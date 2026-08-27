import {
  cellAt,
  cellIndex,
  crossingWidth,
  groundDivisor,
  inBounds,
  isCrossing,
  passable,
} from "./field"
import { baseSpeed, beginChange, frontage, intendedFormation, unitFootprint } from "./formation"
import {
  CHARGE_RANGE,
  chargeSpeed,
  CONTACT_RANGE,
  endCharge,
  gapTo,
  RECOIL_DISTANCE,
  resolveContact,
  struckSide,
} from "./charge"
import { resolveFire } from "./fighting"
import { applyInitiative } from "./initiative"
import { advanceRout, dread, hasArmyBroken, hasQuitTheField, isRouting, recover } from "./morale"
import { advanceCouriers } from "./orders"
import {
  describeFormation,
  type ArmyId,
  type Battle,
  type ChargeOrder,
  type Outcome,
  type Unit,
  type Vec2,
} from "./types"
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
  return paceOf(battle, unit, baseSpeed(unit.arm, unit.formation))
}

/** What `base` metres a second comes to over the ground under the Unit. */
function paceOf(battle: Battle, unit: Unit, base: number): number {
  const shape = unitFootprint(unit)
  return base / groundDivisor(battle.field, unit.position, shape.width, shape.depth, unit.facing)
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

/**
 * Move a Unit that is running rather than marching: straight down a heading, at
 * whatever the ground leaves of the pace, stopping at anything it cannot enter.
 */
function runOn(
  battle: Battle,
  unit: Unit,
  heading: number,
  base: number,
  dt: number,
  wheel: boolean,
): void {
  if (wheel) turnToward(battle, unit, heading, dt)
  const stride = paceOf(battle, unit, base) * dt
  const next = {
    x: unit.position.x + Math.cos(heading) * stride,
    y: unit.position.y + Math.sin(heading) * stride,
  }
  const { cx, cy } = cellAt(battle.field, next)
  if (inBounds(battle.field, cx, cy) && !passable(battle.field, cellIndex(battle.field, cx, cy))) {
    return
  }
  if (!admits(battle, unit, next, heading)) return
  unit.position = next
}

/**
 * A Charge under way, which is two different things with a seam between them.
 * Beyond CHARGE_RANGE the Unit is walking up at its Formation's own pace;
 * inside it, it is running, and the ground it covers running is the only ground
 * that costs it anything. That seam is standing in for Fatigue until Fatigue is
 * built — without it a regiment could gallop the length of the Field for free,
 * and the player's real problem, which is getting the horse close under a Move
 * Order before letting them go, would not exist.
 *
 * It goes straight at what it was aimed at. A Charge does not pick its way
 * round a wood, because it is a committed run and not a march, so it stops dead
 * at ground it cannot enter and at a Crossing it does not fit through — and the
 * Order stands there until the player sends another.
 */
function advanceCharge(battle: Battle, unit: Unit, body: ChargeOrder, dt: number): void {
  const target = battle.units.find((u) => u.id === body.targetId)
  if (!target) {
    endCharge(battle, unit, `${unit.name} has nothing left to charge`)
    return
  }
  unit.charging ??= { targetId: target.id, launchedAt: battle.time, recoiling: false }
  const charge = unit.charging

  // Nobody rides down a mob here: Pursuit is not built, so the chargers pull up
  // and watch it go. Generous to the Unit that ran, and knowingly so.
  if (isRouting(target)) {
    endCharge(battle, unit, `${unit.name} pulled up; ${target.name} was already running`)
    return
  }

  const gap = gapTo(unit, target)

  if (charge.recoiling) {
    if (gap >= RECOIL_DISTANCE) {
      endCharge(battle, unit, `${unit.name} is clear of ${target.name}, and blown`)
      return
    }
    runOn(battle, unit, bearing(target.position, unit.position), chargeSpeed(unit.arm), dt, true)
    return
  }

  if (gap <= CONTACT_RANGE) {
    resolveContact(battle, unit, target)
    return
  }

  const running = gap <= CHARGE_RANGE
  // What it costs to be charged at, before anybody is touched. Only while they
  // are actually running: a regiment walking up at two and a half metres a
  // second is a threat, and the threat is what the square rule answers.
  if (running) dread(target, unit, struckSide(target, unit.position) === null, dt)
  const pace = running ? chargeSpeed(unit.arm) : baseSpeed(unit.arm, unit.formation)
  runOn(battle, unit, bearing(unit.position, target.position), pace, dt, true)
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

  if (body.kind === "charge") {
    advanceCharge(battle, unit, body, dt)
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
    unit.charging = null
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
  battle.contacts = []
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
  holdKeyGround(battle)
  decide(battle)
}

/**
 * Who holds each piece of Key Ground, kept up to date as Units walk on and off
 * it. An army holds one by having the last uncontested Unit on it: while both
 * armies have somebody standing there it changes hands for nobody, and a piece
 * taken and then marched away from stays taken until somebody else takes it.
 *
 * A Rout does not count. A mob streaming back over the bridge has not held the
 * bridge, and the army it belongs to is in no position to claim it.
 */
function holdKeyGround(battle: Battle): void {
  for (const ground of battle.keyGround) {
    let claimant: ArmyId | null = null
    let contested = false
    for (const unit of battle.units) {
      if (isRouting(unit)) continue
      if (distance(unit.position, ground.position) > ground.radius) continue
      if (claimant === null) claimant = unit.army
      else if (claimant !== unit.army) contested = true
    }
    if (claimant !== null && !contested) ground.holder = claimant
  }
}

/** The army holding the most Key Ground, or null where nobody is ahead on it. */
function onPoints(battle: Battle): ArmyId | null {
  const held = new Map<ArmyId, number>()
  for (const ground of battle.keyGround) {
    if (ground.holder === null) continue
    held.set(ground.holder, (held.get(ground.holder) ?? 0) + 1)
  }
  let leader: ArmyId | null = null
  let most = 0
  let level = false
  for (const [army, count] of held) {
    if (count > most) {
      most = count
      leader = army
      level = false
    } else if (count === most) {
      level = true
    }
  }
  return level ? null : leader
}

function endBattle(battle: Battle, by: Outcome["by"], winner: ArmyId | null, text: string): void {
  battle.outcome = {
    at: battle.time,
    by,
    winner,
    keyGround: battle.keyGround.map((g) => ({ name: g.name, holder: g.holder })),
  }
  battle.dispatches.push({ at: battle.time, unitId: null, text })
}

/**
 * Whether the battle is decided, and by what (F11). Two ways in and no third:
 * an army breaks, or the clock runs out and the Key Ground is counted. There is
 * no way to win by killing everything, because C7 sees to it that nothing is
 * there to be killed — a battalion is running long before it is gone.
 *
 * Army Break outranks the clock, and the Key Ground does not enter into it. An
 * army that has quit the Field has left whatever it was standing on.
 */
function decide(battle: Battle): void {
  if (battle.outcome) return

  const broken = battle.armies.filter((army) => hasArmyBroken(battle, army))
  if (broken.length > 0) {
    // Both armies going in the same step is rare and entirely possible: two
    // Routs a tick apart on a Field where both sides are already at the edge.
    // Nobody won it, and saying so is better than picking one.
    const left = battle.armies.filter((army) => !broken.includes(army))
    endBattle(
      battle,
      "army-break",
      left.length === 1 ? left[0].id : null,
      left.length === 1
        ? `The ${broken.map((a) => a.name).join(" and ")} army has had enough, and is quitting the Field`
        : `Both armies have had enough, and the Field is left to nobody`,
    )
    return
  }

  if (battle.time < battle.clock) return
  const winner = onPoints(battle)
  const name = battle.armies.find((a) => a.id === winner)?.name
  endBattle(
    battle,
    "clock",
    winner,
    name
      ? `The clock has run out, and the ${name} army holds the Key Ground`
      : `The clock has run out with the Key Ground undecided`,
  )
}

export function isOver(battle: Battle): boolean {
  return battle.outcome !== null
}
