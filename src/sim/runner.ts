import { isOver, step, STEP } from "./battle"
import { snapshot, type BattleSnapshot } from "./snapshot"
import type { ArmyId, Battle } from "./types"

/**
 * A tab left in the background must not fire a thousand steps at once, and
 * neither must a server process that has been descheduled.
 */
const MOST_STEPS = 40

/**
 * The fixed 10Hz clock, driven off real time.
 *
 * Tempo scales how many steps are taken per real second and never the size of
 * a step — letting it stretch the step would make every result depend on the
 * speed the player chose to watch at.
 *
 * Held apart from `BattleRunner` because the server drives the same clock and
 * wants nothing else the runner has: it keeps no pair of snapshots, having no
 * screen to interpolate for, and it cuts one per Commander rather than one for
 * anybody. Two copies of this arithmetic would be two answers to *how long is
 * an afternoon*, which is C8's question and not a session's.
 */
export class BattleClock {
  tempo = 1
  /** How far into the step after the last one taken, 0 to 1. */
  alpha = 1
  private carry = 0

  /** How many fixed steps `seconds` of wall clock buys, at the Tempo asked for. */
  due(seconds: number): number {
    this.carry += Math.min(seconds, 0.5) * this.tempo
    let steps = 0
    while (this.carry >= STEP && steps < MOST_STEPS) {
      this.carry -= STEP
      steps++
    }
    this.alpha = Math.min(1, this.carry / STEP)
    return steps
  }

  /** Nothing is moving: whatever holds a state draws it outright. */
  stop(): void {
    this.alpha = 1
  }
}

/**
 * Drives the clock and keeps the last two states for the renderer to draw
 * between (F14).
 */
export class BattleRunner {
  battle: Battle
  running = false
  previous: BattleSnapshot
  current: BattleSnapshot
  private readonly clock = new BattleClock()
  private cutFor: ArmyId | null

  /**
   * `forArmy` is who the snapshots are cut for (C17). It is settable because a
   * battle is loaded before an Army is taken — the Field is on the screen while
   * the offer is still being read, and at that moment there is no Commander to
   * cut for.
   */
  constructor(battle: Battle, forArmy: ArmyId | null) {
    this.battle = battle
    this.cutFor = forArmy
    this.current = snapshot(battle, forArmy)
    this.previous = this.current
  }

  get tempo(): number {
    return this.clock.tempo
  }

  set tempo(tempo: number) {
    this.clock.tempo = tempo
  }

  /** How far between `previous` and `current` the screen should draw. */
  get alpha(): number {
    return this.clock.alpha
  }

  get forArmy(): ArmyId | null {
    return this.cutFor
  }

  /** Take an Army, and re-cut what the screen is holding. */
  set forArmy(forArmy: ArmyId | null) {
    this.cutFor = forArmy
    this.resnap()
    this.previous = this.current
  }

  /**
   * Take a snapshot of a Battle that changed without a step: an Order said,
   * a staff sent riding, a Unit moved by hand at Deployment.
   *
   * `previous` is left where it was, so a snapshot taken mid-step does not
   * collapse the interpolation the frame is in the middle of (F14). A caller
   * with the clock stopped — Deployment — sets it after, because there is
   * nothing to interpolate between there and leaving it behind would slide
   * every Unit back to where it was for a frame.
   */
  resnap(): void {
    this.current = snapshot(this.battle, this.cutFor)
  }

  /** Advance by `seconds` of wall clock. Steps are always exactly STEP long. */
  advance(seconds: number): void {
    // A decided battle stops here rather than in `step`, which stays a plain
    // step. Nothing downstream of the Outcome would be wrong if it ran on — the
    // Outcome is written once and never revisited — but a battle that has
    // ended should not still be moving on the screen.
    if (!this.running || isOver(this.battle)) {
      this.clock.stop()
      return
    }
    const steps = this.clock.due(seconds)
    for (let i = 0; i < steps; i++) {
      this.previous = this.current
      step(this.battle)
      this.resnap()
    }
    if (steps === 0 && this.previous === this.current) this.clock.stop()
  }
}
