import { describe, expect, it } from "vitest"
import { STEP, step, unitSpeed } from "./battle"
import { blankField } from "./scenario"
import { cellIndex } from "./field"
import { baseSpeed, drillSeconds, faces, figureSlots, frontage, poseOf, slots } from "./formation"
import { GROUNDS } from "./ground"
import { COURIER_SPEED, estimateDelay, ghosts, issueOrder } from "./orders"
import { clearLine, route } from "./routing"
import type { Battle, Field, Unit } from "./types"
import { distance } from "./vec"

function battalion(overrides: Partial<Unit> = {}): Unit {
  return {
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
    ...overrides,
  }
}

function emptyBattle(field: Field, units: Unit[]): Battle {
  return {
    time: 0,
    field,
    armies: [{ id: "french", name: "French", colour: 0x2c7c40, headquarters: null }],
    units,
    couriers: [],
    dispatches: [],
    crossings: [],
    keyGround: [],
    arrivals: [],
    plan: [],
    clock: 2400,
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

  it("gives a square four Faces and a march column none", () => {
    expect(faces("infantry", "square")).toBe(4)
    expect(faces("infantry", "line")).toBe(1)
    expect(faces("infantry", "march-column")).toBe(0)
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
