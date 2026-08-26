import { cellAt, cellIndex, inBounds, passable } from "./field"
import { TRAVELLING_FORMATION } from "./formation"
import type { Battle, Grade, Unit, Vec2 } from "./types"
import { bearing, distance } from "./vec"

/**
 * C7 Morale.
 *
 * Morale is the health bar, and Strength is not (T11). A battalion is beaten
 * when its willingness gives out, which happens at a fifth of its men rather
 * than at all of them — so a Unit reaching 0 Strength is a bug and this module
 * is what makes that true (F10).
 *
 * Break, Rout and Rally are *decided* in the Initiative list, where the rule
 * that fires is the reason a Dispatch can name (ADR-0004). What lives here is
 * everything the rules ask about: what casualties cost, what standing still
 * gives back, what a Rout does to a Unit, and what a Rally costs it.
 *
 * Not built yet: Fatigue, Disorder, Pursuit and Army Break. A Rout stands in for
 * Disorder in the meantime by putting the Unit in its travelling Formation,
 * which is legible and wrong in the Unit's favour.
 */

/** Morale, and the Ceiling on it, that a Unit starts a battle with. */
export const FULL_MORALE = 1

/**
 * What casualties cost in Morale, as a multiple of the share of the Unit they
 * took. Set so that Break lands inside F10's 15–30% band: a line battalion
 * spends its whole Morale on about a fifth of its men, a conscript one sooner
 * and an elite one later.
 */
const SHOCK = 5.6

/** How much of that a Grade shrugs off. This is what Grade means under fire. */
const STEADINESS: Record<Grade, number> = { conscript: 0.75, line: 1, elite: 1.2 }

/**
 * What being shot at from the wrong side costs on top. A deliberate rule and
 * not geometry: Units broke from being flanked long before the casualties
 * justified it, and worst of all from behind.
 */
const FLANK_SHOCK = 1.5

/**
 * Morale back per second. Ten minutes from nothing to full, which on a
 * half-hour clock makes pulling a battalion out of the line a real decision
 * rather than a free one.
 */
const RECOVERY = 1 / 600

/** Metres of its own Headquarters within which a Unit recovers twice as fast. */
const HQ_COMFORT = 250

/** Morale a Routing Unit must creep back to before it can Rally. */
const RALLY_FLOOR = 0.25

/**
 * Metres of clearance from the nearest enemy a Rally needs. The same distance
 * Initiative treats as being in reach of the enemy, kept separately because
 * C7 may not import C2 — the rule list asks C7 questions, never the reverse.
 */
const RALLY_CLEARANCE = 300

/** What a Rally takes off the Morale Ceiling, so a Unit that Broke Breaks sooner. */
const CEILING_LOSS = 0.25

/** Metres per second a Routing Unit runs. Faster than any Formation marches. */
const ROUT_SPEED = 2.6

/** The share of its remaining Strength a Routing Unit sheds each second. */
const SHEDDING = 0.001

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value))
}

export function isRouting(unit: Unit): boolean {
  return unit.routing !== null
}

/** True when Morale has given out. The Initiative list is what acts on it. */
export function hasBroken(unit: Unit): boolean {
  return unit.morale <= 0
}

/**
 * Morale in words rather than as a number. T11 paid for Morale-as-health-bar by
 * giving up a bar the player can count down, so the panel says how a battalion
 * is holding up and never how much of it is left.
 */
export function describeMorale(unit: Unit): string {
  if (unit.morale >= 0.75) return "steady"
  if (unit.morale >= 0.5) return "wavering"
  if (unit.morale >= 0.25) return "shaken"
  return "on the point of breaking"
}

/**
 * How much of its fire a Unit still has. This is the whole route by which Grade
 * reaches lethality: a steady battalion fires as it was drilled to, a shaken one
 * fires high and ragged, and Grade decides which it is — never a multiplier on
 * the Volley itself.
 */
export function fireEffect(unit: Unit): number {
  return 0.4 + 0.6 * clamp(unit.morale, 0, 1)
}

/** How much worse the shock is for coming from off the Face. */
function flanking(unit: Unit, from: Vec2): number {
  const incoming = bearing(unit.position, from)
  const off = 1 - Math.cos(incoming - unit.facing)
  return 1 + (FLANK_SHOCK - 1) * (off / 2)
}

/**
 * What a Unit's losses cost its Morale. Called with the men it just lost and
 * where they came from, so the same casualties in the back cost more than they
 * do in the teeth.
 */
export function shake(unit: Unit, casualties: number, from: Vec2): void {
  if (casualties <= 0) return
  const share = casualties / Math.max(1, unit.strength + casualties)
  unit.morale -= (share * SHOCK * flanking(unit, from)) / STEADINESS[unit.grade]
}

/** Morale creeping back toward the Ceiling, hastened by its own Headquarters. */
export function recover(battle: Battle, unit: Unit, dt: number): void {
  if (unit.morale >= unit.moraleCeiling) return
  const hq = battle.armies.find((a) => a.id === unit.army)?.headquarters
  const comfort = hq && distance(unit.position, hq.position) <= HQ_COMFORT ? 2 : 1
  unit.morale = Math.min(unit.moraleCeiling, unit.morale + RECOVERY * comfort * dt)
}

/** Metres to the nearest enemy, or Infinity if the Unit is alone on the Field. */
function nearestEnemy(battle: Battle, unit: Unit): number {
  let best = Infinity
  for (const other of battle.units) {
    if (other.army === unit.army) continue
    best = Math.min(best, distance(unit.position, other.position))
  }
  return best
}

/** True when a Routing Unit is clear enough, and steady enough, to Rally. */
export function canRally(battle: Battle, unit: Unit): boolean {
  if (!isRouting(unit)) return false
  if (unit.morale < RALLY_FLOOR) return false
  return nearestEnemy(battle, unit) > RALLY_CLEARANCE
}

/**
 * Break the Unit into a Rout. It runs from whatever was nearest — which is what
 * broke it — and it goes as a mob: the Formation is dropped on the spot rather
 * than drilled out of, because a Unit that has stopped obeying Orders is not
 * going to file off neatly first.
 */
export function breakUnit(battle: Battle, unit: Unit): void {
  const enemy = closestEnemy(battle, unit)
  const away = enemy ? bearing(enemy.position, unit.position) : unit.facing + Math.PI
  unit.routing = { heading: away, brokeAt: battle.time }
  unit.morale = 0
  unit.route = []
  unit.formation = TRAVELLING_FORMATION[unit.arm]
  unit.changing = null
  unit.facing = away
}

function closestEnemy(battle: Battle, unit: Unit): Unit | null {
  let best: Unit | null = null
  let range = Infinity
  for (const other of battle.units) {
    if (other.army === unit.army) continue
    const gap = distance(unit.position, other.position)
    if (gap >= range) continue
    range = gap
    best = other
  }
  return best
}

/**
 * Back under command, at a price it carries for the rest of the battle: the
 * Ceiling drops, so the next Rout comes sooner than the first one did.
 */
export function rally(unit: Unit): void {
  unit.routing = null
  unit.moraleCeiling = Math.max(RALLY_FLOOR, unit.moraleCeiling - CEILING_LOSS)
  unit.morale = Math.min(unit.morale, unit.moraleCeiling)
}

/**
 * Run one step of a Rout: straight down the heading it broke on, shedding men as
 * it goes. It does not route around anything — a mob is not picking its way — so
 * it stops at water it cannot cross rather than drowning in it.
 */
export function advanceRout(battle: Battle, unit: Unit, dt: number): void {
  if (!unit.routing) return
  unit.strength = Math.max(0, unit.strength - unit.strength * SHEDDING * dt)
  const heading = unit.routing.heading
  const next = {
    x: unit.position.x + Math.cos(heading) * ROUT_SPEED * dt,
    y: unit.position.y + Math.sin(heading) * ROUT_SPEED * dt,
  }
  if (!runnable(battle, next)) return
  unit.position = next
  unit.facing = heading
}

/** Ground a Rout will actually run over. Off the Field counts: it keeps going. */
function runnable(battle: Battle, at: Vec2): boolean {
  const field = battle.field
  const { cx, cy } = cellAt(field, at)
  if (!inBounds(field, cx, cy)) return true
  return passable(field, cellIndex(field, cx, cy))
}

/** True once a Routing Unit has run clean off the Field and out of the battle. */
export function hasQuitTheField(battle: Battle, unit: Unit): boolean {
  if (!isRouting(unit)) return false
  const { cx, cy } = cellAt(battle.field, unit.position)
  return !inBounds(battle.field, cx, cy)
}
