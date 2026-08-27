import { chargersOf } from "./charge"
import { cellAt, cellIndex, crossingWidth, inBounds, isCrossing } from "./field"
import {
  allows,
  baseSpeed,
  beginChange,
  canFire,
  FIGHTING_FORMATION,
  frontage,
  intendedFormation,
  TRAVELLING_FORMATION,
} from "./formation"
import { breakUnit, canRally, hasBroken, isRouting, rally } from "./morale"
import type { Battle, FormationName, Unit } from "./types"
import { bearing, distance } from "./vec"

/**
 * C2 Initiative.
 *
 * An ordered priority list, evaluated each tick, first match wins (ADR-0004).
 * The rule that fires *is* the reason, so a Dispatch explains itself for free.
 *
 * Initiative is strictly defensive: it preserves — it never advances, never
 * takes ground, never picks an objective. That boundary is what stops good
 * Initiative from making the player redundant.
 *
 * It suspends the live Order rather than cancelling it. Cancelling would leave
 * a battalion standing in an empty field until a new Order rode out to it.
 */

export interface InitiativeAction {
  /** The Formation the Unit adopts on its own account, if the rule changes it. */
  formation?: FormationName
  /**
   * What the rule does to the Unit's obedience. Only Morale reaches this far: a
   * Rout is a Unit that has stopped listening, which no Formation rule can say.
   */
  obedience?: "break" | "rally"
}

export interface InitiativeRule {
  /** Named as the Dispatch would read it — this text is the cause. */
  name: string
  applies: (unit: Unit, battle: Battle) => InitiativeAction | null
}

/** Metres of Route left below which a Unit is deploying, not travelling. */
const DEPLOY_RANGE = 180

/** How far ahead a Unit looks for the mouth of a Crossing. */
const CROSSING_LOOKAHEAD = 120

/**
 * Metres within which a Unit will not be caught on the march. Roughly cannon
 * shot, and about ninety seconds of cavalry — long enough that a battalion
 * still has time to do something about it, which is the only reason to pick a
 * number larger than musket range.
 *
 * Known cheat: this reads true positions. Concealment is not built, so a Unit
 * deploys against an enemy it could not actually see. Revisit with C8.
 */
const ENGAGEMENT_RANGE = 300

/** Route left, in metres, following the waypoints rather than the crow. */
function routeRemaining(unit: Unit): number {
  if (unit.route.length === 0) return 0
  let total = distance(unit.position, unit.route[0])
  for (let i = 1; i < unit.route.length; i++) {
    total += distance(unit.route[i - 1], unit.route[i])
  }
  return total
}

/**
 * Metres of gap where the Unit's Route enters a Crossing within the lookahead,
 * or null if it meets none. The width is what the rule needs: whether to file
 * into column is a question about the gap, not about there being one.
 */
function crossingAhead(unit: Unit, battle: Battle): number | null {
  if (unit.route.length === 0) return null
  const field = battle.field
  const target = unit.route[0]
  const span = distance(unit.position, target)
  const heading = bearing(unit.position, target)
  const steps = Math.ceil(Math.min(span, CROSSING_LOOKAHEAD) / field.cellSize)
  for (let i = 0; i <= steps; i++) {
    const t = span === 0 ? 0 : Math.min(1, (i * field.cellSize) / span)
    const p = {
      x: unit.position.x + (target.x - unit.position.x) * t,
      y: unit.position.y + (target.y - unit.position.y) * t,
    }
    const { cx, cy } = cellAt(field, p)
    if (!inBounds(field, cx, cy)) continue
    if (isCrossing(field, cellIndex(field, cx, cy))) {
      return crossingWidth(field, cx, cy, heading)
    }
  }
  return null
}

/**
 * True if a Crossing ahead would stop the Unit in the Formation given. Frontage
 * against the gap — the same question `admits` asks at the mouth of it, asked
 * early enough for the rule list to do something about the answer.
 */
function squeezedBy(unit: Unit, battle: Battle, formation: FormationName): boolean {
  const gap = crossingAhead(unit, battle)
  if (gap === null) return false
  return frontage(unit.arm, formation, unit.strength) > gap
}

/** A Form Order pins the Formation; Initiative does not argue with the player. */
function pinned(unit: Unit): boolean {
  return unit.order?.order.body.kind === "form"
}

function travelling(unit: Unit): FormationName {
  return TRAVELLING_FORMATION[unit.arm]
}

/** True if any enemy stands within ENGAGEMENT_RANGE. */
function enemyNear(unit: Unit, battle: Battle): boolean {
  for (const other of battle.units) {
    if (other.army === unit.army) continue
    if (distance(unit.position, other.position) <= ENGAGEMENT_RANGE) return true
  }
  return false
}

/**
 * True if enemy cavalry is committed to a Charge on this Unit and near enough
 * that there is any point doing something about it.
 */
function chargedByCavalry(unit: Unit, battle: Battle): boolean {
  return chargersOf(battle, unit).some(
    (horse) =>
      horse.arm === "cavalry" && distance(unit.position, horse.position) <= ENGAGEMENT_RANGE,
  )
}

/**
 * The Formation to deploy into when caught travelling. The Order's arrival
 * Formation is the player's own answer, so use it when it can fight; a Unit
 * ordered to arrive in column still has to survive the last three hundred
 * metres, and falls back on the Arm's fighting Formation to do it.
 */
function deployInto(unit: Unit): FormationName {
  const body = unit.order?.order.body
  if (body?.kind === "move" && canFire(unit.arm, body.arrivalFormation)) {
    return body.arrivalFormation
  }
  return FIGHTING_FORMATION[unit.arm]
}

/**
 * The list, in priority order: whether a Unit is still obeying anybody at all,
 * then how it chooses to travel and when it stops travelling. Order matters
 * throughout: Morale outranks everything, because a battalion that has broken is
 * not going to file into column for the bridge on the way past, and making
 * square outranks every reason to be marching, because nothing else that
 * happens to a battalion is as urgent as horse at the gallop.
 */
export const RULES: InitiativeRule[] = [
  {
    // Above Breaking, so a Unit that has run itself steady again comes back
    // under command rather than being held by the rule that broke it. It picks
    // its Arm's fighting Formation and takes the drill to get there — a mob does
    // not re-form for nothing, and the ground it lost is what the Rout cost.
    name: "rallied, clear of the enemy and back under command",
    applies: (unit, battle) => {
      if (!canRally(battle, unit)) return null
      return { formation: FIGHTING_FORMATION[unit.arm], obedience: "rally" }
    },
  },
  {
    // First of everything else, and it stays matched for as long as the Unit is
    // Routing — which is what keeps the marching rules off a mob. Morale creeps
    // back while it runs, so the test is "is it Routing", not "is its Morale
    // gone": otherwise the first tick of recovery would hand the battalion back
    // to the rule that files it into column.
    name: "broke, and is running for the rear",
    applies: (unit) => {
      if (!isRouting(unit) && !hasBroken(unit)) return null
      return { obedience: "break" }
    },
  },
  {
    // Third, under the two Morale rules and over everything about marching. A
    // Charge coming on is the most urgent thing that happens to a battalion,
    // and it will stop mid-march and mid-Order to meet it.
    //
    // It answers a Charge and not the sight of cavalry. A battalion that
    // squared up whenever horse stood within cannon shot would be frozen for
    // free, all day, at no risk to the horse — and Initiative would be doing
    // the anticipating that is the player's whole job. The rule preserves; it
    // does not command.
    //
    // Thirty seconds of drill against twenty-one of gallop: this only lands in
    // time against a Charge let go at a distance. Walking the last hundred and
    // fifty metres up under a Move Order first is how a Charge is made to
    // arrive before the square does, and seeing that coming is the player's.
    name: "formed square, cavalry coming on",
    applies: (unit, battle) => {
      if (pinned(unit)) return null
      if (!allows(unit.arm, "square")) return null
      if (!chargedByCavalry(unit, battle)) return null
      // Not at the mouth of a gap a square will not fit through, for the same
      // reason the deploying rule is not: it would be stopped on the bank in a
      // Formation that cannot cross, and the rule below would file it straight
      // back into column.
      if (squeezedBy(unit, battle, "square")) return null
      return { formation: "square" }
    },
  },
  {
    // First of the marching rules, and not guarded by the enemy being away,
    // unlike every other one. A Unit too wide for the gap is stopped dead at the mouth
    // of it, so if deploying outranked this a battalion sent over a bridge with
    // the enemy within cannon shot would stand on the near bank in line for the
    // rest of the battle. Forming column to cross under fire is the period's
    // answer and its cost is the point — Lodi and Arcole were both that.
    //
    // It only fires when the Unit does not fit: a gorge wide enough for an
    // attack column lets one through in attack column.
    name: "squeezed into march column for the crossing",
    applies: (unit, battle) => {
      if (pinned(unit)) return null
      if (intendedFormation(unit) === travelling(unit)) return null
      if (!squeezedBy(unit, battle, intendedFormation(unit))) return null
      return { formation: travelling(unit) }
    },
  },
  {
    // Above the travelling rules, because coming out of column outranks any
    // reason to be in one. This rule acts, so it suspends the Order and the
    // Unit stands still to drill — which is right: it cannot march and form
    // at once, and arriving late beats arriving in column.
    name: "deployed, the enemy too close to stay on the march",
    applies: (unit, battle) => {
      if (pinned(unit)) return null
      if (canFire(unit.arm, intendedFormation(unit))) return null
      if (!enemyNear(unit, battle)) return null
      // Not at the mouth of a gap the deploying Formation will not fit through.
      // The Unit would be stopped dead on the near bank and the rule above
      // would file it straight back into column, the two rules taking turns
      // while the enemy watched. Crossing in column under threat is what the
      // rule above is for, and going over unable to fire is the cost of it.
      if (squeezedBy(unit, battle, deployInto(unit))) return null
      return { formation: deployInto(unit) }
    },
  },
  {
    // Above the rules that only bother for ground worth covering, because a
    // Formation with no speed at all cannot be walked into position however
    // short the distance — a battery ordered fifty metres forward would
    // otherwise sit in battery with a live Order and never reach it.
    //
    // Guarded by the enemy being away, like the other travelling rules. So a
    // battery ordered to move with the enemy in reach stays in battery and its
    // Order stalls, which is the right answer rather than idleness: guns do not
    // hitch up and trundle off under close threat, and the one thing they can
    // still do — traverse onto the threat — they are already doing.
    name: "limbered up, because guns in battery do not move",
    applies: (unit, battle) => {
      if (pinned(unit)) return null
      if (enemyNear(unit, battle)) return null
      if (unit.order?.order.body.kind !== "move") return null
      if (routeRemaining(unit) <= 0) return null
      if (baseSpeed(unit.arm, intendedFormation(unit)) > 0) return null
      return { formation: travelling(unit) }
    },
  },
  {
    name: "took march column to cover the ground",
    applies: (unit, battle) => {
      if (pinned(unit)) return null
      if (enemyNear(unit, battle)) return null
      if (unit.order?.order.body.kind !== "move") return null
      if (intendedFormation(unit) === travelling(unit)) return null
      if (routeRemaining(unit) < DEPLOY_RANGE) return null
      return { formation: travelling(unit) }
    },
  },
]

/**
 * Run the list for one Unit. A rule that fires suspends the Order; when no rule
 * matches any more, the Unit picks the Order back up where it left it.
 */
export function applyInitiative(unit: Unit, battle: Battle): void {
  for (const rule of RULES) {
    const action = rule.applies(unit, battle)
    if (!action) continue
    if (unit.suspendedBy === rule.name) return
    const reformed = action.formation ? beginChange(unit, action.formation) : false
    // A rule that only re-forms the Unit has done nothing if the Unit is already
    // standing that way, and must not claim the Order. A rule that changes what
    // the Unit is *obeying* has always done something.
    if (action.obedience === "break") breakUnit(battle, unit)
    else if (action.obedience === "rally") rally(unit)
    else if (!reformed) return
    unit.suspendedBy = rule.name
    battle.dispatches.push({
      at: battle.time,
      unitId: unit.id,
      text: `${unit.name} ${rule.name}`,
    })
    return
  }
  if (unit.suspendedBy !== null && unit.changing === null) {
    unit.suspendedBy = null
  }
}
