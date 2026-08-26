import { cellAt, cellIndex, inBounds, isCrossing } from "./field"
import {
  baseSpeed,
  beginChange,
  canFire,
  FIGHTING_FORMATION,
  intendedFormation,
  TRAVELLING_FORMATION,
} from "./formation"
import type { Battle, FormationName, Unit } from "./types"
import { distance } from "./vec"

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
  /** The Formation the Unit adopts on its own account. */
  formation: FormationName
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

/** True if the Unit's Route enters a Crossing within the lookahead. */
function crossingAhead(unit: Unit, battle: Battle): boolean {
  if (unit.route.length === 0) return false
  const field = battle.field
  const target = unit.route[0]
  const span = distance(unit.position, target)
  const steps = Math.ceil(Math.min(span, CROSSING_LOOKAHEAD) / field.cellSize)
  for (let i = 0; i <= steps; i++) {
    const t = span === 0 ? 0 : Math.min(1, (i * field.cellSize) / span)
    const p = {
      x: unit.position.x + (target.x - unit.position.x) * t,
      y: unit.position.y + (target.y - unit.position.y) * t,
    }
    const { cx, cy } = cellAt(field, p)
    if (!inBounds(field, cx, cy)) continue
    if (isCrossing(field, cellIndex(field, cx, cy))) return true
  }
  return false
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
 * The list, in priority order: how a Unit chooses to travel, and when it stops
 * travelling. Return fire, forming square against cavalry, Breaking, Routing
 * and Rallying join above these when C6 and C7 land — order matters, and the
 * fighting rules outrank the marching ones.
 */
export const RULES: InitiativeRule[] = [
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
    name: "squeezed into march column for the crossing",
    applies: (unit, battle) => {
      if (pinned(unit)) return null
      if (enemyNear(unit, battle)) return null
      if (intendedFormation(unit) === travelling(unit)) return null
      if (!crossingAhead(unit, battle)) return null
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
    if (!beginChange(unit, action.formation)) return
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
