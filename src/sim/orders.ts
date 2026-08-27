import {
  describeFormation,
  type Battle,
  type Courier,
  type Order,
  type OrderBody,
  type Unit,
  type UnitId,
  type Vec2,
} from "./types"
import { isRouting } from "./morale"
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

export function issueOrder(battle: Battle, unitId: UnitId, body: OrderBody, from: Vec2): Order {
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
      return `${unit.name} received its Order: march, and form ${describeFormation(body.arrivalFormation)} on arrival`
    case "form":
      return `${unit.name} received its Order: form ${describeFormation(body.formation)}`
    case "charge":
      return `${unit.name} received its Order: go at ${named(battle, body.targetId)}`
    case "halt":
      return `${unit.name} received its Order: halt`
  }
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
      text: `${unit.name} is routing; its Order found nobody to take it`,
    })
    return
  }
  unit.order = { order, arrivedAt: battle.time }
  unit.route = []
  // A rider arriving with anything else puts down whatever the Unit was
  // committed to. A Charge is a committed run and Contact is over in seconds,
  // so in practice a Courier is never in time to call one back — the delay does
  // the committing, rather than a rule making the Unit deaf.
  unit.charging = null
  // A new Order clears whatever Initiative was holding the Unit back: the rule
  // will fire again on the next tick if it still applies.
  unit.suspendedBy = null
  battle.dispatches.push({
    at: battle.time,
    unitId: unit.id,
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

export function ghosts(battle: Battle): Ghost[] {
  const out: Ghost[] = []
  for (const courier of battle.couriers) {
    const unit = battle.units.find((u) => u.id === courier.order.unitId)
    if (!unit) continue
    const body = courier.order.body
    if (body.kind === "move") {
      out.push({
        unitId: unit.id,
        position: body.destination,
        facing: body.arrivalFacing,
        formation: body.arrivalFormation,
      })
    } else if (body.kind === "form") {
      out.push({
        unitId: unit.id,
        position: unit.position,
        facing: unit.facing,
        formation: body.formation,
      })
    } else if (body.kind === "charge") {
      // On the Unit it names, which is moving — so the mark follows it, and the
      // player watches the rider chase a target that has gone somewhere else.
      const target = battle.units.find((u) => u.id === body.targetId)
      if (target) {
        out.push({
          unitId: unit.id,
          position: target.position,
          facing: bearing(target.position, unit.position),
          formation: unit.formation,
        })
      }
    }
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
