import { ORDERED, orderLeft } from "./disorder"
import { cellAt, cellIndex, inBounds, passable } from "./field"
import { fireLeft, nerveLeft } from "./fatigue"
import { backing, TRAVELLING_FORMATION } from "./formation"
import type { Arm, Army, ArmyId, Battle, Grade, Unit, Vec2 } from "./types"
import { angleDelta, bearing, distance } from "./vec"

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
 * The last thing in here is the one that is about the army rather than the
 * battalion. Army Break is Morale read one level up: an army is beaten when it
 * has nothing left in hand, exactly as a Unit is beaten when its Morale gives
 * out, and neither is ever beaten by being counted down to nothing.
 *
 * Fatigue is C7's too and lives beside this in `fatigue.ts`, the way the Charge
 * lives beside the Volley: it is bought by the pace rather than by anything
 * done to the Unit, and everything in here that Grade steadies, it unsteadies.
 * Disorder is the third of them and lives in `disorder.ts` — the nerve, the
 * legs and the ranks, counted apart because they are spent apart.
 */

/** Morale, and the Ceiling on it, that a Unit starts a battle with. */
export const FULL_MORALE = 1

/**
 * What casualties cost in Morale, as a multiple of the share of the Unit they
 * took. Set so that Break lands inside F10's 15–30% band: a battalion with
 * nothing standing behind its fight spends its whole Morale on about a sixth of
 * its men, a conscript one sooner and an elite one later, and what depth is
 * worth is added on top of that floor rather than taken out of it.
 */
const SHOCK = 5.6

/** How much of that a Grade shrugs off. This is what Grade means under fire. */
const STEADINESS: Record<Grade, number> = { conscript: 0.75, line: 1, elite: 1.2 }

/**
 * What the ranks behind the fight are worth to the men in it, as a multiple of
 * what a Unit shrugs off. The one thing depth has ever bought, and the only
 * place C3's geometry reaches Morale directly.
 *
 * A global scalar against a derived share, which is what DESIGN section 6 says
 * to do when F8's geometry has to hit F10's numbers: `backing` sets the
 * relative effect and this sets how much it is worth. There is no
 * per-Formation constant anywhere in it — a column stands because it *is* deep,
 * a march column does not because it has no Face, and a screen does not because
 * it is men who have let go of each other.
 */
const BACKING = 0.6

/**
 * What a Unit shrugs off, all told: its Grade, less what it has spent its legs
 * on. Grade is the ladder and Fatigue is the sag in it — an elite battalion
 * that has been marched off its feet is steadier than a conscript one and less
 * steady than it was at noon, which is CONTEXT's *sooner if it's tired* and the
 * whole of it.
 */
function steadiness(unit: Unit): number {
  return STEADINESS[unit.grade] * nerveLeft(unit)
}

/**
 * What the ranks behind the fight are worth when the Unit is rushed, as a
 * further multiple on what it shrugs off.
 *
 * Deliberately not part of `steadiness`, which is to say deliberately worth
 * nothing against fire. Depth holds a battalion together when something arrives
 * at it — the men behind cannot see it coming, cannot run without going through
 * the men behind *them*, and are pushing — and that is a fact about a shock, not
 * about ten minutes of musketry. A column being shot at is not steadied by being
 * deep; it is a bigger target for being deep, which C6 already charges it for.
 *
 * Keeping it out of fire is also what keeps F10 honest. Casualties are almost
 * all fire, so where a Unit Breaks by the men it has lost does not move an inch
 * for any of this: every Formation still spends its Morale on the sixth of its
 * men SHOCK is calibrated to. What moves is what it takes to rush one.
 */
export function stiffening(unit: Unit): number {
  return 1 + BACKING * backing(unit.arm, unit.formation, unit.strength)
}

/**
 * What being shot at from the wrong side costs on top. A deliberate rule and
 * not geometry: Units broke from being flanked long before the casualties
 * justified it, and worst of all from behind.
 */
const FLANK_SHOCK = 1.5

/**
 * What a Charge coming on costs the Unit it is aimed at, per second, before
 * anybody has laid a hand on anybody. A deliberate rule and not geometry, in
 * exactly the way FLANK_SHOCK is: infantry broke at the sight of cavalry far
 * more often than it broke at the sabre, and that — not the arithmetic of the
 * Contact — is what thirty seconds of drill into square is buying.
 */
const DREAD: Record<Arm, number> = { infantry: 0.004, cavalry: 0.012, artillery: 0 }

/** What having no Face turned toward the charge multiplies it by. */
const DREAD_EXPOSED = 3

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

/**
 * Metres per second a Routing Unit runs. Faster than any Formation marches,
 * and the number that decides who may Pursue: C6 reads it against what an Arm
 * makes at the charge, so foot cannot catch what it has just broken.
 */
export const ROUT_SPEED = 2.6

/** The share of its remaining Strength a Routing Unit sheds each second. */
const SHEDDING = 0.001

/**
 * Deflections a Rout tries when the way it is running is shut, in order, and
 * never past a quarter turn either side — a mob will run along a river but it
 * will not turn back into what put it there.
 *
 * This is what a mob does at an obstacle, not pathfinding: it takes the least
 * turn that still gets it away and keeps going. The heading it broke on is
 * never rewritten, so the moment the bank runs out or a bridge comes up under
 * it, it is running for the rear again.
 *
 * Ties go to the side it is already turned to, and to its left when it is not
 * turned at all — for no reason anybody could defend beyond replay. A mob
 * pinned against a river is not choosing the better bank, but it is not
 * choosing afresh either: see `advanceRout` for what picking the far side of a
 * tie every step did to a Unit standing on a bank on the slant (F18).
 */
const ROUT_DEFLECTIONS = [0, 1, 2, 3].map((sixths) => (sixths * Math.PI) / 6)

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
 * The words Morale is read in, worst rung first. An ordered ladder and not a set
 * of labels, because the renderer draws Morale as a rung on it (C10) and these
 * words are the whole of what it is given.
 */
export const MORALE_WORDS = ["on the point of breaking", "shaken", "wavering", "steady"] as const

export type MoraleWord = (typeof MORALE_WORDS)[number]

/**
 * Morale in words rather than as a number. T11 paid for Morale-as-health-bar by
 * giving up a bar the player can count down, so the panel says how a battalion
 * is holding up and never how much of it is left.
 */
export function describeMorale(unit: Unit): MoraleWord {
  if (unit.morale >= 0.75) return "steady"
  if (unit.morale >= 0.5) return "wavering"
  if (unit.morale >= 0.25) return "shaken"
  return "on the point of breaking"
}

/**
 * Which rung of the ladder a word stands on, 0 the lowest. The ordering without
 * the number behind it: enough to draw a Unit coming apart by degrees, and no
 * more of the Morale figure than T11 lets off the simulation.
 */
export function moraleRung(word: MoraleWord): number {
  return MORALE_WORDS.indexOf(word)
}

/**
 * How much of its fire a Unit still has, in its nerve and in its arms. This is
 * the whole route by which Grade reaches lethality: a steady battalion fires as
 * it was drilled to, a shaken one fires high and ragged, and Grade decides which
 * it is — never a multiplier on the Volley itself. Fatigue is folded in at the
 * same point and for the same reason: a blown battalion is slow with the
 * cartridge and heavy with the musket, and neither is a fact about the Volley.
 *
 * Disorder is folded in at the same point and, for the third time, for the same
 * reason: a Unit whose files are mixed has no dressed rank to level along, and
 * that is a fact about the men and not about the discharge.
 */
export function fireEffect(unit: Unit): number {
  return (0.4 + 0.6 * clamp(unit.morale, 0, 1)) * fireLeft(unit) * orderLeft(unit)
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
 *
 * `weight` is what this particular blow is worth beyond the men in it, and is 1
 * for everything but a Contact. C8 works it out from how narrow a front the blow
 * landed on and how much depth the Unit had behind the fight; all this knows is
 * that the same men lost can cost more nerve or less for the way they were lost.
 */
export function shake(unit: Unit, casualties: number, from: Vec2, weight = 1): void {
  if (casualties <= 0) return
  const share = casualties / Math.max(1, unit.strength + casualties)
  unit.morale -= (share * SHOCK * flanking(unit, from) * weight) / steadiness(unit)
  unit.settling = SETTLING
}

/**
 * What a Charge closing on the Unit costs it while it is still only closing.
 * Called by C8 for each step the chargers are running, with `exposed` set when
 * nothing the Unit has is turned their way — which is three times as dear,
 * because a battalion that cannot reply has nothing to do but watch.
 */
export function dread(unit: Unit, charger: Unit, exposed: boolean, dt: number): void {
  if (isRouting(unit)) return
  const rate = DREAD[charger.arm] * (exposed ? DREAD_EXPOSED : 1)
  unit.morale -= (rate * dt) / (steadiness(unit) * stiffening(unit))
  unit.settling = SETTLING
}

/**
 * Morale creeping back toward the Ceiling, hastened by its own Headquarters.
 *
 * Nothing creeps back while the Unit is still being shaken. A battalion
 * steadies when it is out of it and not between two Volleys, and the count runs
 * down here because this is the one thing asked of every Unit every step
 * (ADR-0011).
 */
export function recover(battle: Battle, unit: Unit, dt: number): void {
  if (unit.settling > 0) {
    unit.settling = Math.max(0, unit.settling - dt)
    return
  }
  if (unit.morale >= unit.moraleCeiling) return
  const hq = battle.armies.find((a) => a.id === unit.army)?.headquarters
  const comfort = hq && distance(unit.position, hq.position) <= HQ_COMFORT ? 2 : 1
  unit.morale = Math.min(unit.moraleCeiling, unit.morale + RECOVERY * comfort * dt)
}

/**
 * Seconds a Unit goes on being shaken after the last thing that shook it, and
 * therefore how long it must be left alone before it steadies at all.
 *
 * Longer than a reload on purpose. A battalion loads in twenty-two and a half
 * seconds, so a window shorter than that would hand a Unit its nerve back
 * between the Volleys of the enemy taking it — which is the whole of what this
 * is for. Thirty is the same window the budget run already reads a Unit's last
 * Volley against when it asks whether the Unit has answered for itself.
 */
const SETTLING = 30

/** Metres to the nearest enemy, or Infinity if the Unit is alone on the Field. */
function nearestEnemy(battle: Battle, unit: Unit): number {
  let best = Infinity
  for (const other of battle.units) {
    if (other.army === unit.army) continue
    best = Math.min(best, distance(unit.position, other.position))
  }
  return best
}

/**
 * True when a Routing Unit is clear enough, and steady enough, to Rally.
 *
 * A Pursuit denies it with no clause of its own. A pursuer takes more nerve off
 * a mob in a second than standing anywhere gives back in ten, so a Unit that
 * has been ridden down is under the floor for the rest of the afternoon, and
 * one that got away is only ever a long walk from the mark.
 */
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
  // A mob has no ranks left to have lost, so whatever Disorder it was carrying
  // is spent. What it costs to be a Unit again is the Rally's own drill, at a
  // Ceiling it will not get back — a dearer bill than this one, and charged
  // instead of it rather than on top.
  unit.disorder = ORDERED
  // Whatever it was committed to, it is not committed to it any more.
  unit.charging = null
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
 * Run one step of a Rout: down the heading it broke on, shedding men as it goes.
 * It does not route around anything — a mob is not picking its way — so it does
 * not cross water it cannot cross. What it does instead is run along it.
 *
 * Stopping dead was the first answer and it was the wrong one. A battalion that
 * broke with a river behind it stood in the shallows for the rest of the
 * afternoon: it could not run, it could not Rally with the enemy that close,
 * and it shed men where it stood — which is F10's bug arriving by the back
 * door, a Unit counted down to nothing rather than beaten.
 *
 * Choosing afresh every step was the second wrong one. On a bank on the slant
 * both quarter turns are open, and which of them is open is decided by the cell
 * edge the Unit is standing on: it stepped a foot north, that shut the turn it
 * had just taken and opened the other, and it stepped the foot back. A mob
 * spinning end for end ten times a second and holding its ground is the
 * shallows again in a different coat, so the side it turned to is remembered.
 */
export function advanceRout(battle: Battle, unit: Unit, dt: number): void {
  if (!unit.routing) return
  unit.strength = Math.max(0, unit.strength - unit.strength * SHEDDING * dt)
  const stride = ROUT_SPEED * dt
  // The side it is already turned to, tried first at every deflection. A mob
  // that turned last step is running along the obstacle, and a mob has no
  // reason to change its mind about which way round it.
  const turned = Math.sign(angleDelta(unit.routing.heading, unit.facing)) || 1
  for (const deflection of ROUT_DEFLECTIONS) {
    for (const side of deflection === 0 ? [1] : [turned, -turned]) {
      const heading = unit.routing.heading + side * deflection
      const next = {
        x: unit.position.x + Math.cos(heading) * stride,
        y: unit.position.y + Math.sin(heading) * stride,
      }
      if (!runnable(battle, next)) continue
      unit.position = next
      unit.facing = heading
      return
    }
  }
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

/**
 * What losing a Unit costs its army. The army leans on its best, so an elite
 * Unit going is worth exactly two conscript ones going — which is the whole of
 * what the weighting is asked for.
 *
 * Since ARMY_BREAK went to 1 the weighting no longer decides when a battle
 * ends: nothing standing is nothing standing at any weight. What it still
 * decides is the share the Return reports and the clock that ran out level,
 * which is where the difference between losing a Grenadier battalion and
 * losing a Landwehr one now has to be visible.
 *
 * It weighs Units and not men, because Army Break counts Units that have
 * Broken. So a squadron of two hundred costs the same as a battalion of seven
 * hundred: wrong about bodies, right about the line, where what has been lost
 * is a place in it and the gap is the same width either way.
 */
const GRADE_WEIGHT: Record<Grade, number> = { conscript: 0.75, line: 1, elite: 1.5 }

/**
 * The share of an army that has to be running or gone before the battle is
 * over: all of it.
 *
 * A third was the period-true figure and it is not the one used, because what
 * ends a battle here is the clock and Army Break is the floor underneath it
 * (ADR-0006). A third ended the fixture in five and a half minutes of a thirty
 * minute afternoon, which is a worse lie than the one it told the truth about:
 * an army a third gone is hurt, and it has the rest of the day to show it.
 *
 * At 1 it is still not annihilation. What has to be true is that no Unit is
 * left in hand, and a Unit leaves the count by Breaking rather than by being
 * killed — so an army arrives here with its men and without its nerve.
 */
export const ARMY_BREAK = 1

/** What one Unit is worth toward its army's Army Break. */
export function unitWeight(unit: Unit): number {
  return GRADE_WEIGHT[unit.grade]
}

/**
 * What an army still has standing: Units on the Field that are not running,
 * plus everything still on the road.
 *
 * Counting the road is what settles the conflict between Army Break and
 * Arrival. An army one Unit from breaking with a fresh column ninety seconds
 * off the Field edge has not lost, and a rule that looked only at the Field
 * would end the battle a minute before its best moment.
 */
function standing(battle: Battle, army: ArmyId): number {
  let total = 0
  for (const unit of battle.units) {
    if (unit.army !== army || isRouting(unit)) continue
    total += unitWeight(unit)
  }
  for (const arrival of battle.arrivals) {
    if (arrival.unit.army !== army) continue
    total += unitWeight(arrival.unit)
  }
  return total
}

/**
 * The share of an army that is running or gone, 0 to 1.
 *
 * It reads what is happening now rather than keeping a tally, so a Unit that
 * Rallies comes back off it and the share can fall as well as rise. That is
 * deliberate, and it is asked in three places: the Return reports it as how far
 * the army went toward breaking, a clock that ran out with the Key Ground even
 * is settled on it, and at 1 it is the end condition. A commander who gets two
 * battalions back in hand has bought the time he paid for, and it shows in all
 * three.
 */
export function shareGone(battle: Battle, army: Army): number {
  if (army.weight <= 0) return 0
  return Math.max(0, 1 - standing(battle, army.id) / army.weight)
}

/** True when an army has nothing left in hand: every Unit of it running or gone. */
export function hasArmyBroken(battle: Battle, army: Army): boolean {
  return shareGone(battle, army) >= ARMY_BREAK
}
