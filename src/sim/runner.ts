import { step, STEP } from "./battle"
import { snapshot, type BattleSnapshot } from "./snapshot"
import type { Battle } from "./types"

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

  constructor(battle: Battle) {
    this.battle = battle
    this.current = snapshot(battle)
    this.previous = this.current
  }

  /** Advance by `seconds` of wall clock. Steps are always exactly STEP long. */
  advance(seconds: number): void {
    if (!this.running) {
      this.alpha = 1
      return
    }
    // A tab left in the background must not fire a thousand steps at once.
    this.carry += Math.min(seconds, 0.5) * this.tempo
    let steps = 0
    while (this.carry >= STEP && steps < 40) {
      this.previous = this.current
      step(this.battle)
      this.current = snapshot(this.battle)
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
