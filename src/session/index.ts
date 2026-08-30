import type { ArmyReturn } from "@/sim/return"
import type { BattleSnapshot } from "@/sim/snapshot"
import type { ArmyId, FormationName, Latitude, OrderBody, Outcome, UnitId, Vec2 } from "@/sim/types"

/**
 * C16, the seam.
 *
 * **A battle session takes Orders, emits `BattleSnapshot`s, and reports the
 * Outcome.** There are two implementations — a local one wrapping
 * `BattleRunner` in the tab, and a remote one wrapping a socket — and the
 * screen talks to this and never learns which of them it has (ADR-0013).
 *
 * **Neither implementation may contain a rule.** That is the whole guard, and
 * it is the only thing keeping the solo game and the two-Commander game one
 * game rather than two. Anything either of them knows about a battalion belongs
 * in `src/sim/`; anything either of them decides that the other does not is
 * ADR-0013 broken rather than extended. Read the tension in DESIGN section 9
 * before adding a method here.
 */

/**
 * Everything a Commander can say to a battle, in one closed set.
 *
 * A union rather than a method per verb, because on the far side of the wire it
 * *is* a message: the remote implementation writes these down the socket
 * unchanged, and the local one applies them in the tab. A verb that cannot be
 * said as a value is a verb the two implementations would have to agree about
 * twice.
 *
 * Nothing here is checked for legality by its caller. The screen may refuse to
 * offer a button, but what an Order does is the session's answer — under two
 * Commanders it is the *server's*, and a rule the client is trusted to keep is
 * not a rule (F21).
 */
export type Command =
  /**
   * Take an Army. The first thing a battle asks and the one decision that
   * cannot be revisited: an army is arranged by the hand that will command it.
   */
  | { kind: "take-army"; army: ArmyId }
  /** Deployment: put a Unit on ground, inside the zone its Scenario allows. */
  | { kind: "place"; unitId: UnitId; at: Vec2 }
  /** Deployment: turn a Unit where it stands. */
  | { kind: "face"; unitId: UnitId; facing: number }
  /**
   * Deployment: stand a Unit in a Formation outright. Not an Order — there is
   * no rider to send and no drill to serve, because the clock is not running.
   */
  | { kind: "form-up"; unitId: UnitId; formation: FormationName }
  /**
   * Deployment: brief a subordinate before he marches. Free here and couriered
   * once the clock runs, because this is the hour a brief is given in.
   */
  | { kind: "brief"; unitId: UnitId; latitude: Latitude }
  /** Deployment: stand the tables somewhere inside the zone. */
  | { kind: "post-headquarters"; at: Vec2 }
  /** The arranging is done and the clock may run. */
  | { kind: "stand-to" }
  /** An Order, ridden from the Headquarters by a Courier (ADR-0002). */
  | { kind: "order"; unitId: UnitId; body: OrderBody }
  /** Send the staff to new ground. Nothing leaves it while it rides (ADR-0008). */
  | { kind: "ride"; at: Vec2 }
  /** How fast the afternoon is watched. Never how long a step is. */
  | { kind: "tempo"; tempo: number }
  /**
   * Stop and start the clock.
   *
   * A solo Commander may stop his own afternoon because there is nobody else in
   * it. Under two Commanders one clock runs for both and this is refused —
   * which is a difference in what a *session* accepts and not a difference in
   * the rules of a battle, so it is inside what ADR-0013 allows and worth
   * saying out loud that it is the closest thing to the line.
   */
  | { kind: "pause"; on: boolean }
  /** Break off the action, and take the army off the Field. */
  | { kind: "concede" }

export interface BattleSession {
  /**
   * The two states the screen draws between, and how far through it is (F14).
   * A local session steps the simulation to produce them; a remote one is sent
   * them.
   */
  readonly previous: BattleSnapshot
  readonly current: BattleSnapshot
  readonly alpha: number
  /** Whether the clock is running. A decided battle is not. */
  readonly running: boolean
  /**
   * The Tempo the clock is actually running at, which is not always the one
   * that was asked for: under two Commanders both ask and the battle takes the
   * slower of the two (F21). The screen reads it here rather than off the
   * button that was pressed.
   */
  readonly tempo: number
  /** How the battle ended, once it has. Null while it is still being fought. */
  readonly outcome: Outcome | null
  /** Wall-clock seconds have passed. */
  advance(seconds: number): void
  /** Say something to the battle. */
  send(command: Command): void
  /** What each army had to show for the afternoon. Read once it is over. */
  returns(): ArmyReturn[]
}
