import { beginCharge, CHARGE_RANGE, chargersOf } from "./charge"
import { isDisordered } from "./disorder"
import { aim } from "./fighting"
import { cellAt, cellIndex, crossingWidth, inBounds, isCrossing } from "./field"
import {
  allows,
  baseSpeed,
  beginChange,
  canFire,
  FIGHTING_FORMATION,
  frontage,
  intendedFormation,
  TRAVELLING_FORMATION,
} from "./formation"
import { breakUnit, canRally, hasBroken, isRouting, rally } from "./morale"
import { ARRIVAL_RANGE } from "./orders"
import { leash } from "./standing"
import type { Battle, FormationName, Unit, UnitId, Vec2 } from "./types"
import { bearing, distance, normalise, scale, sub } from "./vec"

/**
 * C2 Initiative.
 *
 * An ordered priority list, evaluated each tick, first match wins (ADR-0004).
 * The rule that fires *is* the reason, so a Dispatch explains itself for free.
 *
 * How much of it a Unit is permitted is its Standing Order, and above `hold
 * ground` that includes giving and taking ground (ADR-0007). What Initiative
 * never does at any rung is pick an objective: every step a Unit takes on its
 * own account is bounded in metres from its Post, which is the ground the
 * player last gave it. It drifts off what it was given; it cannot choose
 * something else.
 *
 * It suspends the live Order rather than cancelling it. Cancelling would leave
 * a battalion standing in an empty field until a new Order rode out to it.
 */

export interface InitiativeAction {
  /** The Formation the Unit adopts on its own account, if the rule changes it. */
  formation?: FormationName
  /**
   * Ground the Unit walks to on its own account, if the rule moves it. Only the
   * Latitude rules reach this, and it is re-read every tick: what a Unit is
   * giving ground to, or closing on, is moving too.
   */
  march?: Vec2
  /**
   * The Unit the rule lets this one go at, if it lets it go at all. The one
   * thing in here that ADR-0002 would otherwise reserve to a Courier, and it is
   * narrow on purpose: the rule that reaches it answers a Charge already coming
   * on and can aim at nothing else, so no rung buys the choice of a target.
   */
  charge?: UnitId
  /**
   * What the rule does to the Unit's obedience. Only Morale reaches this far: a
   * Rout is a Unit that has stopped listening, which no Formation rule can say.
   */
  obedience?: "break" | "rally"
}

export interface InitiativeRule {
  /** Named as the Dispatch would read it — this text is the cause. */
  name: string
  applies: (unit: Unit, battle: Battle) => InitiativeAction | null
}

/** Metres of Route left below which a Unit is deploying, not travelling. */
const DEPLOY_RANGE = 180

/**
 * How far ahead a Unit looks for the mouth of a Crossing before filing into
 * column for it. Short on purpose: a battalion forms column on the bank, not
 * half a mile out, and the ground it spends in column is ground it cannot
 * fight over.
 */
const CROSSING_LOOKAHEAD = 120

/**
 * Metres within which a Unit will not be caught on the march. Roughly cannon
 * shot, and about ninety seconds of cavalry — long enough that a battalion
 * still has time to do something about it, which is the only reason to pick a
 * number larger than musket range.
 *
 * Known cheat: this reads true positions. Concealment is not built, so a Unit
 * deploys against an enemy it could not actually see. Revisit with C8.
 */
const ENGAGEMENT_RANGE = 300

/**
 * How far off the nearest enemy has to be before a Unit that has deployed will
 * file back into column — and the reason this is a second number rather than
 * ENGAGEMENT_RANGE read twice.
 *
 * Deploying and re-columning are asked at the same moment by rules whose
 * guards are exact complements, so with one threshold between them an enemy
 * sitting on it makes a Unit change its mind every tick: it begins the drill,
 * the enemy drifts a metre out, it reverses the drill for the ground it has
 * covered, the enemy drifts a metre back, and the Unit spends the afternoon
 * standing still deciding. It is a limit cycle and a Unit can hold itself in
 * one, because halting to drill is what lets the enemy walk back out of range.
 *
 * The margin is the ground a Unit walking away covers while the drill it just
 * decided on is still being done — thirty to forty seconds of it — because a
 * battalion that finishes deploying and files straight back into column has
 * deployed for nothing. It is not a tuning dial: anything shorter than the
 * drill it protects re-opens the cycle.
 */
const MARCHING_AGAIN = ENGAGEMENT_RANGE + 100

/**
 * How far ahead a Crossing still governs the choice of Formation — as against
 * CROSSING_LOOKAHEAD, which is only how late a Unit leaves forming the column.
 * Two questions, two horizons: "should I file into column now" is asked at the
 * bank, and "is this a place worth deploying at all" has to be asked as far out
 * as the reason to deploy reaches.
 *
 * So it is ENGAGEMENT_RANGE, and not a number of its own. Where the two
 * disagreed there was a band of ground — everything between a hundred and
 * twenty metres and three hundred — in which a Unit could see the enemy and
 * could not see the bridge. A battalion marching up deployed into line for the
 * enemy at three hundred metres, marched eighty metres at line's pace, and
 * filed straight back into column at a hundred and twenty for the deck: two
 * drills and a minute standing still to arrive in the Formation it set off in,
 * and it spent that minute inside the enemy's reach.
 */
const CROSSING_HORIZON = ENGAGEMENT_RANGE

/**
 * The ground the Unit still has to walk, as points to walk it by. The Route
 * when it has one, and the Order's destination when it has not: Initiative runs
 * before the march each tick, so a Unit that stepped onto its last waypoint on
 * the previous tick is carrying an empty Route and would otherwise be blind for
 * that tick to the Crossing it is standing on.
 *
 * A Unit re-forming carries an empty Route for as long as the drill lasts — it
 * has halted, so nothing is walking it and nothing is laying it out. That is the
 * case the arrival Formation runs into: a rider tells a column to form line, a
 * second rider tells it to march, and reading the Route alone left the travelling
 * rules blind to the march until the drill they should have called off had run.
 */
function pathAhead(unit: Unit): Vec2[] {
  if (unit.route.length > 0) return unit.route
  const body = unit.order?.order.body
  if (body?.kind !== "move") return []
  // Standing on it. The Order stays live while the Unit dresses and takes up
  // the Formation it was told to arrive in, so without this a battery would
  // read its own destination as ground to cover and stay on its limbers for
  // the rest of the battle rather than coming into battery on the spot.
  if (distance(unit.position, body.destination) <= ARRIVAL_RANGE) return []
  return [body.destination]
}

/** Ground left, in metres, following the waypoints rather than the crow. */
function routeRemaining(unit: Unit): number {
  const path = pathAhead(unit)
  if (path.length === 0) return 0
  let total = distance(unit.position, path[0])
  for (let i = 1; i < path.length; i++) {
    total += distance(path[i - 1], path[i])
  }
  return total
}

/**
 * Metres of gap where the Unit's Route enters a Crossing within `horizon`, or
 * null if it meets none. The width is what the rules need: whether to file into
 * column is a question about the gap, not about there being one.
 *
 * It walks the whole Route and not the first leg of it. A string-pulled Route
 * puts a waypoint at the mouth of a bridge, so reading one leg meant a Unit
 * could only ever see the Crossing it was already aimed at, and the horizon
 * that matters is longer than a leg.
 */
function crossingWithin(unit: Unit, battle: Battle, horizon: number): number | null {
  const field = battle.field
  let from = unit.position
  let walked = 0
  for (const target of pathAhead(unit)) {
    const span = distance(from, target)
    const heading = bearing(from, target)
    const steps = Math.ceil(Math.min(span, horizon - walked) / field.cellSize)
    for (let i = 0; i <= steps; i++) {
      const t = span === 0 ? 0 : Math.min(1, (i * field.cellSize) / span)
      const p = { x: from.x + (target.x - from.x) * t, y: from.y + (target.y - from.y) * t }
      const { cx, cy } = cellAt(field, p)
      if (!inBounds(field, cx, cy)) continue
      if (isCrossing(field, cellIndex(field, cx, cy))) {
        return crossingWidth(field, cx, cy, heading)
      }
    }
    walked += span
    if (walked >= horizon) return null
    from = target
  }
  return null
}

/**
 * True if a Crossing within `horizon` would stop the Unit in the Formation
 * given. Frontage against the gap — the same question `admits` asks at the
 * mouth of it, asked early enough for the rule list to do something about the
 * answer. How early is the caller's to say, and the two callers differ.
 */
function squeezedBy(
  unit: Unit,
  battle: Battle,
  formation: FormationName,
  horizon: number,
): boolean {
  const gap = crossingWithin(unit, battle, horizon)
  if (gap === null) return false
  return frontage(unit.arm, formation, unit.strength) > gap
}

/** A Form Order pins the Formation; Initiative does not argue with the player. */
function pinned(unit: Unit): boolean {
  return unit.order?.order.body.kind === "form"
}

function travelling(unit: Unit): FormationName {
  return TRAVELLING_FORMATION[unit.arm]
}

/** True if any enemy stands within `range` metres. */
function enemyWithin(unit: Unit, battle: Battle, range: number): boolean {
  for (const other of battle.units) {
    if (other.army === unit.army) continue
    if (distance(unit.position, other.position) <= range) return true
  }
  return false
}

/** True if any enemy is close enough to be worth coming off the march for. */
function enemyNear(unit: Unit, battle: Battle): boolean {
  return enemyWithin(unit, battle, ENGAGEMENT_RANGE)
}

/**
 * True if the nearest enemy is still near enough that filing back into column
 * would be filing back into column in front of him. The wide half of the pair
 * MARCHING_AGAIN describes: a Unit comes off the march at ENGAGEMENT_RANGE and
 * does not go back onto it until well outside that.
 */
function enemyStillAbout(unit: Unit, battle: Battle): boolean {
  return enemyWithin(unit, battle, MARCHING_AGAIN)
}

/**
 * True if taking this Formation, here, is a drill the enemy would undo the
 * moment it was done: he is inside ENGAGEMENT_RANGE and the Formation cannot
 * fire, which is precisely the case "deployed, the enemy too close to stay on
 * the march" exists to reverse.
 *
 * Exported because an arriving Move has to ask the same question. A Move's
 * arrival Formation is a preference and a Form Order is how the player insists
 * — that is what `pinned` is for — so where the two disagree the Order has to
 * give way rather than be re-imposed on the next tick. Re-imposed, the Unit
 * files into column, is turned back into line, files in again, and never
 * reports itself in position: the Order never retires and the Unit spends the
 * rest of the battle drilling on the spot in front of the man it is supposed to
 * be fighting.
 */
export function caughtOnTheMarchIn(unit: Unit, battle: Battle, formation: FormationName): boolean {
  return !canFire(unit.arm, formation) && enemyNear(unit, battle)
}

/**
 * True if enemy cavalry is committed to a Charge on this Unit and near enough
 * that there is any point doing something about it.
 */
function chargedByCavalry(unit: Unit, battle: Battle): boolean {
  return chargersOf(battle, unit).some(
    (horse) =>
      horse.arm === "cavalry" && distance(unit.position, horse.position) <= ENGAGEMENT_RANGE,
  )
}

/**
 * Metres a Unit standing off lets an enemy come to before it gives ground. Well
 * short of ENGAGEMENT_RANGE, because a screen that backed away from everything
 * it could see would never observe anything; well outside the hundred and fifty
 * of a Charge's run-in, because inside that a battalion is not standing off, it
 * is being caught.
 *
 * Flat, and not read off the Formation's own reach, which is worth saying
 * because it looks like it should be. Two hundred is outside every reach in the
 * game but a gun's, so a screen standing off appears to be giving ground from
 * an enemy it could have been shooting at. It is not: the enemy is closing
 * while the screen backs, the pair spend the whole approach inside the screen's
 * hundred and fifty, and once the leash is spent the screen stands and fires
 * like anything else. Holding them at the edge of its own musketry instead
 * makes it start later, be caught sooner, and fire *less* — eleven Volleys for
 * a hundred and thirty-five men against ten for a hundred and eighteen. The
 * trigger is when to begin walking, not when to begin shooting, and those are
 * not the same distance.
 */
const STANDOFF_RANGE = 200

/** Metres of ground below which taking a step is not worth suspending an Order for. */
const WORTH_MOVING = 2

/**
 * Seconds within which the same rule firing again on the same Unit is the same
 * act of judgement, and is not reported twice.
 *
 * A rule holds an Order only for as long as it goes on matching, and several of
 * them stop matching the moment they have been obeyed: a Unit that gives ground
 * to the edge of its leash is a Unit the rule now has nothing to say about, so
 * the Order comes back, walks it a metre inside the leash, and the rule fires
 * again on the next tick. That tug of war is the two instructions doing exactly
 * what they were given — the Order pulling in, the brief pushing out — and it is
 * not eleven hundred separate decisions to report at ten a second. CONTEXT has
 * a Dispatch as a line about what just happened, and the second one has not
 * happened: it is the first one still going on.
 *
 * A minute, because that is about how long a Unit's situation takes to become a
 * different situation. Giving ground again ten minutes later is news.
 */
const SAME_JUDGEMENT = 60

/** The nearest enemy that `want` accepts, within `range`, or null. */
function nearestEnemy(
  unit: Unit,
  battle: Battle,
  range: number,
  want: (other: Unit) => boolean,
): Unit | null {
  let found: Unit | null = null
  let nearest = range
  for (const other of battle.units) {
    if (other.army === unit.army) continue
    if (!want(other)) continue
    const gap = distance(unit.position, other.position)
    if (gap > nearest) continue
    nearest = gap
    found = other
  }
  return found
}

/**
 * Where the Unit may walk to, given where it wants to go and what its Standing
 * Order allows: `to` itself while that is inside the leash, the point on the way
 * there where the leash runs out otherwise, and null where there is no step in
 * it worth taking.
 *
 * A Unit already outside its leash gets nothing rather than being walked back
 * toward its Post. The leash bounds what a Unit may *do* and not where it may
 * be — a regiment that charged three hundred metres out stays there until it is
 * ordered, because nothing should undo the player's Order on its own account.
 */
function leashed(unit: Unit, to: Vec2): Vec2 | null {
  const bound = leash(unit.standing)
  const spent = distance(unit.post, unit.position)
  if (spent >= bound) return null
  const reach = distance(unit.post, to)
  const target =
    reach <= bound
      ? to
      : (() => {
          const out = scale(normalise(sub(to, unit.post)), bound)
          return { x: unit.post.x + out.x, y: unit.post.y + out.y }
        })()
  return distance(unit.position, target) < WORTH_MOVING ? null : target
}

/** True where the Unit's brief lets it take ground rather than only hold it. */
function mayAdvance(unit: Unit): boolean {
  return unit.standing === "close-up" || unit.standing === "follow-up"
}

/**
 * True where the Unit is committed to a Charge: the state it is in once it is
 * running, and the Order that is about to put it there.
 *
 * Both, because Initiative runs before the Order does each tick. A Charge the
 * rider has just handed over has no Charge state under it yet, so a rule that
 * read the state alone saw a Unit standing free — and having walked it off on
 * its own account it suspended the Order that would have begun the run, so the
 * state never arrived and the Unit never went at all. The player let the horse
 * go and watched its brief keep it.
 */
function committedToCharge(unit: Unit): boolean {
  return unit.charging !== null || unit.order?.order.body.kind === "charge"
}

/**
 * True where the Unit is free to spend its Latitude at all: not committed to a
 * Charge, and not part-way through an Order that says where to be. A brief fills
 * the gaps between Orders and never argues with one — a battalion that closed up
 * on its own while marching somewhere would be choosing its own ground, which is
 * the one thing no rung buys.
 */
function unoccupied(unit: Unit): boolean {
  return !committedToCharge(unit) && unit.order?.order.body.kind !== "move"
}

/**
 * The Formation to deploy into when caught travelling. The Order's arrival
 * Formation is the player's own answer, so use it when it can fight; a Unit
 * ordered to arrive in column still has to survive the last three hundred
 * metres, and falls back on the Arm's fighting Formation to do it.
 */
function deployInto(unit: Unit): FormationName {
  const body = unit.order?.order.body
  if (body?.kind === "move" && canFire(unit.arm, body.arrivalFormation)) {
    return body.arrivalFormation
  }
  return FIGHTING_FORMATION[unit.arm]
}

/**
 * The list, in priority order: whether a Unit is still obeying anybody at all,
 * then how it chooses to travel and when it stops travelling. Order matters
 * throughout: Morale outranks everything, because a battalion that has broken is
 * not going to file into column for the bridge on the way past, and making
 * square outranks every reason to be marching, because nothing else that
 * happens to a battalion is as urgent as horse at the gallop.
 */
export const RULES: InitiativeRule[] = [
  {
    // Above Breaking, so a Unit that has run itself steady again comes back
    // under command rather than being held by the rule that broke it. It picks
    // its Arm's fighting Formation and takes the drill to get there — a mob does
    // not re-form for nothing, and the ground it lost is what the Rout cost.
    name: "rallied, clear of the enemy and back under command",
    applies: (unit, battle) => {
      if (!canRally(battle, unit)) return null
      return { formation: FIGHTING_FORMATION[unit.arm], obedience: "rally" }
    },
  },
  {
    // First of everything else, and it stays matched for as long as the Unit is
    // Routing — which is what keeps the marching rules off a mob. Morale creeps
    // back while it runs, so the test is "is it Routing", not "is its Morale
    // gone": otherwise the first tick of recovery would hand the battalion back
    // to the rule that files it into column.
    name: "broke, and is running for the rear",
    applies: (unit) => {
      if (!isRouting(unit) && !hasBroken(unit)) return null
      return { obedience: "break" }
    },
  },
  {
    // Third, under the two Morale rules and over everything about marching. A
    // Charge coming on is the most urgent thing that happens to a battalion,
    // and it will stop mid-march and mid-Order to meet it.
    //
    // It answers a Charge and not the sight of cavalry. A battalion that
    // squared up whenever horse stood within cannon shot would be frozen for
    // free, all day, at no risk to the horse — and Initiative would be doing
    // the anticipating that is the player's whole job. The rule preserves; it
    // does not command.
    //
    // Thirty seconds of drill against twenty-one of gallop: this only lands in
    // time against a Charge let go at a distance. Walking the last hundred and
    // fifty metres up under a Move Order first is how a Charge is made to
    // arrive before the square does, and seeing that coming is the player's.
    name: "formed square, cavalry coming on",
    applies: (unit, battle) => {
      if (pinned(unit)) return null
      if (!allows(unit.arm, "square")) return null
      if (!chargedByCavalry(unit, battle)) return null
      // Not at the mouth of a gap a square will not fit through: it would be
      // stopped on the bank in a Formation that cannot cross, and the rule
      // below would file it straight back into column.
      //
      // The short lookahead, not CROSSING_HORIZON, and the difference is the
      // point. The deploying rule gives a bridge three hundred metres of
      // deference because arriving deployed a minute later costs nothing much.
      // Squaring costs everything if it comes late, so this one refuses only
      // where the square would physically not get over — a battalion three
      // hundred metres short of a bridge with horse coming on makes square and
      // files into column afterwards.
      if (squeezedBy(unit, battle, "square", CROSSING_LOOKAHEAD)) return null
      return { formation: "square" }
    },
  },
  {
    // Beside the square and under nothing else, because it is the same rule for
    // the arm that has no square. Infantry answers horse coming on by presenting
    // four Faces; cavalry has one Formation and cannot present anything, so its
    // only answer is not to be standing still when the charge arrives. Both stop
    // mid-march and mid-Order to give it, and for the same reason.
    //
    // The one place Initiative commits a Charge, and the narrowest it can be:
    // it answers a Charge already committed to *this* Unit, so it picks no
    // objective and cannot be aimed. Horse standing to receive is horse ridden
    // over — that is the whole of the rule, and it is why the gap was left here
    // rather than filled with something that goes looking.
    //
    // Not gated on Latitude, like the square above it and unlike the three
    // Latitude rules below. A leash bounds what a Unit spends acting on its own
    // account; this is preservation, and `hold-ground` is the default brief, so
    // gating it would mean cavalry sat still for a charge in every battle nobody
    // had written a Standing Order for. Where the regiment ends up is the
    // accepted cost of any Charge (ADR-0007).
    //
    // It re-matches for as long as the run lasts, so the Order stays suspended
    // until the Charge is over and the regiment picks it back up — `beginCharge`
    // is idempotent for exactly this.
    name: "countercharged the horse coming on",
    applies: (unit, battle) => {
      if (unit.arm !== "cavalry") return null
      // A Charge the player gave is an Order, and C2 does not argue with one.
      if (unit.order?.order.body.kind === "charge") return null
      if (unit.charging) return { charge: unit.charging.targetId }
      const coming = chargersOf(battle, unit).find(
        (other) => distance(unit.position, other.position) <= CHARGE_RANGE,
      )
      return coming ? { charge: coming.id } : null
    },
  },
  {
    // Under the square, and over everything about how a Unit travels. Giving
    // ground is preservation and belongs with the rules that preserve: a screen
    // exists to watch and not to be fixed, and a Unit that means to keep its
    // distance has to be moving before the distance is gone.
    //
    // It is not an escape and cannot be. Horse at the gallop makes seven metres
    // a second against a battalion's one, so standing off buys ground and time
    // against infantry and buys only the choice of where to be caught against
    // cavalry. What it does buy everywhere is that the Unit was not standing
    // still when it was reached.
    //
    // It wheels and marches rather than backing away facing the enemy, so a
    // Unit that gives ground turns its back to do it — which is the cost, and
    // what makes standing off a decision rather than a free setting.
    name: "gave ground rather than be closed with",
    applies: (unit, battle) => {
      if (unit.standing !== "stand-off") return null
      // Giving ground is preservation and outranks a march, but it does not
      // outrank being let go at somebody: a Unit under a Charge Order is going
      // the other way on the player's word, and its brief does not get to
      // answer for it.
      if (committedToCharge(unit)) return null
      // A Formation with no pace gives no ground: guns in battery are standing
      // on their trails and go nowhere at all, so the march this rule returns
      // would be one they could never walk and the Order above it would stay
      // suspended for as long as anything was in front of them. What a battery
      // does about an enemy coming on is limber up, and there is a rule for
      // that below. Guarded here rather than there because this rule sits
      // above the limbering one and would otherwise answer first with an act
      // the Unit cannot perform.
      if (baseSpeed(unit.arm, intendedFormation(unit)) <= 0) return null
      // A mob is nothing to give ground to, and something that has recoiled is
      // going the other way already.
      const enemy = nearestEnemy(unit, battle, STANDOFF_RANGE, (other) => !isRouting(other))
      if (!enemy) return null
      const away = scale(normalise(sub(unit.position, enemy.position)), STANDOFF_RANGE)
      const to = leashed(unit, { x: unit.position.x + away.x, y: unit.position.y + away.y })
      return to ? { march: to } : null
    },
  },
  {
    // First of the marching rules, and not guarded by the enemy being away,
    // unlike every other one. A Unit too wide for the gap is stopped dead at the mouth
    // of it, so if deploying outranked this a battalion sent over a bridge with
    // the enemy within cannon shot would stand on the near bank in line for the
    // rest of the battle. Forming column to cross under fire is the period's
    // answer and its cost is the point — Lodi and Arcole were both that.
    //
    // It only fires when the Unit does not fit: a gorge wide enough for an
    // attack column lets one through in attack column.
    name: "squeezed into march column for the crossing",
    applies: (unit, battle) => {
      if (pinned(unit)) return null
      if (intendedFormation(unit) === travelling(unit)) return null
      if (!squeezedBy(unit, battle, intendedFormation(unit), CROSSING_LOOKAHEAD)) return null
      return { formation: travelling(unit) }
    },
  },
  {
    // Above the travelling rules, because coming out of column outranks any
    // reason to be in one. This rule acts, so it suspends the Order and the
    // Unit stands still to drill — which is right: it cannot march and form
    // at once, and arriving late beats arriving in column.
    name: "deployed, the enemy too close to stay on the march",
    applies: (unit, battle) => {
      if (pinned(unit)) return null
      if (canFire(unit.arm, intendedFormation(unit))) return null
      // Already standing in the only thing it has to deploy into. Cavalry is
      // the whole of this case: it fires from nothing, so the guard above never
      // lets it past, and a regiment in line with the enemy in reach would
      // otherwise suspend its Order to form the line it is already in — and go
      // on suspending it, because a rule that is already holding the Order is
      // asked no further questions. Horse ordered within three hundred metres
      // of anybody stood still for the rest of the afternoon.
      if (intendedFormation(unit) === deployInto(unit)) return null
      if (!enemyNear(unit, battle)) return null
      // Nowhere on the near side of a gap the deploying Formation will not fit
      // through — CROSSING_HORIZON, so the bridge is visible as far out as the
      // enemy that is the reason to deploy at all. Otherwise the two rules take
      // turns while the enemy watches: line for him, column for the deck, line
      // again on the far bank, three drills where one would have done.
      //
      // So a Unit with a bridge ahead of it crosses in the column it is
      // marching in and deploys once it is over. Going over unable to fire is
      // the cost of the bridge, and it is cheaper than being caught mid-drill
      // on the bank. Crossing under threat is what the rule above is for.
      if (squeezedBy(unit, battle, deployInto(unit), CROSSING_HORIZON)) return null
      return { formation: deployInto(unit) }
    },
  },
  {
    // Above the rules that only bother for ground worth covering, because a
    // Formation with no speed at all cannot be walked into position however
    // short the distance — a battery ordered fifty metres forward would
    // otherwise sit in battery with a live Order and never reach it.
    //
    // Guarded by the enemy being away, like the other travelling rules. So a
    // battery ordered to move with the enemy in reach stays in battery and its
    // Order stalls, which is the right answer rather than idleness: guns do not
    // hitch up and trundle off under close threat, and the one thing they can
    // still do — traverse onto the threat — they are already doing.
    name: "limbered up, because guns in battery do not move",
    applies: (unit, battle) => {
      if (pinned(unit)) return null
      if (enemyStillAbout(unit, battle)) return null
      if (unit.order?.order.body.kind !== "move") return null
      if (routeRemaining(unit) <= 0) return null
      if (baseSpeed(unit.arm, intendedFormation(unit)) > 0) return null
      return { formation: travelling(unit) }
    },
  },
  {
    name: "took march column to cover the ground",
    applies: (unit, battle) => {
      if (pinned(unit)) return null
      if (enemyStillAbout(unit, battle)) return null
      if (unit.order?.order.body.kind !== "move") return null
      if (intendedFormation(unit) === travelling(unit)) return null
      if (routeRemaining(unit) < DEPLOY_RANGE) return null
      return { formation: travelling(unit) }
    },
  },
  {
    // Last but one, under every rule that keeps a Unit out of trouble. Taking
    // ground is the least urgent thing a Unit does unbidden: squaring, forming
    // column for a bridge and deploying against what is already in reach all
    // come first, and a Unit that has closed up into a Formation it cannot
    // fight from has closed up for nothing.
    //
    // What it buys is the hundred metres between a battalion and a battery on
    // the next rise — an enemy in reach of the Unit and the Unit out of reach
    // of him, which before this cost ninety seconds of Courier to answer with
    // a hundred metres of ground. It stops the moment anything bears, because
    // bringing them under fire is the whole of the reason.
    //
    // Nothing here for cavalry, which fires at nothing: horse closes by being
    // let go at somebody, and that is a Charge and the player's to give. That
    // gap is where a countercharge rule would sit if one is ever written.
    name: "closed up to bring them under its fire",
    applies: (unit, battle) => {
      if (!mayAdvance(unit)) return null
      if (!unoccupied(unit)) return null
      if (!canFire(unit.arm, intendedFormation(unit))) return null
      if (aim(battle, unit)) return null
      const enemy = nearestEnemy(unit, battle, ENGAGEMENT_RANGE, (other) => !isRouting(other))
      if (!enemy) return null
      const to = leashed(unit, enemy.position)
      return to ? { march: to } : null
    },
  },
  {
    // Last of all, and the only rung that acts on an enemy who has already been
    // beaten. Three hundred metres of ground taken off a Unit that is running,
    // which is ground the player would otherwise have to spend an Order on at
    // the one moment there is something better to do with it.
    //
    // It is a follow-up and not a Pursuit: a mob runs at two and a half metres
    // a second and a battalion walks at one, so nothing here rides anybody down
    // — the Unit takes the ground the enemy left and keeps him under fire while
    // he is on it.
    //
    // Pursuit is built, and no rung of the ladder buys it. It is an advance
    // after a beaten enemy and Initiative preserves rather than advances, so it
    // costs a Courier ride like every other act of intent — and horse that
    // pursued on its own account would be the period's most famous mistake made
    // by the rule list instead of by the commander.
    name: "followed up as they gave way",
    applies: (unit, battle) => {
      if (unit.standing !== "follow-up") return null
      if (!unoccupied(unit)) return null
      const enemy = nearestEnemy(unit, battle, ENGAGEMENT_RANGE, isRouting)
      if (!enemy) return null
      const to = leashed(unit, enemy.position)
      return to ? { march: to } : null
    },
  },
]

/**
 * Run the list for one Unit. A rule that fires suspends the Order; when no rule
 * matches any more, the Unit picks the Order back up where it left it.
 */
export function applyInitiative(unit: Unit, battle: Battle): void {
  for (const rule of RULES) {
    const action = rule.applies(unit, battle)
    if (!action) continue
    // Re-aimed before anything else, and before the rule is asked whether it is
    // already the one holding the Order: a Unit giving ground to something that
    // is following it has to keep reading where it went.
    unit.shift = action.march ?? null
    if (unit.suspendedBy === rule.name) return
    // A Unit whose ranks are not its own re-forms them before it re-forms
    // anything else, whatever rule fired. The rule is not held against it: with
    // nothing done the list falls through, so the Order is never suspended by
    // an act the Unit could not perform, and the rule fires for real the moment
    // it has its shape back.
    const drill = action.formation
    const reformed = drill !== undefined && !isDisordered(unit) ? beginChange(unit, drill) : false
    const gone = action.charge !== undefined ? beginCharge(battle, unit, action.charge) : false
    // A rule that only re-forms the Unit has done nothing if the Unit is already
    // standing that way, and must not claim the Order. A rule that changes what
    // the Unit is *obeying*, walks it somewhere, or lets it go at somebody, has
    // always done something.
    if (action.obedience === "break") breakUnit(battle, unit)
    else if (action.obedience === "rally") rally(unit)
    else if (!reformed && !action.march && !gone) return
    unit.suspendedBy = rule.name
    report(battle, unit, rule.name)
    return
  }
  unit.shift = null
  if (unit.suspendedBy !== null && unit.changing === null) {
    unit.suspendedBy = null
  }
}

/**
 * The Dispatch a fired rule writes, once per act of judgement rather than once
 * per tick it holds the Order for.
 *
 * The feed itself is what remembers, so nothing is carried on the Unit and
 * nothing goes over the wire: the scan walks back only as far as
 * `SAME_JUDGEMENT` seconds, which is a handful of lines, and the repeats it
 * suppresses are the lines that would have made it long.
 */
function report(battle: Battle, unit: Unit, rule: string): void {
  const text = `${unit.name} ${rule}`
  for (let i = battle.dispatches.length - 1; i >= 0; i--) {
    const said = battle.dispatches[i]!
    if (said.at < battle.time - SAME_JUDGEMENT) break
    if (said.unitId === unit.id && said.text === text) return
  }
  battle.dispatches.push({ at: battle.time, unitId: unit.id, army: unit.army, text })
}
