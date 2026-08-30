import { makeField } from "./field"
import { FRESH } from "./fatigue"
import { FULL_MORALE, unitWeight } from "./morale"
import { defaultStanding } from "./standing"
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
  Latitude,
  OrderBody,
  PlannedOrder,
  Unit,
  Vec2,
} from "./types"

/**
 * A Scenario carries a Field, two Rosters, a Plan for each army, a clock and its
 * Key Ground. A Roster is a standalone thing a Scenario names rather than contains,
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
  /**
   * The rung it carries onto the Field. A Standing Order is free at Deployment
   * (ADR-0007), and this is that freedom spent by the author rather than by the
   * player: a Roster says what its Units were briefed to do before anybody took
   * command of them. The player may still revise it for nothing until the clock
   * starts, and the enemy army's rungs are the only brief its Plan ever gives.
   *
   * Absent means `defaultStanding()`, so a Roster that says nothing gets the
   * army it got before rungs were authorable.
   */
  standing?: Latitude
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
  /** One line on what this army's afternoon is, read when it is offered. */
  brief?: string
  roster: string
  /** Where its Orders are ridden from. Every army has one: either may be taken. */
  headquarters: Vec2
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
    standing: entry.standing ?? defaultStanding(),
    post: entry.position ? { ...entry.position } : { x: 0, y: 0 },
    shift: null,
    reload: 0,
    morale: FULL_MORALE,
    moraleCeiling: FULL_MORALE,
    settling: 0,
    fatigue: FRESH,
    blown: false,
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
    // Either army may be taken, so either may be the one whose Orders have to
    // be ridden from somewhere. An army authored without a Headquarters is a
    // Scenario the player could pick and then be unable to command at all, and
    // it would fail as silence rather than as an error.
    if (!a.headquarters) throw new Error(`${a.name} is authored without a Headquarters`)
    const army: Army = {
      id: a.id,
      name: a.name,
      colour: Number.parseInt(a.colour.replace("#", ""), 16),
      headquarters: {
        army: a.id,
        position: { ...a.headquarters },
        destination: null,
        dictated: [],
        surcharge: 0,
        harried: false,
      },
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

/**
 * Take command of an Army. A Scenario authors a Plan for both of them so either
 * can be played, and the half belonging to the Army the player has taken is
 * dropped here: an Army that is commanded cannot also be driven, or the first
 * Order the player sends would be argued with by its own Scenario.
 *
 * The Plan's owner is read off the Unit each Order names rather than declared,
 * so an author writes one list and never says twice whose a line is. Arrivals
 * count: a Unit still on the road already belongs to an Army.
 */
export function takeCommand(battle: Battle, army: string): void {
  const mine = new Set<string>()
  for (const unit of battle.units) if (unit.army === army) mine.add(unit.id)
  for (const arrival of battle.arrivals) if (arrival.unit.army === army) mine.add(arrival.unit.id)
  battle.plan = battle.plan.filter((planned) => !mine.has(planned.unitId))
}

/** A bare Field, for tests and fixtures that do not want a PNG. */
export function blankField(width: number, height: number, cellSize = 8): Field {
  return makeField(width, height, cellSize)
}
