import { isRouting, shareGone } from "./morale"
import type { ArmyId, Battle } from "./types"

/**
 * The Return: what each army has to show for the afternoon, read off the
 * Battle at the moment it ended.
 *
 * A period army rendered a return of its strength and its killed and wounded,
 * and that is exactly what this is — a tally of facts, not a score. It carries
 * no total and no points, because there is nothing here to add up: the ground
 * an army took and the men it spent taking it are two different currencies, and
 * the Outcome has already said which of them decided the day.
 *
 * It is derived and never stored. Nothing in here is state the simulation keeps.
 */

export interface ArmyReturn {
  id: ArmyId
  name: string
  colour: number
  /** Units still in hand: on the Field, and not running. */
  inHand: number
  /** Units running now. A Rout is not a grave — these may yet have Rallied. */
  running: number
  /**
   * Units the army no longer has at all: run clean off the Field and not
   * coming back. It is the difference between what was mustered and what is
   * still somewhere, and without it the other two lines do not add up to an
   * army — a battalion that ran off the edge leaves no row of its own.
   */
  gone: number
  /** Men still with the army, across every Unit it has left. */
  strength: number
  /** Men it put on the Field at Deployment, Units on the road included. */
  mustered: number
  /**
   * How far it went toward Army Break, 0 to 1, on the same weighting the end
   * condition uses. The one number that answers whether there is still an army
   * here — and the reason it is a share and not a count is that an army leaning
   * on its elites loses more by losing them.
   */
  spent: number
  /** Pieces of Key Ground it ended holding, by name. */
  keyGround: string[]
}

/** Men still with an army, counting only Units it still has. */
function strengthOf(battle: Battle, army: ArmyId): number {
  let men = 0
  for (const unit of battle.units) {
    if (unit.army === army) men += unit.strength
  }
  return men
}

/**
 * The Return for every army in a Battle, in the order the Scenario named them.
 *
 * Units still on the road count as mustered and not as in hand, and they are
 * not gone either — which is the same asymmetry Army Break takes: a column that
 * never arrived was the army's to lose, and it was not the army's to fight
 * with, and it certainly did not run away.
 */
export function armyReturns(battle: Battle): ArmyReturn[] {
  return battle.armies.map((army) => {
    let inHand = 0
    let running = 0
    for (const unit of battle.units) {
      if (unit.army !== army.id) continue
      if (isRouting(unit)) running += 1
      else inHand += 1
    }
    const onTheRoad = battle.arrivals.filter((a) => a.unit.army === army.id).length
    return {
      id: army.id,
      name: army.name,
      colour: army.colour,
      inHand,
      running,
      gone: Math.max(0, army.units - inHand - running - onTheRoad),
      strength: strengthOf(battle, army.id),
      mustered: army.strength,
      spent: shareGone(battle, army),
      keyGround: battle.keyGround.filter((g) => g.holder === army.id).map((g) => g.name),
    }
  })
}
