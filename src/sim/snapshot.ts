import { unitSpeed } from "./battle"
import { describeFatigue, type FatigueWord } from "./fatigue"
import { aim } from "./fighting"
import { describeMorale, type MoraleWord } from "./morale"
import { briefsInFlight, ghosts, type Ghost } from "./orders"
import type { Battle, Contact, FormationName, Latitude, Unit, Vec2, Volley } from "./types"

/**
 * What the renderer is allowed to see. The simulation runs at 10Hz and the
 * screen at 60fps, so the renderer draws *between* the last two of these
 * (F14) — and nothing it computes may ever come back in, or replays diverge
 * (ADR-0003).
 */
export interface UnitSnapshot {
  id: string
  army: string
  name: string
  arm: Unit["arm"]
  grade: Unit["grade"]
  strength: number
  position: Vec2
  facing: number
  formation: FormationName
  changingTo: FormationName | null
  /** 0 to 1 through the Formation change, or 0 when there is none. */
  changeProgress: number
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
  /** True while it is walking somewhere on its own account, not under Orders. */
  shifting: boolean
  /**
   * How the Unit is holding up, in words. T11 gave up the countable bar on
   * purpose, so the screen never sees the number behind this.
   */
  morale: MoraleWord
  /**
   * How it is blowing, in words, and read the same way Morale is: the screen
   * gets the rung and never the figure. `blown` is the state as well as the
   * word — a Unit reading blown will not be let go at anybody.
   */
  fatigue: FatigueWord
  /** True while it is Routing: out of command, and running. */
  routing: boolean
  /** The Unit it is committed to a Charge on, by id, or null. */
  charging: string | null
  /**
   * The Unit its next Volley would fall on, by id, or null. The Volley's own
   * choice and not the renderer's guess at one: a Unit shoots the nearest enemy
   * standing in its beaten ground, which is rarely the one the player has in
   * mind, and there is no reading that off a Footprint and a Face by eye.
   */
  aiming: string | null
  /** True once that Charge has been thrown back and is running back out. */
  recoiling: boolean
  /**
   * True once that Charge has become a Pursuit: what it is aimed at is a mob,
   * and the regiment is riding it down rather than going in on anything.
   */
  pursuing: boolean
  /**
   * Metres per second over the ground it is standing on, in the Formation it is
   * standing in. Drawn from the simulation rather than recomputed, because the
   * renderer has no business knowing what the marsh does to a battalion.
   */
  speed: number
}

export interface CourierSnapshot {
  id: string
  unitId: string
  position: Vec2
  origin: Vec2
  /** True while he is still held at the Headquarters and has not set off. */
  held: boolean
}

export interface BattleSnapshot {
  time: number
  units: UnitSnapshot[]
  couriers: CourierSnapshot[]
  ghosts: Ghost[]
  /** Fired in the step this snapshot was taken of, and nowhere else. */
  volleys: Volley[]
  /** Struck in the step this snapshot was taken of, and nowhere else. */
  contacts: Contact[]
}

export function snapshot(battle: Battle): BattleSnapshot {
  const briefs = briefsInFlight(battle)
  return {
    time: battle.time,
    units: battle.units.map((unit) => ({
      id: unit.id,
      army: unit.army,
      name: unit.name,
      arm: unit.arm,
      grade: unit.grade,
      // Whole men. Casualties are the expected value and land fractional; the
      // fraction is the simulation's business and not the screen's.
      strength: Math.round(unit.strength),
      position: { ...unit.position },
      facing: unit.facing,
      formation: unit.formation,
      changingTo: unit.changing?.to ?? null,
      changeProgress: unit.changing
        ? Math.min(1, unit.changing.elapsed / unit.changing.duration)
        : 0,
      suspendedBy: unit.suspendedBy,
      hasOrder: unit.order !== null,
      standing: unit.standing,
      briefedTo: briefs.get(unit.id) ?? null,
      shifting: unit.shift !== null,
      morale: describeMorale(unit),
      fatigue: describeFatigue(unit),
      routing: unit.routing !== null,
      charging: unit.charging?.targetId ?? null,
      aiming: aim(battle, unit)?.target.id ?? null,
      recoiling: unit.charging?.recoiling ?? false,
      pursuing: unit.charging?.pursuing ?? false,
      speed: unitSpeed(battle, unit),
    })),
    couriers: battle.couriers.map((courier) => ({
      id: courier.id,
      unitId: courier.order.unitId,
      position: { ...courier.position },
      origin: { ...courier.origin },
      held: courier.hold > 0,
    })),
    ghosts: ghosts(battle),
    volleys: battle.volleys.map((v) => ({ ...v, from: { ...v.from } })),
    contacts: battle.contacts.map((c) => ({ ...c, where: { ...c.where } })),
  }
}
