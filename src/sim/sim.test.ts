import { describe, expect, it } from "vitest"
import { STEP, step, unitSpeed } from "./battle"
import { blankField } from "./scenario"
import { cellIndex } from "./field"
import {
  baseSpeed,
  beginChange,
  drillSeconds,
  faces,
  figureSlots,
  fireZone,
  frontage,
  poseOf,
  slots,
} from "./formation"
import { GROUND_COST, GROUNDS, movementCost } from "./ground"
import { aim, reloadSeconds, resolveFire, volleyCasualties } from "./fighting"
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
    reload: 0,
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
    volleys: [],
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
    expect(battle.dispatches.at(-1)?.text).toContain("destroyed")
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
