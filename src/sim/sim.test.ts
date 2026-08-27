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
  spanAlong,
  unitFootprint,
} from "./formation"
import { GROUND_COST, GROUNDS, movementCost } from "./ground"
import { aim, reloadSeconds, resolveFire, volleyCasualties } from "./fighting"
import {
  canCharge,
  CHARGE_RANGE,
  gapTo,
  RECOIL_DISTANCE,
  resolveContact,
  struckSide,
} from "./charge"
import { canRally, describeMorale, dread, isRouting, shake } from "./morale"
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
    morale: 1,
    moraleCeiling: 1,
    routing: null,
    charging: null,
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
    contacts: [],
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
