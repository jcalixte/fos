import { disarrange, isDisordered } from "./disorder"
import { isBlown } from "./fatigue"
import { ENGAGED_RANKS, faces, frontage, grid, spanAlong, unitFootprint } from "./formation"
import { breakUnit, hasBroken, isRouting, ROUT_SPEED, shake, stiffening } from "./morale"
import type { Arm, Battle, Unit, UnitId, Vec2 } from "./types"
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
 * A Charge whose target Breaks does not pull up. It rides on, and what it is
 * doing then is a Pursuit: no Face to strike, no Contact to resolve, and no
 * second decision to make — a regiment among a mob, taking a third of what is
 * left off it every minute. The player bought it with the Order that let the
 * horse go, which is the only moment he gets to decide it: calling them back is
 * a Courier ride, and no Courier has ever been in time for one of those.
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
 * It stood in for Fatigue until Fatigue was built, and it stays now that it is,
 * because it turned out not to be the tax it was standing in as: regiments
 * walked up and galloped the last stretch *because* of what a gallop costs, so
 * the seam is the drill and Fatigue is the reason for it (ADR-0010). What it
 * still is, and what nothing else would be, is the warning the infantry it is
 * aimed at gets: twenty-one seconds of gallop against thirty of drill to make
 * square. Running the whole way would hand the target ninety seconds of dread
 * instead, and break a fresh battalion by fear before anybody reached it.
 */
export const CHARGE_RANGE = 150

/** Metres of gap at which the two blocks are touching. */
export const CONTACT_RANGE = 2

/** Metres a Unit thrown back puts between itself and what threw it. */
export const RECOIL_DISTANCE = 120

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
 *
 * Paid to whichever side is running, and not to whichever side this function
 * was handed first. That distinction is the whole of what a countercharge buys:
 * two regiments meeting head-on are both at the gallop, and while impetus went
 * to the `unit` argument alone, which of them got it was decided by the order
 * the Units happen to sit in the array — so meeting a charge was strictly worse
 * than standing to receive it, because the regiment that ran closed the last
 * few metres on its opponent's behalf and was then struck as the target.
 */
const IMPETUS = 2

/** What a Unit brings to a Contact for being in motion: a run, or nothing. */
function impetus(unit: Unit): number {
  return unit.charging && !unit.charging.recoiling ? IMPETUS : 1
}

/**
 * Whether a Charge may be aimed at this Unit at all, and by what. A Routing one
 * may be — that is a Pursuit — but only by an Arm that can catch it, or the
 * Order spends a Courier ride and buys a battalion walking after a mob it will
 * never come up with.
 *
 * The rule lives next to what C6 does with the answer rather than in the
 * screen, so what the player is offered and what the simulation will accept
 * cannot drift.
 *
 * Typed on the two fields the answer turns on, because what the screen holds is
 * a Snapshot and C6 has no business importing the renderer's view of a Unit.
 * `by` is null where there is nothing selected to charge with, and then a mob
 * is nobody's target.
 */
export function chargeable(
  target: { army: string; routing: boolean },
  playerArmy: string,
  by: Arm | null,
): boolean {
  if (target.army === playerArmy) return false
  return !target.routing || (by !== null && canPursue(by))
}

/**
 * Whether this Arm can ride a mob down at all. Read off the two paces rather
 * than named per Arm: a Rout runs at 2.6 metres a second and foot goes at the
 * charge at 2.2, so infantry cannot catch what it has just broken and horse
 * can. F8 in the one place a table of three Arms would have been the obvious
 * way to write it.
 */
export function canPursue(arm: Arm): boolean {
  return chargeSpeed(arm) > ROUT_SPEED
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

/**
 * How concentrated the blow one Unit took was, as a multiple on what it cost its
 * nerve. Its own Frontage against the front the two actually met over: a line
 * struck along its whole length has been pushed, and the same line struck over a
 * third of it has had a hole punched in the middle of it, and the second is the
 * one battalions came apart from.
 *
 * This is the half of the attack column C8 owed it. Casualties stay exactly as
 * geometric as they were — only the bayonets that reach anybody kill anybody, so
 * a 47m column kills a 47m column's worth of men and takes a 47m column's worth
 * back. What was missing is that those two are not the same event to the Unit
 * they happen to: the column has been hit across the whole of its front and the
 * line has been hit in one place, and a line does not have to lose many men in
 * one place to stop being a line.
 *
 * It is never less than 1, and it is 1 for whichever side is the narrower —
 * which is every Contact the design already had. Cavalry is 200m wide and reads
 * 1 against a line and 1 against a square, so nothing about what square is for
 * moves; a column into a line is the case this exists for.
 *
 * Nothing for a blow struck by a Unit with no Face. A battalion on the road is
 * three metres across and would otherwise punch the hardest hole on the Field,
 * which is the exact opposite of what being caught in march column means.
 */
function concentration(taker: Unit, striker: Unit, width: number): number {
  if (width <= 0) return 1
  if (faces(striker.arm, striker.formation) === 0) return 1
  return Math.max(1, frontage(taker.arm, taker.formation, taker.strength) / width)
}

/**
 * Bodies a Unit gets into the fight over `width` metres of it. The ranks that
 * can reach across a Contact are C3's `ENGAGED_RANKS`: the third rank of a line
 * has no more of a bayonet in the fight than it has a musket in the Volley, and
 * the ninth rank of a column has nothing to do but push. What the pushing is
 * worth is that same fact read from the other end, which C3 hands to C7 as
 * `backing` rather than anything here counting it twice.
 */
function reach(unit: Unit, width: number): number {
  const g = grid(unit.arm, unit.formation, unit.strength)
  const front = frontage(unit.arm, unit.formation, unit.strength)
  if (front <= 0) return 0
  return (width * g.files * Math.min(g.ranks, ENGAGED_RANKS)) / front
}

/** Every enemy Unit committed to a Charge on this one, the thrown-back excluded. */
export function chargersOf(battle: Battle, unit: Unit): Unit[] {
  return battle.units.filter((other) => {
    const charge = other.charging
    if (!charge) return false
    return charge.targetId === unit.id && !charge.recoiling && other.army !== unit.army
  })
}

/**
 * Let a Unit go at another on its own account, and say whether it went. The
 * counterpart to `endCharge`, and here rather than in C2 for the same reason: a
 * Charge is a state this module owns, and the rule list only ever asks for one.
 *
 * Idempotent, because the rule that asks re-matches every tick to keep the
 * Order suspended for the length of the run — asking twice must not relaunch it
 * and reset the clock it was launched on.
 */
export function beginCharge(battle: Battle, unit: Unit, targetId: UnitId): boolean {
  if (unit.charging) return false
  // A blown regiment will not go, whoever asks. The rule list reaches this for
  // the countercharge, so horse with nothing left in it stands to receive —
  // which is horse ridden over, and the price of having been let go twice
  // already.
  if (isBlown(unit)) return false
  // Neither will a regiment that is not a regiment yet. A Charge is the one act
  // that is nothing but keeping formed while going fast, so a Unit whose ranks
  // are still its officers' problem has nothing to go with — and the countercharge
  // reaches this too, which is the sharpest thing Disorder does: horse loose
  // among a mob is horse that will stand to receive whatever comes next.
  if (isDisordered(unit)) return false
  unit.charging = { targetId, launchedAt: battle.time, recoiling: false, pursuing: false }
  unit.route = []
  return true
}

/** End a Charge, put the Order down with it where it was one, and say why. */
export function endCharge(battle: Battle, unit: Unit, text: string): void {
  unit.charging = null
  // The Order goes down with the Charge only where the Order *was* the Charge.
  // A countercharge came out of the rule list instead, and Initiative suspends
  // an Order and never cancels one (ADR-0004) — so a regiment that met the
  // horse coming on goes back to whatever it was doing before, rather than
  // standing in an empty field waiting for a rider that is not coming.
  if (unit.order?.order.body.kind === "charge") unit.order = null
  unit.route = []
  battle.dispatches.push({ at: battle.time, unitId: unit.id, text })
}

/**
 * The share of what a mob has left that a pursuer takes off it every second he
 * is among them: a third of it a minute. It is the whole of what makes a
 * Pursuit finish a Unit rather than merely follow one — a battalion that broke
 * and got clear comes back at a lower Ceiling, and one that was ridden for two
 * minutes has a quarter of its men and no afternoon left.
 *
 * The one number Pursuit costs the design, and it is a global scalar rather
 * than anything per Arm or per Formation: a mob has no Formation, and the two
 * Arms that could be doing this are already told apart by which of them can
 * catch a mob at all.
 */
const RIDDEN_DOWN = 1 / 150

/**
 * One step of riding a mob down. Not a Contact and it raises no Contact: a
 * Contact is two blocks touching and is over in seconds, and this is a regiment
 * loose among men who have stopped being a block at all. It lasts as long as
 * the horse stays with them.
 *
 * It takes men, and through them it takes nerve from behind — which is where
 * the Rally goes. Nothing here denies one in so many words: the sabre simply
 * puts Morale down a great deal faster than standing anywhere puts it back, so
 * a Unit that has been ridden down is under the floor for the rest of the day.
 *
 * What it costs the regiment doing it is its own shape, which is CONTEXT's
 * third price of a Pursuit and was owed from the day the Pursuit was built.
 */
export function rideDown(battle: Battle, unit: Unit, target: Unit, dt: number): void {
  const taken = target.strength * RIDDEN_DOWN * dt
  target.strength = Math.max(0, target.strength - taken)
  shake(target, taken, unit.position)
  // And it costs the pursuer his ranks, every step he is among them. This is
  // the third of a Pursuit's three prices and the last one to be charged: the
  // wind and the position were always paid by the ground the ride covered, and
  // the shape was not paid at all. Refreshed rather than accumulated, so what
  // the length of the ride buys is a later start on the clock home.
  disarrange(battle, unit, `loose among ${target.name}`)
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

  const dealt = Math.min(target.strength, reach(unit, width) * LETHALITY[unit.arm] * impetus(unit))
  // Off a Face there is nothing to take in return. The chargers are into
  // something that cannot turn to meet them, and it costs them nothing.
  const taken =
    side === null
      ? 0
      : Math.min(unit.strength, reach(target, width) * LETHALITY[target.arm] * impetus(target))

  target.strength -= dealt
  unit.strength -= taken
  // What each blow is worth beyond the men in it: how narrow a front it landed
  // on, against how much of the Unit was standing behind the fight to hold it.
  shake(target, dealt, unit.position, concentration(target, unit, width) / stiffening(target))
  shake(unit, taken, target.position, concentration(unit, target, width) / stiffening(unit))

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
    // The horse rides on. What it was let go at is a mob now and the same Order
    // carries it: pulling up here would be the player deciding after the event
    // what he committed to before it, and the Order he committed to said go.
    if (canPursue(unit.arm)) {
      charge.pursuing = true
      battle.dispatches.push({
        at: battle.time,
        unitId: unit.id,
        text: `${how}, and rode on after it`,
      })
      return
    }
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
