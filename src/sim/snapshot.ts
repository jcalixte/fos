import { unitSpeed } from "./battle"
import { isDisordered } from "./disorder"
import { describeFatigue, type FatigueWord } from "./fatigue"
import { dictatedUnits } from "./headquarters"
import { aim } from "./fighting"
import { describeMorale, type MoraleWord } from "./morale"
import { briefsInFlight, ghosts, type Ghost } from "./orders"
import type {
  ArmyId,
  Battle,
  Contact,
  Dispatch,
  FormationName,
  HeldGround,
  Latitude,
  Unit,
  Vec2,
  Volley,
} from "./types"

/**
 * What the renderer is allowed to see. The simulation runs at 10Hz and the
 * screen at 60fps, so the renderer draws *between* the last two of these
 * (F14) — and nothing it computes may ever come back in, or replays diverge
 * (ADR-0003).
 *
 * It is also C17, the Commander's View: a snapshot is taken *for* one army, and
 * what the other Commander may not know was never put in it (F22). The cut is
 * here rather than in the renderer because under two Commanders it has to be a
 * cut in what is *sent* — a filter drawn on the far side of the wire is a rule
 * enforced by the machine it is a rule about (ADR-0013).
 */

/**
 * What a Commander is told about his own Units and about nobody else's: the
 * Report.
 *
 * The rule for what belongs here is one question — *could he see it from where
 * he is standing?* A battalion's frontage, its Formation, whether it is running
 * and how it is holding up are all on the Field in front of him, at a
 * kilometre, with a glass. What its men have left in their legs is not, and
 * neither is what its next Volley is laid on, and neither is what its colonel
 * was told to do this morning.
 */
export interface UnitReport {
  /**
   * How it is blowing, in words, and read the same way Morale is: the screen
   * gets the rung and never the figure. `blown` is the state as well as the
   * word — a Unit reading blown will not be let go at anybody.
   */
  fatigue: FatigueWord
  /**
   * The Unit its next Volley would fall on, by id, or null. The Volley's own
   * choice and not the renderer's guess at one: a Unit shoots the nearest enemy
   * standing in its beaten ground, which is rarely the one the player has in
   * mind, and there is no reading that off a Footprint and a Face by eye.
   */
  aiming: string | null
  /** The Initiative rule currently holding its Order suspended, by name. */
  suspendedBy: string | null
  hasOrder: boolean
  /** The brief it is carrying: how much Latitude it has. */
  standing: Latitude
  /**
   * The brief on its way to it, where the player has said one and no rider has
   * handed it over yet — null when nothing is coming. A Standing Order changes
   * nothing the Unit is doing, so this is the only way the screen can show that
   * one was taken at all while it is still on the road.
   */
  briefedTo: Latitude | null
  /**
   * True while an Order for it is in an aide's notebook: said to a staff that
   * was in the saddle, with no rider under it and nothing on the road. The
   * Ghost alone cannot say that — a Ghost with no Courier riding at it reads as
   * an Order the app has lost (ADR-0008).
   */
  dictated: boolean
  /** True while it is walking somewhere on its own account, not under Orders. */
  shifting: boolean
  /**
   * Metres per second over the ground it is standing on, in the Formation it is
   * standing in. Drawn from the simulation rather than recomputed, because the
   * renderer has no business knowing what the marsh does to a battalion.
   *
   * A Report and not a map read, which is not obvious: the ground and the
   * Formation are both on the screen, but this number is divided by what the
   * Unit has left in its legs, so a pace on an enemy card is its Fatigue read
   * out loud.
   */
  speed: number
}

export interface UnitSnapshot {
  id: string
  army: string
  name: string
  arm: Unit["arm"]
  grade: Unit["grade"]
  /**
   * Men, at the resolution the Field itself shows them: exact for the
   * Commander's own, and rounded to `STRENGTH_STEP` on the other army's.
   *
   * Not withheld, because it is what a Unit's Footprint is built out of — cut
   * it and the enemy has no ground to stand on. What the map spends it on is
   * one Figure per ten men and a Frontage, so rounding to ten changes the
   * Figures not at all and a battalion's front by under a metre in a hundred
   * and forty: less than the pixel it is drawn at. The head count to the man is
   * what a Return is for, and it stays in the Report.
   */
  strength: number
  position: Vec2
  facing: number
  formation: FormationName
  changingTo: FormationName | null
  /** 0 to 1 through the Formation change, or 0 when there is none. */
  changeProgress: number
  /**
   * How the Unit is holding up, in words. T11 gave up the countable bar on
   * purpose, so the screen never sees the number behind this.
   *
   * On the map for both armies, because it is: Morale is said with the colour
   * of the dressed edge, all the way round a Unit, and a Commander who could
   * not see the enemy going shaky would be reading a different battle from the
   * one being fought.
   */
  morale: MoraleWord
  /**
   * True while its ranks are not its own: it will not change Formation and it
   * will not go at anybody until it has re-formed.
   *
   * A flag and not a word, unlike Morale and Fatigue beside it, because Disorder
   * is not a ladder — a Unit is Ordered or it is not. What T11 keeps off the
   * screen is a figure the player could count down, and there is none here to
   * keep.
   */
  disordered: boolean
  /** True while it is Routing: out of command, and running. */
  routing: boolean
  /** The Unit it is committed to a Charge on, by id, or null. */
  charging: string | null
  /** True once that Charge has been thrown back and is running back out. */
  recoiling: boolean
  /**
   * True once that Charge has become a Pursuit: what it is aimed at is a mob,
   * and the regiment is riding it down rather than going in on anything.
   */
  pursuing: boolean
  /** Everything only this Unit's own Commander is told. Null on the enemy's. */
  report: UnitReport | null
}

export interface CourierSnapshot {
  id: string
  unitId: string
  position: Vec2
  origin: Vec2
  /** True while he is still held at the Headquarters and has not set off. */
  held: boolean
}

/**
 * The Headquarters as the Field draws it. Both armies' are sent, which is new:
 * until the cut existed, the enemy's staff was undrawn rather than unsent, and
 * a Headquarters nobody can see is a Headquarters nobody can ride at — so
 * Harried and Overrun cost one army everything and the other nothing, which is
 * the oldest tension in DESIGN section 9.
 */
export interface HeadquartersSnapshot {
  army: ArmyId
  position: Vec2
  /**
   * What the staff knows about itself. Null on the other Commander's, the way a
   * Unit's Report is — how slow his riders are getting away, and what he has
   * dictated to an aide, are his own business even though the staff itself is
   * now on your map.
   */
  report: HeadquartersReport | null
}

export interface HeadquartersReport {
  /** Ground it is riding to, or null while it stands. Nothing leaves it riding. */
  destination: Vec2 | null
  /** True while an enemy is near enough, or shooting, to slow every Order down. */
  harried: boolean
  /** Seconds every Order waits at the table before its rider sets off. */
  surcharge: number
  /** Orders said in the saddle, with no rider under them and nothing on the road. */
  dictated: number
}

/**
 * A Volley as the Field shows it: a flash of a certain width, pointing
 * somewhere. What it took off the Unit it fell on is not here — the block
 * thinning is how a Commander learns that, and a per-Volley casualty figure on
 * the wire would add back up to the exact Strength the cut above just took out.
 */
export type VolleySnapshot = Omit<Volley, "casualties">

/** A Contact as the Field shows it, and for the same reason: no butcher's bill. */
export type ContactSnapshot = Omit<Contact, "casualties" | "targetCasualties">

export interface BattleSnapshot {
  time: number
  units: UnitSnapshot[]
  couriers: CourierSnapshot[]
  ghosts: Ghost[]
  headquarters: HeadquartersSnapshot[]
  /**
   * Every piece of Key Ground and the army standing on it. Uncut: who holds the
   * ground is what the battle is decided on and it is on the Field for anybody
   * to look at (F11).
   */
  keyGround: HeldGround[]
  /** Fired in the step this snapshot was taken of, and nowhere else. */
  volleys: VolleySnapshot[]
  /** Struck in the step this snapshot was taken of, and nowhere else. */
  contacts: ContactSnapshot[]
  /**
   * The feed, cut to this Commander's own army (F7). Whole every step rather
   * than a tail, because a Commander who joins a battle late — or comes back
   * to one after being Out of Contact — is owed the afternoon he missed.
   */
  dispatches: Dispatch[]
}

/**
 * Men to round the other army's Strength to. Ten, because that is what one
 * Figure on the map stands for (`MEN_PER_FIGURE` in the renderer), so the cut
 * costs the drawing nothing. If the renderer ever draws a Figure per five men,
 * this follows it down.
 */
export const STRENGTH_STEP = 10

/**
 * Whether the other army's Couriers ride on your Field.
 *
 * A dial, and it starts at nothing. Watching where the enemy's riders go is
 * watching him think — which Unit he has just spoken to, and roughly when it
 * will hear — and F2's promise that every pending Order is on the Field is a
 * promise made to the Commander about his *own* Orders.
 *
 * It is a constant here and deliberately not in `settings.ts`: that file is
 * per-Commander and about how the Field looks, and a rule about what one
 * Commander may know is not a thing the other one's preferences may move.
 */
export const ENEMY_COURIERS = false

/**
 * A snapshot of nothing: no Field, no armies, no feed.
 *
 * What a screen holds before it has been told anything — a battle it has asked
 * a server for and not yet heard back about. Not an empty battle: an empty
 * *report* of one.
 */
export function noSnapshot(): BattleSnapshot {
  return {
    time: 0,
    units: [],
    couriers: [],
    ghosts: [],
    headquarters: [],
    keyGround: [],
    volleys: [],
    contacts: [],
    dispatches: [],
  }
}

/** The rounding above, applied. */
function menOf(strength: number, mine: boolean): number {
  const men = Math.round(strength)
  return mine ? men : Math.round(men / STRENGTH_STEP) * STRENGTH_STEP
}

/**
 * The battle as one Commander is told it.
 *
 * `forArmy` is null for nobody in particular — the plate, a headless run, and
 * the moment before an Army has been taken — and nothing is cut. Every other
 * caller names an army, and the parameter is required so that naming one is a
 * decision somebody made rather than a default nobody noticed.
 *
 * `deploying` is the harder half of the same cut: while two armies are being
 * arranged at once, neither is on the other's Field at all (F23). It is not a
 * phase this module knows about — the simulation has no Deployment in it, only
 * a clock that has not started — so whoever is holding the phase says so. A
 * solo battle never passes it: there is no second army being arranged, only a
 * Roster standing where it was authored, and hiding that would be taking six
 * existing battles away for a rule with nobody on the other side of it.
 */
export function snapshot(
  battle: Battle,
  forArmy: ArmyId | null,
  deploying = false,
): BattleSnapshot {
  const briefs = briefsInFlight(battle)
  const dictated = dictatedUnits(battle)
  const own = (army: ArmyId | null) => forArmy === null || army === forArmy
  const shown = deploying ? battle.units.filter((unit) => own(unit.army)) : battle.units
  return {
    time: battle.time,
    units: shown.map((unit) => {
      const mine = own(unit.army)
      return {
        id: unit.id,
        army: unit.army,
        name: unit.name,
        arm: unit.arm,
        grade: unit.grade,
        // Whole men. Casualties are the expected value and land fractional; the
        // fraction is the simulation's business and not the screen's.
        strength: menOf(unit.strength, mine),
        position: { ...unit.position },
        facing: unit.facing,
        formation: unit.formation,
        changingTo: unit.changing?.to ?? null,
        changeProgress: unit.changing
          ? Math.min(1, unit.changing.elapsed / unit.changing.duration)
          : 0,
        morale: describeMorale(unit),
        disordered: isDisordered(unit),
        routing: unit.routing !== null,
        charging: unit.charging?.targetId ?? null,
        recoiling: unit.charging?.recoiling ?? false,
        pursuing: unit.charging?.pursuing ?? false,
        report: mine
          ? {
              fatigue: describeFatigue(unit),
              aiming: aim(battle, unit)?.target.id ?? null,
              suspendedBy: unit.suspendedBy,
              hasOrder: unit.order !== null,
              standing: unit.standing,
              briefedTo: briefs.get(unit.id) ?? null,
              dictated: dictated.has(unit.id),
              shifting: unit.shift !== null,
              speed: unitSpeed(battle, unit),
            }
          : null,
      }
    }),
    couriers: battle.couriers
      .filter((courier) => ENEMY_COURIERS || own(armyOf(battle, courier.order.unitId)))
      .map((courier) => ({
        id: courier.id,
        unitId: courier.order.unitId,
        position: { ...courier.position },
        origin: { ...courier.origin },
        held: courier.hold > 0,
      })),
    ghosts: ghosts(battle).filter((ghost) => own(armyOf(battle, ghost.unitId))),
    headquarters: battle.armies.flatMap((army) =>
      army.headquarters && (!deploying || own(army.id))
        ? [
            {
              army: army.id,
              position: { ...army.headquarters.position },
              report: own(army.id)
                ? {
                    destination: army.headquarters.destination
                      ? { ...army.headquarters.destination }
                      : null,
                    harried: army.headquarters.harried,
                    surcharge: army.headquarters.surcharge,
                    dictated: army.headquarters.dictated.length,
                  }
                : null,
            },
          ]
        : [],
    ),
    keyGround: battle.keyGround.map((ground) => ({ ...ground, position: { ...ground.position } })),
    volleys: battle.volleys.map(({ casualties: _casualties, ...v }) => ({
      ...v,
      from: { ...v.from },
    })),
    contacts: battle.contacts.map(
      ({ casualties: _casualties, targetCasualties: _targetCasualties, ...c }) => ({
        ...c,
        where: { ...c.where },
      }),
    ),
    dispatches: battle.dispatches.filter(
      // Null belongs to neither army and is read by both: it is how the battle
      // ended, and there is one of them.
      (dispatch) => dispatch.army === null || own(dispatch.army),
    ),
  }
}

/**
 * Which army a Unit belongs to, for the Orders and Ghosts that name one by id.
 * Arrivals are searched too: a Unit can be ordered onto ground before it walks
 * onto the Field, and its rider is out there while it is still off it.
 */
function armyOf(battle: Battle, unitId: string): ArmyId | null {
  const unit =
    battle.units.find((u) => u.id === unitId) ??
    battle.arrivals.find((a) => a.unit.id === unitId)?.unit
  return unit?.army ?? null
}
