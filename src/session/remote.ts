import type { BattleSession, Command } from "./index"
import { WIRE_PATH, type Ask, type State, type Tell } from "./wire"
import { STEP } from "@/sim/battle"
import type { ArmyReturn } from "@/sim/return"
import { noSnapshot, type BattleSnapshot } from "@/sim/snapshot"
import type { ArmyId, Dispatch, Outcome } from "@/sim/types"

/**
 * The battle in a process somewhere else, seen down a socket (ADR-0013).
 *
 * It holds no rule. Everything it does is write a Command down the wire and
 * keep the last two states the server sent back, so that the renderer has the
 * same pair to interpolate between that a local battle gives it (F14).
 *
 * The one arithmetic here is `alpha`, and it is the same arithmetic in a
 * different frame: locally the clock knows how far into a step it is because it
 * took the step; here it is measured from when the state arrived. The server
 * sends one per tick, so a state is one tick old at worst — a fraction of the
 * fifteen seconds an Order takes to ride two hundred metres, which is the whole
 * reason this game can afford a network.
 */

/** How a seat is remembered, so it can be taken back after a drop (F24). */
const SEATS = "fos.seats"

/** Wait before dialling again after the line goes. */
const REDIAL_MS = 1000

export class RemoteSession implements BattleSession {
  previous: BattleSnapshot = noSnapshot()
  current: BattleSnapshot = noSnapshot()

  private socket: WebSocket | null = null
  private closed = false
  private redial = 0
  private sinceState = 0
  /** The whole feed, kept here because the wire only carries what is new. */
  private feed: Dispatch[] = []
  private state: State | null = null
  private seat: { battle: string; army: ArmyId | null } | null = null
  private trouble_: string | null = null
  private turnedAway_ = false
  private asked = 4
  /** Said before the socket was open, and sent the moment it is. */
  private queue: Ask[] = []
  private readonly opening: Ask
  private readonly onSeat: (battle: string, army: ArmyId | null) => void

  /**
   * `battle` is an address to join, or null to open a new one on `scenario`.
   * `onSeat` fires when the battle answers with one, because taking a seat is
   * what gives the address the URL has to carry.
   */
  constructor(
    scenario: string,
    battle: string | null,
    onSeat: (battle: string, army: ArmyId | null) => void,
  ) {
    this.onSeat = onSeat
    this.opening = battle
      ? { ask: "join", battle, token: rememberedToken(battle) }
      : { ask: "open", scenario }
    this.dial()
  }

  get alpha(): number {
    // Between the last two states, measured in wall clock against one step of
    // battle time. Capped, so a late state holds the Field still rather than
    // sliding every Unit past where it actually is.
    return Math.min(1, this.sinceState / STEP)
  }

  get running(): boolean {
    return this.state?.running ?? false
  }

  get begun(): boolean {
    return this.state?.begun ?? false
  }

  get tempo(): number {
    return this.state?.tempo ?? this.asked
  }

  get outcome(): Outcome | null {
    return this.state?.outcome ?? null
  }

  get army(): ArmyId | null {
    return this.seat?.army ?? null
  }

  get address(): string | null {
    return this.seat?.battle ?? null
  }

  get waitingForTheOther(): boolean {
    return this.state?.waitingForTheOther ?? false
  }

  get stoodTo(): boolean {
    return this.state?.stoodTo ?? false
  }

  get trouble(): string | null {
    return this.trouble_
  }

  get turnedAway(): boolean {
    return this.turnedAway_
  }

  advance(seconds: number): void {
    this.sinceState += seconds
    if (this.redial > 0) {
      this.redial -= seconds
      if (this.redial <= 0 && !this.closed) this.dial()
    }
  }

  returns(): ArmyReturn[] {
    return this.state?.returns ?? []
  }

  send(command: Command): void {
    if (command.kind === "tempo") this.asked = command.tempo
    this.write({ ask: "say", command })
  }

  close(): void {
    this.closed = true
    this.queue = []
    const socket = this.socket
    this.socket = null
    socket?.close()
  }

  // -------------------------------------------------------------------------

  private dial(): void {
    if (this.closed) return
    const socket = new WebSocket(wireUrl())
    this.socket = socket
    socket.onopen = () => {
      this.trouble_ = null
      // The opening ask again every time, because a redial is a seat being
      // reclaimed and the token is what does the reclaiming.
      const opening: Ask =
        this.seat !== null
          ? { ask: "join", battle: this.seat.battle, token: rememberedToken(this.seat.battle) }
          : this.opening
      socket.send(JSON.stringify(opening))
      for (const ask of this.queue) socket.send(JSON.stringify(ask))
      this.queue = []
    }
    socket.onmessage = (event) => this.heard(String(event.data))
    socket.onclose = () => {
      if (this.closed || this.socket !== socket) return
      this.socket = null
      // Out of Contact is not an ending. The battle has not stopped and the
      // seat is still ours; the line is what broke (F24).
      this.trouble_ = "out of contact — trying the line again"
      this.redial = REDIAL_MS / 1000
    }
    socket.onerror = () => socket.close()
  }

  private write(ask: Ask): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(ask))
    else this.queue.push(ask)
  }

  private heard(raw: string): void {
    let message: Tell
    try {
      message = JSON.parse(raw) as Tell
    } catch {
      return
    }
    switch (message.tell) {
      case "seat":
        this.seat = { battle: message.battle, army: message.army }
        rememberSeat(message.battle, message.token)
        this.trouble_ = null
        this.onSeat(message.battle, message.army)
        return
      case "full":
        this.trouble_ = "both armies are taken — this battle has its two Commanders"
        this.turnedAway_ = true
        this.close()
        return
      case "gone":
        this.trouble_ = "there is no battle at this address — it may have expired"
        this.turnedAway_ = true
        this.close()
        return
      case "refused":
        this.trouble_ = message.because
        return
      case "state":
        this.took(message.state)
        return
    }
  }

  private took(state: State): void {
    // The feed comes as a tail. `dispatchesFrom` says where it belongs, so a
    // message that overtook another is dropped rather than spliced in wrong.
    if (state.dispatchesFrom <= this.feed.length) {
      this.feed = [...this.feed.slice(0, state.dispatchesFrom), ...state.dispatches]
    }
    const snapshot: BattleSnapshot = { ...state.snapshot, dispatches: this.feed }
    this.previous = this.current
    this.current = snapshot
    this.sinceState = 0
    this.state = state
  }
}

function wireUrl(): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${location.host}${WIRE_PATH}`
}

function seats(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEATS) ?? "{}") as Record<string, string>
  } catch {
    return {}
  }
}

function rememberedToken(battle: string): string | undefined {
  return seats()[battle]
}

function rememberSeat(battle: string, token: string): void {
  try {
    localStorage.setItem(SEATS, JSON.stringify({ ...seats(), [battle]: token }))
  } catch {
    // Private browsing refuses the write. The seat is then only good for as
    // long as the socket is, which is worth saying nothing about here.
  }
}
