import { cellAt, cellIndex, inBounds, isCrossing } from "./field"
import { beginChange, intendedFormation, TRAVELLING_FORMATION } from "./formation"
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

/**
 * The list, in priority order. Milestone 1 has no fighting in it, so the only
 * rules are the ones about how a Unit chooses to travel. Return fire, forming
 * square, Breaking, Routing and Rallying join the list above these when C6 and
 * C7 land — order matters, and the fighting rules outrank the marching ones.
 */
export const RULES: InitiativeRule[] = [
  {
    name: "squeezed into march column for the crossing",
    applies: (unit, battle) => {
      if (pinned(unit)) return null
      if (intendedFormation(unit) === travelling(unit)) return null
      if (!crossingAhead(unit, battle)) return null
      return { formation: travelling(unit) }
    },
  },
  {
    name: "took march column for the road",
    applies: (unit) => {
      if (pinned(unit)) return null
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
