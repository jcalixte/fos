import {
  allRoundStandoff,
  density,
  fireZone,
  firesOnTheMove,
  footprint,
  grid,
  spanAlong,
  type FireZone,
} from "./formation"
import { fireEffect, isRouting, shake } from "./morale"
import type { Arm, Battle, Grade, Unit, Vec2 } from "./types"
import { axes, dot } from "./vec"

/**
 * C6 Fighting — the Volley.
 *
 * Fire is not an Order and not an Initiative rule. A battalion standing in line
 * with the enemy in front of it and loaded muskets fires, and no player and no
 * rule list has to say so. What the player commands is where it stands and which
 * way it looks, and that is what decides the fight (F8).
 *
 * Every number a Volley needs comes out of C3's geometry: how many muskets bear
 * is Frontage against the target's Frontage, and how much a shot finds is how
 * many bodies stand in its path. Nothing here is authored per Formation — a line
 * out-shoots a column because it *is* wider, and a column is ploughed by round
 * shot because it *is* deep.
 *
 * Casualties are the expected value, not a sample. There is no per-man
 * simulation to sample over (T1), and taking the mean keeps a replay identical
 * without threading the seeded RNG through every discharge (F18).
 */

const QUARTER_TURN = Math.PI / 2

/**
 * Seconds between one discharge and the next: F9's clocks, which are the drill
 * manuals' — three rounds a minute for infantry against a gun's minute and a
 * half of running the piece back up to the line.
 */
const RELOAD_SECONDS: Record<Arm, number> = { infantry: 22.5, cavalry: 0, artillery: 45 }

/** Veterans load faster; conscripts fumble the cartridge. Both stay in F9's band. */
const RELOAD_BY_GRADE: Record<Grade, number> = { conscript: 1.1, line: 1, elite: 0.9 }

/**
 * What loading on the walk costs, for the Formations that may do it at all. One
 * global scalar and not a per-Formation number (F8): a skirmisher gets his shot
 * off every forty-five seconds against a halted battalion's twenty-two, because
 * he is loading between paces and not because Open Order was given a fire rate.
 *
 * The price is paid here and never on the Volley itself, which stays purely
 * geometric — the same discipline Grade is held to.
 *
 * Charged to the Formation and not to the step. Reading whether the Unit had
 * moved *this tick* meant a screen that halted reloaded as fast as a dressed
 * battalion, so Open Order kept its 150m reach and its all-round aim and paid
 * nothing at all for either: parked at 130m it beat a line to death from
 * outside the line's reach, at a line's own rate of fire, and the one price the
 * Formation is supposed to carry was refunded the moment it stopped walking.
 * A skirmisher loads on his own account whether or not his feet are moving,
 * which is what CONTEXT means by Open Order firing on the move and paying for
 * it in the reload.
 */
const RELOAD_ON_THE_MOVE = 2

export function reloadSeconds(arm: Arm, grade: Grade): number {
  return RELOAD_SECONDS[arm] * RELOAD_BY_GRADE[grade]
}

/**
 * Ranks that get a weapon to bear at once. The third rank of a line has no shot
 * it can take without shooting the second in the back of the head, so a line's
 * fire is its files twice over and not three times.
 */
const FIRING_RANKS: Record<Arm, number> = { infantry: 2, cavalry: 0, artillery: 1 }

/**
 * Bodies one projectile can strike before it stops. A musket ball stops in the
 * first man it finds; round shot goes through the file and keeps going, which is
 * the whole reason depth is a liability in front of guns and not just in front
 * of muskets.
 */
const PENETRATION: Record<Arm, number> = { infantry: 1, cavalry: 0, artillery: 4 }

/**
 * Weapons laid on the target rather than levelled where the rank points. A gun
 * is traversed onto what it is shooting at; a musket in the second rank of a
 * hundred-and-forty-metre line points wherever the line points, and if the enemy
 * is not in front of *him* his ball goes into open country.
 *
 * This is why a battery loses nothing against a narrow target and a battalion
 * loses most of its fire — and it is a fact about the weapon, not the Formation.
 */
const AIMED: Record<Arm, boolean> = { infantry: false, cavalry: false, artillery: true }

/**
 * Chance one shot strikes one particular body standing in its path, at
 * point-blank. Per *body*, not per shot: what a shot's chance of hitting
 * anything comes to is that compounded over everything standing in its way, so
 * depth raises it and nothing has to say that a column is easier to hit.
 *
 * Calibrated so that the shape of a firefight comes out where the period puts
 * it: two lines at sixty metres take about thirty men a Volley off each other,
 * an eight-gun battery at four hundred metres takes three or four off a line and
 * three times that off a column standing in front of it.
 */
const HIT_PER_BODY: Record<Arm, number> = { infantry: 0.035, cavalry: 0, artillery: 0.075 }

/** How much of that is left at the far edge of the Formation's reach. */
const HIT_AT_RANGE = 0.3

/** A Face that bears on an enemy, and how much of it does. */
export interface Aim {
  target: Unit
  /** Which Face: 0 front, 1 right, 2 rear, 3 left. As the Faces are drawn. */
  side: number
  /** Metres from the Face to the near edge of the target. */
  gap: number
  /** The share of that Face whose shot falls on the target, 0 to 1. */
  overlap: number
}

/**
 * The band a Face beats, matched to the one the renderer draws: `across` metres
 * wide, standing off the Unit's own edge, `range` deep. Odd sides are the
 * flanks, so what they present is the Unit's depth rather than its Frontage.
 */
function band(zone: FireZone, side: number): { across: number; standoff: number } {
  const across = side % 2 === 0 ? zone.width : zone.depth
  const standoff = (side % 2 === 0 ? zone.depth : zone.width) / 2
  return { across, standoff }
}

function bearsOnSide(unit: Unit, zone: FireZone, side: number, target: Unit): Aim | null {
  const { across, standoff } = band(zone, side)
  const face = axes(unit.facing + side * QUARTER_TURN)
  const offset = { x: target.position.x - unit.position.x, y: target.position.y - unit.position.y }
  const shape = footprint(target.arm, target.formation, target.strength)
  const depthwise = spanAlong(shape, target.facing, face.along)
  const widthwise = spanAlong(shape, target.facing, face.across)

  const along = dot(offset, face.along)
  const near = along - depthwise / 2
  if (near > standoff + zone.range) return null
  if (along + depthwise / 2 < standoff) return null

  // Frontage against Frontage: the part of the Face whose shot has anything in
  // front of it. A battalion firing at something a quarter its width fires with
  // a quarter of its muskets, and the rest are pointed at empty ground.
  const off = dot(offset, face.across)
  const from = Math.max(-across / 2, off - widthwise / 2)
  const to = Math.min(across / 2, off + widthwise / 2)
  if (to <= from) return null

  return { target, side, gap: Math.max(0, near - standoff), overlap: (to - from) / across }
}

/**
 * The whole-circle case: skirmishers have no Face and shoot every way at once.
 *
 * Both bodies are measured along the line of fire and not by their longest side,
 * exactly as a Face measures them — so the gap a shot crosses is the ground
 * actually between the two of them, and a screen's fire thins with the range
 * instead of carrying flat to the edge of its own Frontage.
 */
function bearsAllRound(unit: Unit, zone: FireZone, target: Unit): Aim | null {
  const offset = { x: target.position.x - unit.position.x, y: target.position.y - unit.position.y }
  const bearing = Math.atan2(offset.y, offset.x)
  const line = axes(bearing).along
  const shape = footprint(target.arm, target.formation, target.strength)
  const near =
    Math.hypot(offset.x, offset.y) -
    spanAlong(shape, target.facing, line) / 2 -
    allRoundStandoff(zone, unit.facing, bearing)
  if (near > zone.range) return null
  return { target, side: 0, gap: Math.max(0, near), overlap: 1 }
}

/**
 * True if a Unit's fire falls on one bare point of the Field. The same bands
 * `aim` reads, measured against a target of no width and no depth at all —
 * which is what a Headquarters is: a place and not a Unit, so there is nothing
 * on the far side of the shot to measure (ADR-0008).
 *
 * The Faces are honoured, and that is the whole reason this is geometry and not
 * a radius. A battalion in line beats a slab of ground a hundred metres deep in
 * front of it and nothing behind it, so a Headquarters sited *behind* the line
 * that is firing over it is not under fire — and one sited eight hundred metres
 * off, in front of a battery, is.
 */
export function beatsPoint(unit: Unit, point: Vec2): boolean {
  if (unit.changing || unit.strength <= 0 || isRouting(unit)) return false
  const zone = fireZone(unit.arm, unit.formation, unit.strength)
  if (!zone) return false
  const offset = { x: point.x - unit.position.x, y: point.y - unit.position.y }
  if (zone.faces === 0) {
    const heading = Math.atan2(offset.y, offset.x)
    const near = Math.hypot(offset.x, offset.y) - allRoundStandoff(zone, unit.facing, heading)
    return near <= zone.range
  }
  const sides = zone.faces === 4 ? [0, 1, 2, 3] : [0]
  return sides.some((side) => {
    const { across, standoff } = band(zone, side)
    const face = axes(unit.facing + side * QUARTER_TURN)
    const along = dot(offset, face.along)
    // A point nearer than the standoff is inside the Unit's own Footprint, not
    // in the ground it beats. Nothing is lost by it: anything that close to a
    // Headquarters is past harrying it and into overrunning it.
    if (along < standoff || along > standoff + zone.range) return false
    return Math.abs(dot(offset, face.across)) <= across / 2
  })
}

/**
 * What a Unit shoots at: the nearest enemy standing in its beaten ground. A
 * battalion shoots at what is in front of it, which is a fact about where it was
 * pointed and therefore the player's decision, not a target the Unit picked.
 */
export function aim(battle: Battle, unit: Unit): Aim | null {
  if (unit.changing) return null
  if (unit.strength <= 0) return null
  // A mob running for the rear is not delivering Volleys.
  if (isRouting(unit)) return null
  const zone = fireZone(unit.arm, unit.formation, unit.strength)
  if (!zone) return null
  const sides = zone.faces === 4 ? [0, 1, 2, 3] : [0]
  let best: Aim | null = null
  for (const other of battle.units) {
    if (other.army === unit.army) continue
    if (other.strength <= 0) continue
    const found =
      zone.faces === 0
        ? bearsAllRound(unit, zone, other)
        : sides.reduce<Aim | null>((carried, side) => {
            const shot = bearsOnSide(unit, zone, side, other)
            if (!shot) return carried
            return !carried || shot.gap < carried.gap ? shot : carried
          }, null)
    if (found && (!best || found.gap < best.gap)) best = found
  }
  return best
}

/**
 * Bodies a shot passes through, which is what decides how much it finds. Read
 * off the target's own grid against the line of fire, so enfilading a line runs
 * the ball down two hundred files and taking it head-on runs it through three
 * ranks — the difference the period cared most about, and it is geometry.
 *
 * Counted at the Density the Formation stands at, so what a shot meets is the
 * bodies in its way less the ground between them: a ball crossing a line is in
 * somebody's lane the whole way, and one crossing a screen at 1.6m intervals
 * mostly is not. Depth and dispersal are then priced apart, which is the whole
 * reason a battalion sends its skirmishers out rather than closing them up.
 *
 * A square is counted as the one Face the shot enters and not as both sides of
 * the hollow, so it is a little safer here than it was in life.
 */
export function bodiesInPath(target: Unit, direction: number): number {
  const g = grid(target.arm, target.formation, target.strength)
  const d = density(target.arm, target.formation)
  const shot = axes(direction).along
  const { along, across } = axes(target.facing)
  return Math.max(
    1,
    g.ranks * d.ranks * Math.abs(dot(shot, along)) +
      g.files * d.files * Math.abs(dot(shot, across)),
  )
}

/**
 * Grade is deliberately not in here. It buys rate of fire and the steadiness to
 * keep firing as the Unit is shot at, and it reaches lethality only through
 * Morale — never as a multiplier on the Volley itself.
 */
function hitPerBody(unit: Unit, gap: number, range: number): number {
  const falloff = 1 - (1 - HIT_AT_RANGE) * Math.min(1, gap / range)
  return HIT_PER_BODY[unit.arm] * falloff * fireEffect(unit)
}

/**
 * Men the target loses to one discharge. Three geometric quantities and nothing
 * else: how many weapons bear, whether a shot finds anybody in the depth it
 * passes through, and how many bodies it can take down once it does.
 *
 * Exported to be argued with in tests, which is where the tuning lives.
 */
export function volleyCasualties(unit: Unit, shot: Aim): number {
  const zone = fireZone(unit.arm, unit.formation, unit.strength)
  if (!zone) return 0
  const g = grid(unit.arm, unit.formation, unit.strength)
  const bearing = AIMED[unit.arm] ? 1 : shot.overlap
  const shots = g.files * Math.min(g.ranks, FIRING_RANKS[unit.arm]) * bearing
  const direction = Math.atan2(
    shot.target.position.y - unit.position.y,
    shot.target.position.x - unit.position.x,
  )
  const path = bodiesInPath(shot.target, direction)
  const q = hitPerBody(unit, shot.gap, zone.range)
  // Compounded over the depth: a ball that misses the front rank of a column
  // still has eight more ranks to find, which is the whole case against depth.
  const strikes = 1 - (1 - q) ** path
  return shots * strikes * Math.min(PENETRATION[unit.arm], path)
}

/**
 * One Unit's fire for one step.
 *
 * `halted` is the period's own rule and not a nicety: fire and movement do not
 * mix when reloading takes both hands and twelve separate motions, and a line
 * cannot deliver anything at all until it is dressed. So a battalion that wants
 * to shoot has to stop, which is what makes the Halt Order worth having and an
 * advance under fire cost something.
 *
 * What is halted is the *Face*, though, and skirmishers have none: Open Order
 * fires on the move, at half the rate, because that is the whole of what the
 * Formation is for. Which Formations those are is derived and not authored.
 *
 * Two questions off the one word, and only the first of them is about this
 * step. Whether the Unit may fire at all turns on having its Face dressed, so
 * it turns on `halted`. What the shot costs in reload turns on how the
 * Formation loads, which is the same whether its feet are moving or not.
 *
 * A Unit reloads whatever it is doing, so a battalion arriving in position with
 * loaded muskets fires the moment it dresses, exactly as it should.
 */
export function resolveFire(battle: Battle, unit: Unit, dt: number, halted: boolean): void {
  unit.reload = Math.max(0, unit.reload - dt)
  if (!halted && !firesOnTheMove(unit.arm, unit.formation)) return
  if (unit.reload > 0) return
  const shot = aim(battle, unit)
  if (!shot) return

  const casualties = Math.min(shot.target.strength, volleyCasualties(unit, shot))
  shot.target.strength -= casualties
  // Casualties cost the target Morale as well as men, and cost it more from off
  // its Face. Morale is what decides its fate; the men are just the bill (F10).
  shake(shot.target, casualties, unit.position)
  const looseFile = firesOnTheMove(unit.arm, unit.formation)
  unit.reload = reloadSeconds(unit.arm, unit.grade) * (looseFile ? RELOAD_ON_THE_MOVE : 1)

  const zone = fireZone(unit.arm, unit.formation, unit.strength)
  if (!zone) return
  const { across, standoff } = band(zone, shot.side)
  // A Unit with no Face fires from where it stands, at whatever it hit; one with
  // a Face fires from the middle of that Face, along it.
  const allRound = zone.faces === 0
  const direction = allRound
    ? Math.atan2(shot.target.position.y - unit.position.y, shot.target.position.x - unit.position.x)
    : unit.facing + shot.side * QUARTER_TURN
  const face = axes(direction).along
  const standing = allRound ? 0 : standoff
  battle.volleys.push({
    id: `v${battle.nextId++}`,
    at: battle.time,
    unitId: unit.id,
    targetId: shot.target.id,
    from: {
      x: unit.position.x + face.x * standing,
      y: unit.position.y + face.y * standing,
    },
    direction,
    width: allRound ? Math.max(zone.width, zone.depth) : across,
    casualties,
  })
}
