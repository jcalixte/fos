import { allows, spanAlong, unitFootprint } from "./formation"
import type { ScenarioFile } from "./scenario"
import type { ArmyId, FormationName, Headquarters, Latitude, Unit, Vec2 } from "./types"

/**
 * Deployment: the hour before the battle, when an army is arranged rather than
 * commanded.
 *
 * Nothing here is an Order. The clock is not running, so there is no rider to
 * send and no drill to serve — a battalion told to make square is standing in
 * square, and one dragged across the zone is simply there.
 *
 * It lives in `sim/` and not in a session because it is a rule: what a
 * Commander may do to his army before the clock runs, and where he may put it.
 * Both sessions call it, which is the only thing stopping the solo game and the
 * two-Commander game from arranging armies by two slightly different sets of
 * arithmetic (ADR-0013).
 */

/** The rectangle, in metres, an army may be arranged inside: x, y, width, height. */
export type Zone = [number, number, number, number]

/** The ground a Scenario lets an army arrange itself on, if it names one. */
export function deploymentZone(file: ScenarioFile, army: ArmyId | null): Zone | null {
  return file.armies.find((a) => a.id === army)?.deploymentZone ?? null
}

export function inZone(zone: Zone | null, point: Vec2): boolean {
  if (!zone) return false
  const [x, y, w, h] = zone
  return point.x >= x && point.y >= y && point.x <= x + w && point.y <= y + h
}

/**
 * Hold a Unit inside its zone, and give it the ground it stands on as its Post.
 *
 * A Unit is placed by its centre, so its whole Footprint has to fit — and the
 * Footprint is read fresh every time, because Formation decides it. A 720-man
 * battalion measures 144m by 3.6m in line and 2.8m by 162m in march column, so
 * the margin it needs moves with the Formation, and a battalion legally placed
 * in one would hang out of the zone in the other if the margin were not
 * recomputed.
 *
 * Facing decides it too, so the margin is the Footprint's real span on each
 * axis and not the larger of its two dimensions. Reserving a square was
 * conservative on the axis nobody cares about and dear on the one that decides
 * the battle: a line is a few metres deep, and at Castiglione a square margin
 * held the 5e 80m off the edge it was meant to crowd — 22 times its own depth,
 * and a third of the lateral room the whole zone has. The consequence is that a
 * battalion gains ground as it is wheeled, which is what the Field already
 * shows: what stops it is the ground it covers.
 *
 * The Post goes where the hand puts it, because arranging the army is how a
 * Unit is given its ground before there is anybody to ride an Order to it. Left
 * behind, a Unit deployed across the zone would open the battle with its whole
 * Latitude already spent.
 */
export function place(zone: Zone | null, unit: Unit, at: Vec2): void {
  if (!zone) return
  const [zx, zy, zw, zh] = zone
  const shape = unitFootprint(unit)
  const halfX = spanAlong(shape, unit.facing, { x: 1, y: 0 }) / 2
  const halfY = spanAlong(shape, unit.facing, { x: 0, y: 1 }) / 2
  unit.position = {
    x: Math.max(zx + halfX, Math.min(zx + zw - halfX, at.x)),
    y: Math.max(zy + halfY, Math.min(zy + zh - halfY, at.y)),
  }
  unit.post = { ...unit.position }
}

/**
 * Turn a Unit where it stands. Wheeling swings the Footprint across the zone's
 * corner, so it is re-held: a line standing a few metres off the top edge is
 * 3.6m deep facing east and 144m deep facing north.
 */
export function face(zone: Zone | null, unit: Unit, facing: number): void {
  unit.facing = facing
  place(zone, unit, unit.position)
}

/**
 * Stand a Unit in a Formation outright.
 *
 * Sending the real thing here would have been the wrong model twice over. The
 * clock is stopped, so the Order would sit frozen on the Field until the battle
 * began, and then a rider would set off and the army would spend its first
 * minutes drilling instead of standing where it was put.
 */
export function formUp(zone: Zone | null, unit: Unit, formation: FormationName): void {
  if (!allows(unit.arm, formation) || unit.formation === formation) return
  unit.formation = formation
  // Nothing has stepped yet, so there is no change under way to abandon —
  // cleared rather than trusted, because a half-formed battalion at Deployment
  // would be a bug somewhere else and this must not carry it.
  unit.changing = null
  place(zone, unit, unit.position)
}

/**
 * Brief a subordinate. Free here and couriered once the clock runs, because
 * this is the hour a brief is given in, and a dial that stayed free would hand
 * back instantaneous army-wide command (ADR-0007).
 */
export function brief(unit: Unit, latitude: Latitude): void {
  unit.standing = latitude
}

/** Stand the tables somewhere inside the zone. Every Order is ridden from here. */
export function postHeadquarters(zone: Zone | null, headquarters: Headquarters, at: Vec2): void {
  if (!inZone(zone, at)) return
  headquarters.position = { ...at }
}
