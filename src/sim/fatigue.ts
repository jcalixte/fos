import { baseSpeed, TRAVELLING_FORMATION } from "./formation"
import type { Battle, Unit } from "./types"

/**
 * C7 Morale — Fatigue.
 *
 * The other half of C7, and the half that is about the men's legs rather than
 * their nerve. Morale is what a Unit is willing to do; Fatigue is what it is
 * still able to do, and the two are counted apart because they are spent apart
 * — a battalion that has marched all afternoon and never been shot at is fresh
 * in the one and finished in the other.
 *
 * It is bought by the pace and not by the Order. There is no rule in here that
 * knows what a Unit was told to do: a Unit tires by the ground it covers and
 * the speed it covers it at, so a charge, a Rout, a flank march and a battery
 * hitching up and trundling off are all the same question asked of the same
 * arithmetic. What it costs is CONTEXT's three — it slows a Unit, it blunts its
 * fire, and it denies it a Charge — and one more the ubiquitous language has
 * always said out loud: a tired battalion goes sooner than a fresh one.
 *
 * Formation reaches it through the pace and nowhere else, which is F8 held to
 * where it would be easiest to break: a table of fatigue per Formation is the
 * per-Formation constant F8 exists to forbid. So a column tires five times what
 * a line does a second, because it is walking at 1.4 metres a second against
 * 0.8, and about three times what a line does over the same ground — a
 * battalion in a hurry gets there in half the time and pays three times a metre
 * for it. Square and guns in battery cost nothing, having no speed to cost
 * anything with. Known simplification, and it runs the other way: dressing a
 * line across broken country is work, and a Formation that only ever tires by
 * how fast it walks reads that as rest.
 *
 * A Rout is not hobbled by it. Everything else reads `paceLeft` through C8's
 * one funnel, but a mob running for the rear is not marching and is not pacing
 * itself, and slowing it would be the simulation deciding a man cannot run for
 * his life while out of breath.
 */

/** What a Unit starts a battle with: its whole wind. */
export const FRESH = 0

/**
 * Seconds at its own marching pace that leave a Unit blown. Forty minutes,
 * which on ADR-0006's half-hour clock puts a battalion that spent the whole of
 * it on the road at a little over half — winded, and still a Unit that fights.
 * Not three quarters, because the cost limits itself: a tired battalion walks
 * slower and is therefore asking less of its men than a fresh one under the
 * same Order.
 */
const BLOWN_AT = 2400

/**
 * How the pace is charged: the cube of what a Unit is asking of its men against
 * what it marches at. Cubed and not squared, because troops do not tire in
 * proportion to their speed — the square had a cavalry regiment blown by
 * crossing the Field at the trot, and a gallop costing barely twice a march,
 * which is the wrong shape for both. At the cube a regiment can trot all
 * afternoon and pays for the last stretch, which is the period's own account of
 * why horse walked up and only galloped the last hundred and fifty metres.
 *
 * Measured against the Unit's *own* marching pace, so it is one law for three
 * Arms rather than a number each: a horse's work is a horse's, and every Unit
 * in its travelling Formation is doing exactly one second of work a second.
 */
const EXERTION = 3

/**
 * Fatigue back per second standing. Twenty minutes from blown to fresh, which
 * is most of an afternoon — a regiment blown at the tenth minute is not the
 * regiment the commander has at the twentieth, and pulling it out is a decision
 * about the rest of the battle rather than a pause.
 */
const WIND_BACK = 1 / 1200

/** What being blown takes off a Unit's pace. */
const HOBBLE = 0.35

/** What it takes off its fire: heavy arms, and a slower cartridge. */
const BLUNT = 0.3

/** What it takes off its steadiness, which is what makes a tired Unit go sooner. */
const UNNERVE = 0.25

/**
 * The words Fatigue is read in, worst rung first, as MORALE_WORDS are. T11 gave
 * up the countable bar for Morale on purpose and the same discipline holds
 * here: the screen is told how a Unit is blowing, never the figure behind it.
 */
export const FATIGUE_WORDS = ["blown", "winded", "fresh"] as const

export type FatigueWord = (typeof FATIGUE_WORDS)[number]

/** Fatigue at which a Unit is blown, and will not be let go at anybody. */
const BLOWN = 0.6

/**
 * Fatigue a blown Unit has to come back under before it will go at anybody
 * again. Two marks and not one, which is the shape Breaking already has: a Unit
 * does not un-Break the instant its Morale creeps over zero, it stays Routing
 * until it can Rally, and that is a different and higher bar.
 *
 * With one mark the hard edge was a revolving door. A regiment sitting just
 * over the line at 0.62 needed twenty-four seconds of standing to be let go
 * again — charge, halt half a minute, charge — and the Dispatch fired afresh
 * every time it crossed back. Four minutes standing is what it costs now, which
 * is the claim the rule was written to make: a regiment blown at the tenth
 * minute is not the regiment the commander has at the twentieth.
 */
const RECOVERED = 0.4

/** Fatigue at which it has stopped being fresh. */
const WINDED = 0.3

export function describeFatigue(unit: Unit): FatigueWord {
  if (isBlown(unit)) return "blown"
  if (unit.fatigue >= WINDED) return "winded"
  return "fresh"
}

/**
 * True when a Unit has nothing left to run with. It is the one hard edge in
 * here — the other three costs come on by degrees — because a Charge is a thing
 * a regiment either goes at or does not, and the word for a regiment that will
 * not go is the word the player is already reading on its card.
 *
 * Read off the state and not only the figure, because the way out is not the
 * way in. The figure is still consulted so that nothing which is plainly spent
 * can be mistaken for fresh — a Unit at 0.7 is blown whatever a fixture set on
 * it — but between the two marks it is `blown` that answers, and `weary` is
 * what keeps it.
 */
export function isBlown(unit: Unit): boolean {
  return unit.blown || unit.fatigue >= BLOWN
}

/** The pace a Unit marches at when it is going somewhere: what effort is read against. */
function marchingPace(unit: Unit): number {
  return baseSpeed(unit.arm, TRAVELLING_FORMATION[unit.arm])
}

/**
 * What one step of asking `pace` metres a second of a Unit costs it, and what
 * standing still gives back. Called once a step by C8 with the pace the Unit
 * asked of its men — which is the ground it gained with the ground's own cut
 * handed back, so a marsh is paid for in work and not refunded in it.
 */
export function weary(battle: Battle, unit: Unit, pace: number, dt: number): void {
  const was = isBlown(unit)
  if (pace <= 0) {
    unit.fatigue = Math.max(FRESH, unit.fatigue - WIND_BACK * dt)
  } else {
    const march = marchingPace(unit)
    const effort = march > 0 ? (pace / march) ** EXERTION : 0
    unit.fatigue = Math.min(1, unit.fatigue + (effort * dt) / BLOWN_AT)
  }
  if (unit.fatigue >= BLOWN) unit.blown = true
  else if (unit.fatigue < RECOVERED) unit.blown = false
  // Both ends of it are said, once each, because both are things the player can
  // act on: one takes a Charge off the table and the other puts it back, and
  // neither is visible on a card he is not looking at (F7).
  if (was === isBlown(unit)) return
  battle.dispatches.push({
    at: battle.time,
    unitId: unit.id,
    army: unit.army,
    text: was ? `${unit.name} has its wind back` : `${unit.name} is blown`,
  })
}

/** How much of its pace a Unit still has. */
export function paceLeft(unit: Unit): number {
  return 1 - HOBBLE * unit.fatigue
}

/** How much of its fire it still has for being tired, which C7 folds into the rest. */
export function fireLeft(unit: Unit): number {
  return 1 - BLUNT * unit.fatigue
}

/**
 * How much of its steadiness it still has. The one cost CONTEXT's definition
 * does not list and its dialogue does: *it'll go at a quarter of its Strength,
 * sooner if it's tired*. A blown battalion breaks a few points of Strength
 * earlier than a fresh one, which is under F10's band on purpose — the band is
 * where a Unit that has been left something to fight with breaks.
 */
export function nerveLeft(unit: Unit): number {
  return 1 - UNNERVE * unit.fatigue
}
