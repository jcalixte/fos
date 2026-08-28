import { describe, expect, it } from "vitest"
import { concede, isOver, STEP, step, unitSpeed } from "./battle"
import { blankField, takeCommand } from "./scenario"
import { cellIndex } from "./field"
import {
  baseSpeed,
  beginChange,
  drillSeconds,
  faces,
  figureSlots,
  fireZone,
  firesOnTheMove,
  frontage,
  mobRadius,
  poseOf,
  slots,
  spanAlong,
  unitFootprint,
} from "./formation"
import { GROUND_COST, GROUNDS, movementCost } from "./ground"
import { aim, reloadSeconds, resolveFire, volleyCasualties } from "./fighting"
import {
  canCharge,
  chargeable,
  CHARGE_RANGE,
  gapTo,
  RECOIL_DISTANCE,
  resolveContact,
  struckSide,
} from "./charge"
import {
  ARMY_BREAK,
  canRally,
  hasArmyBroken,
  describeMorale,
  dread,
  isRouting,
  shake,
  shareGone,
  unitWeight,
} from "./morale"
import { COURIER_SPEED, estimateDelay, ghosts, issueOrder } from "./orders"
import { armyReturns } from "./return"
import { applyInitiative } from "./initiative"
import { defaultStanding, leash } from "./standing"
import { clearLine, route } from "./routing"
import type { Battle, Field, Grade, Unit } from "./types"
import { distance } from "./vec"

function battalion(overrides: Partial<Unit> = {}): Unit {
  const unit: Unit = {
    id: "u1",
    army: "french",
    name: "12e Ligne",
    arm: "infantry",
    grade: "line",
    strength: 700,
    position: { x: 100, y: 100 },
    facing: 0,
    formation: "line",
    changing: null,
    order: null,
    route: [],
    suspendedBy: null,
    standing: defaultStanding(),
    post: { x: 100, y: 100 },
    shift: null,
    reload: 0,
    morale: 1,
    moraleCeiling: 1,
    routing: null,
    charging: null,
    ...overrides,
  }
  // Posted where it is put, unless the fixture says otherwise. Latitude is
  // measured from the Post, so a Unit placed anywhere else would start the test
  // with its leash already spent.
  return { ...unit, post: overrides.post ?? { ...unit.position } }
}

/**
 * One army per army id among the Units, each weighted by exactly what it has on
 * the Field. A fixture has no Roster behind it, so anything else would leave it
 * short of Units it never had and broken before the first step.
 */
function armiesOf(units: Unit[]): Battle["armies"] {
  const seen = new Map<string, Battle["armies"][number]>()
  for (const unit of units) {
    const army = seen.get(unit.army) ?? {
      id: unit.army,
      name: unit.army,
      colour: 0x2c7c40,
      headquarters: null,
      weight: 0,
      strength: 0,
      units: 0,
    }
    army.weight += unitWeight(unit)
    army.strength += unit.strength
    army.units += 1
    seen.set(unit.army, army)
  }
  return [...seen.values()]
}

function emptyBattle(field: Field, units: Unit[], armies?: Battle["armies"]): Battle {
  return {
    time: 0,
    field,
    armies: armies ?? armiesOf(units),
    units,
    couriers: [],
    volleys: [],
    contacts: [],
    dispatches: [],
    crossings: [],
    keyGround: [],
    arrivals: [],
    plan: [],
    clock: 2400,
    outcome: null,
    seed: 1,
    nextId: 1,
  }
}

describe("C3 Formation Geometry", () => {
  it("puts a battalion's Frontage in the 75-150m band the Roster is authored to", () => {
    expect(frontage("infantry", "line", 700)).toBeGreaterThan(75)
    expect(frontage("infantry", "line", 700)).toBeLessThan(150)
  })

  it("derives Frontage from Strength, so casualties shrink it", () => {
    expect(frontage("infantry", "line", 350)).toBeLessThan(frontage("infantry", "line", 700))
  })

  it("makes a column a quarter of a line's Frontage and far deeper", () => {
    const line = frontage("infantry", "line", 700)
    const column = frontage("infantry", "attack-column", 700)
    expect(column).toBeLessThan(line / 2)
  })

  it("stands a Rout in a mob, which is no Formation and is drawn as none", () => {
    // A mob is not in the Formation grammar and cannot be: every Formation
    // there is a grid of ranks and files, and the player may order any of them.
    // So a Rout is a pose instead, and this is what makes a battalion that
    // broke stop looking like a battalion — it kept its travelling Formation
    // before, which is a 2.8m by 157m needle, and a needle turning on the spot
    // reads as a fan spinning rather than as men running.
    const mob = {
      arm: "infantry",
      strength: 700,
      formation: "march-column",
      changingTo: null,
      changeProgress: 0,
      routing: true,
    } as const
    const column = { ...mob, routing: false }
    const spread = (pose: typeof mob | typeof column) => {
      const slots = figureSlots(pose, 60)
      return {
        across: Math.max(...slots.map((p) => Math.abs(p.x))) * 2,
        deep: Math.max(...slots.map((p) => Math.abs(p.y))) * 2,
        slots,
      }
    }
    const crowd = spread(mob)
    const marching = spread(column)
    // The column is a needle and the mob is round: as broad as it is deep,
    // within a fifth either way.
    expect(marching.deep).toBeGreaterThan(marching.across * 10)
    expect(crowd.across).toBeGreaterThan(crowd.deep * 0.8)
    expect(crowd.across).toBeLessThan(crowd.deep * 1.25)
    // And nobody stands outside the disc the Unit is said to cover.
    const r = mobRadius("infantry", 700)
    for (const slot of crowd.slots) expect(Math.hypot(slot.x, slot.y)).toBeLessThanOrEqual(r)

    // Uneven, and the same unevenness every time: a replay draws the same
    // crowd, and no two men stand in a rank with each other (F18).
    expect(figureSlots(mob, 60)).toEqual(crowd.slots)
    expect(new Set(crowd.slots.map((p) => p.y.toFixed(3))).size).toBe(crowd.slots.length)
    // It thins as it sheds men rather than carrying one blob off the Field.
    expect(mobRadius("infantry", 350)).toBeLessThan(mobRadius("infantry", 700))
  })

  it("gives a square four Faces and a march column none", () => {
    expect(faces("infantry", "square")).toBe(4)
    expect(faces("infantry", "line")).toBe(1)
    expect(faces("infantry", "march-column")).toBe(0)
  })

  it("beats ground wider than it is deep, and none at all on the march", () => {
    // 720 men, 3 ranks, 0.6m a file: 240 files across, reaching 100m.
    const line = fireZone("infantry", "line", 720)!
    expect(Math.round(line.width)).toBe(144)
    expect(line.range).toBe(100)
    expect(line.width).toBeGreaterThan(line.range)
    expect(line.faces).toBe(1)

    // A column trades the frontage away: same reach, a third of the ground.
    expect(fireZone("infantry", "attack-column", 720)!.width).toBeLessThan(line.width)

    // Square fires four ways; skirmishers face none and shoot all round.
    expect(fireZone("infantry", "square", 720)!.faces).toBe(4)
    expect(fireZone("infantry", "open-order", 720)!.faces).toBe(0)

    // Slung muskets and hitched guns beat nothing.
    expect(fireZone("infantry", "march-column", 720)).toBeNull()
    expect(fireZone("artillery", "limbered", 120)).toBeNull()
  })

  it("lets only the Formations with no Face fire on the move", () => {
    // Nothing authored says so: it falls out of having a Face to dress, or none.
    expect(firesOnTheMove("infantry", "open-order")).toBe(true)
    expect(firesOnTheMove("infantry", "line")).toBe(false)
    expect(firesOnTheMove("infantry", "square")).toBe(false)
    expect(firesOnTheMove("artillery", "in-battery")).toBe(false)
    // No Face either, but nothing to fire with.
    expect(firesOnTheMove("infantry", "march-column")).toBe(false)
    expect(firesOnTheMove("cavalry", "line")).toBe(false)
  })

  it("lays out one slot per man, and none of them on top of each other", () => {
    const s = slots("infantry", "line", 60)
    expect(s).toHaveLength(60)
    const unique = new Set(s.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`))
    expect(unique.size).toBe(60)
  })

  it("arranges artillery by its guns rather than by its gunners", () => {
    // 90 gunners is a six-gun battery; the guns are what stand on the ground.
    expect(slots("artillery", "in-battery", 90)).toHaveLength(6)
  })

  it("takes about half a minute to go from line to square, and less if elite", () => {
    expect(drillSeconds("infantry", "line", "line", "square")).toBe(30)
    expect(drillSeconds("infantry", "elite", "line", "square")).toBeLessThan(30)
    expect(drillSeconds("infantry", "conscript", "line", "square")).toBeGreaterThan(30)
  })

  it("charges a change of mind mid-drill from where the Unit was going", () => {
    const unit = battalion()
    expect(beginChange(unit, "march-column")).toBe(true)
    unit.changing!.elapsed = 10
    // Told to be in line after all, having spent ten seconds filing off. It is
    // not already in line, and getting back there is drill like any other.
    expect(beginChange(unit, "line")).toBe(true)
    expect(unit.changing?.duration).toBe(drillSeconds("infantry", "line", "march-column", "line"))
  })

  it("morphs the slot layout across a change rather than popping", () => {
    const unit = battalion({
      changing: { from: "line", to: "square", elapsed: 15, duration: 30 },
    })
    const half = figureSlots(poseOf(unit), 40)
    const start = figureSlots(poseOf(battalion()), 40)
    const end = figureSlots(poseOf(battalion({ formation: "square" })), 40)
    // Halfway through, every Figure is halfway between its two slots.
    for (let i = 0; i < half.length; i++) {
      expect(half[i].x).toBeCloseTo((start[i].x + end[i].x) / 2, 5)
      expect(half[i].y).toBeCloseTo((start[i].y + end[i].y) / 2, 5)
    }
  })

  it("marches faster in march column than in line", () => {
    expect(baseSpeed("infantry", "march-column")).toBeGreaterThan(baseSpeed("infantry", "line"))
  })
})

describe("C1 Order Delivery", () => {
  it("hits the F1 targets: 200m in about 15s, 1500m in about 115s", () => {
    for (const [gap, expected] of [
      [200, 15],
      [1500, 115],
    ] as const) {
      const unit = battalion({ position: { x: gap, y: 0 } })
      const battle = emptyBattle(blankField(400, 40), [unit])
      issueOrder(battle, unit.id, { kind: "halt" }, { x: 0, y: 0 })
      let elapsed = 0
      while (battle.couriers.length > 0 && elapsed < 600) {
        step(battle)
        elapsed += STEP
      }
      expect(elapsed).toBeGreaterThan(expected - 1)
      expect(elapsed).toBeLessThan(expected + 1)
    }
  })

  it("agrees with its own estimate for a Unit standing still", () => {
    expect(estimateDelay({ x: 0, y: 0 }, { x: 1300, y: 0 })).toBeCloseTo(100, 5)
    expect(COURIER_SPEED).toBe(13)
  })

  it("costs more to order a Unit marching away than the map distance suggests", () => {
    const unit = battalion({
      position: { x: 400, y: 0 },
      formation: "march-column",
      order: {
        order: {
          id: "seed",
          unitId: "u1",
          body: {
            kind: "move",
            destination: { x: 1600, y: 0 },
            arrivalFacing: 0,
            arrivalFormation: "march-column",
          },
          issuedAt: 0,
        },
        arrivedAt: 0,
      },
    })
    const battle = emptyBattle(blankField(400, 40), [unit])
    issueOrder(battle, unit.id, { kind: "halt" }, { x: 0, y: 0 })
    let elapsed = 0
    while (battle.couriers.length > 0 && elapsed < 600) {
      step(battle)
      elapsed += STEP
    }
    expect(elapsed).toBeGreaterThan(estimateDelay({ x: 0, y: 0 }, { x: 400, y: 0 }))
  })

  it("reads a Move onto the ground a Unit stands on as coming round, not marching", () => {
    const battery = battalion({ arm: "artillery", formation: "in-battery", strength: 90 })
    const battle = emptyBattle(blankField(400, 40), [battery])
    issueOrder(
      battle,
      battery.id,
      {
        kind: "move",
        destination: { ...battery.position },
        arrivalFacing: -Math.PI / 2,
        arrivalFormation: "in-battery",
      },
      { x: 0, y: 0 },
    )
    while (battle.couriers.length > 0) step(battle)
    const said = battle.dispatches.map((d) => d.text)
    expect(said.some((t) => t.includes("come round where it stands"))).toBe(true)
    expect(said.some((t) => t.includes("march"))).toBe(false)
  })

  it("shows every pending Order as a Ghost where it leads", () => {
    const unit = battalion()
    const battle = emptyBattle(blankField(400, 40), [unit])
    issueOrder(
      battle,
      unit.id,
      {
        kind: "move",
        destination: { x: 900, y: 300 },
        arrivalFacing: 1,
        arrivalFormation: "line",
      },
      { x: 0, y: 0 },
    )
    const shown = ghosts(battle)
    expect(shown).toHaveLength(1)
    expect(shown[0].position).toEqual({ x: 900, y: 300 })
    expect(battle.couriers).toHaveLength(1)
  })

  it("holds the Ghost until the Unit arrives, not until the Courier does", () => {
    const unit = battalion()
    const battle = emptyBattle(blankField(400, 40), [unit])
    issueOrder(
      battle,
      unit.id,
      {
        kind: "move",
        destination: { x: 900, y: 300 },
        arrivalFacing: 1,
        arrivalFormation: "square",
      },
      { x: 0, y: 0 },
    )
    while (battle.couriers.length > 0) step(battle)

    // The Courier is home and the march has barely started.
    expect(unit.order).not.toBeNull()
    const shown = ghosts(battle)
    expect(shown).toHaveLength(1)
    expect(shown[0].position).toEqual({ x: 900, y: 300 })
    // It stands in the Formation the Unit will arrive in, not the one it marches in.
    expect(shown[0].formation).toBe("square")
    expect(unit.formation).not.toBe("square")
  })
})

describe("C5 Routing", () => {
  function riverField(bridgeAtY: number): Field {
    const field = blankField(40, 20)
    const water = GROUNDS.indexOf("water")
    for (let cy = 0; cy < field.height; cy++) {
      field.ground[cellIndex(field, 20, cy)] = water
    }
    field.crossing[cellIndex(field, 20, bridgeAtY)] = 1
    return field
  }

  it("refuses to walk into water", () => {
    const field = riverField(4)
    expect(clearLine(field, { x: 40, y: 80 }, { x: 280, y: 80 })).toBe(false)
  })

  it("funnels to the Crossing without being told to", () => {
    const field = riverField(16)
    const path = route(field, { x: 40, y: 40 }, { x: 280, y: 40 })
    expect(path.length).toBeGreaterThan(1)
    const bridge = { x: 20 * 8 + 4, y: 16 * 8 + 4 }
    const closest = Math.min(...path.map((p) => distance(p, bridge)))
    expect(closest).toBeLessThan(16)
  })

  it("string-pulls an open march down to a single waypoint", () => {
    const field = blankField(40, 20)
    expect(route(field, { x: 40, y: 40 }, { x: 280, y: 40 })).toHaveLength(1)
  })

  it("returns nothing when there is no way through", () => {
    const field = blankField(40, 20)
    const water = GROUNDS.indexOf("water")
    for (let cy = 0; cy < field.height; cy++) {
      field.ground[cellIndex(field, 20, cy)] = water
    }
    expect(route(field, { x: 40, y: 40 }, { x: 280, y: 40 })).toHaveLength(0)
  })
})

describe("C2 Initiative", () => {
  it("picks march column for a long march, then gives the Order back", () => {
    const unit = battalion()
    const battle = emptyBattle(blankField(200, 40), [unit])
    unit.order = {
      order: {
        id: "o1",
        unitId: unit.id,
        body: {
          kind: "move",
          destination: { x: 1200, y: 100 },
          arrivalFacing: 0,
          arrivalFormation: "line",
        },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }
    for (let i = 0; i < 10; i++) step(battle)
    expect(unit.suspendedBy).toBe("took march column to cover the ground")
    expect(unit.changing?.to).toBe("march-column")
    const halted = { ...unit.position }

    // It halts to re-form: a battalion cannot file off and march at once.
    for (let i = 0; i < 100; i++) step(battle)
    expect(distance(unit.position, halted)).toBeLessThan(1)

    while (unit.changing !== null) step(battle)
    expect(unit.formation).toBe("march-column")

    for (let i = 0; i < 100; i++) step(battle)
    expect(unit.suspendedBy).toBeNull()
    expect(distance(unit.position, halted)).toBeGreaterThan(5)
  })

  it("will not fold into column with the enemy in reach", () => {
    const unit = battalion()
    // 250m off, inside ENGAGEMENT_RANGE.
    const austrian = battalion({ id: "a1", army: "austrian", position: { x: 350, y: 100 } })
    const battle = emptyBattle(blankField(200, 40), [unit, austrian])
    unit.order = {
      order: {
        id: "o1",
        unitId: unit.id,
        body: {
          kind: "move",
          destination: { x: 1200, y: 100 },
          arrivalFacing: 0,
          arrivalFormation: "line",
        },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }
    for (let i = 0; i < 10; i++) step(battle)
    // Long march, but it keeps its line and walks at line pace.
    expect(unit.suspendedBy).toBeNull()
    expect(unit.changing).toBeNull()
    expect(unit.formation).toBe("line")
  })

  it("comes out of column when the enemy gets close, and stands to do it", () => {
    const unit = battalion({ formation: "march-column" })
    const austrian = battalion({ id: "a1", army: "austrian", position: { x: 350, y: 100 } })
    const battle = emptyBattle(blankField(200, 40), [unit, austrian])
    unit.order = {
      order: {
        id: "o1",
        unitId: unit.id,
        body: {
          kind: "move",
          destination: { x: 1200, y: 100 },
          arrivalFacing: 0,
          arrivalFormation: "square",
        },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }
    step(battle)
    expect(unit.suspendedBy).toBe("deployed, the enemy too close to stay on the march")
    // It deploys into what the player asked it to arrive in, since that can fight.
    expect(unit.changing?.to).toBe("square")

    const halted = { ...unit.position }
    while (unit.changing !== null) step(battle)
    expect(distance(unit.position, halted)).toBeLessThan(1)
    expect(unit.formation).toBe("square")
  })

  it("says why, in the words of the rule that fired", () => {
    const unit = battalion()
    const battle = emptyBattle(blankField(200, 40), [unit])
    unit.order = {
      order: {
        id: "o1",
        unitId: unit.id,
        body: {
          kind: "move",
          destination: { x: 1200, y: 100 },
          arrivalFacing: 0,
          arrivalFormation: "line",
        },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }
    for (let i = 0; i < 10; i++) step(battle)
    expect(battle.dispatches.map((d) => d.text)).toContain(
      "12e Ligne took march column to cover the ground",
    )
  })

  it("limbers a battery up to move it, however short the distance", () => {
    const battery = battalion({
      id: "b1",
      arm: "artillery",
      formation: "in-battery",
      strength: 90,
      position: { x: 100, y: 100 },
    })
    const battle = emptyBattle(blankField(60, 60), [battery])
    // Fifty metres: less than DEPLOY_RANGE, so no rule about covering ground
    // fires, and a battery in battery has no speed to cover it with.
    battery.order = {
      order: {
        id: "o1",
        unitId: battery.id,
        body: {
          kind: "move",
          destination: { x: 150, y: 100 },
          arrivalFacing: 0,
          arrivalFormation: "in-battery",
        },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }
    for (let i = 0; i < 20; i++) step(battle)
    expect(battery.suspendedBy).toBe("limbered up, because guns in battery do not move")
    expect(battery.changing?.to).toBe("limbered")

    for (let i = 0; i < 3000; i++) step(battle)
    expect(distance(battery.position, { x: 150, y: 100 })).toBeLessThan(10)
    expect(battery.formation).toBe("in-battery")
  })

  it("traverses a battery onto a new facing without moving it an inch", () => {
    const battery = battalion({ arm: "artillery", formation: "in-battery", strength: 90 })
    const battle = emptyBattle(blankField(60, 60), [battery])
    expect(unitSpeed(battle, battery)).toBe(0)
    // Ordered to stand where it stands and face north instead: no ground to
    // cover, so nothing limbers up, and the guns come round on the spot.
    battery.order = {
      order: {
        id: "o1",
        unitId: battery.id,
        body: {
          kind: "move",
          destination: { ...battery.position },
          arrivalFacing: -Math.PI / 2,
          arrivalFormation: "in-battery",
        },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }
    for (let i = 0; i < 3000; i++) step(battle)
    expect(battery.position).toEqual({ x: 100, y: 100 })
    expect(battery.formation).toBe("in-battery")
    expect(battery.facing).toBeCloseTo(-Math.PI / 2, 2)
    expect(battery.order).toBeNull()
  })

  it("traverses at a rate, not a wheel, so twelve guns come round with six", () => {
    // Seconds a battery of `strength` gunners takes to come a quarter turn
    // round where it stands.
    const quarterTurn = (strength: number, grade: Grade = "line"): number => {
      const battery = battalion({ arm: "artillery", formation: "in-battery", strength, grade })
      const battle = emptyBattle(blankField(60, 60), [battery])
      battery.order = {
        order: {
          id: "o1",
          unitId: battery.id,
          body: {
            kind: "move",
            destination: { ...battery.position },
            arrivalFacing: -Math.PI / 2,
            arrivalFormation: "in-battery",
          },
          issuedAt: 0,
        },
        arrivedAt: 0,
      }
      for (let i = 0; i < 6000 && battery.order !== null; i++) step(battle)
      expect(battery.order).toBeNull()
      return battle.time
    }

    // Six guns are 108m of front and twelve are 216m. Read off Frontage the way
    // a wheel is, that was 212s against 425s: a twelve-gun battery spent seven
    // minutes of a thirty-minute battle changing front, and the bigger the
    // battery the worse it got. Every crew handspikes its own piece at once, so
    // the time is the same one.
    expect(frontage("artillery", "in-battery", 180)).toBeCloseTo(
      frontage("artillery", "in-battery", 90) * 2,
      0,
    )
    // A minute, less the last 0.05 radians FACING_TOLERANCE calls dressed.
    expect(quarterTurn(90)).toBeGreaterThan(55)
    expect(quarterTurn(90)).toBeLessThan(62)
    expect(quarterTurn(180)).toBeCloseTo(quarterTurn(90), 0)

    // It is drill, so the ladder that sets how fast a battalion files into
    // square sets this too.
    expect(quarterTurn(90, "elite")).toBeLessThan(quarterTurn(90))
    expect(quarterTurn(90, "conscript")).toBeGreaterThan(quarterTurn(90))
  })

  it("still wheels what can walk, so a wider line takes longer to come round", () => {
    // The other half of the same rule: a Formation with speed pays for its turn
    // in ground, and the outer flank of a long line has further to walk.
    const wheelTime = (strength: number): number => {
      const unit = battalion({ strength })
      const battle = emptyBattle(blankField(60, 60), [unit])
      unit.order = {
        order: {
          id: "o1",
          unitId: unit.id,
          body: {
            kind: "move",
            destination: { ...unit.position },
            arrivalFacing: -Math.PI / 2,
            arrivalFormation: "line",
          },
          issuedAt: 0,
        },
        arrivedAt: 0,
      }
      for (let i = 0; i < 12000 && unit.order !== null; i++) step(battle)
      expect(unit.order).toBeNull()
      return battle.time
    }
    expect(wheelTime(700)).toBeGreaterThan(wheelTime(350) * 1.5)
  })

  it("leaves the Formation alone when a Form Order pins it", () => {
    const unit = battalion()
    const battle = emptyBattle(blankField(200, 40), [unit])
    unit.order = {
      order: {
        id: "o1",
        unitId: unit.id,
        body: { kind: "form", formation: "square" },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }
    for (let i = 0; i < 10; i++) step(battle)
    expect(unit.changing?.to).toBe("square")
    expect(unit.suspendedBy).toBeNull()
  })
})

describe("C2 Initiative — the Standing Order", () => {
  /** A Unit of yours, an enemy `gap` metres due east of it, and a Field to fight on. */
  function facing(gap: number, mine: Partial<Unit> = {}, theirs: Partial<Unit> = {}) {
    const unit = battalion({ position: { x: 100, y: 100 }, ...mine })
    const enemy = battalion({
      id: "au",
      army: "austrian",
      name: "IR 23",
      position: { x: 100 + gap, y: 100 },
      facing: Math.PI,
      ...theirs,
    })
    return { unit, enemy, battle: emptyBattle(blankField(200, 40), [unit, enemy]) }
  }

  it("holds its ground by default, whatever comes into reach", () => {
    const { unit, battle } = facing(250)
    const stood = { ...unit.position }
    for (let i = 0; i < 600; i++) step(battle)
    expect(unit.standing).toEqual(defaultStanding())
    expect(distance(unit.position, stood)).toBe(0)
  })

  it("closes up to bring them under its fire, and stops when the leash runs out", () => {
    const { unit, battle } = facing(280, { standing: { latitude: "close-up", holdFire: false } })
    for (let i = 0; i < 3000; i++) step(battle)
    expect(unit.suspendedBy).toBeNull()
    expect(unit.position.x).toBeGreaterThan(150)
    // The leash is measured from the Post and never from where the Unit ended
    // up: a hundred metres of ground, and the enemy still out of its reach.
    expect(distance(unit.position, unit.post)).toBeLessThanOrEqual(leash("close-up") + 1)
    expect(aim(battle, unit)).toBeNull()
  })

  it("closing up stops the moment anything bears, well short of the leash", () => {
    const { unit, battle } = facing(180, { standing: { latitude: "close-up", holdFire: false } })
    for (let i = 0; i < 3000; i++) step(battle)
    expect(aim(battle, unit)?.target.id).toBe("au")
    expect(distance(unit.position, unit.post)).toBeLessThan(leash("close-up"))
  })

  it("gives ground rather than be closed with, and no more than its leash", () => {
    const { unit, enemy, battle } = facing(150, {
      standing: { latitude: "stand-off", holdFire: false },
    })
    for (let i = 0; i < 3000; i++) step(battle)
    // Out past the range it means to keep, and stopped there — it gives ground
    // to keep its distance, not to leave the battle.
    expect(distance(unit.position, enemy.position)).toBeGreaterThan(150)
    expect(distance(unit.position, unit.post)).toBeLessThanOrEqual(leash("stand-off"))
  })

  it("follows up as they give way, and only a Unit told it may", () => {
    for (const latitude of ["hold-ground", "follow-up"] as const) {
      const { unit, battle } = facing(
        200,
        { standing: { latitude, holdFire: false } },
        { routing: { heading: 0, brokeAt: 0 }, morale: 0.05 },
      )
      const stood = { ...unit.position }
      for (let i = 0; i < 2000; i++) step(battle)
      const taken = unit.position.x - stood.x
      if (latitude === "hold-ground") expect(taken).toBe(0)
      else {
        expect(taken).toBeGreaterThan(10)
        expect(distance(unit.position, unit.post)).toBeLessThanOrEqual(leash("follow-up") + 1)
      }
    }
  })

  it("holds its fire when it is told to, at any range", () => {
    const { unit, battle } = facing(60, { standing: { latitude: "hold-ground", holdFire: true } })
    // It has a target and its muskets are loaded. It is the Order that stops it.
    expect(aim(battle, unit)?.target.id).toBe("au")
    for (let i = 0; i < 600; i++) step(battle)
    expect(battle.volleys.filter((v) => v.unitId === unit.id)).toHaveLength(0)
    expect(unit.reload).toBe(0)

    unit.standing = { latitude: "hold-ground", holdFire: false }
    step(battle)
    expect(battle.volleys.some((v) => v.unitId === unit.id)).toBe(true)
  })

  it("takes a new brief by Courier, and the brief leaves the march alone", () => {
    const { unit, battle } = facing(2000)
    unit.order = {
      order: {
        id: "o1",
        unitId: unit.id,
        body: {
          kind: "move",
          destination: { x: 600, y: 100 },
          arrivalFacing: 0,
          arrivalFormation: "line",
        },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }
    unit.post = { x: 600, y: 100 }
    issueOrder(
      battle,
      unit.id,
      { kind: "standing", latitude: "close-up", holdFire: true },
      {
        x: 100,
        y: 300,
      },
    )
    for (let i = 0; i < 600 && battle.couriers.length > 0; i++) step(battle)
    expect(battle.couriers).toHaveLength(0)
    expect(unit.standing).toEqual({ latitude: "close-up", holdFire: true })
    // Still marching where it was sent. A brief says what a Unit does unbidden,
    // which is a different question from what it is under orders to do now.
    expect(unit.order?.order.body.kind).toBe("move")
  })

  it("posts a Unit where its Move Order sent it, so the leash is spent from there", () => {
    const { unit, battle } = facing(2000, {
      standing: { latitude: "close-up", holdFire: false },
    })
    issueOrder(
      battle,
      unit.id,
      { kind: "move", destination: { x: 400, y: 100 }, arrivalFacing: 0, arrivalFormation: "line" },
      { x: 100, y: 100 },
    )
    for (let i = 0; i < 6000; i++) step(battle)
    expect(unit.order).toBeNull()
    expect(unit.post).toEqual({ x: 400, y: 100 })
  })
})

describe("C8 Battle Clock", () => {
  it("marches a Unit to where it was sent and dresses it on the ordered facing", () => {
    const unit = battalion({ formation: "march-column" })
    const battle = emptyBattle(blankField(200, 40), [unit])
    unit.order = {
      order: {
        id: "o1",
        unitId: unit.id,
        body: {
          kind: "move",
          destination: { x: 600, y: 100 },
          arrivalFacing: Math.PI / 2,
          arrivalFormation: "line",
        },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }
    for (let i = 0; i < 12000 && unit.order !== null; i++) step(battle)
    expect(unit.order).toBeNull()
    expect(distance(unit.position, { x: 600, y: 100 })).toBeLessThan(10)
    expect(unit.facing).toBeCloseTo(Math.PI / 2, 2)
    expect(unit.formation).toBe("line")
  })

  it("wheels onto the ordered facing while still marching, not after", () => {
    const field = blankField(200, 60)
    const unit = battalion({ position: { x: 100, y: 240 }, facing: 0 })
    const battle = emptyBattle(field, [unit])
    unit.order = {
      order: {
        id: "o1",
        unitId: unit.id,
        // 150m east, to stand facing north at the end of it. Short enough that
        // Initiative leaves it in line: a line is what has a wheel worth timing.
        body: {
          kind: "move",
          destination: { x: 250, y: 240 },
          arrivalFacing: -Math.PI / 2,
          arrivalFormation: "line",
        },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }
    let done = 0
    for (let i = 0; i < 12000 && done === 0; i++) {
      step(battle)
      if (unit.order === null) done = battle.time
    }
    // 142m in line is 178s. A 140m line wheeling 90 degrees is 138s more, and
    // standing still for it at the destination was the whole complaint — the
    // wheel is walked over the last hundred metres instead.
    expect(unit.formation).toBe("line")
    expect(done).toBeGreaterThan(0)
    expect(done).toBeLessThan(200)
    expect(unit.facing).toBeCloseTo(-Math.PI / 2, 2)
  })

  it("brings an Arrival onto the Field on its clock time, not before", () => {
    const field = blankField(200, 40)
    const battle = emptyBattle(field, [])
    battle.arrivals = [
      {
        at: 60,
        unit: battalion({ id: "u2", name: "9e Légère" }),
        entry: { x: 0, y: 100 },
        order: null,
      },
    ]
    for (let i = 0; i < 500; i++) step(battle)
    expect(battle.units).toHaveLength(0)
    for (let i = 0; i < 200; i++) step(battle)
    expect(battle.units.map((u) => u.id)).toEqual(["u2"])
  })

  it("replays identically from the same Scenario and seed", () => {
    const run = () => {
      const unit = battalion()
      const battle = emptyBattle(blankField(200, 40), [unit])
      issueOrder(
        battle,
        unit.id,
        {
          kind: "move",
          destination: { x: 900, y: 300 },
          arrivalFacing: 0.4,
          arrivalFormation: "attack-column",
        },
        { x: 50, y: 50 },
      )
      for (let i = 0; i < 4000; i++) step(battle)
      return JSON.stringify({ units: battle.units, dispatches: battle.dispatches })
    }
    expect(run()).toBe(run())
  })

  it("reads the ground under the Unit, not the ground behind it", () => {
    // A battalion in line is 140m across and 4m deep. A wood twelve metres to
    // its rear is ground it is not standing on, and must cost it nothing: the
    // Footprint is sampled along the Unit's own axes, so its depth reaches back
    // four metres, not seventy.
    const field = blankField(60, 60)
    const wood = GROUNDS.indexOf("wood")
    for (let cy = 0; cy < 60; cy++) {
      for (let cx = 0; cx < 36; cx++) field.ground[cellIndex(field, cx, cy)] = wood
    }
    const unit = battalion({ position: { x: 300, y: 300 }, facing: 0 })
    const battle = emptyBattle(field, [unit])
    expect(unitSpeed(battle, unit)).toBeCloseTo(baseSpeed("infantry", "line"), 5)
  })

  it("lets the marsh cost a route more than it costs a Unit's legs", () => {
    // The routing weight and the speed divisor are different numbers on purpose:
    // A* should walk round the marsh, but a battalion caught in one must still
    // be moving at a speed the battle clock can notice.
    expect(movementCost(GROUND_COST.marsh)).toBeLessThan(GROUND_COST.marsh)
    expect(movementCost(GROUND_COST.marsh)).toBeGreaterThan(GROUND_COST.open)
    // The road's bonus is not softened along with the malus.
    expect(movementCost(GROUND_COST.road)).toBe(GROUND_COST.road)

    const field = blankField(60, 60)
    field.ground.fill(GROUNDS.indexOf("marsh"))
    const unit = battalion({ position: { x: 300, y: 300 }, facing: 0 })
    const battle = emptyBattle(field, [unit])
    // 20m a minute would be a Unit that has stopped, on a 30-minute clock.
    expect(unitSpeed(battle, unit) * 60).toBeGreaterThan(20)
  })

  it("slows a Unit down in the marsh and speeds it up on the road", () => {
    const field = blankField(40, 20)
    const unit = battalion({ formation: "march-column", position: { x: 100, y: 80 } })
    const battle = emptyBattle(field, [unit])
    const open = unitSpeed(battle, unit)
    field.ground.fill(GROUNDS.indexOf("marsh"))
    expect(unitSpeed(battle, unit)).toBeLessThan(open)
    field.ground.fill(GROUNDS.indexOf("road"))
    expect(unitSpeed(battle, unit)).toBeGreaterThan(open)
  })
})

describe("C6 Fighting", () => {
  /** A firer and something for it to shoot at, `gap` metres in front of it. */
  function facingOff(gap: number, target: Partial<Unit> = {}, firer: Partial<Unit> = {}) {
    const shooter = battalion({ id: "fr", position: { x: 100, y: 100 }, ...firer })
    const enemy = battalion({
      id: "au",
      army: "austrian",
      name: "IR 23",
      position: { x: 100 + gap, y: 100 },
      facing: Math.PI,
      ...target,
    })
    return { shooter, enemy, battle: emptyBattle(blankField(60, 40), [shooter, enemy]) }
  }

  it("fires on the period's clocks: three rounds a minute, and a gun in half of one", () => {
    for (const grade of ["conscript", "line", "elite"] as const) {
      expect(reloadSeconds("infantry", grade)).toBeGreaterThanOrEqual(20)
      expect(reloadSeconds("infantry", grade)).toBeLessThanOrEqual(25)
      expect(reloadSeconds("artillery", grade)).toBeGreaterThanOrEqual(30)
      expect(reloadSeconds("artillery", grade)).toBeLessThanOrEqual(60)
    }
  })

  it("shoots what stands in its beaten ground, and nothing behind it", () => {
    const { shooter, battle } = facingOff(60)
    expect(aim(battle, shooter)?.target.id).toBe("au")
    battle.units[1].position = { x: 40, y: 100 }
    expect(aim(battle, shooter)).toBeNull()
  })

  it("does not shoot at its own army, whatever it is pointed at", () => {
    const { battle, shooter } = facingOff(60, { army: "french" })
    expect(aim(battle, shooter)).toBeNull()
  })

  it("cannot fire in march column, which is the argument against being caught in one", () => {
    const { battle, shooter } = facingOff(60, {}, { formation: "march-column" })
    expect(aim(battle, shooter)).toBeNull()
  })

  it("cannot fire while it is re-forming", () => {
    const { battle, shooter } = facingOff(60)
    shooter.changing = { from: "line", to: "square", elapsed: 1, duration: 30 }
    expect(aim(battle, shooter)).toBeNull()
  })

  it("will not fire on the march, so a Unit that wants to shoot has to stop", () => {
    const { battle, shooter, enemy } = facingOff(60)
    const before = enemy.strength
    resolveFire(battle, shooter, STEP, false)
    expect(enemy.strength).toBe(before)
    expect(battle.volleys).toHaveLength(0)
    resolveFire(battle, shooter, STEP, true)
    expect(enemy.strength).toBeLessThan(before)
    expect(battle.volleys).toHaveLength(1)
  })

  it("fires on the move in open order, which is the whole of what it is for", () => {
    const { battle, shooter, enemy } = facingOff(60, {}, { formation: "open-order" })
    const before = enemy.strength
    resolveFire(battle, shooter, STEP, false)
    expect(enemy.strength).toBeLessThan(before)
    expect(battle.volleys).toHaveLength(1)
    // And pays for it in the reload, never in how much the Volley finds.
    expect(shooter.reload).toBeCloseTo(reloadSeconds("infantry", shooter.grade) * 2)
  })

  it("charges a screen the same reload standing still as it does walking", () => {
    const walking = facingOff(60, {}, { formation: "open-order" })
    const halted = facingOff(60, {}, { formation: "open-order" })
    resolveFire(walking.battle, walking.shooter, STEP, false)
    resolveFire(halted.battle, halted.shooter, STEP, true)
    // The price is the Formation's, not the step's. Reading whether the Unit had
    // moved this tick refunded it the moment the screen stopped, which handed
    // Open Order a line's rate of fire out at 150m where no line can answer.
    expect(halted.shooter.reload).toBeCloseTo(walking.shooter.reload)
    expect(halted.shooter.reload).toBeCloseTo(reloadSeconds("infantry", "line") * 2)
  })

  it("does not charge a dressed battalion for having its feet still", () => {
    const { battle, shooter } = facingOff(60)
    resolveFire(battle, shooter, STEP, true)
    expect(shooter.reload).toBeCloseTo(reloadSeconds("infantry", "line"))
  })

  it("leaves a screen out-shot by the line it is standing off from", () => {
    // The whole reason the reload is charged to the Formation: at 120m a screen
    // fires and nothing can fire back, so what it does per minute out there has
    // to stay under what a line does inside its own reach.
    const screen = facingOff(120, {}, { formation: "open-order" })
    const line = facingOff(60)
    const perMinute = (u: typeof line.shooter, b: typeof line.battle) =>
      (volleyCasualties(u, aim(b, u)!) * 60) / u.reload || 0
    resolveFire(screen.battle, screen.shooter, STEP, true)
    resolveFire(line.battle, line.shooter, STEP, true)
    expect(perMinute(screen.shooter, screen.battle)).toBeLessThan(
      perMinute(line.shooter, line.battle) / 3,
    )
  })

  it("thins a screen's fire with the range, and not with its own Frontage", () => {
    const near = facingOff(60, {}, { formation: "open-order" })
    const far = facingOff(140, {}, { formation: "open-order" })
    expect(volleyCasualties(far.shooter, aim(far.battle, far.shooter)!)).toBeLessThan(
      volleyCasualties(near.shooter, aim(near.battle, near.shooter)!) * 0.8,
    )
    // And it reaches as far as the range says, not as far as the swarm is wide.
    const beyond = facingOff(200, {}, { formation: "open-order" })
    expect(aim(beyond.battle, beyond.shooter)).toBeNull()
  })

  it("holds its fire until it has reloaded", () => {
    const { battle, shooter } = facingOff(60)
    resolveFire(battle, shooter, STEP, true)
    battle.volleys = []
    for (let t = 0; t < reloadSeconds("infantry", "line") - 1; t += STEP) {
      resolveFire(battle, shooter, STEP, true)
    }
    expect(battle.volleys).toHaveLength(0)
    for (let t = 0; t < 2; t += STEP) resolveFire(battle, shooter, STEP, true)
    expect(battle.volleys).toHaveLength(1)
  })

  it("costs a battalion a Volley's worth of men and no more", () => {
    const { battle, shooter, enemy } = facingOff(60)
    resolveFire(battle, shooter, STEP, true)
    const lost = 700 - enemy.strength
    // A firefight at sixty metres is decided in a couple of minutes, not thirty.
    expect(lost).toBeGreaterThan(15)
    expect(lost).toBeLessThan(50)
    expect(battle.volleys[0].casualties).toBeCloseTo(lost)
  })

  it("thins out with the range", () => {
    const near = facingOff(30)
    const far = facingOff(95)
    expect(volleyCasualties(near.shooter, aim(near.battle, near.shooter)!)).toBeGreaterThan(
      volleyCasualties(far.shooter, aim(far.battle, far.shooter)!) * 1.5,
    )
  })

  it("settles the line-against-column exchange by which of them can reply", () => {
    const line = facingOff(60)
    const column = facingOff(60, { formation: "attack-column" })
    const lineOnLine = volleyCasualties(line.shooter, aim(line.battle, line.shooter)!)
    const lineOnColumn = volleyCasualties(column.shooter, aim(column.battle, column.shooter)!)
    // Two thirds of the line's muskets are pointed at open country either side
    // of the column, and the third that bears finds three times as much depth to
    // find. Those very nearly cancel, so what the column standing there actually
    // loses is not men — it is the exchange, because it can only reply with the
    // muskets its own narrow Frontage carries.
    expect(lineOnColumn).toBeGreaterThan(lineOnLine * 0.8)
    const columnBack = volleyCasualties(column.enemy, aim(column.battle, column.enemy)!)
    expect(columnBack).toBeLessThan(lineOnColumn / 2)
  })

  it("lays its guns rather than levelling them, so a battery loses nothing to a narrow target", () => {
    const battery = { arm: "artillery" as const, formation: "in-battery" as const, strength: 120 }
    const onLine = facingOff(400, {}, battery)
    const onColumn = facingOff(400, { formation: "attack-column" }, battery)
    const shotLine = aim(onLine.battle, onLine.shooter)!
    const shotColumn = aim(onColumn.battle, onColumn.shooter)!
    expect(shotColumn.overlap).toBeLessThan(shotLine.overlap / 2)
    // Every gun still bears, and the column's depth is what round shot is for.
    expect(volleyCasualties(onColumn.shooter, shotColumn)).toBeGreaterThan(
      volleyCasualties(onLine.shooter, shotLine) * 2,
    )
  })

  it("ploughs a march column, which is the worst place to be caught by guns", () => {
    const battery = { arm: "artillery" as const, formation: "in-battery" as const, strength: 120 }
    const column = facingOff(400, { formation: "march-column" }, battery)
    const line = facingOff(400, {}, battery)
    expect(volleyCasualties(column.shooter, aim(column.battle, column.shooter)!)).toBeGreaterThan(
      volleyCasualties(line.shooter, aim(line.battle, line.shooter)!) * 3,
    )
  })

  it("takes a Unit with nobody left off the Field, for want of Morale to Break it", () => {
    // Where enough Volleys get a Unit to, with nothing in the game yet able to
    // Break it first. A Unit of no men would otherwise stand there returning
    // fire, which is worse than the missing rule it stands in for.
    const { battle } = facingOff(60, { strength: 0 })
    step(battle)
    expect(battle.units.map((u) => u.id)).toEqual(["fr"])
    expect(battle.dispatches.some((d) => d.text.includes("destroyed"))).toBe(true)
  })

  it("keeps a Volley only for the step it was fired in", () => {
    const { battle } = facingOff(60)
    step(battle)
    // Both of them: each is standing still with the other in front of it.
    expect(battle.volleys).toHaveLength(2)
    step(battle)
    expect(battle.volleys).toHaveLength(0)
  })
})

describe("C7 Morale", () => {
  /** Two battalions eighty metres apart, with room behind them to run. */
  function firefight(overrides: Partial<Unit> = {}) {
    const french = battalion({ id: "fr", position: { x: 1000, y: 1000 }, ...overrides })
    const austrian = battalion({
      id: "au",
      army: "austrian",
      name: "IR 23",
      position: { x: 1080, y: 1000 },
      facing: Math.PI,
      ...overrides,
    })
    const battle = emptyBattle(blankField(250, 250), [french, austrian])
    return { french, austrian, battle }
  }

  /** Fight it out until somebody Breaks, and say who did and what it cost. */
  function untilSomebodyBreaks(overrides: Partial<Unit> = {}) {
    const { french, austrian, battle } = firefight(overrides)
    while (battle.time < 1800 && !isRouting(french) && !isRouting(austrian)) step(battle)
    const broken = isRouting(french) ? french : austrian
    return { battle, broken, lost: 1 - broken.strength / 700 }
  }

  it("Breaks a battalion inside F10's band, at a fifth of its men and not at all of them", () => {
    const { broken, lost } = untilSomebodyBreaks()
    expect(isRouting(broken)).toBe(true)
    expect(lost).toBeGreaterThan(0.15)
    expect(lost).toBeLessThan(0.3)
  })

  it("makes a conscript battalion Break sooner than an elite one", () => {
    const conscript = untilSomebodyBreaks({ grade: "conscript" })
    const elite = untilSomebodyBreaks({ grade: "elite" })
    expect(conscript.lost).toBeLessThan(elite.lost)
    expect(conscript.battle.time).toBeLessThan(elite.battle.time)
  })

  it("says why, in the words of the rule that fired", () => {
    const { battle, broken } = untilSomebodyBreaks()
    const said = battle.dispatches.filter((d) => d.unitId === broken.id).at(-1)?.text
    expect(said).toBe(`${broken.name} broke, and is running for the rear`)
  })

  it("runs from what broke it, shedding men, and fires at nothing while it goes", () => {
    const { battle, broken } = untilSomebodyBreaks()
    const enemy = battle.units.find((u) => u.army !== broken.army)!
    const before = { gap: distance(broken.position, enemy.position), strength: broken.strength }
    expect(aim(battle, broken)).toBeNull()
    for (let i = 0; i < 300; i++) step(battle)
    expect(distance(broken.position, enemy.position)).toBeGreaterThan(before.gap)
    expect(broken.strength).toBeLessThan(before.strength)
    expect(battle.volleys.every((v) => v.unitId !== broken.id)).toBe(true)
  })

  it("holds a Routing Unit out of the marching rules, mob before bridge", () => {
    const { broken } = untilSomebodyBreaks()
    expect(broken.suspendedBy).toBe("broke, and is running for the rear")
  })

  it("is deaf while it Routs: the rider finds nobody to hand the Order to", () => {
    const { battle, broken } = untilSomebodyBreaks()
    issueOrder(battle, broken.id, { kind: "halt" }, { ...broken.position })
    for (let i = 0; i < 20; i++) step(battle)
    expect(battle.couriers).toHaveLength(0)
    expect(broken.order).toBeNull()
    expect(battle.dispatches.at(-1)?.text).toContain("found nobody to take it")
  })

  it("Rallies once it is clear and steady, and pays for it with the Ceiling", () => {
    const { battle, broken } = untilSomebodyBreaks()
    while (battle.time < 1800 && isRouting(broken) && battle.units.includes(broken)) step(battle)
    expect(isRouting(broken)).toBe(false)
    expect(canRally(battle, broken)).toBe(false)
    // It Breaks sooner the next time, because it can never be as steady again.
    expect(broken.moraleCeiling).toBeLessThan(1)
    expect(broken.morale).toBeLessThanOrEqual(broken.moraleCeiling)
  })

  it("takes a Rout that runs off the Field out of the battle", () => {
    // The conscripts have the edge of the Field at their backs and elite
    // infantry in front of them, so it is settled which way this goes.
    const { french, austrian, battle } = firefight()
    french.grade = "conscript"
    french.position = { x: 60, y: 1000 }
    austrian.grade = "elite"
    austrian.position = { x: 140, y: 1000 }
    while (battle.time < 1800 && battle.units.length === 2) step(battle)
    expect(battle.units).toHaveLength(1)
    expect(battle.dispatches.at(-1)?.text).toContain("quit the Field")
  })

  it("runs along a river at its back rather than standing against it", () => {
    // A mob does not pick its way, but it does not stand in the shallows and
    // wait to be shot either. Water down the whole west edge, the enemy to the
    // east, so the way it breaks is the one way it cannot go.
    const field = blankField(120, 120)
    const water = GROUNDS.indexOf("water")
    for (let cy = 0; cy < field.height; cy++) {
      for (let cx = 0; cx < 30; cx++) field.ground[cellIndex(field, cx, cy)] = water
    }
    const mob = battalion({ position: { x: 250, y: 500 }, morale: 0 })
    const austrian = battalion({
      id: "au",
      army: "austrian",
      position: { x: 400, y: 500 },
      facing: Math.PI,
    })
    const battle = emptyBattle(field, [mob, austrian])
    step(battle)
    expect(isRouting(mob)).toBe(true)
    const brokeAt = { ...mob.position }

    for (let i = 0; i < 600 && battle.units.includes(mob); i++) step(battle)
    // It got somewhere. Where hardly matters — along the bank, over a bridge if
    // there were one, off the edge of the Field — but not nowhere.
    expect(distance(mob.position, brokeAt)).toBeGreaterThan(100)
    // And it never turned round into what it was running from.
    expect(mob.position.x).toBeLessThanOrEqual(brokeAt.x)
  })

  it("holds the side it turned to, so a bank on the slant is run along and not danced on", () => {
    // The bank at forty-five degrees, which is the one the straight edge above
    // does not catch. Both quarter turns off the heading it broke on are open
    // ground here, and which of them is open is settled by the cell edge the
    // Unit happens to be standing on — so choosing afresh every step had the
    // mob step a foot north, find that turn shut and the other open, and step
    // the foot back. It spun end for end ten times a second and held its
    // ground for the rest of the afternoon.
    const field = blankField(120, 120)
    const water = GROUNDS.indexOf("water")
    for (let cy = 0; cy < field.height; cy++) {
      for (let cx = 0; cx < field.width; cx++) {
        if (cx + cy < 100) field.ground[cellIndex(field, cx, cy)] = water
      }
    }
    const mob = battalion({ position: { x: 350, y: 496 }, morale: 0 })
    const austrian = battalion({
      id: "au",
      army: "austrian",
      position: { x: 490, y: 496 },
      facing: Math.PI,
    })
    const battle = emptyBattle(field, [mob, austrian])
    step(battle)
    expect(isRouting(mob)).toBe(true)
    const brokeAt = { ...mob.position }

    // A mob hugging a bank on the slant does swing between the heading it
    // broke on and its deflection, taking a little ground west whenever the
    // bank allows it — over seconds, which is a Unit working its way down a
    // bank. What it must never do is swing back inside a tenth of a second,
    // which is a Unit going nowhere.
    let flaps = 0
    let turn = 0
    for (let i = 0; i < 1200 && battle.units.includes(mob); i++) {
      const was = mob.facing
      step(battle)
      const swing = mob.facing - was
      if (swing !== 0 && turn !== 0 && Math.sign(swing) !== Math.sign(turn)) flaps++
      turn = swing
    }
    expect(flaps).toBe(0)
    // And it got down the bank rather than standing on it.
    expect(distance(mob.position, brokeAt)).toBeGreaterThan(200)
  })

  it("costs more Morale from behind than in the teeth, casualties being equal", () => {
    const front = battalion({ position: { x: 500, y: 500 } })
    const behind = battalion({ position: { x: 500, y: 500 } })
    shake(front, 30, { x: 600, y: 500 })
    shake(behind, 30, { x: 400, y: 500 })
    expect(behind.morale).toBeLessThan(front.morale)
  })

  it("thins a shaken battalion's fire, which is the only way Grade reaches lethality", () => {
    const steady = battalion({ id: "s" })
    const shaken = battalion({ id: "k", morale: 0.2 })
    const target = battalion({
      id: "t",
      army: "austrian",
      position: { x: 160, y: 100 },
      facing: Math.PI,
    })
    const battle = emptyBattle(blankField(60, 40), [steady, shaken, target])
    expect(volleyCasualties(shaken, aim(battle, shaken)!)).toBeLessThan(
      volleyCasualties(steady, aim(battle, steady)!) * 0.8,
    )
  })

  it("gives a conscript and an elite battalion the same Volley, Morale being equal", () => {
    const conscript = battalion({ id: "c", grade: "conscript" })
    const elite = battalion({ id: "e", grade: "elite" })
    const target = battalion({
      id: "t",
      army: "austrian",
      position: { x: 160, y: 100 },
      facing: Math.PI,
    })
    const battle = emptyBattle(blankField(60, 40), [conscript, elite, target])
    expect(volleyCasualties(conscript, aim(battle, conscript)!)).toBeCloseTo(
      volleyCasualties(elite, aim(battle, elite)!),
    )
  })

  it("reports Morale in words, never as a bar to count down", () => {
    expect(describeMorale(battalion())).toBe("steady")
    expect(describeMorale(battalion({ morale: 0.6 }))).toBe("wavering")
    expect(describeMorale(battalion({ morale: 0.3 }))).toBe("shaken")
    expect(describeMorale(battalion({ morale: 0.1 }))).toBe("on the point of breaking")
  })
})

describe("C6 Fighting — the Charge", () => {
  /** A regiment of horse: four hundred sabres in two ranks, two hundred metres of them. */
  function regiment(overrides: Partial<Unit> = {}): Unit {
    return battalion({
      id: "ca",
      name: "1er Hussards",
      arm: "cavalry",
      strength: 400,
      formation: "line",
      facing: 0,
      ...overrides,
    })
  }

  /** Stand the horse so the two Footprints are `gap` metres apart, due west. */
  function place(horse: Unit, target: Unit, gap: number): void {
    const axis = { x: 1, y: 0 }
    const mine = spanAlong(unitFootprint(horse), horse.facing, axis)
    const theirs = spanAlong(unitFootprint(target), target.facing, axis)
    horse.position = { x: target.position.x - (gap + (mine + theirs) / 2), y: target.position.y }
  }

  function targetOf(overrides: Partial<Unit> = {}): Unit {
    return battalion({
      id: "au",
      army: "austrian",
      name: "IR 23",
      position: { x: 1000, y: 1000 },
      facing: Math.PI,
      ...overrides,
    })
  }

  /** Horse `gap` metres short of a battalion, with the Order already in its hand. */
  function chargeAt(gap: number, target: Partial<Unit> = {}, horse: Partial<Unit> = {}) {
    const enemy = targetOf(target)
    const cavalry = regiment(horse)
    place(cavalry, enemy, gap)
    cavalry.order = {
      order: {
        id: "o1",
        unitId: cavalry.id,
        body: { kind: "charge", targetId: enemy.id },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }
    return { cavalry, enemy, battle: emptyBattle(blankField(250, 250), [cavalry, enemy]) }
  }

  /** The blocks already touching, and the Contact resolved on the spot. */
  function struck(target: Partial<Unit> = {}, horse: Partial<Unit> = {}) {
    const enemy = targetOf(target)
    const cavalry = regiment(horse)
    place(cavalry, enemy, 1)
    cavalry.charging = { targetId: enemy.id, launchedAt: 0, recoiling: false }
    const battle = emptyBattle(blankField(250, 250), [cavalry, enemy])
    resolveContact(battle, cavalry, enemy)
    return { battle, cavalry, enemy, contact: battle.contacts[0] }
  }

  /** Run the whole thing out and hand back the Contact it came to. */
  function untilItStrikes(gap: number, target: Partial<Unit> = {}) {
    const { cavalry, enemy, battle } = chargeAt(gap, target)
    while (battle.time < 600 && battle.contacts.length === 0) step(battle)
    return { cavalry, enemy, battle, contact: battle.contacts[0] }
  }

  describe("the countercharge", () => {
    /** Enemy horse committed to a Charge on a regiment of ours, `gap` metres short. */
    function comingOn(gap: number, ours: Partial<Unit> = {}) {
      const mine = regiment({ id: "fr-hus", army: "french", facing: Math.PI })
      Object.assign(mine, ours)
      mine.post = { ...mine.position }
      const theirs = regiment({ id: "au-hus", army: "austrian", name: "Hussar Nr. 4" })
      place(theirs, mine, gap)
      theirs.charging = { targetId: mine.id, launchedAt: 0, recoiling: false }
      theirs.order = {
        order: {
          id: "o1",
          unitId: theirs.id,
          body: { kind: "charge", targetId: mine.id },
          issuedAt: 0,
        },
        arrivedAt: 0,
      }
      return { mine, theirs, battle: emptyBattle(blankField(250, 250), [mine, theirs]) }
    }

    it("lets the horse go at what is coming on, on its own account", () => {
      const { mine, theirs, battle } = comingOn(CHARGE_RANGE - 20)
      applyInitiative(mine, battle)
      expect(mine.charging?.targetId).toBe(theirs.id)
      expect(mine.suspendedBy).toBe("countercharged the horse coming on")
    })

    it("stands still for anything further off than a Charge's run-in", () => {
      const { mine, battle } = comingOn(CHARGE_RANGE + 40)
      applyInitiative(mine, battle)
      expect(mine.charging).toBeNull()
    })

    it("needs a Charge coming on, and not the sight of horse", () => {
      const { mine, theirs, battle } = comingOn(60)
      theirs.charging = null
      theirs.order = null
      applyInitiative(mine, battle)
      expect(mine.charging).toBeNull()
    })

    it("leaves a battalion to make square instead, which is its own answer", () => {
      const foot = battalion({ army: "french", position: { x: 800, y: 1000 }, facing: 0 })
      foot.post = { ...foot.position }
      const theirs = regiment({ id: "au-hus", army: "austrian" })
      place(theirs, foot, 100)
      theirs.charging = { targetId: foot.id, launchedAt: 0, recoiling: false }
      const battle = emptyBattle(blankField(250, 250), [foot, theirs])
      applyInitiative(foot, battle)
      expect(foot.charging).toBeNull()
      expect(foot.changing?.to).toBe("square")
    })

    it("does not argue with a Charge the player gave it", () => {
      const { mine, battle } = comingOn(CHARGE_RANGE - 20)
      const other = regiment({ id: "au-2", army: "austrian", position: { x: 1200, y: 1200 } })
      battle.units.push(other)
      mine.order = {
        order: {
          id: "p1",
          unitId: mine.id,
          body: { kind: "charge", targetId: other.id },
          issuedAt: 0,
        },
        arrivedAt: 0,
      }
      applyInitiative(mine, battle)
      // The Order stands: it is aimed at the far regiment, not at the near one.
      expect(mine.suspendedBy).toBeNull()
      expect(mine.charging).toBeNull()
    })

    it("runs the countercharge with no Order behind it, and comes to Contact", () => {
      const { mine, battle } = comingOn(CHARGE_RANGE - 20)
      const from = mine.position.x
      while (battle.time < 600 && battle.contacts.length === 0) step(battle)
      expect(battle.contacts).toHaveLength(1)
      // It met them: the regiment covered ground toward the charge rather than
      // standing where it was, and nothing but the Charge state carried it.
      expect(mine.position.x).toBeLessThan(from - 20)
    })

    it("takes the exchange with it rather than losing one for nothing", () => {
      const met = comingOn(CHARGE_RANGE - 20)
      while (met.battle.time < 600 && met.battle.contacts.length === 0) step(met.battle)
      const contact = met.battle.contacts[0]
      // Both were at the gallop, so both paid a running Unit's price. Standing
      // to receive costs a regiment everything and the enemy nothing, which is
      // the whole reason the horse does not wait to be told.
      expect(contact.casualties).toBeCloseTo(contact.targetCasualties)
      expect(met.theirs.morale).toBeLessThan(0)
    })

    it("gives the Order back afterwards, because Initiative never cancels one", () => {
      const { mine, battle } = comingOn(CHARGE_RANGE - 20)
      const errand = {
        order: {
          id: "m1",
          unitId: mine.id,
          body: {
            kind: "move" as const,
            destination: { x: 200, y: 1000 },
            arrivalFacing: 0,
            arrivalFormation: "line" as const,
          },
          issuedAt: 0,
        },
        arrivedAt: 0,
      }
      mine.order = errand
      applyInitiative(mine, battle)
      expect(mine.charging).not.toBeNull()
      while (battle.time < 900 && mine.charging !== null) step(battle)
      // The errand is still in its hand: the Charge was never the Order.
      expect(mine.order).toBe(errand)
    })

    it("keeps the Order suspended for the whole run, and does not relaunch it", () => {
      const { mine, battle } = comingOn(CHARGE_RANGE - 20)
      applyInitiative(mine, battle)
      const launched = mine.charging!.launchedAt
      battle.time += 5
      applyInitiative(mine, battle)
      expect(mine.charging!.launchedAt).toBe(launched)
      expect(mine.suspendedBy).toBe("countercharged the horse coming on")
    })

    it("countercharges on hold ground, which is the brief nobody writes", () => {
      const { mine, battle } = comingOn(CHARGE_RANGE - 20)
      expect(mine.standing.latitude).toBe("hold-ground")
      applyInitiative(mine, battle)
      // Preservation is not Latitude: a leash of zero must not mean standing to
      // receive a charge in every battle with no Standing Order written for it.
      expect(mine.charging).not.toBeNull()
    })
  })

  it("pays impetus to whichever side is running, and not to whichever struck", () => {
    // Horse against horse, so both sides can bring a run to the Contact.
    const opposing = { arm: "cavalry" as const, strength: 400, formation: "line" as const }
    // Standing to receive: the target brings nothing, and the arithmetic is
    // what it always was.
    const still = struck(opposing)
    // Met head-on: both are at the gallop, so both pay a running Unit's price.
    const met = struck({
      ...opposing,
      charging: { targetId: "ca", launchedAt: 0, recoiling: false },
    })
    expect(met.contact.casualties).toBeCloseTo(still.contact.casualties * 2)
    // What the chargers deal is untouched by it either way: impetus is read off
    // each side's own motion, so answering a Charge does not blunt it.
    expect(met.contact.targetCasualties).toBeCloseTo(still.contact.targetCasualties)
  })

  it("pays a recoiling Unit nothing, because it is running the other way", () => {
    const opposing = { arm: "cavalry" as const, strength: 400, formation: "line" as const }
    const still = struck(opposing)
    const thrownBack = struck({
      ...opposing,
      charging: { targetId: "ca", launchedAt: 0, recoiling: true },
    })
    expect(thrownBack.contact.casualties).toBeCloseTo(still.contact.casualties)
  })

  it("is for the two Arms that can run at somebody, and not for the guns", () => {
    expect(canCharge("cavalry")).toBe(true)
    expect(canCharge("infantry")).toBe(true)
    expect(canCharge("artillery")).toBe(false)
  })

  it("walks up at the Formation's pace, and only runs the last hundred and fifty metres", () => {
    const far = chargeAt(CHARGE_RANGE + 250)
    const near = chargeAt(CHARGE_RANGE - 50)
    const walked = -far.cavalry.position.x
    const ran = -near.cavalry.position.x
    for (let i = 0; i < 10; i++) {
      step(far.battle)
      step(near.battle)
    }
    // A second of each: the Formation's 2.5 m/s against the gallop's 7.
    expect(walked + far.cavalry.position.x).toBeCloseTo(2.5, 1)
    expect(ran + near.cavalry.position.x).toBeCloseTo(7, 1)
  })

  it("has no Face to strike while it is changing Formation, however it is standing", () => {
    const caught = targetOf({ changing: { from: "line", to: "square", elapsed: 5, duration: 30 } })
    // Head-on, and still nothing: half its files are between two layouts.
    expect(struckSide(caught, { x: 0, y: 1000 })).toBeNull()
    expect(struckSide(targetOf(), { x: 0, y: 1000 })).toBe(0)
  })

  it("undoes a battalion caught in march column, which has no Face to offer at all", () => {
    const { cavalry, enemy, contact } = struck({
      formation: "march-column",
      order: {
        order: {
          id: "p1",
          unitId: "au",
          body: { kind: "form", formation: "march-column" },
          issuedAt: 0,
        },
        arrivedAt: 0,
      },
    })
    expect(contact.side).toBeNull()
    expect(contact.outcome).toBe("broke")
    expect(isRouting(enemy)).toBe(true)
    // Off a Face there is no fight, so the charge is not paid for at all.
    expect(contact.casualties).toBe(0)
    expect(cavalry.strength).toBe(400)
  })

  it("makes square worth the drill out of Frontage alone, with no rule of its own", () => {
    const line = struck({ formation: "line" })
    const square = struck({ formation: "square" })
    expect(line.contact.side).toBe(0)
    expect(square.contact.side).toBe(0)
    // A quarter of the Frontage means a quarter of the sabres reach it. Nothing
    // in C6 knows what a square is; it knows how wide one is.
    expect(square.contact.width).toBeLessThan(line.contact.width / 3)
    expect(square.contact.targetCasualties).toBeLessThan(line.contact.targetCasualties / 3)
    expect(square.enemy.morale).toBeGreaterThan(line.enemy.morale)
  })

  it("is thrown back by a steady line and carries a shaken one, the geometry being equal", () => {
    expect(struck({ morale: 1 }).contact.outcome).toBe("recoiled")
    expect(struck({ morale: 0.4 }).contact.outcome).toBe("broke")
  })

  it("decides by Morale and not by Strength: the loser Breaks with most of its men", () => {
    const { enemy, contact } = struck({ morale: 0.4 })
    expect(contact.outcome).toBe("broke")
    expect(1 - enemy.strength / 700).toBeLessThan(0.15)
    expect(enemy.strength).toBeGreaterThan(500)
  })

  it("beats cavalry that received it standing, which is why you countercharge", () => {
    const { cavalry, enemy, contact } = struck({
      id: "au",
      army: "austrian",
      name: "Husaren 5",
      arm: "cavalry",
      strength: 400,
      formation: "line",
      facing: Math.PI,
    })
    // The Contact names the outcome; the Rout itself is Morale's to declare, on
    // the tick after, through the rule that gets to say why.
    expect(contact.outcome).toBe("broke")
    expect(enemy.morale).toBeLessThanOrEqual(0)
    expect(cavalry.morale).toBeGreaterThan(0)
  })

  it("keeps a Contact only for the step it was struck in", () => {
    const { battle } = untilItStrikes(6, { morale: 1 })
    expect(battle.contacts).toHaveLength(1)
    step(battle)
    expect(battle.contacts).toHaveLength(0)
  })

  it("lets a battalion make square against a charge let go at a distance", () => {
    const { enemy, contact } = untilItStrikes(290)
    expect(enemy.formation).toBe("square")
    expect(contact.side).not.toBeNull()
    expect(contact.outcome).toBe("recoiled")
  })

  it("catches it half-formed when the charge is let go from a hundred and forty metres", () => {
    // Thirty seconds of drill against twenty of gallop. Initiative tries, and
    // trying is worse than standing: a battalion mid-drill has no Face at all.
    const { enemy, contact } = untilItStrikes(140)
    expect(contact.side).toBeNull()
    expect(isRouting(enemy)).toBe(true)
  })

  it("rides clear when it is thrown back, keeping its shape, which a Rout does not", () => {
    const { cavalry, enemy, battle } = chargeAt(6, { formation: "square" })
    while (battle.time < 600 && cavalry.order !== null) step(battle)
    expect(cavalry.charging).toBeNull()
    expect(isRouting(cavalry)).toBe(false)
    expect(cavalry.formation).toBe("line")
    expect(gapTo(cavalry, enemy)).toBeGreaterThanOrEqual(RECOIL_DISTANCE)
  })

  it("pulls up rather than pursuing, because Pursuit is not built", () => {
    const { cavalry, enemy, battle } = chargeAt(80)
    enemy.routing = { heading: 0, brokeAt: 0 }
    step(battle)
    expect(cavalry.order).toBeNull()
    expect(cavalry.charging).toBeNull()
    expect(battle.dispatches.some((d) => d.text.includes("pulled up"))).toBe(true)
  })

  it("does not offer a Unit it would only pull up in front of", () => {
    // What the screen outlines while a Charge is being aimed, and what the
    // press will spend a Courier on. It has to agree with the pull-up above, or
    // the player buys ninety seconds of ride and gets a regiment standing still.
    const formed = { army: "austrian", routing: false }
    expect(chargeable(formed, "french")).toBe(true)
    expect(chargeable({ ...formed, routing: true }, "french")).toBe(false)
    expect(chargeable({ ...formed, army: "french" }, "french")).toBe(false)
  })

  it("costs a Unit with nothing turned toward the charge three times the nerve", () => {
    const horse = regiment()
    const facing = targetOf()
    const exposed = targetOf()
    dread(facing, horse, false, 10)
    dread(exposed, horse, true, 10)
    expect(1 - facing.morale).toBeGreaterThan(0)
    expect(1 - exposed.morale).toBeCloseTo((1 - facing.morale) * 3, 5)
  })
})

describe("C7 Army Break, and C8 the end of a battle", () => {
  function army(id: string, name: string, weight: number): Battle["armies"][number] {
    return { id, name, colour: 0, headquarters: null, weight, strength: 0, units: weight }
  }

  /** `count` line battalions of one army, spread far enough apart to be alone. */
  function brigade(id: string, at: number, count: number): Unit[] {
    return Array.from({ length: count }, (_, i) =>
      battalion({
        id: `${id}${i}`,
        army: id,
        name: `${id} ${i}`,
        position: { x: at, y: 100 + i * 160 },
      }),
    )
  }

  function running(unit: Unit): Unit {
    unit.routing = { heading: Math.PI, brokeAt: 0 }
    unit.morale = 0
    return unit
  }

  it("weighs an elite Unit at twice a conscript one, which is all the weighting is for", () => {
    expect(unitWeight(battalion({ grade: "elite" }))).toBe(
      unitWeight(battalion({ grade: "conscript" })) * 2,
    )
  })

  it("weighs Units and not men, so a squadron costs the army what a battalion does", () => {
    // Wrong about bodies and right about the line: what the army has lost is a
    // place in it, and the gap is the same width either way.
    expect(unitWeight(battalion({ arm: "cavalry", strength: 220 }))).toBe(
      unitWeight(battalion({ strength: 700 })),
    )
  })

  it("breaks an army only once it has nothing left in hand", () => {
    const units = brigade("french", 200, 4)
    const battle = emptyBattle(blankField(200, 120), units, [army("french", "French", 4)])
    const french = battle.armies[0]

    expect(shareGone(battle, french)).toBe(0)
    running(units[0])
    expect(shareGone(battle, french)).toBeCloseTo(0.25, 5)
    // Half an army running is a mauling and not a result. Under the third this
    // was, the battle was already over here (ADR-0006).
    running(units[1])
    expect(shareGone(battle, french)).toBeCloseTo(0.5, 5)
    expect(hasArmyBroken(battle, french)).toBe(false)
    running(units[2])
    expect(hasArmyBroken(battle, french)).toBe(false)
    running(units[3])
    expect(shareGone(battle, french)).toBeCloseTo(1, 5)
    expect(shareGone(battle, french)).toBeGreaterThanOrEqual(ARMY_BREAK)
    expect(hasArmyBroken(battle, french)).toBe(true)
  })

  it("is unmoved by casualties, so an army is never counted down to nothing", () => {
    const units = brigade("french", 200, 4)
    const battle = emptyBattle(blankField(200, 120), units, [army("french", "French", 4)])
    // The whole brigade shot to a tenth of itself and still in its ranks. F11
    // says a battle never ends by annihilation, and this is the half of it that
    // is C7's: Units that have Broken are what Army Break counts.
    for (const unit of units) unit.strength = 70
    expect(shareGone(battle, battle.armies[0])).toBe(0)
  })

  it("counts a column still on the road, so a battle does not end while one is coming", () => {
    const units = brigade("french", 200, 3)
    const battle = emptyBattle(blankField(200, 120), units, [army("french", "French", 4)])
    battle.arrivals.push({
      at: 600,
      unit: battalion({ id: "fr-late", army: "french", name: "9e Légère" }),
      entry: { x: 8, y: 400 },
      order: null,
    })
    for (const unit of units) running(unit)

    expect(hasArmyBroken(battle, battle.armies[0])).toBe(false)
    // The same Field with nothing on the road is an army that has lost. This is
    // the one conflict §6 flags between Army Break and Arrival, and the whole
    // of the resolution is which side of the count the road sits on.
    battle.arrivals = []
    expect(hasArmyBroken(battle, battle.armies[0])).toBe(true)
  })

  it("lets a Rally take an army back off the edge, because the cascade is the thing", () => {
    const units = brigade("french", 200, 4)
    const battle = emptyBattle(blankField(200, 120), units, [army("french", "French", 4)])
    for (const unit of units) running(unit)
    expect(hasArmyBroken(battle, battle.armies[0])).toBe(true)
    units[0].routing = null
    expect(hasArmyBroken(battle, battle.armies[0])).toBe(false)
  })

  it("ends the battle at Army Break and leaves the Field to the other army", () => {
    const units = [...brigade("french", 200, 4), ...brigade("austrian", 1400, 4)]
    const battle = emptyBattle(blankField(200, 120), units, [
      army("french", "French", 4),
      army("austrian", "Austrian", 4),
    ])
    for (const unit of units.filter((u) => u.army === "french")) running(unit)

    step(battle)
    expect(isOver(battle)).toBe(true)
    expect(battle.outcome?.by).toBe("army-break")
    expect(battle.outcome?.winner).toBe("austrian")
    expect(battle.dispatches.some((d) => d.text.includes("quitting the Field"))).toBe(true)
  })

  it("keeps the Outcome it first wrote, so the end of a battle is decided once", () => {
    const units = [...brigade("french", 200, 4), ...brigade("austrian", 1400, 4)]
    const battle = emptyBattle(blankField(200, 120), units)
    for (const unit of units.filter((u) => u.army === "french")) running(unit)
    step(battle)
    const decided = battle.outcome
    running(units[4])
    running(units[5])
    step(battle)
    expect(battle.outcome).toBe(decided)
    expect(battle.outcome?.winner).toBe("austrian")
  })

  it("does not end on the clock alone before the clock", () => {
    const battle = emptyBattle(blankField(200, 120), brigade("french", 200, 4), [
      army("french", "French", 4),
    ])
    battle.clock = 60
    while (battle.time < 59) step(battle)
    expect(isOver(battle)).toBe(false)
    while (!isOver(battle) && battle.time < 120) step(battle)
    expect(battle.outcome?.by).toBe("condition")
    expect(battle.time).toBeCloseTo(60, 5)
  })

  it("gives Key Ground to the last army that stood on it uncontested", () => {
    const holder = battalion({ id: "fr1", army: "french", position: { x: 400, y: 100 } })
    const battle = emptyBattle(blankField(200, 120), [holder], [army("french", "French", 1)])
    battle.keyGround = [
      { name: "the bridge", position: { x: 400, y: 100 }, radius: 90, holder: null },
    ]

    step(battle)
    expect(battle.keyGround[0].holder).toBe("french")
    // Marched off it, and it is still French. Nobody has taken it since.
    holder.position = { x: 900, y: 100 }
    step(battle)
    expect(battle.keyGround[0].holder).toBe("french")
  })

  it("gives Key Ground both armies are standing on to the nearer of them", () => {
    const units = [
      battalion({ id: "au1", army: "austrian", position: { x: 440, y: 100 } }),
      battalion({ id: "fr1", army: "french", position: { x: 400, y: 100 } }),
    ]
    const battle = emptyBattle(blankField(200, 120), units, [
      army("french", "French", 1),
      army("austrian", "Austrian", 1),
    ])
    battle.keyGround = [
      { name: "the bridge", position: { x: 400, y: 100 }, radius: 90, holder: null },
    ]
    step(battle)
    expect(battle.keyGround[0].holder).toBe("french")

    // The French are pushed back to the far lip of it — still on the bridge,
    // no longer the nearest to it — and the Austrians take it off them.
    units[1].position = { x: 470, y: 100 }
    step(battle)
    expect(battle.keyGround[0].holder).toBe("austrian")
  })

  it("gives Key Ground to nobody while both armies are outside its radius", () => {
    const units = [
      battalion({ id: "fr1", army: "french", position: { x: 300, y: 100 } }),
      battalion({ id: "au1", army: "austrian", position: { x: 520, y: 100 } }),
    ]
    const battle = emptyBattle(blankField(200, 120), units, [
      army("french", "French", 1),
      army("austrian", "Austrian", 1),
    ])
    battle.keyGround = [
      { name: "the bridge", position: { x: 400, y: 100 }, radius: 90, holder: null },
    ]
    step(battle)
    expect(battle.keyGround[0].holder).toBeNull()
  })

  it("is not held by a mob running over it", () => {
    const mob = running(battalion({ id: "fr1", army: "french", position: { x: 400, y: 100 } }))
    const battle = emptyBattle(blankField(200, 120), [mob], [army("french", "French", 4)])
    battle.keyGround = [
      { name: "the bridge", position: { x: 400, y: 100 }, radius: 90, holder: null },
    ]
    step(battle)
    expect(battle.keyGround[0].holder).toBeNull()
  })

  it("counts the Key Ground when the clock runs out", () => {
    const holder = battalion({ id: "fr1", army: "french", position: { x: 400, y: 100 } })
    const battle = emptyBattle(blankField(200, 120), [holder], [army("french", "French", 1)])
    battle.keyGround = [
      { name: "the bridge", position: { x: 400, y: 100 }, radius: 90, holder: null },
    ]
    battle.clock = 30
    while (!isOver(battle) && battle.time < 60) step(battle)

    expect(battle.outcome?.by).toBe("key-ground")
    expect(battle.outcome?.winner).toBe("french")
    expect(battle.outcome?.keyGround).toEqual([{ name: "the bridge", holder: "french" }])
  })

  it("leaves the clock undecided when neither Key Ground nor condition separates them", () => {
    const battle = emptyBattle(
      blankField(200, 120),
      [...brigade("french", 200, 3), ...brigade("austrian", 700, 3)],
      [army("french", "French", 3), army("austrian", "Austrian", 3)],
    )
    battle.clock = 1
    while (!isOver(battle) && battle.time < 10) step(battle)
    expect(battle.outcome?.winner).toBeNull()
    expect(battle.dispatches.some((d) => d.text.includes("nothing to separate"))).toBe(true)
  })

  it("counts condition when the clock runs out with the Key Ground even", () => {
    const french = brigade("french", 200, 4)
    const battle = emptyBattle(
      blankField(200, 120),
      [...french, ...brigade("austrian", 700, 4)],
      [army("french", "French", 4), army("austrian", "Austrian", 4)],
    )
    // One French battalion in four running: a quarter of the army, past the
    // margin and short of the third that would have ended it outright.
    running(french[0])
    battle.clock = 1
    while (!isOver(battle) && battle.time < 10) step(battle)

    expect(battle.outcome?.by).toBe("condition")
    expect(battle.outcome?.winner).toBe("austrian")
    expect(battle.outcome?.keyGround).toEqual([])
  })

  it("counts the Key Ground ahead of condition", () => {
    const french = brigade("french", 200, 4)
    const battle = emptyBattle(
      blankField(200, 120),
      [...french, ...brigade("austrian", 700, 4)],
      [army("french", "French", 4), army("austrian", "Austrian", 4)],
    )
    battle.keyGround = [
      { name: "the bridge", position: { x: 200, y: 100 }, radius: 90, holder: null },
    ]
    // The French are in worse shape and hold the bridge anyway. Ground wins.
    running(french[1])
    battle.clock = 1
    while (!isOver(battle) && battle.time < 10) step(battle)
    expect(battle.outcome?.winner).toBe("french")
  })

  it("says condition decided it even where the winner holds Key Ground of its own", () => {
    const french = brigade("french", 200, 4)
    const battle = emptyBattle(
      blankField(200, 120),
      [...french, ...brigade("austrian", 700, 4)],
      [army("french", "French", 4), army("austrian", "Austrian", 4)],
    )
    // One piece apiece: level on ground, so the day turns on condition. The
    // Austrians win it while still standing on the farm, which is the case that
    // reading the ending off "the clock ran out" alone got wrong — it reported
    // a win on ground the Austrians had not taken more of.
    battle.keyGround = [
      { name: "the bridge", position: { x: 200, y: 100 }, radius: 90, holder: null },
      { name: "the farm", position: { x: 700, y: 100 }, radius: 90, holder: null },
    ]
    // Not the battalion on the bridge — a Rout would give the bridge up and
    // put the Austrians ahead on ground, which is the other case entirely.
    running(french[1])
    battle.clock = 1
    while (!isOver(battle) && battle.time < 10) step(battle)

    expect(battle.outcome?.by).toBe("condition")
    expect(battle.outcome?.winner).toBe("austrian")
    expect(battle.outcome?.keyGround).toEqual([
      { name: "the bridge", holder: "french" },
      { name: "the farm", holder: "austrian" },
    ])
  })

  it("leaves the Field to the enemy when a commander breaks off the action", () => {
    const battle = emptyBattle(
      blankField(200, 120),
      [...brigade("french", 200, 4), ...brigade("austrian", 700, 4)],
      [army("french", "French", 4), army("austrian", "Austrian", 4)],
    )
    battle.clock = 3600
    step(battle)
    concede(battle, "french")

    expect(isOver(battle)).toBe(true)
    expect(battle.outcome?.by).toBe("conceded")
    expect(battle.outcome?.winner).toBe("austrian")
    expect(battle.dispatches.some((d) => d.text.includes("breaks off the action"))).toBe(true)
  })

  it("does not let a commander bank the Key Ground he is sitting on", () => {
    const battle = emptyBattle(
      blankField(200, 120),
      [...brigade("french", 200, 4), ...brigade("austrian", 700, 4)],
      [army("french", "French", 4), army("austrian", "Austrian", 4)],
    )
    battle.keyGround = [
      { name: "the bridge", position: { x: 200, y: 100 }, radius: 90, holder: null },
    ]
    battle.clock = 3600
    step(battle)
    expect(battle.keyGround[0].holder).toBe("french")

    // Holding the only piece on the Field, and quitting it still loses: an
    // army that has gone has left what it was standing on.
    concede(battle, "french")
    expect(battle.outcome?.winner).toBe("austrian")
    expect(battle.outcome?.keyGround).toEqual([{ name: "the bridge", holder: "french" }])
  })

  it("does not reopen a battle that is already decided", () => {
    const battle = emptyBattle(blankField(200, 120), brigade("french", 200, 4), [
      army("french", "French", 4),
    ])
    battle.clock = 1
    while (!isOver(battle) && battle.time < 10) step(battle)
    const decided = battle.outcome

    concede(battle, "french")
    expect(battle.outcome).toBe(decided)
  })
})

describe("the Return", () => {
  function army(
    id: string,
    name: string,
    weight: number,
    strength: number,
  ): Battle["armies"][number] {
    // Every battalion in these fixtures is line Grade, so one Unit weighs one
    // and the count and the weight are the same number.
    return { id, name, colour: 0x2f4d8f, headquarters: null, weight, strength, units: weight }
  }

  function brigade(id: string, at: number, count: number): Unit[] {
    return Array.from({ length: count }, (_, i) =>
      battalion({ id: `${id}${i}`, army: id, position: { x: at, y: 100 + i * 160 } }),
    )
  }

  it("separates Units in hand from Units running, and counts the men against what was mustered", () => {
    const french = brigade("french", 200, 4)
    const battle = emptyBattle(blankField(200, 120), french, [army("french", "French", 4, 2800)])
    french[0].routing = { heading: 0, brokeAt: 0 }
    french[1].strength -= 200

    const [row] = armyReturns(battle)
    expect(row.inHand).toBe(3)
    expect(row.running).toBe(1)
    expect(row.mustered).toBe(2800)
    expect(row.mustered - row.strength).toBe(200)
    expect(row.towardBreak).toBeCloseTo(0.25, 5)
    expect(row.gone).toBe(0)
  })

  it("counts a Unit that ran clean off the Field as gone", () => {
    const french = brigade("french", 200, 3)
    // Four mustered and three still somewhere: the fourth ran off the edge and
    // was cleared, which leaves nothing behind but the hole in the count.
    const battle = emptyBattle(blankField(200, 120), french, [army("french", "French", 4, 2800)])

    const [row] = armyReturns(battle)
    expect(row.inHand).toBe(3)
    expect(row.running).toBe(0)
    expect(row.gone).toBe(1)
    expect(row.towardBreak).toBeCloseTo(0.25, 5)
  })

  it("counts a Unit still on the road as mustered and not as in hand", () => {
    const french = brigade("french", 200, 2)
    const battle = emptyBattle(blankField(200, 120), french, [army("french", "French", 3, 2100)])
    battle.arrivals = [
      {
        at: 600,
        unit: battalion({ id: "fr9", army: "french" }),
        entry: { x: 0, y: 0 },
        order: null,
      },
    ]

    const [row] = armyReturns(battle)
    expect(row.inHand).toBe(2)
    // Two of three on the Field and the third on the road, so nothing is gone.
    expect(row.gone).toBe(0)
    expect(row.towardBreak).toBeCloseTo(0, 5)
  })

  it("names the Key Ground under the army that ended on it", () => {
    const battle = emptyBattle(
      blankField(200, 120),
      [...brigade("french", 200, 1), ...brigade("austrian", 700, 1)],
      [army("french", "French", 1, 700), army("austrian", "Austrian", 1, 700)],
    )
    battle.keyGround = [
      { name: "the bridge", position: { x: 200, y: 100 }, radius: 90, holder: null },
      { name: "the farm", position: { x: 700, y: 100 }, radius: 90, holder: null },
    ]
    step(battle)

    const [french, austrian] = armyReturns(battle)
    expect(french.keyGround).toEqual(["the bridge"])
    expect(austrian.keyGround).toEqual(["the farm"])
  })
})

describe("taking an Army", () => {
  function bothArmies(): Battle {
    const battle = emptyBattle(blankField(200, 120), [
      battalion({ id: "fr-1", army: "french" }),
      battalion({ id: "au-1", army: "austrian" }),
    ])
    battle.arrivals = [
      {
        at: 300,
        unit: battalion({ id: "fr-2", army: "french" }),
        entry: { x: 0, y: 100 },
        order: null,
      },
    ]
    const at = (unitId: string) => ({
      at: 60,
      unitId,
      body: {
        kind: "move" as const,
        destination: { x: 400, y: 100 },
        arrivalFacing: 0,
        arrivalFormation: "line" as const,
      },
    })
    battle.plan = [at("fr-1"), at("au-1"), at("fr-2")]
    return battle
  }

  it("drops the Plan for the army the player has taken, and leaves the enemy's", () => {
    const battle = bothArmies()
    takeCommand(battle, "french")
    expect(battle.plan.map((p) => p.unitId)).toEqual(["au-1"])
  })

  it("drops it for a Unit still on the road, which is already somebody's", () => {
    const battle = bothArmies()
    takeCommand(battle, "austrian")
    expect(battle.plan.map((p) => p.unitId)).toEqual(["fr-1", "fr-2"])
  })
})
