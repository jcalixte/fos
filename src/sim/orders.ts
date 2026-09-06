import {
  describeFormation,
  type Battle,
  type Courier,
  type Latitude,
  type Order,
  type OrderBody,
  type Unit,
  type UnitId,
  type Vec2,
} from "./types"
import { isRouting } from "./morale"
import { describeLatitude } from "./standing"
import { bearing, distance, normalise, scale, sub } from "./vec"

/**
 * C1 Order Delivery.
 *
 * An Order is not a call on a Unit — it is a message with a delivery time
 * (ADR-0002). The delay is a real ride across real ground, so the flanks are
 * genuinely expensive, and the rider is on the Field the whole way.
 */

/** Metres per second. 200m lands in about 15s, 1500m in about 115s (F1). */
export const COURIER_SPEED = 13

/** How close the rider must get to count as having handed the Order over. */
const HANDOVER_RANGE = 6

/**
 * Metres from its destination at which a Unit counts as arrived. Here rather
 * than in C8 beside the march that spends it: what counts as having got there
 * is a fact about the Order, the sibling of what counts as having received it,
 * and both the march and the Dispatch that reads the Order out need it.
 */
export const ARRIVAL_RANGE = 8

/**
 * Write an Order and put a rider on the Field with it. `hold` is what the
 * Headquarters costs before he sets off, which is zero unless the staff has
 * been harried or ridden over (ADR-0008) — the ride itself is the same either
 * way, because the wait is at the table and not on the road.
 */
export function issueOrder(
  battle: Battle,
  unitId: UnitId,
  body: OrderBody,
  from: Vec2,
  hold = 0,
): Order {
  const order: Order = {
    id: `o${battle.nextId++}`,
    unitId,
    body,
    issuedAt: battle.time,
  }
  battle.couriers.push({
    id: `c${battle.nextId++}`,
    order,
    position: { ...from },
    origin: { ...from },
    hold,
  })
  return order
}

/** How long a rider would need to reach a Unit standing still at `to`. */
export function estimateDelay(from: Vec2, to: Vec2): number {
  return distance(from, to) / COURIER_SPEED
}

function describe(battle: Battle, body: OrderBody, unit: Unit): string {
  switch (body.kind) {
    case "move":
      // A Move onto the ground the Unit is already standing on carries no
      // march at all: it is how a Unit is turned where it stands, which is the
      // only thing guns in battery can do without hitching up. Reading that
      // out as a march is a lie the player can see on the Field.
      if (distance(unit.position, body.destination) <= ARRIVAL_RANGE) {
        return body.arrivalFormation === unit.formation
          ? `${unit.name} received its Order: come round where it stands`
          : `${unit.name} received its Order: come round where it stands, and form ${describeFormation(body.arrivalFormation)}`
      }
      return `${unit.name} received its Order: march, and form ${describeFormation(body.arrivalFormation)} on arrival`
    case "form":
      return `${unit.name} received its Order: form ${describeFormation(body.formation)}`
    case "charge":
      return `${unit.name} received its Order: go at ${named(battle, body.targetId)}`
    case "halt":
      return `${unit.name} received its Order: halt`
    case "standing":
      // Read as a brief and not as an act, because that is what it is: nothing
      // the Unit is doing now changes when this arrives.
      return `${unit.name} received its Order: from here on, ${describeLatitude(body.latitude)}`
  }
}

/**
 * The ground an Order gives a Unit, or null where it gives it none. This is the
 * Post that Latitude is measured from: a Move gives the ground it names, a Halt
 * gives the ground the Unit is standing on, and nothing else gives any — a
 * Charge in particular leaves the Post where it was, so a regiment let go and
 * blown three hundred metres out has not thereby been posted there.
 */
export function postOf(unit: Unit, body: OrderBody): Vec2 | null {
  if (body.kind === "move") return { ...body.destination }
  if (body.kind === "halt") return { ...unit.position }
  return null
}

/** What the Order names, as the Dispatch should read it. */
function named(battle: Battle, unitId: UnitId): string {
  return battle.units.find((u) => u.id === unitId)?.name ?? "whatever is left of it"
}

/**
 * Ride the couriers one step. A rider chases the Unit's current position rather
 * than the spot it stood on when the Order was written, so ordering a Unit that
 * is marching away from Headquarters costs more than the map distance.
 */
export function advanceCouriers(battle: Battle, dt: number): void {
  const arrived: Courier[] = []
  for (const courier of battle.couriers) {
    const unit = battle.units.find((u) => u.id === courier.order.unitId)
    if (!unit) {
      arrived.push(courier)
      continue
    }
    // Still at the table. He sits where the player can see him and the Ghost is
    // already out on the Field, so a harried Headquarters reads as an Order
    // that cannot get out of the door rather than as one that vanished.
    if (courier.hold > 0) {
      courier.hold = Math.max(0, courier.hold - dt)
      continue
    }
    const gap = sub(unit.position, courier.position)
    const remaining = Math.hypot(gap.x, gap.y)
    const stride = COURIER_SPEED * dt
    if (remaining <= Math.max(stride, HANDOVER_RANGE)) {
      courier.position = { ...unit.position }
      deliver(battle, unit, courier.order)
      arrived.push(courier)
      continue
    }
    const step = scale(normalise(gap), stride)
    courier.position = {
      x: courier.position.x + step.x,
      y: courier.position.y + step.y,
    }
  }
  if (arrived.length > 0) {
    battle.couriers = battle.couriers.filter((c) => !arrived.includes(c))
  }
}

function deliver(battle: Battle, unit: Unit, order: Order): void {
  // Routing Units are deaf. The rider finds a mob going the other way and there
  // is nobody to hand it to, so the Order is lost rather than banked — a Unit
  // that Rallies is not still carrying orders written before it broke.
  if (isRouting(unit)) {
    battle.dispatches.push({
      at: battle.time,
      unitId: unit.id,
      unitName: unit.name,
      army: unit.army,
      text: `${unit.name} is routing; its Order found nobody to take it`,
    })
    return
  }
  // The one Order that leaves the Unit doing what it was doing. A brief says
  // what the Unit may do unbidden, which is a different question from what it
  // is under orders to do now — and a rider arriving with a new brief that
  // stopped a march would make the useful instruction the expensive one.
  if (order.body.kind === "standing") {
    unit.standing = order.body.latitude
    battle.dispatches.push({
      at: battle.time,
      unitId: unit.id,
      unitName: unit.name,
      army: unit.army,
      text: describe(battle, order.body, unit),
    })
    return
  }
  unit.post = postOf(unit, order.body) ?? unit.post
  unit.order = { order, arrivedAt: battle.time }
  unit.route = []
  // A rider arriving with anything else puts down whatever the Unit was
  // committed to. A Charge is a committed run and Contact is over in seconds,
  // so in practice a Courier is never in time to call one back — the delay does
  // the committing, rather than a rule making the Unit deaf.
  unit.charging = null
  // A new Order clears whatever Initiative was holding the Unit back, and the
  // ground it was walking to on its own account with it: the rule will fire
  // again on the next tick if it still applies.
  unit.suspendedBy = null
  unit.shift = null
  battle.dispatches.push({
    at: battle.time,
    unitId: unit.id,
    unitName: unit.name,
    army: unit.army,
    text: describe(battle, order.body, unit),
  })
}

/**
 * The Ghost's placement: where an Order will put its Unit, and how it will
 * stand there. Held on screen from the moment the Order is issued until the
 * Unit is actually on the spot — across the ride and the march both, since the
 * march is the longer wait and the one the player most needs a mark for.
 */
export interface Ghost {
  unitId: UnitId
  position: Vec2
  facing: number
  formation: Unit["formation"]
}

/** Where one Order would put its Unit, or nothing where it names no ground. */
function ghostOf(battle: Battle, unit: Unit, body: OrderBody): Ghost | null {
  if (body.kind === "move") {
    return {
      unitId: unit.id,
      position: body.destination,
      facing: body.arrivalFacing,
      formation: body.arrivalFormation,
    }
  }
  if (body.kind === "form") {
    return {
      unitId: unit.id,
      position: unit.position,
      facing: unit.facing,
      formation: body.formation,
    }
  }
  if (body.kind === "charge") {
    // On the Unit it names, which is moving — so the mark follows it, and the
    // player watches the rider chase a target that has gone somewhere else.
    const target = battle.units.find((u) => u.id === body.targetId)
    if (!target) return null
    return {
      unitId: unit.id,
      position: target.position,
      facing: bearing(target.position, unit.position),
      formation: unit.formation,
    }
  }
  return null
}

/**
 * The brief each Unit is about to be under, where the player has said one and
 * the Unit has not heard it yet. A Standing Order names no ground, so it has no
 * Ghost to stand on the Field — the button it was pressed on is the only place
 * the player can be shown that it was taken, and this is what tells the button.
 *
 * Last said wins, because last said is last delivered: the riders go at one
 * speed, so the brief written later hands over later and overwrites the other.
 * What was dictated in the saddle is later still than anything on the road,
 * since nothing leaves a riding Headquarters at all (ADR-0008).
 */
export function briefsInFlight(battle: Battle): Map<UnitId, Latitude> {
  const out = new Map<UnitId, Latitude>()
  const said = [...battle.couriers].sort((a, b) => a.order.issuedAt - b.order.issuedAt)
  for (const courier of said) {
    const body = courier.order.body
    if (body.kind === "standing") out.set(courier.order.unitId, body.latitude)
  }
  for (const army of battle.armies) {
    for (const entry of army.headquarters?.dictated ?? []) {
      if (entry.body.kind === "standing") out.set(entry.unitId, entry.body.latitude)
    }
  }
  return out
}

export function ghosts(battle: Battle): Ghost[] {
  const out: Ghost[] = []
  const mark = (unitId: UnitId, body: OrderBody): void => {
    const unit = battle.units.find((u) => u.id === unitId)
    if (!unit) return
    const ghost = ghostOf(battle, unit, body)
    if (ghost) out.push(ghost)
  }
  for (const courier of battle.couriers) mark(courier.order.unitId, courier.order.body)
  // What was dictated in the saddle has no rider on the Field yet, and is a
  // thing the player has committed to all the same (ADR-0008). Marking it is
  // the same promise the Courier's own Ghost makes: an Order is watched from
  // the moment it is given, never a hidden timer.
  for (const army of battle.armies) {
    for (const entry of army.headquarters?.dictated ?? []) mark(entry.unitId, entry.body)
  }
  // A Unit still working a move Order has not arrived: `order` is only cleared
  // once it is on the spot, faced and formed. So this outlives the Courier and
  // carries the Ghost through the march.
  for (const unit of battle.units) {
    const body = unit.order?.order.body
    if (body?.kind !== "move") continue
    out.push({
      unitId: unit.id,
      position: body.destination,
      facing: body.arrivalFacing,
      formation: body.arrivalFormation,
    })
  }
  return out
}
