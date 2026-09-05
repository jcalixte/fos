import type { BattleSession, Command } from "./index"
import type { LoadedScenario } from "@/scenario/build"
import { armyReturns, type ArmyReturn } from "@/sim/return"
import { BattleRunner } from "@/sim/runner"
import type { BattleSnapshot } from "@/sim/snapshot"
import type { ArmyId, Battle, Outcome } from "@/sim/types"

/**
 * The Book: a battle nobody commands.
 *
 * The third implementation of the seam, beside the one in the tab and the one
 * on the wire (ADR-0013). It differs from `LocalSession` in exactly two ways,
 * and neither of them is a rule.
 *
 * **It never takes an Army.** `takeCommand` is what drops the Plan of the army
 * being taken; it is not called here, so *both* order books fire and the
 * afternoon plays itself — the decisions are the ones the Scenario authored for
 * Bonaparte and for Wurmser, and everything that happens between them is the
 * simulation's, under the same rules a Commander plays against.
 *
 * **It cuts the snapshot for nobody.** `snapshot(battle, null)` withholds
 * nothing: both armies' Reports, both feeds, both Headquarters, every Courier
 * and every Ghost. That is a seat no Commander may ever have and the one a
 * reader must — F22 cuts the Field to one pair of eyes because there is
 * somebody on the other side of it to keep it from, and in a Book there is not.
 *
 * It is not a spectator seat on somebody else's battle, which is the thing
 * `PLAN.md` refuses: there is no live battle here and no blind Deployment for a
 * watcher to leak through, only a Scenario being read.
 */
export class BookSession implements BattleSession {
  private readonly runner: BattleRunner
  private readonly scenario: LoadedScenario

  constructor(scenario: LoadedScenario) {
    this.scenario = scenario
    this.runner = new BattleRunner(scenario.battle, null)
    // There is no Deployment, because there is nobody to arrange anything: both
    // armies stand where their Rosters were authored, which is where history
    // put them. The clock therefore runs from the moment the page is open.
    this.runner.running = true
  }

  get previous(): BattleSnapshot {
    return this.runner.previous
  }

  get current(): BattleSnapshot {
    return this.runner.current
  }

  get alpha(): number {
    return this.runner.alpha
  }

  get running(): boolean {
    return this.runner.running && this.battle.outcome === null
  }

  /** The clock started when the page did. */
  get begun(): boolean {
    return true
  }

  get tempo(): number {
    return this.runner.tempo
  }

  get outcome(): Outcome | null {
    return this.battle.outcome
  }

  /** Nobody's. That is the whole of what a Book is. */
  get army(): ArmyId | null {
    return null
  }

  /** Nothing to hand anybody: a Book is the same reading for everyone. */
  get address(): string | null {
    return null
  }

  get waitingForTheOther(): boolean {
    return false
  }

  get stoodTo(): boolean {
    return true
  }

  get trouble(): string | null {
    return null
  }

  get turnedAway(): boolean {
    return false
  }

  advance(seconds: number): void {
    this.runner.advance(seconds)
  }

  returns(): ArmyReturn[] {
    return armyReturns(this.battle)
  }

  close(): void {
    this.runner.running = false
  }

  /**
   * How fast it is read, and whether it is being read at all.
   *
   * Every other member of the union is an act of command, and there is no
   * Commander here to have committed it. They are listed one by one rather than
   * swept up in a default, so that a verb added to the union has to be answered
   * here as well: the honest answer for a Book is almost always *nothing
   * happens*, but it should be written down as an answer and not fallen into.
   */
  send(command: Command): void {
    switch (command.kind) {
      case "tempo":
        this.runner.tempo = command.tempo
        return
      case "pause":
        this.runner.running = !command.on
        return
      // Nobody takes an army, and nothing arranges one: both stand where their
      // Rosters put them, which is the position history left them in.
      case "take-army":
      case "place":
      case "face":
      case "form-up":
      case "brief":
      case "post-headquarters":
      case "stand-to":
      // And nothing is said to them once the clock runs. The Plans are the only
      // intent on this Field, which is the whole of what makes it a Book.
      case "order":
      case "ride":
      case "concede":
        return
    }
  }

  private get battle(): Battle {
    return this.scenario.battle
  }
}
