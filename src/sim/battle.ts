import { averageCostUnder, cellAt, cellIndex, crossingWidth, inBounds, isCrossing } from "./field"
import { baseSpeed, beginChange, frontage, intendedFormation, unitFootprint } from "./formation"
import { resolveFire } from "./fighting"
import { applyInitiative } from "./initiative"
import { advanceRout, hasQuitTheField, isRouting, recover } from "./morale"
import { advanceCouriers } from "./orders"
import { describeFormation, type Battle, type Unit, type Vec2 } from "./types"
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
 *
 * The floor is what a Unit that cannot march can still do. A battery in battery
 * has no speed at all and yet traverses its guns; this is the rate it does it
 * at, and the reason the floor is not zero.
 */
const TRAVERSE_SPEED = 0.4

function turnRate(battle: Battle, unit: Unit): number {
  const width = Math.max(4, frontage(unit.arm, unit.formation, unit.strength))
  return (2 * Math.max(TRAVERSE_SPEED, unitSpeed(battle, unit))) / width
}

/**
 * Ground a Unit needs to come onto its ordered facing while still marching.
 * A wheel's outer flank walks the arc, so the ground is the turn times half the
 * Frontage — and the speed cancels out, which is why this is a distance and not
 * a time. A march column dresses in a couple of metres and a line in a hundred.
 */
function dressingGround(unit: Unit, facing: number): number {
  const width = Math.max(4, frontage(unit.arm, unit.formation, unit.strength))
  return Math.abs(angleDelta(unit.facing, facing)) * (width / 2)
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

/**
 * True if the Unit fits through the Crossing it is about to step onto. A
 * battalion in line is 140m across and a bridge deck is 8m wide: it does not
 * get over by being ordered to, it files into column first.
 *
 * Frontage against the gap, so one rule passes a column of files over a
 * footbridge and a whole attack column through a gorge, with nothing authored
 * per Formation (F8).
 *
 * In play it is Initiative that forms the column, well before the Unit reaches
 * the bank — so this is the backstop that makes "only a column crosses" a rule
 * of the Field rather than a habit of the rule list. Exported to be tested for
 * exactly that reason: nothing in a normal march makes it fire.
 */
export function admits(battle: Battle, unit: Unit, at: Vec2, heading: number): boolean {
  const field = battle.field
  const { cx, cy } = cellAt(field, at)
  if (!inBounds(field, cx, cy)) return true
  if (!isCrossing(field, cellIndex(field, cx, cy))) return true
  return unitFootprint(unit).width <= crossingWidth(field, cx, cy, heading)
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
    // Dress over the last stretch rather than on arrival. A battalion that has
    // marched four hundred metres has been coming onto its facing as it went,
    // and charging the wheel afterwards left it standing still for two minutes
    // at the end of every Order — the one moment the player is watching it.
    const dressing =
      unit.route.length === 1 &&
      toWaypoint <= dressingGround(unit, body.arrivalFacing) + ARRIVAL_RANGE
    const heading = bearing(unit.position, waypoint)
    turnToward(battle, unit, dressing ? body.arrivalFacing : heading, dt)
    const next =
      toWaypoint <= stride
        ? { ...waypoint }
        : {
            x: unit.position.x + Math.cos(heading) * stride,
            y: unit.position.y + Math.sin(heading) * stride,
          }
    // Held at the mouth of a Crossing it does not fit through. Initiative is
    // what gets it into column; until then it stands, and so does the Order.
    if (!admits(battle, unit, next, heading)) return
    unit.position = next
    if (toWaypoint <= stride) unit.route.shift()
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

/**
 * Units that are out of the battle: the ones that ran off the edge of the Field,
 * and the ones with nobody left.
 *
 * The second is a backstop and is meant to stay unreachable — F10 is explicit
 * that a Unit reaching 0 Strength is a bug, and Morale is what makes it one. A
 * battalion Breaks at a fifth of its men, so the only way to see that Dispatch
 * now is a Rout that shed itself away without ever getting clear.
 */
function clearTheGone(battle: Battle): void {
  const gone = battle.units.filter((u) => u.strength <= 0 || hasQuitTheField(battle, u))
  if (gone.length === 0) return
  for (const unit of gone) {
    battle.dispatches.push({
      at: battle.time,
      unitId: unit.id,
      text:
        unit.strength <= 0
          ? `${unit.name} was destroyed where it stood`
          : `${unit.name} quit the Field`,
    })
  }
  battle.units = battle.units.filter((u) => !gone.includes(u))
}

/** One fixed step. Never call this with anything but STEP. */
export function step(battle: Battle): void {
  battle.time += STEP
  battle.volleys = []
  releaseArrivals(battle)
  firePlan(battle)
  advanceCouriers(battle, STEP)
  for (const unit of battle.units) {
    applyInitiative(unit, battle)
    advanceFormationChange(battle, unit, STEP)
    if (isRouting(unit)) {
      // A Rout obeys nothing and fires at nothing. It runs.
      advanceRout(battle, unit, STEP)
    } else {
      const was = unit.position
      if (unit.suspendedBy === null) advanceOrder(battle, unit, STEP)
      // Fire comes after the march, so what a Unit shoots at is where it ended
      // the step — and whether it marched at all is what says if it shot.
      resolveFire(battle, unit, STEP, distance(was, unit.position) < 0.001)
    }
    recover(battle, unit, STEP)
  }
  clearTheGone(battle)
}

export function isOver(battle: Battle): boolean {
  return battle.time >= battle.clock
}
