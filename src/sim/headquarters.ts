import { cellAt, cellIndex, inBounds, passable } from "./field"
import { beatsPoint } from "./fighting"
import { isRouting } from "./morale"
import { issueOrder } from "./orders"
import type { Battle, Field, Headquarters, Order, OrderBody, Unit, UnitId, Vec2 } from "./types"
import { bearing, distance } from "./vec"

/**
 * C1 Order Delivery, the half of it the Orders come *from*.
 *
 * ADR-0002 sited the Headquarters and left it standing there. ADR-0008 lets it
 * ride, and lets the enemy come at it: the one decision it exists to pose —
 * where do I stand — is worth nothing asked once, before the clock, against an
 * afternoon the player has not seen.
 *
 * Three states, and the whole of them is how far the nearest enemy Unit is plus
 * whether there is ground the staff is still trying to reach. Standing, it
 * sends riders on the ride alone. Harried, every Order waits at the table
 * first. Riding, nothing leaves it at all.
 */

/**
 * Metres per second the staff makes over the ground. A third of a Courier,
 * deliberately: a Headquarters that could keep up with the fighting would be
 * dragged after it all afternoon, and *where do I stand* would become a thing
 * the player fidgets with rather than a thing he decides. At this pace a four
 * hundred metre move is a hundred seconds out of command, which is a
 * commitment — and it is the commitment, not a rule, that stops him chasing.
 */
export const HEADQUARTERS_SPEED = 4

/**
 * Metres at which an enemy Unit harries the staff whether it is shooting or
 * not. Musket shot, roughly: near enough that the men at the table can see
 * whose it is and have to decide whether to stay. It is the second way in and
 * not the main one — being under fire is the main one — and it exists because
 * cavalry has no fire at all, and a regiment of horse trotting up to the tables
 * is the most harrying thing on the Field.
 */
export const HARRIED_RANGE = 200

/**
 * Metres an enemy must get *back* to before the staff settles again. A Unit
 * hovering on the threshold would otherwise flap the state — and every flap is
 * two Dispatches and a change in what every Order costs.
 */
const HARRIED_RELEASE = 260

/** Metres at which an enemy Unit is up to the tables, and has overrun it. */
export const OVERRUN_RANGE = 60

/**
 * Seconds every Order waits at the table while the staff is harried. Modest on
 * purpose: about the ride to a Unit 260m out, so it is most of a near Order and
 * a sixth of a flank one. It compresses the distance gradient F1 rests on,
 * which is the bill ADR-0008 accepts — the crisis is at the Headquarters, so it
 * is the Orders that had the shortest way to go that are hurt most by it.
 */
export const HARRIED_SURCHARGE = 20

/** Seconds each Overrun adds to every Order after it, for the rest of the day. */
export const OVERRUN_SURCHARGE = 10

/**
 * The most a staff can be worn down by being ridden over. Without a ceiling a
 * single regiment of horse could chase it round the Field all afternoon and run
 * the surcharge past the length of any ride — which is the silence ADR-0008
 * refuses, arrived at by arithmetic instead of by rule.
 */
export const MOST_SURCHARGE = 60

/** Metres the staff bolts when it is overrun. Far enough to be out of it. */
const BOLT_DISTANCE = 300

/** Metres from its destination at which the staff counts as established. */
const SETTLE_RANGE = 2

/** Metres of Field edge the staff will not ride past. */
const EDGE_MARGIN = 20

/** True while the staff is in the saddle rather than at a table. */
export function isRiding(headquarters: Headquarters): boolean {
  return headquarters.destination !== null
}

/**
 * Seconds an Order waits before its rider sets off. The permanent scar plus
 * whatever the enemy is costing right now, and nothing to do with the ride —
 * the wait is at the table.
 */
export function courierHold(headquarters: Headquarters): number {
  return headquarters.surcharge + (headquarters.harried ? HARRIED_SURCHARGE : 0)
}

/** Whether a rider can leave at all. He cannot, while the staff is in the saddle. */
export function canSendCourier(headquarters: Headquarters): boolean {
  return !isRiding(headquarters)
}

/**
 * Send an Order from a Headquarters, or nothing where none can leave it. The
 * rule about a staff in the saddle lives here rather than in the screen: what
 * the player presses is a button, and whether there is anybody to carry the
 * Order is the simulation's to say.
 */
export function sendOrder(
  battle: Battle,
  headquarters: Headquarters,
  unitId: UnitId,
  body: OrderBody,
): Order | null {
  if (!canSendCourier(headquarters)) return null
  return issueOrder(battle, unitId, body, headquarters.position, courierHold(headquarters))
}

/** Hold the point inside the Field, clear of the very edge. */
function ontoTheField(field: Field, point: Vec2): Vec2 {
  const width = field.width * field.cellSize
  const height = field.height * field.cellSize
  return {
    x: Math.max(EDGE_MARGIN, Math.min(width - EDGE_MARGIN, point.x)),
    y: Math.max(EDGE_MARGIN, Math.min(height - EDGE_MARGIN, point.y)),
  }
}

function standsOnPassableGround(field: Field, point: Vec2): boolean {
  const { cx, cy } = cellAt(field, point)
  if (!inBounds(field, cx, cy)) return false
  return passable(field, cellIndex(field, cx, cy))
}

/**
 * Send the staff to new ground. The player's own decision, and the expensive
 * one: from here until it is established, no Order can leave.
 */
export function rideTo(battle: Battle, headquarters: Headquarters, to: Vec2): void {
  headquarters.destination = ontoTheField(battle.field, to)
  battle.dispatches.push({
    at: battle.time,
    unitId: null,
    text: "The Headquarters is riding for new ground; no Order can leave it until it is established",
  })
}

/** The nearest enemy to the tables, and how far off it is. */
interface Threat {
  unit: Unit
  range: number
}

/**
 * The nearest enemy Unit and how far off it is. A Routing Unit is nobody's
 * threat and counts for nothing here, on the same grounds it holds no Key
 * Ground: a mob streaming past is in no position to threaten a table.
 */
function nearestEnemy(battle: Battle, headquarters: Headquarters): Threat | null {
  let nearest: Threat | null = null
  for (const unit of battle.units) {
    if (unit.army === headquarters.army || isRouting(unit)) continue
    const range = distance(unit.position, headquarters.position)
    if (nearest && range >= nearest.range) continue
    nearest = { unit, range }
  }
  return nearest
}

/**
 * The enemy whose fire is falling on the Headquarters, or null. This is the
 * "it can be shot at" ADR-0002 promised and never built, and it is read off the
 * beaten ground C6 already draws rather than off a radius of its own — so a
 * battery on a ridge harries a staff eight hundred metres away, a line harries
 * nothing behind it, and the player can see the whole rule by pressing the
 * beaten-ground button.
 */
function firingOn(battle: Battle, headquarters: Headquarters): Unit | null {
  for (const unit of battle.units) {
    if (unit.army === headquarters.army) continue
    if (beatsPoint(unit, headquarters.position)) return unit
  }
  return null
}

/**
 * Ride every Headquarters one step, and let the enemy come at it.
 *
 * Written over both armies, and the enemy pays nothing for it today: the Plan
 * applies its Orders where they land rather than couriering them (ADR-0008), so
 * an enemy staff that is harried loses nothing at all. Symmetric anyway, so it
 * lights up the day the enemy is commanded through Couriers like the player.
 */
export function advanceHeadquarters(battle: Battle, dt: number): void {
  for (const army of battle.armies) {
    const headquarters = army.headquarters
    if (!headquarters) continue
    const nearest = nearestEnemy(battle, headquarters)
    harry(battle, headquarters, nearest, firingOn(battle, headquarters))
    // Only a staff at a table can be ridden over. One already in the saddle is
    // going as fast as it goes, and a regiment that keeps pace with it would
    // otherwise charge the same overrun home ten times a second.
    if (nearest && !isRiding(headquarters) && nearest.range <= OVERRUN_RANGE) {
      overrun(battle, headquarters, nearest.unit)
    }
    advanceRide(battle, headquarters, dt)
  }
}

/**
 * Set or clear the harrying, and say so once either way. Two ways in — the
 * staff is being shot at, or an enemy is simply up to it — and it takes both
 * being gone to get out, so a battery shelling a Headquarters from a thousand
 * metres holds it harried however empty the ground around the tables is.
 */
function harry(
  battle: Battle,
  headquarters: Headquarters,
  nearest: Threat | null,
  firing: Unit | null,
): void {
  if (!headquarters.harried) {
    const close = nearest !== null && nearest.range <= HARRIED_RANGE
    if (!firing && !close) return
    headquarters.harried = true
    battle.dispatches.push({
      at: battle.time,
      unitId: null,
      text: firing
        ? `The Headquarters is under fire from ${firing.name}: every Order is ${HARRIED_SURCHARGE} seconds later leaving the table`
        : `There is an enemy up to the Headquarters: every Order is ${HARRIED_SURCHARGE} seconds later leaving the table`,
    })
    return
  }
  const clear = !firing && (nearest === null || nearest.range > HARRIED_RELEASE)
  if (!clear) return
  headquarters.harried = false
  battle.dispatches.push({
    at: battle.time,
    unitId: null,
    text: "The Headquarters is clear of the enemy, and its riders are getting away again",
  })
}

/**
 * The staff is ridden over. It is not taken and the army is not silenced: the
 * men mount and go, which is a ride, which is a blackout — and what it costs
 * afterwards is the Morale Ceiling's shape, a permanent surcharge on every
 * Order for the rest of the afternoon.
 */
function overrun(battle: Battle, headquarters: Headquarters, enemy: Unit): void {
  const away = bearing(enemy.position, headquarters.position)
  headquarters.destination = ontoTheField(battle.field, {
    x: headquarters.position.x + Math.cos(away) * BOLT_DISTANCE,
    y: headquarters.position.y + Math.sin(away) * BOLT_DISTANCE,
  })
  const spent = headquarters.surcharge >= MOST_SURCHARGE
  headquarters.surcharge = Math.min(MOST_SURCHARGE, headquarters.surcharge + OVERRUN_SURCHARGE)
  battle.dispatches.push({
    at: battle.time,
    unitId: null,
    text: spent
      ? `The Headquarters has been ridden over again by ${enemy.name}; the staff is away, and there is nothing left of it to lose`
      : `The Headquarters has been ridden over by ${enemy.name}; the staff is away, and every Order after this is later for it`,
  })
}

/**
 * Walk the staff toward the ground it was sent to. It rides straight and does
 * not route — no A*, no Crossings — and it will not ford a river: a step onto
 * impassable Ground establishes it where it stands instead, which reads as the
 * staff pulling up at the bank.
 */
function advanceRide(battle: Battle, headquarters: Headquarters, dt: number): void {
  const to = headquarters.destination
  if (!to) return
  const gap = distance(headquarters.position, to)
  if (gap <= Math.max(SETTLE_RANGE, HEADQUARTERS_SPEED * dt)) {
    headquarters.position = { ...to }
    settle(battle, headquarters)
    return
  }
  const heading = bearing(headquarters.position, to)
  const stride = HEADQUARTERS_SPEED * dt
  const next = {
    x: headquarters.position.x + Math.cos(heading) * stride,
    y: headquarters.position.y + Math.sin(heading) * stride,
  }
  if (!standsOnPassableGround(battle.field, next)) {
    settle(battle, headquarters)
    return
  }
  headquarters.position = next
}

function settle(battle: Battle, headquarters: Headquarters): void {
  headquarters.destination = null
  battle.dispatches.push({
    at: battle.time,
    unitId: null,
    text: "The Headquarters is established, and Orders can be written again",
  })
}
