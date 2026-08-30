import { isOver, step, STEP } from "./battle"
import { snapshot, type BattleSnapshot } from "./snapshot"
import type { ArmyId, Battle } from "./types"

/**
 * Drives the fixed 10Hz clock off real time and keeps the last two states for
 * the renderer to draw between.
 *
 * Tempo scales how many steps are taken per real second and never the size of
 * a step — letting it stretch the step would make every result depend on the
 * speed the player chose to watch at.
 */
export class BattleRunner {
  battle: Battle
  tempo = 1
  running = false
  previous: BattleSnapshot
  current: BattleSnapshot
  /** How far between `previous` and `current` the screen should draw. */
  alpha = 1
  private carry = 0
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
      this.alpha = 1
      return
    }
    // A tab left in the background must not fire a thousand steps at once.
    this.carry += Math.min(seconds, 0.5) * this.tempo
    let steps = 0
    while (this.carry >= STEP && steps < 40) {
      this.previous = this.current
      step(this.battle)
      this.current = snapshot(this.battle, this.cutFor)
      this.carry -= STEP
      steps++
    }
    if (steps === 0 && this.previous === this.current) {
      this.alpha = 1
      return
    }
    this.alpha = Math.min(1, this.carry / STEP)
  }
}
