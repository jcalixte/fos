import { drillSeconds } from "./formation"
import type { Battle, Unit } from "./types"

/**
 * C7 Morale — Disorder.
 *
 * The third of C7's three, beside Morale and Fatigue, and the one about the
 * ranks rather than about the nerve or the legs. A Unit in Disorder has not
 * lost its willingness and has not lost its wind: it has lost its shape, and
 * everything a body of troops does that depends on having one is off the table
 * until it has dressed itself again.
 *
 * It is binary, because CONTEXT says a Unit is either Ordered or in Disorder
 * and means it. What is counted here is not how disordered a Unit is but how
 * long the way back is, which is a drill and therefore a length of time spent
 * standing still.
 *
 * Three things buy it and there is no fourth. A regiment that has ridden a mob
 * down is loose among men who are running; a Unit that a mob has run through
 * has had its files opened by its own side; and two formed Units that have
 * walked through each other have opened each other's. The first two are
 * CONTEXT's and were owed since Pursuit was built. The third is what stops a
 * brigade being one body of men drawn as four, and it arrived with the ground a
 * Unit stands in
 * ([ADR-0015](../../docs/adr/0015-a-unit-stands-in-ground-of-its-own.md)).
 *
 * None of the three is a rule the player can ask for: Disorder is something
 * that happens to a Unit and never something it does.
 *
 * What it costs is CONTEXT's three — no Formation change, no Charge, and fire
 * that falls off — and the three are enforced where each of them lives rather
 * than from in here. What lives here is the state, its price, and its clock.
 *
 * A Pursuit's length is not counted anywhere and does not need to be. The
 * regiment is disordered afresh every step it is among them, so the ride is
 * paid for in the walk home: it re-forms only standing still, and it is not
 * standing still until it has come back. That is the third of a Pursuit's
 * three prices, and the other two — Fatigue and position — were always charged
 * by the ground it covered ([ADR-0012](../../docs/adr/0012-disorder-is-what-a-mob-costs-the-troops-it-runs-over.md)).
 */

/** What a Unit carries when its ranks are its own: nothing to give back. */
export const ORDERED = 0

/**
 * How much of its fire a Unit still has for being ragged. Half, and the half is
 * borrowed rather than invented: Open Order is the one other way a Unit fires
 * without a dressed Face to level along, and C6 already prices that at a shot
 * every forty-five seconds against a formed battalion's twenty-two. A Unit in
 * Disorder is men firing on their own account, so it puts down what men firing
 * on their own account put down.
 *
 * Charged on the Volley's effect rather than on the reload, which is where
 * CONTEXT puts it — *a Unit's fire falls off as its Morale drops and Disorder
 * sets in* — and it lands beside Morale and Fatigue in `fireEffect` for that
 * reason. One global scalar, nothing per Formation: F8 stands.
 */
const RAGGED = 0.5

/** True while the Unit's ranks are not its own. Its opposite is Ordered. */
export function isDisordered(unit: Unit): boolean {
  return unit.disorder > ORDERED
}

/**
 * Seconds of standing still it takes this Unit to get its ranks back.
 *
 * Derived out of C3's own drill table rather than authored here, which is the
 * whole reason there is no number in this function. There is no Formation for
 * *a crowd*, and the nearest thing the table has to one is Open Order — men who
 * have let go of each other, which is precisely what a Unit in Disorder is. So
 * re-forming is priced at the drill out of it and into whatever the Unit is
 * standing in: thirty-five seconds back into line, forty-five into square,
 * twenty-five into march column, and every one of them scaled by the Grade that
 * already decides how fast a battalion drills.
 *
 * The two Arms with no Open Order of their own fall to the table's default,
 * which is what a lookup with no row for it has always done. A battery whose
 * guns have been ridden through is a quarter of a minute from having them laid
 * again, and nothing about that wanted a row of its own.
 */
export function reformingSeconds(unit: Unit): number {
  return drillSeconds(unit.arm, unit.grade, "open-order", unit.formation)
}

/**
 * Throw a Unit into Disorder, and say what did it. Called every step the cause
 * is still on it, so the clock does not start until the cause has gone.
 *
 * Whatever drill it was in the middle of is ruined. A battalion three-quarters
 * of the way into square that a mob runs through is not three-quarters of the
 * way into anything: it is a crowd, standing in the Formation it started from,
 * and it has to be a Unit again before it can be a square. That is the harshest
 * thing in here and it is the reading CONTEXT asks for — a Unit in Disorder
 * cannot change Formation, and one that is mid-change is changing Formation.
 *
 * And the suspension goes with the drill. An Initiative rule holds the Order
 * back for as long as it is the rule that fired, and it is asked no further
 * questions while it holds — so a rule that had suspended the Order to make
 * square would go on holding it after the drill was cancelled, standing the
 * Unit still for the rest of the afternoon and never starting the square again.
 * The rule list is let go of instead, and it decides afresh on the next tick
 * with the Unit's ranks as they now are.
 */
export function disarrange(battle: Battle, unit: Unit, because: string): void {
  const was = isDisordered(unit)
  if (unit.changing) {
    unit.changing = null
    unit.suspendedBy = null
  }
  unit.disorder = reformingSeconds(unit)
  if (was) return
  battle.dispatches.push({
    at: battle.time,
    unitId: unit.id,
    army: unit.army,
    text: `${unit.name} is in disorder, ${because}`,
  })
}

/**
 * One step of getting the ranks back, given the pace the Unit asked of its men.
 * Called beside `weary` and off the same number, because they are the same
 * question asked two ways: standing still is the only thing that mends either.
 *
 * A Unit that is walking does not re-form. Officers dress a line by walking it
 * back into place, which cannot be done by a body that is going somewhere — and
 * it is why a pursuing regiment comes home ragged rather than tidying itself up
 * on the ride back.
 *
 * Nothing here asks whether it is being shot at. A battalion that re-forms
 * under fire in half a minute is a known simplification and the honest one to
 * make first: ADR-0011 already keeps Morale from mending between two Volleys,
 * and stacking a second such rule on the ranks would be pricing the same
 * afternoon twice before anything has measured it.
 */
export function reform(battle: Battle, unit: Unit, pace: number, dt: number): void {
  if (!isDisordered(unit)) return
  if (pace > 0) return
  unit.disorder = Math.max(ORDERED, unit.disorder - dt)
  if (isDisordered(unit)) return
  battle.dispatches.push({
    at: battle.time,
    unitId: unit.id,
    army: unit.army,
    text: `${unit.name} has its ranks back`,
  })
}

/** How much of its fire a Unit still has, in its ranks. C7 folds it in with the rest. */
export function orderLeft(unit: Unit): number {
  return isDisordered(unit) ? RAGGED : 1
}
