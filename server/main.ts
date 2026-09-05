import type { ServerWebSocket } from "bun"
import { BattleRegister, tempoOf, type HeldBattle, type Seat } from "./register"
import type { Command } from "@/session"
import { WIRE_PATH, type Ask, type State, type Tell } from "@/session/wire"
import { concede } from "@/sim/battle"
import * as deployment from "@/sim/deployment"
import { rideTo, sendOrder } from "@/sim/headquarters"
import { armyReturns } from "@/sim/return"
import { snapshot } from "@/sim/snapshot"
import type { Battle, Unit } from "@/sim/types"
import * as record from "./record"

/**
 * The process a two-Commander battle lives in (ADR-0013).
 *
 * WebSocket only. There is no HTTP API and no framework: creating a battle,
 * joining one and giving an Order are all messages on the socket that is
 * already open, because a second transport would be a second set of failure
 * modes for a game whose entire network is one connection per Commander. The
 * SPA is served by nginx beside this and never through it.
 *
 * It holds no rule about a battalion. Every Command below turns into a call on
 * `src/sim/` — the same source the browser bundles, and under Bun the same
 * engine the tests measure (ADR-0014).
 */

/** How often the battles are advanced and what moved is sent out. */
const TICK_MS = 100

/** How often battles nobody is coming back to are forgotten. */
const SWEEP_MS = 60_000

interface Sitting {
  battle: string
  token: string
}

const register = new BattleRegister(Bun.env.SCENARIO_ROOT ?? "public")
const sockets = new Set<ServerWebSocket<Sitting>>()

const server = Bun.serve<Sitting, never>({
  port: Number(Bun.env.PORT ?? 8787),
  fetch(request, srv) {
    const url = new URL(request.url)
    if (url.pathname !== WIRE_PATH) {
      // Nothing else is served here. A GET that lands on this process is a
      // proxy pointed at the wrong thing, and saying so is more use than a
      // blank page would be.
      return new Response("this process serves one WebSocket, at " + WIRE_PATH, { status: 404 })
    }
    // The seat is claimed on the socket, not in the handshake: a battle that
    // has not been opened yet has no address to put in a query string.
    if (srv.upgrade(request, { data: { battle: "", token: "" } })) return undefined
    return new Response("expected a WebSocket upgrade", { status: 400 })
  },
  websocket: {
    open(socket) {
      sockets.add(socket)
    },
    close(socket) {
      sockets.delete(socket)
      // Out of Contact, and not an ending: the seat, the army and the afternoon
      // stay where they are, and the clock does not pause (F24).
      const seat = seatOf(socket)
      if (seat) {
        seat.present = false
        record.wentQuiet(seat)
      }
    },
    message(socket, raw) {
      let ask: Ask
      try {
        ask = JSON.parse(String(raw)) as Ask
      } catch {
        const seat = seatOf(socket)
        if (seat) record.refused(seat, "that was not a message")
        return say(socket, { tell: "refused", because: "that was not a message" })
      }
      handle(socket, ask)
    },
  },
})

console.log(`the register is open on :${server.port}${WIRE_PATH}`)

setInterval(() => {
  const moved = register.advance(TICK_MS / 1000)
  for (const battle of moved) report(battle)
}, TICK_MS)

setInterval(() => {
  register.sweep()
  record.prune()
}, SWEEP_MS)

// A battle need not end for the process to: stopped is the one ending nothing
// else here would write down.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    record.stopping()
    process.exit(0)
  })
}

// ---------------------------------------------------------------------------

function handle(socket: ServerWebSocket<Sitting>, ask: Ask): void {
  if (ask.ask === "open") {
    let battle: HeldBattle
    try {
      battle = register.open(ask.scenario)
    } catch (error) {
      // No Scenario of that name on this disk, which reads the same to a
      // Commander as a battle that is not there — and reads the same whether
      // the name is wrong or the image is missing the Rosters, which is why the
      // reason is logged rather than swallowed.
      console.error(`could not open ${ask.scenario}:`, error)
      return say(socket, { tell: "gone", battle: ask.scenario })
    }
    const seat = register.sit(battle, undefined)
    if (!seat) return say(socket, { tell: "full", battle: battle.id })
    socket.data = { battle: battle.id, token: seat.token }
    record.asked(seat, "open")
    return say(socket, seated(battle, seat))
  }

  if (ask.ask === "join") {
    const battle = register.get(ask.battle)
    if (!battle) return say(socket, { tell: "gone", battle: ask.battle })
    if (!register.hasRoom(battle, ask.token)) {
      return say(socket, { tell: "full", battle: battle.id })
    }
    const seat = register.sit(battle, ask.token)
    if (!seat) return say(socket, { tell: "full", battle: battle.id })
    socket.data = { battle: battle.id, token: seat.token }
    record.asked(seat, "join")
    say(socket, seated(battle, seat))
    // A seat reclaimed after a drop is owed the afternoon it missed, so the
    // feed goes again from the top.
    seat.sent = 0
    if (seat.army) tell(battle, seat, socket)
    return
  }

  const battle = register.get(socket.data.battle)
  const seat = seatOf(socket)
  if (!battle || !seat) return say(socket, { tell: "refused", because: "no seat here" })
  record.asked(seat, ask.command.kind)
  apply(battle, seat, ask.command)
}

/**
 * A Command, applied by the authority.
 *
 * Nothing the client said is trusted. Every branch reads the seat's own army
 * back out of the register, so an Order naming somebody else's battalion is
 * refused whatever the message claimed (F21).
 */
function apply(battle: HeldBattle, seat: Seat, command: Command): void {
  const field = battle.loaded.battle
  const zone = deployment.deploymentZone(battle.loaded.file, seat.army)
  const arranging = !battle.running

  switch (command.kind) {
    case "take-army": {
      if (!register.takeArmy(battle, seat, command.army)) {
        record.refused(seat, "that army is taken")
        return sayTo(seat, { tell: "refused", because: "that army is taken" })
      }
      // The seat again, now that it names an army: it is the answer to the one
      // question a Commander cannot read off a snapshot, which is whether he
      // got what he asked for.
      sayTo(seat, seated(battle, seat))
      broadcast(battle)
      return
    }
    case "place": {
      const unit = mine(field, seat, command.unitId)
      if (arranging && unit) deployment.place(zone, unit, command.at)
      return tellSeat(battle, seat)
    }
    case "face": {
      const unit = mine(field, seat, command.unitId)
      if (arranging && unit) deployment.face(zone, unit, command.facing)
      return tellSeat(battle, seat)
    }
    case "form-up": {
      const unit = mine(field, seat, command.unitId)
      if (arranging && unit) deployment.formUp(zone, unit, command.formation)
      return tellSeat(battle, seat)
    }
    case "brief": {
      const unit = mine(field, seat, command.unitId)
      // Free while the army is being arranged; a Courier ride after that, which
      // is the `standing` Order and goes through `order` below.
      if (arranging && unit) deployment.brief(unit, command.latitude)
      return tellSeat(battle, seat)
    }
    case "post-headquarters": {
      const staff = staffOf(field, seat)
      if (arranging && staff) deployment.postHeadquarters(zone, staff, command.at)
      return tellSeat(battle, seat)
    }
    case "stand-to":
      seat.stoodTo = true
      // Said and not done: the clock runs when both have said it, or when the
      // three minutes are up (F23). Told to both, because the other Commander
      // is owed the fact that he is no longer the one being waited for — and
      // nothing beyond that fact.
      broadcast(battle)
      return
    case "order": {
      const staff = staffOf(field, seat)
      if (!battle.running || !staff || !mine(field, seat, command.unitId)) return
      sendOrder(field, staff, command.unitId, command.body)
      return tellSeat(battle, seat)
    }
    case "ride": {
      const staff = staffOf(field, seat)
      if (!battle.running || !staff) return
      rideTo(field, staff, command.at)
      return tellSeat(battle, seat)
    }
    case "tempo":
      seat.tempo = command.tempo
      // Both are told, because the Tempo that took effect is the slower of the
      // two and the other Commander's screen has to stop claiming otherwise.
      broadcast(battle)
      return
    case "pause":
      // One clock runs for both. A Commander who wants to stop watching stops
      // watching; the afternoon does not wait for him (F24).
      record.refused(seat, "a battle with two Commanders does not stop")
      return sayTo(seat, {
        tell: "refused",
        because: "a battle with two Commanders does not stop",
      })
    case "concede":
      if (!battle.running || !seat.army) return
      concede(field, seat.army)
      broadcast(battle)
      return
  }
}

// ---------------------------------------------------------------------------

function seatOf(socket: ServerWebSocket<Sitting>): Seat | null {
  const battle = register.get(socket.data.battle)
  return battle?.seats.find((seat) => seat.token === socket.data.token) ?? null
}

function socketOf(seat: Seat): ServerWebSocket<Sitting> | null {
  for (const socket of sockets) if (socket.data.token === seat.token) return socket
  return null
}

function mine(field: Battle, seat: Seat, unitId: string): Unit | null {
  const unit = field.units.find((u) => u.id === unitId)
  return unit && unit.army === seat.army ? unit : null
}

function staffOf(field: Battle, seat: Seat) {
  return field.armies.find((a) => a.id === seat.army)?.headquarters ?? null
}

function seated(battle: HeldBattle, seat: Seat): Tell {
  return {
    tell: "seat",
    battle: battle.id,
    scenario: battle.scenario,
    army: seat.army,
    token: seat.token,
  }
}

/** The battle as one seat is told it. */
function stateFor(battle: HeldBattle, seat: Seat): State {
  const field = battle.loaded.battle
  const arranging = !battle.running
  const cut = snapshot(field, seat.army, arranging)
  const { dispatches, ...rest } = cut
  const from = Math.min(seat.sent, dispatches.length)
  seat.sent = dispatches.length
  const other = battle.seats.find((s) => s !== seat)
  return {
    snapshot: rest,
    dispatches: dispatches.slice(from),
    dispatchesFrom: from,
    running: battle.running && field.outcome === null,
    // Set once and never cleared: there is nothing here that stops a clock.
    begun: battle.running,
    tempo: tempoOf(battle),
    outcome: field.outcome,
    returns: field.outcome ? armyReturns(field) : null,
    // *That* he is still arranging, and never what he is doing (F23).
    waitingForTheOther: arranging && (!other || other.army === null || !other.stoodTo),
    stoodTo: seat.stoodTo,
  }
}

function tell(battle: HeldBattle, seat: Seat, socket: ServerWebSocket<Sitting>): void {
  // Stringified here rather than in `say` so the length can be counted: this is
  // the whole of what a Commander is sent, every other message being a handful
  // of bytes against ten states a second.
  const line = JSON.stringify({ tell: "state", state: stateFor(battle, seat) })
  socket.send(line)
  record.sent(seat, Buffer.byteLength(line, "utf8"), true)
}

function tellSeat(battle: HeldBattle, seat: Seat): void {
  const socket = socketOf(seat)
  if (socket) tell(battle, seat, socket)
}

/** Both Commanders, each cut to what is his. */
function broadcast(battle: HeldBattle): void {
  for (const seat of battle.seats) if (seat.army) tellSeat(battle, seat)
}

/** What the tick sends: the same thing, for every seat with somebody in it. */
function report(battle: HeldBattle): void {
  broadcast(battle)
}

function say(socket: ServerWebSocket<Sitting>, message: Tell): void {
  socket.send(JSON.stringify(message))
}

function sayTo(seat: Seat, message: Tell): void {
  const socket = socketOf(seat)
  if (socket) say(socket, message)
}
