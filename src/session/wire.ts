import type { Command } from "./index"
import type { ArmyReturn } from "@/sim/return"
import type { BattleSnapshot } from "@/sim/snapshot"
import type { ArmyId, Dispatch, Outcome } from "@/sim/types"

/**
 * What goes down the socket, in both directions.
 *
 * One file, imported by the client and by the server, because a protocol
 * written down twice is a protocol with two meanings. It is the only thing
 * `server/` and `src/` share besides the simulation itself.
 *
 * There is no HTTP API. Creating a battle, joining one and giving an Order are
 * all messages on the socket that is already open — a second transport would
 * be a second set of failure modes for a game whose whole network is one
 * connection per Commander.
 */

/** The path the socket is opened on. */
export const WIRE_PATH = "/ws"

/** What a Commander says. */
export type Ask =
  /**
   * Open a battle on the named Scenario. Nobody has taken an army yet; the
   * Commander who opened it picks first and the one he hands the link to gets
   * what is left.
   */
  | { ask: "open"; scenario: string }
  /**
   * Sit down at a battle already in progress. `token` is a seat being
   * reclaimed after going Out of Contact — the same address, the same army,
   * and the afternoon carried on without you (F24).
   */
  | { ask: "join"; battle: string; token?: string }
  /** Everything else, which is C16's own vocabulary and not the wire's. */
  | { ask: "say"; command: Command }

/** What the battle answers. */
export type Tell =
  /**
   * A seat. `army` is null until one has been taken, which is the state a
   * Commander is in while he is reading the offer.
   */
  | { tell: "seat"; battle: string; scenario: string; army: ArmyId | null; token: string }
  /** Both armies are taken and neither of them is yours. */
  | { tell: "full"; battle: string }
  /** No battle of that name. A hand-edited address, or one that has expired. */
  | { tell: "gone"; battle: string }
  /** The battle, as this Commander is told it. */
  | { tell: "state"; state: State }
  /** Something was said that the battle would not take, and why. */
  | { tell: "refused"; because: string }

/**
 * One state message: a snapshot with its feed sent as a tail.
 *
 * `BattleSnapshot.dispatches` is the whole feed every step, which is the right
 * shape in memory and the wrong one on a wire — a Castiglione ends with several
 * hundred lines in it, and sending all of them ten times a second would cost
 * more than everything else here put together. So the transport carries what is
 * new, the client keeps what it has been sent, and the seam's contract is
 * unchanged on both sides of it.
 */
export interface State {
  /** Everything but the feed. */
  snapshot: Omit<BattleSnapshot, "dispatches">
  /** Dispatches from `dispatchesFrom` onward, in order. */
  dispatches: Dispatch[]
  /** How many the Commander has been sent before these. */
  dispatchesFrom: number
  running: boolean
  tempo: number
  outcome: Outcome | null
  /** Filled in with the Outcome, and null while the battle is still on. */
  returns: ArmyReturn[] | null
  /**
   * True while the other Commander is still arranging his army, or has not
   * arrived. What it does *not* say is anything about what he is doing (F23).
   */
  waitingForTheOther: boolean
  /** True once this Commander has said his own army is arranged. */
  stoodTo: boolean
}
