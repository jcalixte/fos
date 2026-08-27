import { makeField } from "./field"
import { FULL_MORALE, unitWeight } from "./morale"
import type {
  Arm,
  Arrival,
  Army,
  Battle,
  Crossing,
  Field,
  FormationName,
  Grade,
  HeldGround,
  KeyGround,
  OrderBody,
  PlannedOrder,
  Unit,
  Vec2,
} from "./types"

/**
 * A Scenario carries a Field, two Rosters, the enemy's Plan, a clock and its Key
 * Ground. A Roster is a standalone thing a Scenario names rather than contains,
 * so adding a battle is data and never code (F16).
 */

export interface RosterEntry {
  id: string
  /** Historical display name — "12e Ligne". */
  name: string
  arm: Arm
  grade: Grade
  strength: number
  formation: FormationName
  /** Where it stands at Deployment, in metres. Absent if it is an Arrival. */
  position?: Vec2
  /** Radians. */
  facing?: number
  /** Set instead of `position` for a Unit that walks on after the clock starts. */
  arrival?: {
    at: number
    entry: Vec2
    order?: OrderBody
  }
}

export interface Roster {
  id: string
  name: string
  /** Each Roster names the three rungs of the Grade ladder in its own words. */
  grades: Record<Grade, string>
  entries: RosterEntry[]
}

export interface ScenarioArmy {
  id: string
  name: string
  /** Hex, as the Roster's Units are drawn. */
  colour: string
  roster: string
  headquarters?: Vec2
  /** The rectangle, in metres, the player may arrange this army inside. */
  deploymentZone?: [number, number, number, number]
}

export interface ScenarioFile {
  name: string
  summary: string
  field: {
    cells: [number, number]
    cellSize: number
    ground: string
    heightmap: string
    /** Metres of elevation black and white stand for in `heightmap`. */
    elevation: [number, number]
  }
  /** Seconds on the Scenario clock. */
  clock: number
  seed: number
  armies: ScenarioArmy[]
  /** Cell rectangles, [x, y, w, h]. */
  crossings: { name: string; cells: [number, number, number, number] }[]
  keyGround: KeyGround[]
  plan: PlannedOrder[]
}

export function entryToUnit(entry: RosterEntry, army: string): Unit {
  return {
    id: entry.id,
    army,
    name: entry.name,
    arm: entry.arm,
    grade: entry.grade,
    strength: entry.strength,
    position: entry.position ? { ...entry.position } : { x: 0, y: 0 },
    facing: entry.facing ?? 0,
    formation: entry.formation,
    changing: null,
    order: null,
    route: [],
    suspendedBy: null,
    reload: 0,
    morale: FULL_MORALE,
    moraleCeiling: FULL_MORALE,
    routing: null,
    charging: null,
  }
}

export interface AssembledScenario {
  file: ScenarioFile
  field: Field
  rosters: Record<string, Roster>
}

/** Turn a decoded Scenario into the Battle the clock will run. */
export function assemble(scenario: AssembledScenario): Battle {
  const { file, field, rosters } = scenario
  const armies: Army[] = []
  const units: Unit[] = []
  const arrivals: Arrival[] = []

  for (const a of file.armies) {
    const army: Army = {
      id: a.id,
      name: a.name,
      colour: Number.parseInt(a.colour.replace("#", ""), 16),
      headquarters: a.headquarters ? { army: a.id, position: { ...a.headquarters } } : null,
      weight: 0,
      strength: 0,
      units: 0,
    }
    armies.push(army)
    const roster = rosters[a.roster]
    if (!roster) throw new Error(`Scenario names a Roster it has not loaded: ${a.roster}`)
    for (const entry of roster.entries) {
      const unit = entryToUnit(entry, a.id)
      // What the army is worth is settled here, off the whole Roster, and never
      // moves again — so a Unit that Breaks lowers what is standing without
      // lowering what it is measured against, and one still on the road is
      // already counted.
      army.weight += unitWeight(unit)
      army.strength += unit.strength
      army.units += 1
      if (entry.arrival) {
        arrivals.push({
          at: entry.arrival.at,
          unit,
          entry: { ...entry.arrival.entry },
          order: entry.arrival.order ?? null,
        })
      } else {
        units.push(unit)
      }
    }
  }

  const crossings: Crossing[] = file.crossings.map((c) => {
    const [x, y, w, h] = c.cells
    const cells: number[] = []
    for (let cy = y; cy < y + h; cy++) {
      for (let cx = x; cx < x + w; cx++) {
        const index = cy * field.width + cx
        cells.push(index)
        field.crossing[index] = 1
      }
    }
    return { name: c.name, cells }
  })

  return {
    time: 0,
    field,
    armies,
    units,
    couriers: [],
    volleys: [],
    contacts: [],
    dispatches: [],
    crossings,
    keyGround: file.keyGround.map((g): HeldGround => ({ ...g, holder: null })),
    arrivals,
    plan: [...file.plan],
    clock: file.clock,
    outcome: null,
    seed: file.seed,
    nextId: 1,
  }
}

/** A bare Field, for tests and fixtures that do not want a PNG. */
export function blankField(width: number, height: number, cellSize = 8): Field {
  return makeField(width, height, cellSize)
}
