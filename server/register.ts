import { loadScenarioFromDisk } from "@/scenario/disk"
import type { LoadedScenario } from "@/scenario/build"
import { isOver, step } from "@/sim/battle"
import { BattleClock } from "@/sim/runner"
import { takeCommand } from "@/sim/scenario"
import type { ArmyId } from "@/sim/types"

/**
 * C18, the Battle Register: battles in progress and their addresses, the two
 * seats, the tokens that claim them, joining, Out of Contact, and expiring a
 * battle nobody joined.
 *
 * It holds no rule about a battalion. What it knows is who is sitting where and
 * whether the afternoon has started — which is the whole of why DESIGN section
 * 7 keeps it apart from C16 rather than folding the two together.
 */

/** Seconds the arranging may take before the clock runs anyway (F23). */
export const DEPLOYMENT_SECONDS = 180

/** How long a battle nobody ever joined is kept. */
const UNJOINED_MS = 30 * 60 * 1000

/** How long a decided battle is kept, so both Commanders can read the Return. */
const DECIDED_MS = 10 * 60 * 1000

/**
 * A seat at a battle, and the token that owns it.
 *
 * The token and not the socket: a socket is a thing that drops, and the whole
 * of F24 is that dropping is not an ending. The seat, the army and everything
 * the Commander has been sent stay here while nobody is holding it.
 */
export interface Seat {
  token: string
  /** Null until an Army has been taken, which is what a Commander does first. */
  army: ArmyId | null
  /** True once he has said his own army is arranged. */
  stoodTo: boolean
  /** The Tempo he is asking for. The battle runs at the slower of the two. */
  tempo: number
  /** How many Dispatches he has been sent, so the feed can go as a tail. */
  sent: number
  /** True while somebody is actually connected in this seat. */
  present: boolean
}

export interface HeldBattle {
  id: string
  /** The Scenario's directory name, which is what a URL knows it by. */
  scenario: string
  loaded: LoadedScenario
  clock: BattleClock
  running: boolean
  seats: Seat[]
  /**
   * When Deployment runs out, in wall-clock milliseconds, or null while there
   * is nobody to run out on. Started when the *second* Commander takes an army
   * and not at creation — a battle waiting for somebody to be handed the link
   * has no reason to be counting (F23).
   */
  deadline: number | null
  openedAt: number
  touchedAt: number
}

const MOST_SEATS = 2

export class BattleRegister {
  private readonly battles = new Map<string, HeldBattle>()
  private readonly root: string

  constructor(root = "public") {
    this.root = root
  }

  /**
   * Open a battle on a Scenario. Neither seat is taken: whoever opened it picks
   * first, and whoever he hands the link to gets what is left.
   */
  open(scenario: string): HeldBattle {
    const loaded = loadScenarioFromDisk(scenario, this.root)
    const now = Date.now()
    const battle: HeldBattle = {
      id: address(),
      scenario,
      loaded,
      clock: new BattleClock(),
      running: false,
      seats: [],
      deadline: null,
      openedAt: now,
      touchedAt: now,
    }
    this.battles.set(battle.id, battle)
    return battle
  }

  get(id: string): HeldBattle | null {
    return this.battles.get(id) ?? null
  }

  /**
   * Sit down. A token that already owns a seat here takes it back — the same
   * army, the afternoon as it has got to, and nothing said about having been
   * away (F24). Otherwise a free seat is claimed, and where there is none the
   * caller is turned away.
   */
  sit(battle: HeldBattle, token: string | undefined): Seat | null {
    const held = token ? battle.seats.find((seat) => seat.token === token) : undefined
    if (held) {
      held.present = true
      return held
    }
    if (battle.seats.length >= MOST_SEATS) return null
    const seat: Seat = {
      token: address(),
      army: null,
      stoodTo: false,
      tempo: DEFAULT_TEMPO,
      sent: 0,
      present: true,
    }
    battle.seats.push(seat)
    return seat
  }

  /**
   * Take an Army. Refused if the other Commander has it, or if this one has
   * already taken one — an army is arranged by the hand that will command it,
   * and that is the one decision a battle does not let anybody revisit.
   */
  takeArmy(battle: HeldBattle, seat: Seat, army: ArmyId): boolean {
    if (seat.army !== null) return false
    if (!battle.loaded.file.armies.some((a) => a.id === army)) return false
    if (battle.seats.some((other) => other.army === army)) return false
    seat.army = army
    takeCommand(battle.loaded.battle, army)
    // The arranging has something to run out on only once there are two armies
    // to arrange.
    if (battle.seats.filter((s) => s.army !== null).length === MOST_SEATS) {
      battle.deadline = Date.now() + DEPLOYMENT_SECONDS * 1000
    }
    return true
  }

  /** Whether a seat is left for somebody new. */
  hasRoom(battle: HeldBattle, token: string | undefined): boolean {
    if (token && battle.seats.some((seat) => seat.token === token)) return true
    return battle.seats.length < MOST_SEATS
  }

  /**
   * Advance every battle by `seconds` of wall clock, and say which ones moved.
   *
   * The clock never pauses for a Commander who is not there (F24): an army
   * whose Commander has gone silent fights on its Standing Orders, which is a
   * behaviour C2 already had and §9 has already measured.
   */
  advance(seconds: number): HeldBattle[] {
    const moved: HeldBattle[] = []
    const now = Date.now()
    for (const battle of this.battles.values()) {
      if (this.standTo(battle, now)) moved.push(battle)
      if (!battle.running || isOver(battle.loaded.battle)) continue
      battle.clock.tempo = tempoOf(battle)
      const steps = battle.clock.due(seconds)
      if (steps === 0) continue
      for (let i = 0; i < steps; i++) step(battle.loaded.battle)
      battle.touchedAt = now
      if (!moved.includes(battle)) moved.push(battle)
    }
    return moved
  }

  /**
   * Deployment ends on both Commanders having Stood To, or on the clock,
   * whichever comes first — which is ADR-0006's argument one phase earlier.
   * Returns true on the step it ends.
   */
  private standTo(battle: HeldBattle, now: number): boolean {
    if (battle.running || battle.deadline === null) return false
    const both = battle.seats.length === MOST_SEATS && battle.seats.every((seat) => seat.stoodTo)
    if (!both && now < battle.deadline) return false
    battle.running = true
    battle.deadline = null
    return true
  }

  /** Forget battles nobody is coming back to. */
  sweep(): void {
    const now = Date.now()
    for (const [id, battle] of this.battles) {
      const alone = battle.seats.length < MOST_SEATS
      if (alone && now - battle.openedAt > UNJOINED_MS) {
        this.battles.delete(id)
        continue
      }
      if (isOver(battle.loaded.battle) && now - battle.touchedAt > DECIDED_MS) {
        this.battles.delete(id)
      }
    }
  }

  get size(): number {
    return this.battles.size
  }
}

/** Default Tempo. Four, which is what a solo battle opens at. */
const DEFAULT_TEMPO = 4

/**
 * The Tempo a battle runs at: the slower of the two asked for (F21).
 *
 * The slower and not the faster, because watching an afternoon go past too fast
 * to read is a worse thing to be given than watching one go slowly. A seat with
 * nobody in it is not asking for anything.
 */
export function tempoOf(battle: HeldBattle): number {
  const asked = battle.seats.filter((seat) => seat.present).map((seat) => seat.tempo)
  return asked.length === 0 ? DEFAULT_TEMPO : Math.min(...asked)
}

/**
 * An address: short enough to read down a telephone, long enough not to be
 * guessed. Sixteen characters of base32 is eighty bits.
 */
function address(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789"
  let out = ""
  for (const byte of bytes) out += alphabet[byte % alphabet.length]
  return out
}
