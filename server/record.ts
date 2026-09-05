import { appendFileSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { armyReturns } from "@/sim/return"
import type { HeldBattle, Seat } from "./register"

/**
 * One record per battle, written when the battle is forgotten.
 *
 * Not a line per thing that happens. A battle sends ten state messages a second
 * to each Commander and runs for an afternoon: a diary of that is a hundred
 * thousand lines that answer no question anybody asks afterwards, because the
 * questions are about an *afternoon* and not about a tick. So nothing is
 * written while a battle runs. What is accumulated instead is one wide record —
 * who sat down, what each asked for, what was refused, how the Deployment
 * ended, and what the armies had to show for it — and it goes out once, at the
 * end, where the battle is deleted.
 *
 * There is no sampling. The practice this follows drops most of the happy path
 * because it assumes a hundred thousand events a second; this register will
 * produce a dozen a day, and throwing any of them away would be borrowing a fix
 * for a problem it does not have.
 *
 * Nothing here is read by a battle. It is written to be queried afterwards,
 * which is why every field a question might group by — the battle's address,
 * the Scenario, the army, the reason a Command was refused — is on the record
 * rather than folded into a sentence.
 */

/** Where the record is kept. Unset keeps none, which is what a test wants. */
const PATH = Bun.env.RECORD_PATH ?? ""

/** The file never grows past this, whatever else happens. */
const MAX_BYTES = Number(Bun.env.RECORD_MAX_BYTES ?? 16 * 1024 * 1024)

/** Nor holds anything older than this. */
const KEEP_DAYS = Number(Bun.env.RECORD_KEEP_DAYS ?? 30)

/** How often the age of what is kept is worth re-examining. */
const PRUNE_EVERY_MS = 60 * 60 * 1000

/**
 * What is accumulated about one Commander that his Seat does not already hold.
 *
 * The army, whether he has Stood To and the Tempo he asks for are read off the
 * `Seat` itself at the end — kept in one place, so there is no second copy to
 * disagree with the first.
 */
interface Watched {
  /** Asks by kind, which is where the shape of an afternoon shows up. */
  asks: Record<string, number>
  /** Every refusal, with the reason as the battle gave it. */
  refusals: { because: string; at: string }[]
  /** Times he went Out of Contact, and times he came back to the same seat. */
  drops: number
  reclaims: number
  outOfContactSeconds: number
  /** When the current absence started, or null while somebody is there. */
  awaySince: number | null
  /** What the wire cost him, which is the measurement DESIGN section 8 wanted. */
  states: number
  bytes: number
}

interface Afternoon {
  openedAt: number
  /** How the arranging ended, and how long it took (F23). Null until it does. */
  deploymentEndedOn: "both-stood-to" | "the-clock" | null
  deploymentSeconds: number | null
  emitted: boolean
}

/**
 * Keyed on the objects themselves, so nothing here outlives what it describes:
 * a battle the register drops takes its record with it whether or not anybody
 * remembered to say so. `live` is the exception and is strong on purpose —
 * it is how a battle still in progress is found when the process is stopped.
 */
const afternoons = new WeakMap<HeldBattle, Afternoon>()
const watched = new WeakMap<Seat, Watched>()
const live = new Set<HeldBattle>()

let lastPruned = 0
let complained = false

export function opened(battle: HeldBattle): void {
  afternoons.set(battle, {
    openedAt: battle.openedAt,
    deploymentEndedOn: null,
    deploymentSeconds: null,
    emitted: false,
  })
  live.add(battle)
}

/** A seat claimed. `again` is a seat reclaimed after going Out of Contact (F24). */
export function satDown(seat: Seat, again: boolean): void {
  const w = watched.get(seat)
  if (!w) {
    watched.set(seat, {
      asks: {},
      refusals: [],
      drops: 0,
      reclaims: 0,
      outOfContactSeconds: 0,
      awaySince: null,
      states: 0,
      bytes: 0,
    })
    return
  }
  if (!again) return
  w.reclaims += 1
  if (w.awaySince !== null) {
    w.outOfContactSeconds += Math.round((Date.now() - w.awaySince) / 1000)
    w.awaySince = null
  }
}

/** The socket dropped. Not an ending — the seat, the army and the clock stay. */
export function wentQuiet(seat: Seat): void {
  const w = watched.get(seat)
  if (!w || w.awaySince !== null) return
  w.drops += 1
  w.awaySince = Date.now()
}

export function asked(seat: Seat, kind: string): void {
  const w = watched.get(seat)
  if (!w) return
  w.asks[kind] = (w.asks[kind] ?? 0) + 1
}

export function refused(seat: Seat, because: string): void {
  const w = watched.get(seat)
  if (!w) return
  w.refusals.push({ because, at: new Date().toISOString() })
}

/** Bytes written to a Commander, and whether they were a state. */
export function sent(seat: Seat, bytes: number, state: boolean): void {
  const w = watched.get(seat)
  if (!w) return
  w.bytes += bytes
  if (state) w.states += 1
}

/** The arranging ended, on both having Stood To or on the clock (F23). */
export function deploymentEnded(battle: HeldBattle, on: "both-stood-to" | "the-clock"): void {
  const a = afternoons.get(battle)
  if (!a || a.deploymentEndedOn) return
  a.deploymentEndedOn = on
  a.deploymentSeconds = Math.round((Date.now() - a.openedAt) / 1000)
}

/**
 * The battle is being forgotten. This is the one place a record is written, and
 * `why` is the difference between an afternoon that was fought and one that
 * nobody ever came to.
 */
export function forget(battle: HeldBattle, why: string): void {
  const a = afternoons.get(battle)
  live.delete(battle)
  if (!a || a.emitted) return
  a.emitted = true
  const field = battle.loaded.battle
  const now = Date.now()
  write({
    battle: battle.id,
    scenario: battle.scenario,
    openedAt: new Date(a.openedAt).toISOString(),
    endedAt: new Date(now).toISOString(),
    ended: why,
    // Two clocks, because they answer different questions: one is how long a
    // person sat there and the other is how much of the afternoon they saw.
    heldForSeconds: Math.round((now - a.openedAt) / 1000),
    scenarioSeconds: Math.round(field.time),
    deploymentEndedOn: a.deploymentEndedOn,
    deploymentSeconds: a.deploymentSeconds,
    running: battle.running,
    outcome: field.outcome,
    returns: field.outcome ? armyReturns(field) : null,
    commanders: battle.seats.map((seat) => {
      const w = watched.get(seat)
      const away =
        (w?.outOfContactSeconds ?? 0) + (w?.awaySince ? Math.round((now - w.awaySince) / 1000) : 0)
      return {
        token: seat.token,
        army: seat.army,
        stoodTo: seat.stoodTo,
        tempoAsked: seat.tempo,
        present: seat.present,
        asks: w?.asks ?? {},
        refusals: w?.refusals ?? [],
        drops: w?.drops ?? 0,
        reclaims: w?.reclaims ?? 0,
        outOfContactSeconds: away,
        states: w?.states ?? 0,
        bytes: w?.bytes ?? 0,
      }
    }),
  })
}

/**
 * Every battle still in progress, written down because the process is going.
 *
 * The practice this follows assumes the unit of work finishes. A battle need
 * not: it can be abandoned, and the container it lives in can be stopped —
 * which is exactly what happened on 4 September and left nothing behind saying
 * so. This is the case that would otherwise never be recorded.
 */
export function stopping(): void {
  // `forget` deletes from `live` as it goes, which a Set iteration is defined
  // to take: the entry removed is the one already handed out.
  for (const battle of live) forget(battle, "server-stopped")
}

// ---------------------------------------------------------------------------

function write(event: object): void {
  if (!PATH) return
  const line = JSON.stringify(event) + "\n"
  try {
    appendFileSync(PATH, line)
    prune()
  } catch (error) {
    // A record that cannot be kept is still worth saying out loud, and saying
    // it once rather than every battle: a broken mount should not become the
    // loudest thing in the log.
    if (!complained) {
      complained = true
      console.error(`could not write the record at ${PATH}:`, error)
    }
    console.error(line.trimEnd())
  }
}

/**
 * Hold the record to a size and an age.
 *
 * A Docker volume has no size of its own, so the bound has to be here or it is
 * nowhere: an unattended server writing an unbounded file is a disk that fills
 * up on a day nobody chose. Age first, because a month of battles is the thing
 * actually wanted; size second, as the backstop for a month that was busier
 * than a month is expected to be. The newest lines are the ones kept.
 */
export function prune(): void {
  if (!PATH) return
  let size: number
  try {
    size = statSync(PATH).size
  } catch {
    return
  }
  const now = Date.now()
  const byAge = now - lastPruned > PRUNE_EVERY_MS
  if (size <= MAX_BYTES && !byAge) return
  lastPruned = now

  try {
    const oldest = now - KEEP_DAYS * 24 * 60 * 60 * 1000
    let lines = readFileSync(PATH, "utf8").split("\n").filter(Boolean)
    const before = lines.length
    lines = lines.filter((line) => {
      // A line nobody can date is kept: dropping what cannot be read is how a
      // record quietly loses the thing that was hardest to write down.
      const at = Date.parse(JSON.parse(line)?.endedAt ?? "")
      return Number.isNaN(at) || at >= oldest
    })
    // Newest first while the budget is spent, then back into order.
    let kept: string[] = []
    let bytes = 0
    for (let i = lines.length - 1; i >= 0; i--) {
      const cost = Buffer.byteLength(lines[i]!, "utf8") + 1
      if (bytes + cost > MAX_BYTES) break
      bytes += cost
      kept.push(lines[i]!)
    }
    kept = kept.reverse()
    if (kept.length === before) return
    writeFileSync(PATH, kept.length ? kept.join("\n") + "\n" : "")
    console.log(`record pruned: ${before} battles kept as ${kept.length}`)
  } catch (error) {
    console.error("could not prune the record:", error)
  }
}
