import { faces, frontage, grid, spanAlong, unitFootprint } from "./formation"
import { breakUnit, hasBroken, isRouting, shake } from "./morale"
import type { Arm, Battle, Unit, Vec2 } from "./types"
import { angleDelta, axes, bearing, distance } from "./vec"

/**
 * C6 Fighting — the Charge.
 *
 * The other half of C6, and the half the player has to ask for. Fire happens on
 * its own because a battalion with loaded muskets and an enemy in front of it
 * fires; a Charge never does, because it is an act of intent and every act of
 * intent costs a Courier ride (ADR-0002).
 *
 * What decides it is the same geometry the Volley uses, read a different way:
 * how many metres of front the two blocks actually meet over, and which Face
 * the charge arrived on. There is no per-Formation constant in here either — a
 * square throws cavalry back because its Frontage is a quarter of a line's and
 * so a quarter as many sabres reach it, and a battalion caught in march column
 * is undone because it has no Face at all.
 *
 * Morale finishes it. A Contact takes very few men off either side; what it
 * takes is nerve, and the Unit whose nerve gives out is the one that Breaks
 * (F10). Which is why Contact is over in seconds and is never a state a Unit
 * sits in.
 *
 * Not built yet: Pursuit. A Charge whose target Breaks pulls up and lets it go,
 * which is generous to the Unit that ran.
 */

const QUARTER_TURN = Math.PI / 2

/**
 * Metres per second at the charge, on open level Ground. A gallop and a run,
 * against the two and a half metres a second cavalry makes in line.
 */
const CHARGE_SPEED: Record<Arm, number> = { infantry: 2.2, cavalry: 7, artillery: 0 }

/**
 * Metres from the target at which a Unit goes to the charge; beyond it, a
 * Charge Order is a walk at the Formation's own pace.
 *
 * This seam stands in for Fatigue, which is not built. Without it a regiment
 * would gallop the length of the Field for nothing, and the player's whole
 * problem — get the horse close under a Move Order first, then let them go —
 * would not exist. It is also what the infantry it is aimed at gets as warning:
 * twenty-one seconds of gallop against thirty of drill to make square.
 */
export const CHARGE_RANGE = 150

/** Metres of gap at which the two blocks are touching. */
export const CONTACT_RANGE = 2

/** Metres a Unit thrown back puts between itself and what threw it. */
export const RECOIL_DISTANCE = 120

/**
 * Ranks that can reach across a Contact. The third rank of a line has no more
 * of a bayonet in the fight than it has a musket in the Volley, and the ninth
 * rank of a column has nothing to do but push.
 */
const CONTACT_RANKS = 2

/**
 * Men one body takes off the other side in the seconds a Contact lasts. Per
 * *body that can reach*, so all the Formation there is in this number is the
 * Frontage that decided how many of them there were.
 *
 * Calibrated so the exchange reads as the period's does: a cavalry charge
 * repulsed by a formed line costs the horse rather more nerve than it costs the
 * line, and the same charge against a square costs it almost nothing at all.
 */
const LETHALITY: Record<Arm, number> = { infantry: 0.035, cavalry: 0.1, artillery: 0.02 }

/**
 * What being in motion is worth. Deliberately not scaled by Grade or Morale:
 * CONTEXT forbids Grade a damage bonus and means it, and Morale is already
 * deciding the outcome — letting it decide the casualties too would count it
 * twice.
 */
const IMPETUS = 2

/**
 * Whether a Charge may be aimed at this Unit at all. A Routing one may not: the
 * chargers pull up the instant the Order arrives, because Pursuit is not built,
 * so offering it spends a Courier ride and leaves the regiment standing still
 * with nothing but a Dispatch to show for it.
 *
 * The rule lives next to the pull-up rather than in the screen, so what the
 * player is offered and what the simulation will accept cannot drift — and so
 * that building Pursuit moves both at once.
 *
 * Typed on the two fields the answer turns on, because what the screen holds is
 * a Snapshot and C6 has no business importing the renderer's view of a Unit.
 */
export function chargeable(
  target: { army: string; routing: boolean },
  playerArmy: string,
): boolean {
  return target.army !== playerArmy && !target.routing
}

/** Artillery does not charge. It is being dragged about by horses as it is. */
export function canCharge(arm: Arm): boolean {
  return CHARGE_SPEED[arm] > 0
}

/** Metres per second at the charge, before the ground under the Unit is read. */
export function chargeSpeed(arm: Arm): number {
  return CHARGE_SPEED[arm]
}

/**
 * Which of a Unit's Faces a charge arriving from `from` strikes — 0 front, 1
 * right, 2 rear, 3 left, as the slots are laid out — or null when it strikes it
 * off one. Off a Face there is no fight: nothing the Unit has faces the way the
 * charge came from, so it does not fight and lose, it comes apart.
 *
 * A square is four Faces and therefore no flank, and that is the whole of what
 * square is for — no rule of its own, just the count.
 */
export function struckSide(target: Unit, from: Vec2): number | null {
  // A Unit in the middle of a Formation change has no Face at all: half its
  // files are between two layouts and none of them are pointed anywhere. It is
  // the moment ADR-0001 promised would be the drama, and it is why making
  // square too late is worse than never making it.
  if (target.changing) return null
  const count = faces(target.arm, target.formation)
  if (count === 0) return null
  const off = angleDelta(target.facing, bearing(target.position, from))
  const side = Math.round(off / QUARTER_TURN) & 3
  if (count === 4) return side
  return side === 0 ? 0 : null
}

/** How the Face a charge struck is written in a Dispatch. */
export function describeSide(side: number | null): string {
  if (side === null) return "off its Face"
  return ["front", "right", "rear", "left"][side]
}

/** Metres between two Units' Footprints, along the line joining their centres. */
export function gapTo(unit: Unit, target: Unit): number {
  const line = axes(bearing(unit.position, target.position)).along
  const mine = spanAlong(unitFootprint(unit), unit.facing, line)
  const theirs = spanAlong(unitFootprint(target), target.facing, line)
  return distance(unit.position, target.position) - (mine + theirs) / 2
}

/**
 * Metres of front the two blocks meet over: the narrower of what each presents
 * across the line of the charge. A regiment two hundred metres wide going in on
 * a square thirty-six metres wide fights over thirty-six metres of it, and the
 * rest of the regiment rides past either side.
 */
function contactWidth(unit: Unit, target: Unit): number {
  const across = axes(bearing(unit.position, target.position)).across
  return Math.min(
    spanAlong(unitFootprint(unit), unit.facing, across),
    spanAlong(unitFootprint(target), target.facing, across),
  )
}

/** Bodies a Unit gets into the fight over `width` metres of it. */
function reach(unit: Unit, width: number): number {
  const g = grid(unit.arm, unit.formation, unit.strength)
  const front = frontage(unit.arm, unit.formation, unit.strength)
  if (front <= 0) return 0
  return (width * g.files * Math.min(g.ranks, CONTACT_RANKS)) / front
}

/** Every enemy Unit committed to a Charge on this one, the thrown-back excluded. */
export function chargersOf(battle: Battle, unit: Unit): Unit[] {
  return battle.units.filter((other) => {
    const charge = other.charging
    if (!charge) return false
    return charge.targetId === unit.id && !charge.recoiling && other.army !== unit.army
  })
}

/** End a Charge, put the Order down with it, and say why. */
export function endCharge(battle: Battle, unit: Unit, text: string): void {
  unit.charging = null
  unit.order = null
  unit.route = []
  battle.dispatches.push({ at: battle.time, unitId: unit.id, text })
}

/**
 * The two blocks touch. One Contact, resolved in the step it happened in, and
 * then either the Unit struck is running or the Unit that struck it is.
 */
export function resolveContact(battle: Battle, unit: Unit, target: Unit): void {
  const charge = unit.charging
  if (!charge) return
  const side = struckSide(target, unit.position)
  const width = contactWidth(unit, target)

  const dealt = Math.min(target.strength, reach(unit, width) * LETHALITY[unit.arm] * IMPETUS)
  // Off a Face there is nothing to take in return. The chargers are into
  // something that cannot turn to meet them, and it costs them nothing.
  const taken =
    side === null ? 0 : Math.min(unit.strength, reach(target, width) * LETHALITY[target.arm])

  target.strength -= dealt
  unit.strength -= taken
  shake(target, dealt, unit.position)
  shake(unit, taken, target.position)

  // Off a Face the Contact itself is the cause, and it is what the Dispatch
  // names. On a Face, Morale decides — which is F10, and the reason a steady
  // square throws cavalry back and a shaken line does not.
  const undone = side === null
  if (undone && !isRouting(target)) breakUnit(battle, target)
  const broke = undone || hasBroken(target)

  battle.contacts.push({
    id: `k${battle.nextId++}`,
    at: battle.time,
    unitId: unit.id,
    targetId: target.id,
    where: {
      x: (unit.position.x + target.position.x) / 2,
      y: (unit.position.y + target.position.y) / 2,
    },
    side,
    width,
    casualties: taken,
    targetCasualties: dealt,
    outcome: broke ? "broke" : "recoiled",
  })

  if (broke) {
    const how = undone
      ? `${unit.name} struck ${target.name} off its Face, and it came apart`
      : `${unit.name} went in on ${target.name}'s ${describeSide(side)}, and broke it`
    endCharge(battle, unit, how)
    return
  }
  charge.recoiling = true
  battle.dispatches.push({
    at: battle.time,
    unitId: unit.id,
    text: `${target.name} held its ${describeSide(side)}, and ${unit.name} was thrown back`,
  })
}
