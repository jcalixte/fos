import { averageCostUnder } from "./field"
import { baseSpeed, beginChange, frontage, intendedFormation, unitFootprint } from "./formation"
import { applyInitiative } from "./initiative"
import { advanceCouriers } from "./orders"
import { describeFormation, type Battle, type Unit } from "./types"
import { angleDelta, bearing, distance } from "./vec"
import { route as findRoute } from "./routing"

/**
 * C8 Battle Clock.
 *
 * A fixed 10Hz timestep, which is what makes a battle replay identically from
 * its Scenario and seed (ADR-0003). Tempo scales how many steps are taken per
 * real second and never the size of a step, so no result depends on the speed
 * the player chose to watch at.
 *
 * The renderer draws *between* the last two states. Interpolated positions must
 * never come back in here, or replays diverge.
 */

/** Seconds per simulation step. */
export const STEP = 0.1

/** Metres from its destination at which a Unit counts as arrived. */
const ARRIVAL_RANGE = 8

/** How close to the ordered facing counts as dressed, in radians. */
const FACING_TOLERANCE = 0.05

/**
 * Metres per second a Unit makes over the ground under its Footprint. Terrain
 * reaches it as an average over the Footprint, never cell by cell.
 */
export function unitSpeed(battle: Battle, unit: Unit): number {
  const shape = unitFootprint(unit)
  const cost = averageCostUnder(battle.field, unit.position, shape.width, shape.depth, unit.facing)
  return baseSpeed(unit.arm, unit.formation) / Math.max(0.5, cost)
}

/**
 * Radians per second a Unit can wheel. Derived rather than authored: the outer
 * flank of a long line has further to walk, so a 140m line wheels slowly and a
 * march column turns on the spot (F8).
 */
function turnRate(battle: Battle, unit: Unit): number {
  const width = Math.max(4, frontage(unit.arm, unit.formation, unit.strength))
  return (2 * Math.max(0.4, unitSpeed(battle, unit))) / width
}

function turnToward(battle: Battle, unit: Unit, target: number, dt: number): void {
  const delta = angleDelta(unit.facing, target)
  const most = turnRate(battle, unit) * dt
  unit.facing += Math.abs(delta) <= most ? delta : Math.sign(delta) * most
}

function advanceFormationChange(battle: Battle, unit: Unit, dt: number): void {
  if (!unit.changing) return
  unit.changing.elapsed += dt
  if (unit.changing.elapsed < unit.changing.duration) return
  const settled = unit.changing.to
  unit.formation = settled
  unit.changing = null
  battle.dispatches.push({
    at: battle.time,
    unitId: unit.id,
    text: `${unit.name} is in ${describeFormation(settled)}`,
  })
}

function advanceOrder(battle: Battle, unit: Unit, dt: number): void {
  const live = unit.order
  if (!live) return
  const body = live.order.body

  if (body.kind === "halt") {
    unit.route = []
    return
  }

  if (body.kind === "form") {
    unit.route = []
    if (intendedFormation(unit) !== body.formation) {
      beginChange(unit, body.formation)
    }
    return
  }

  // A Unit re-forming has halted; it cannot march and drill at once.
  if (unit.changing) return

  const gap = distance(unit.position, body.destination)
  if (gap > ARRIVAL_RANGE) {
    if (unit.route.length === 0) {
      unit.route = findRoute(battle.field, unit.position, body.destination)
      if (unit.route.length === 0) unit.route = [body.destination]
    }
    const waypoint = unit.route[0]
    const stride = unitSpeed(battle, unit) * dt
    const toWaypoint = distance(unit.position, waypoint)
    turnToward(battle, unit, bearing(unit.position, waypoint), dt)
    if (toWaypoint <= stride) {
      unit.position = { ...waypoint }
      unit.route.shift()
    } else {
      const heading = bearing(unit.position, waypoint)
      unit.position = {
        x: unit.position.x + Math.cos(heading) * stride,
        y: unit.position.y + Math.sin(heading) * stride,
      }
    }
    return
  }

  // Arrived. Dress on the ordered facing, then take up the ordered Formation.
  // A battalion therefore arrives in whatever it marched in and re-forms while
  // standing on the spot, where historically it would have deployed short of
  // it. Known simplification: deploying early means guessing how much ground
  // the Unit needs before it has any, and nothing in milestone 1 punishes it.
  unit.route = []
  if (Math.abs(angleDelta(unit.facing, body.arrivalFacing)) > FACING_TOLERANCE) {
    turnToward(battle, unit, body.arrivalFacing, dt)
    return
  }
  unit.facing = body.arrivalFacing
  if (intendedFormation(unit) !== body.arrivalFormation) {
    beginChange(unit, body.arrivalFormation)
    return
  }
  unit.order = null
  battle.dispatches.push({
    at: battle.time,
    unitId: unit.id,
    text: `${unit.name} is in position, ${describeFormation(body.arrivalFormation)}`,
  })
}

function releaseArrivals(battle: Battle): void {
  const due = battle.arrivals.filter((a) => a.at <= battle.time)
  if (due.length === 0) return
  for (const arrival of due) {
    const unit = arrival.unit
    unit.position = { ...arrival.entry }
    battle.units.push(unit)
    if (arrival.order) {
      unit.order = {
        order: {
          id: `a${battle.nextId++}`,
          unitId: unit.id,
          body: arrival.order,
          issuedAt: battle.time,
        },
        arrivedAt: battle.time,
      }
    }
    battle.dispatches.push({
      at: battle.time,
      unitId: unit.id,
      text: `${unit.name} came onto the Field`,
    })
  }
  battle.arrivals = battle.arrivals.filter((a) => a.at > battle.time)
}

function firePlan(battle: Battle): void {
  const due = battle.plan.filter((p) => p.at <= battle.time)
  if (due.length === 0) return
  for (const planned of due) {
    const unit = battle.units.find((u) => u.id === planned.unitId)
    if (!unit) continue
    // The enemy's Plan is authored intent, not a Courier ride: it stands in for
    // orders given before the clock started.
    unit.order = {
      order: {
        id: `p${battle.nextId++}`,
        unitId: unit.id,
        body: planned.body,
        issuedAt: battle.time,
      },
      arrivedAt: battle.time,
    }
    unit.route = []
  }
  battle.plan = battle.plan.filter((p) => p.at > battle.time)
}

/** One fixed step. Never call this with anything but STEP. */
export function step(battle: Battle): void {
  battle.time += STEP
  releaseArrivals(battle)
  firePlan(battle)
  advanceCouriers(battle, STEP)
  for (const unit of battle.units) {
    applyInitiative(unit, battle)
    advanceFormationChange(battle, unit, STEP)
    if (unit.suspendedBy === null) advanceOrder(battle, unit, STEP)
  }
}

export function isOver(battle: Battle): boolean {
  return battle.time >= battle.clock
}
