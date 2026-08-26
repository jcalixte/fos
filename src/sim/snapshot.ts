import { unitSpeed } from "./battle"
import { describeMorale } from "./morale"
import { ghosts, type Ghost } from "./orders"
import type { Battle, FormationName, Unit, Vec2, Volley } from "./types"

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
  /**
   * How the Unit is holding up, in words. T11 gave up the countable bar on
   * purpose, so the screen never sees the number behind this.
   */
  morale: string
  /** True while it is Routing: out of command, and running. */
  routing: boolean
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
}

export interface BattleSnapshot {
  time: number
  units: UnitSnapshot[]
  couriers: CourierSnapshot[]
  ghosts: Ghost[]
  /** Fired in the step this snapshot was taken of, and nowhere else. */
  volleys: Volley[]
}

export function snapshot(battle: Battle): BattleSnapshot {
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
      morale: describeMorale(unit),
      routing: unit.routing !== null,
      speed: unitSpeed(battle, unit),
    })),
    couriers: battle.couriers.map((courier) => ({
      id: courier.id,
      unitId: courier.order.unitId,
      position: { ...courier.position },
      origin: { ...courier.origin },
    })),
    ghosts: ghosts(battle),
    volleys: battle.volleys.map((v) => ({ ...v, from: { ...v.from } })),
  }
}
