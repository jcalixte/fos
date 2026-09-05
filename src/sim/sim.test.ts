import { describe, expect, it } from "bun:test"
import { concede, isOver, STEP, step, unitSpeed } from "./battle"
import { isDisordered } from "./disorder"
import { blankField, entryToUnit, takeCommand } from "./scenario"
import { snapshot } from "./snapshot"
import { cellIndex } from "./field"
import {
  baseSpeed,
  beginChange,
  drillSeconds,
  faces,
  figureSlots,
  fireZone,
  firesOnTheMove,
  formationsFor,
  frontage,
  gapToPoint,
  mobRadius,
  overlaps,
  poseOf,
  reachOnBearing,
  slots,
  spanAlong,
  unitFootprint,
} from "./formation"
import { GROUND_COST, GROUNDS, movementCost } from "./ground"
import { aim, beatsPoint, reloadSeconds, resolveFire, volleyCasualties } from "./fighting"
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
  hasBroken,
  stiffening,
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
import type { Arm, Battle, Field, FormationName, Grade, Unit, Vec2 } from "./types"
import { distance, rotate } from "./vec"

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
    settling: 0,
    fatigue: 0,
    blown: false,
    disorder: 0,
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

  it("charges the way back by how far the Unit had got, and no further", () => {
    const unit = battalion()
    const off = drillSeconds("infantry", "line", "line", "march-column")
    const back = drillSeconds("infantry", "line", "march-column", "line")
    expect(beginChange(unit, "march-column")).toBe(true)
    // Ten seconds into filing off, so two fifths of the way there.
    unit.changing!.elapsed = 10
    expect(beginChange(unit, "line")).toBe(true)
    const change = unit.changing!
    expect(change.from).toBe("march-column")
    expect(change.to).toBe("line")
    // Two fifths of the way back is what is left to walk, and the pose starts
    // where the Unit actually stands rather than popping to a column.
    expect(change.duration - change.elapsed).toBeCloseTo((10 / off) * back, 5)
  })

  it("charges a third Formation the whole drill from the one it was going to", () => {
    const unit = battalion()
    expect(beginChange(unit, "march-column")).toBe(true)
    unit.changing!.elapsed = 10
    // Neither the Formation it stands in nor the one it was filing into, so
    // there is no road it is already on: the full drill from march column.
    expect(beginChange(unit, "square")).toBe(true)
    expect(unit.changing?.elapsed).toBe(0)
    expect(unit.changing?.duration).toBe(drillSeconds("infantry", "line", "march-column", "square"))
  })

  it("costs a column all but nothing to be told what to arrive in", () => {
    const unit = battalion({ formation: "march-column" })
    const battle = emptyBattle(blankField(400, 40), [unit])
    const hq = { x: 100, y: 140 }
    // Line and then the Move, which is the order the buttons are pressed in:
    // the Formation says what to arrive in, and the drag says where. The first
    // rider is well ahead of the second, so the column is genuinely filing off
    // into line by the time it is told to march.
    issueOrder(battle, unit.id, { kind: "form", formation: "line" }, hq)
    while (battle.couriers.length > 0) step(battle)
    issueOrder(
      battle,
      unit.id,
      {
        kind: "move",
        destination: { x: 500, y: 100 },
        arrivalFacing: 0,
        arrivalFormation: "line",
      },
      hq,
    )
    while (battle.couriers.length > 0) step(battle)
    // Time from the Move being handed over to the first step of the march. The
    // Unit had begun filing off into line, the march files it back, and what it
    // pays is the seconds it was out of column for and not the whole drill.
    const from = { ...unit.position }
    let waited = 0
    while (distance(unit.position, from) < 1 && waited < 120) {
      step(battle)
      waited += STEP
    }
    expect(waited).toBeLessThan(drillSeconds("infantry", "line", "line", "march-column") / 4)
    expect(unit.formation).toBe("march-column")
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

  it("does not hold cavalry back for a deployment it has already made", () => {
    // Horse fires from no Formation at all, so the rule that deploys a Unit
    // caught travelling is never satisfied by one: it asks whether the Unit can
    // fire in what it is standing in, and for cavalry the answer is no in line,
    // in column and everywhere else. A rule already holding an Order is asked
    // no further questions, so a regiment ordered anywhere with the enemy
    // inside three hundred metres stood where it was for the rest of the
    // afternoon, waiting to form the line it was already in.
    const horse = battalion({
      id: "c1",
      arm: "cavalry",
      strength: 260,
      formation: "march-column",
    })
    const austrian = battalion({ id: "a1", army: "austrian", position: { x: 300, y: 250 } })
    const battle = emptyBattle(blankField(200, 40), [horse, austrian])
    horse.order = {
      order: {
        id: "o1",
        unitId: horse.id,
        body: {
          kind: "move",
          destination: { x: 100, y: 280 },
          arrivalFacing: 0,
          arrivalFormation: "line",
        },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }
    step(battle)
    // It does deploy, once: that much is the rule doing its job.
    expect(horse.suspendedBy).toBe("deployed, the enemy too close to stay on the march")
    while (horse.changing !== null) step(battle)
    const from = { ...horse.position }
    // And then it goes where it was sent, rather than standing in the line it
    // has just made waiting to make it.
    for (let i = 0; i < 200; i++) step(battle)
    expect(horse.suspendedBy).not.toBe("deployed, the enemy too close to stay on the march")
    expect(distance(horse.position, from)).toBeGreaterThan(5)
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
    const { unit, battle } = facing(280, { standing: "close-up" })
    for (let i = 0; i < 3000; i++) step(battle)
    expect(unit.suspendedBy).toBeNull()
    expect(unit.position.x).toBeGreaterThan(150)
    // The leash is measured from the Post and never from where the Unit ended
    // up: a hundred metres of ground, and the enemy still out of its reach.
    expect(distance(unit.position, unit.post)).toBeLessThanOrEqual(leash("close-up") + 1)
    expect(aim(battle, unit)).toBeNull()
  })

  it("closing up stops the moment anything bears, well short of the leash", () => {
    const { unit, battle } = facing(180, { standing: "close-up" })
    for (let i = 0; i < 3000; i++) step(battle)
    expect(aim(battle, unit)?.target.id).toBe("au")
    expect(distance(unit.position, unit.post)).toBeLessThan(leash("close-up"))
  })

  it("gives ground rather than be closed with, and no more than its leash", () => {
    const { unit, enemy, battle } = facing(150, {
      standing: "stand-off",
    })
    for (let i = 0; i < 3000; i++) step(battle)
    // Out past the range it means to keep, and stopped there — it gives ground
    // to keep its distance, not to leave the battle.
    expect(distance(unit.position, enemy.position)).toBeGreaterThan(150)
    expect(distance(unit.position, unit.post)).toBeLessThanOrEqual(leash("stand-off"))
  })

  it("reports a rule once while it holds, not once a tick", () => {
    const { unit, battle } = facing(150, { standing: "stand-off" })
    // An Order that walks the Unit back onto what its brief walks it away from:
    // the Order pulls in, the brief pushes out, and the rule stops matching for
    // the tick in between. Both instructions are being obeyed; only one thing is
    // happening, and the feed used to carry a line of it ten times a second.
    unit.order = {
      order: {
        id: "o1",
        unitId: unit.id,
        body: {
          kind: "move",
          destination: { x: 400, y: 100 },
          arrivalFacing: 0,
          arrivalFormation: "line",
        },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }
    unit.post = { x: 400, y: 100 }
    for (let i = 0; i < 3000; i++) step(battle)
    const said = battle.dispatches.filter(
      (d) => d.unitId === unit.id && d.text.endsWith("gave ground rather than be closed with"),
    )
    // Said, and said sparingly: once when it starts, and not again inside the
    // minute the same judgement is held to be one act of it.
    expect(said.length).toBeGreaterThan(0)
    expect(said.length).toBeLessThanOrEqual(battle.time / 60)
  })

  it("gives no ground with guns in battery, which stand on their trails", () => {
    const { unit, battle } = facing(150, {
      arm: "artillery",
      formation: "in-battery",
      strength: 120,
      standing: "stand-off",
    })
    const stood = { ...unit.position }
    for (let i = 0; i < 3000; i++) step(battle)
    // The rule sits above the one that limbers up, so a battery it answered for
    // was a battery held under an Order it could never walk — suspended, and
    // firing the worse for it.
    expect(unit.suspendedBy).not.toBe("gave ground rather than be closed with")
    expect(distance(unit.position, stood)).toBe(0)
    expect(battle.volleys.length + unit.reload).toBeGreaterThan(0)
  })

  it("follows up as they give way, and only a Unit told it may", () => {
    for (const latitude of ["hold-ground", "follow-up"] as const) {
      const { unit, battle } = facing(
        200,
        { standing: latitude },
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
      { kind: "standing", latitude: "close-up" },
      {
        x: 100,
        y: 300,
      },
    )
    for (let i = 0; i < 600 && battle.couriers.length > 0; i++) step(battle)
    expect(battle.couriers).toHaveLength(0)
    expect(unit.standing).toBe("close-up")
    // Still marching where it was sent. A brief says what a Unit does unbidden,
    // which is a different question from what it is under orders to do now.
    expect(unit.order?.order.body.kind).toBe("move")
  })

  it("shows a new brief on the road, so the screen can say it was taken", () => {
    const { unit, battle } = facing(2000)
    issueOrder(battle, unit.id, { kind: "standing", latitude: "close-up" }, { x: 100, y: 300 })
    // Nothing about the Unit has changed and nothing will until the rider gets
    // there, so what the player pressed has to be readable off the brief in
    // flight or it is readable nowhere at all.
    const riding = snapshot(battle, unit.army).units.find((u) => u.id === unit.id)!
    expect(riding.report?.standing).toBe(defaultStanding())
    expect(riding.report?.briefedTo).toBe("close-up")
    for (let i = 0; i < 600 && battle.couriers.length > 0; i++) step(battle)
    const held = snapshot(battle, unit.army).units.find((u) => u.id === unit.id)!
    expect(held.report?.standing).toBe("close-up")
    expect(held.report?.briefedTo).toBeNull()
  })

  it("does not give ground from the enemy the player has just let it go at", () => {
    const { unit, enemy, battle } = facing(150, { standing: "stand-off" })
    unit.order = {
      order: {
        id: "o1",
        unitId: unit.id,
        body: { kind: "charge", targetId: enemy.id },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }
    const stood = { ...unit.position }
    // Initiative runs before the Order does, so a Charge just handed over has no
    // Charge state under it yet. A brief that read the state alone found a Unit
    // standing free, walked it away from what it had been let go at, and
    // suspended the Order that would have begun the run — so the state it was
    // waiting for never arrived and the Unit never went at all.
    for (let i = 0; i < 300; i++) step(battle)
    expect(unit.suspendedBy).not.toBe("gave ground rather than be closed with")
    expect(unit.charging?.targetId).toBe(enemy.id)
    expect(unit.position.x).toBeGreaterThan(stood.x)
  })

  it("does not close up on the nearest enemy while under a Charge Order", () => {
    const unit = battalion({ standing: "close-up" })
    // The one it was sent at is out of reach to the east; the one it was not is
    // inside the leash to the south, which is where the brief would take it.
    const near = battalion({
      id: "au1",
      army: "austrian",
      name: "IR 23",
      position: { x: 100, y: 380 },
      facing: -Math.PI / 2,
    })
    const far = battalion({
      id: "au2",
      army: "austrian",
      name: "IR 47",
      position: { x: 700, y: 100 },
      facing: Math.PI,
    })
    const battle = emptyBattle(blankField(200, 40), [unit, near, far])
    unit.order = {
      order: { id: "o1", unitId: unit.id, body: { kind: "charge", targetId: far.id }, issuedAt: 0 },
      arrivedAt: 0,
    }
    for (let i = 0; i < 300; i++) step(battle)
    expect(unit.suspendedBy).toBeNull()
    expect(unit.charging?.targetId).toBe(far.id)
    // Walking up at its own pace, straight at what it was aimed at, and not a
    // metre of the hundred its brief would have spent on somebody else.
    expect(unit.position.y).toBeCloseTo(100, 5)
    expect(unit.position.x).toBeGreaterThan(100)
  })

  it("carries the rung its Roster gave it onto the Field", () => {
    // Free at Deployment (ADR-0007), and this is the author spending that
    // freedom rather than the player: until a Roster could say it, every Unit
    // in every authored battle stood at hold-ground and the three rules that
    // spend a leash could not fire on any of them.
    const entry = {
      id: "fr-11e",
      name: "11e Légère",
      arm: "infantry",
      grade: "elite",
      strength: 560,
      formation: "open-order",
      standing: "stand-off",
      position: { x: 100, y: 100 },
    } as const
    expect(entryToUnit(entry, "french").standing).toBe("stand-off")
  })

  it("gives a Roster that says nothing the army it had before rungs were authorable", () => {
    const entry = {
      id: "fr-11e",
      name: "11e Légère",
      arm: "infantry",
      grade: "elite",
      strength: 560,
      formation: "open-order",
      position: { x: 100, y: 100 },
    } as const
    expect(entryToUnit(entry, "french").standing).toBe(defaultStanding())
  })

  it("posts a Unit where its Move Order sent it, so the leash is spent from there", () => {
    const { unit, battle } = facing(2000, {
      standing: "close-up",
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

  it("gives a screen no ground to fire from that a line cannot fire back onto", () => {
    // The property that keeps Open Order honest, and the reason its reach is a
    // hundred metres like every other infantry Formation's. A screen that could
    // stand where nothing answered did not have to win a firefight to win one:
    // it walked backwards, and a line, which cannot fire while it marches,
    // followed it until it broke.
    for (let gap = 40; gap <= 200; gap += 10) {
      const screen = facingOff(gap, {}, { formation: "open-order" })
      const line = facingOff(gap, { formation: "open-order" })
      if (!aim(screen.battle, screen.shooter)) continue
      expect(aim(line.battle, line.shooter)).not.toBeNull()
    }
  })

  it("leaves a screen out-shot by the line it is standing in front of", () => {
    // The whole reason the reload is charged to the Formation: the screen is
    // half a line's muskets loading at half its rate, so at the range they both
    // reach it has to come off far worse than the line does.
    const screen = facingOff(100, {}, { formation: "open-order" })
    const line = facingOff(100)
    const perMinute = (u: typeof line.shooter, b: typeof line.battle) =>
      (volleyCasualties(u, aim(b, u)!) * 60) / u.reload || 0
    resolveFire(screen.battle, screen.shooter, STEP, true)
    resolveFire(line.battle, line.shooter, STEP, true)
    expect(perMinute(screen.shooter, screen.battle)).toBeLessThan(
      perMinute(line.shooter, line.battle) / 2,
    )
  })

  it("thins a screen's fire with the range, and not with its own Frontage", () => {
    const near = facingOff(50, {}, { formation: "open-order" })
    const far = facingOff(105, {}, { formation: "open-order" })
    expect(volleyCasualties(far.shooter, aim(far.battle, far.shooter)!)).toBeLessThan(
      volleyCasualties(near.shooter, aim(near.battle, near.shooter)!) * 0.8,
    )
    // And it reaches as far as the range says, not as far as the swarm is wide:
    // 150m is well outside the screen's reach and well inside what measuring it
    // by its 187m Frontage would have credited it with.
    const beyond = facingOff(150, {}, { formation: "open-order" })
    expect(aim(beyond.battle, beyond.shooter)).toBeNull()
  })

  /** The quarter turn between a Unit's local slot layout and the Field. */
  const QUARTER = Math.PI / 2

  /** Every Formation that fires with no Face to fire it over. */
  function facelessFirers(): { arm: Arm; formation: FormationName }[] {
    const out: { arm: Arm; formation: FormationName }[] = []
    for (const arm of ["infantry", "cavalry", "artillery"] as const) {
      for (const formation of formationsFor(arm)) {
        const zone = fireZone(arm, formation, 700)
        if (zone && zone.faces === 0) out.push({ arm, formation })
      }
    }
    return out
  }

  /**
   * The furthest any point on a Footprint's edge is from the nearest man inside
   * it — half a file's spacing at best, and more where the rear rank of a
   * Strength that does not divide evenly comes up a file short. Measured off the
   * layout rather than written down, so tuning a Formation's spacing moves it.
   */
  function insideEdge(men: Vec2[], shape: { width: number; depth: number }): number {
    let worst = 0
    for (let t = 0; t < 1; t += 0.005) {
      for (const corner of [1, -1]) {
        for (const edge of [
          { x: (t - 0.5) * shape.width, y: (corner * shape.depth) / 2 },
          { x: (corner * shape.width) / 2, y: (t - 0.5) * shape.depth },
        ]) {
          worst = Math.max(worst, Math.min(...men.map((m) => distance(m, edge))))
        }
      }
    }
    return worst
  }

  it("beats no ground its own men are not standing within reach of", () => {
    // The peanut. A Faceless Unit's own body was measured by the shadow it cast
    // across the bearing rather than by where its men were, so a screen 150m
    // across was credited with standoff on the diagonals that it had nobody
    // standing on — up to 19m of reach fired by nobody — and its beaten ground
    // pinched to a notch dead ahead where the two lobes met. The property that
    // fixes it, and the one worth holding: every point a Unit beats has one of
    // its own men inside the range of it.
    //
    // Asked of every Faceless Formation there is and at two Strengths, with the
    // slack read off the Formation's own layout, so the guard follows the tuning
    // instead of having to be renumbered behind it.
    for (const { arm, formation } of facelessFirers()) {
      for (const strength of [200, 700]) {
        const unit = battalion({ arm, formation, strength, position: { x: 0, y: 0 }, facing: 0 })
        const zone = fireZone(arm, formation, strength)!
        // Slots are laid out with the Face along local -y, which is the quarter
        // turn the renderer gives the Unit's container.
        const men = slots(arm, formation, strength).map((s) => rotate(s, unit.facing + QUARTER))
        const slack = insideEdge(slots(arm, formation, strength), zone)
        for (let degrees = 0; degrees < 360; degrees += 5) {
          const bearing = (degrees * Math.PI) / 180
          let far = 0
          for (let r = 1; r <= Math.ceil(zone.range + zone.width + zone.depth); r += 1) {
            if (beatsPoint(unit, { x: Math.cos(bearing) * r, y: Math.sin(bearing) * r })) far = r
          }
          const edge = { x: Math.cos(bearing) * far, y: Math.sin(bearing) * far }
          const nearest = Math.min(...men.map((m) => distance(m, edge)))
          const where = `${arm} ${formation} at ${strength}, ${degrees}°`
          expect(nearest, where).toBeLessThanOrEqual(zone.range + slack)
          // And the far edge is the far edge — a Formation falling short of its
          // own reach would pass the line above by standing still. One metre of
          // give for the metre the walk above steps in.
          expect(nearest, where).toBeGreaterThan(zone.range - 1)
        }
      }
    }
  })

  it("draws the beaten ground on the shape it fires on", () => {
    // Two solutions of one shape: the sim asks how far a point is from the
    // Footprint, the renderer asks how far the Footprint reaches on a bearing.
    // Nothing forces them to agree except this, and a beaten ground drawn where
    // the fire is not is the one kind of lie F5 cannot afford.
    for (const { arm, formation } of facelessFirers()) {
      for (const strength of [200, 700]) {
        const zone = fireZone(arm, formation, strength)!
        const shape = { width: zone.width, depth: zone.depth }
        for (const facing of [0, 0.7, -2.4]) {
          for (let degrees = 0; degrees < 360; degrees += 5) {
            const bearing = (degrees * Math.PI) / 180
            const reach = reachOnBearing(zone, facing, bearing)
            const at = (r: number) => ({ x: Math.cos(bearing) * r, y: Math.sin(bearing) * r })
            const where = `${arm} ${formation} at ${strength}, facing ${facing}, ${degrees}°`
            const origin = { x: 0, y: 0 }
            expect(gapToPoint(shape, origin, facing, at(reach)), where).toBeCloseTo(zone.range, 6)
            expect(gapToPoint(shape, origin, facing, at(reach + 1)), where).toBeGreaterThan(
              zone.range,
            )
          }
        }
      }
    }
  })

  it("leaves a square no corner to be charged home on", () => {
    // How far the Unit's fire carries on a bearing, walked out metre by metre
    // against a bare point — the same measure a Headquarters is harried by.
    const reach = (formation: FormationName, degrees: number) => {
      const unit = battalion({ formation, position: { x: 0, y: 0 }, facing: 0 })
      const bearing = (degrees * Math.PI) / 180
      let far = 0
      for (let r = 1; r <= 200; r += 1) {
        if (beatsPoint(unit, { x: Math.cos(bearing) * r, y: Math.sin(bearing) * r })) far = r
      }
      return far
    }
    // Four Faces and therefore no bearing it is not fighting on. The corner used
    // to be not thin but blind — 118m dead ahead and nothing whatever at 45°,
    // so horse was charged home on the diagonal for no reason about squares.
    expect(reach("square", 45)).toBeGreaterThan(reach("square", 0) * 0.8)
    for (const degrees of [0, 20, 45, 70, 90, 135, 180]) {
      expect(reach("square", degrees)).toBeGreaterThan(80)
    }
    // And a Face is still a Face: a line beats the ground in front of it and
    // none to either side, which is the whole of what a flank is.
    expect(reach("line", 0)).toBeGreaterThan(80)
    expect(reach("line", 90)).toBe(0)
    expect(reach("line", 180)).toBe(0)
  })

  it("beats more of the bearings round it than a line does, being what square is for", () => {
    const share = (formation: FormationName, metres: number) => {
      const unit = battalion({ formation, position: { x: 0, y: 0 }, facing: 0 })
      let beaten = 0
      for (let degrees = 0; degrees < 360; degrees += 1) {
        const bearing = (degrees * Math.PI) / 180
        const at = { x: Math.cos(bearing) * metres, y: Math.sin(bearing) * metres }
        if (beatsPoint(unit, at)) beaten += 1
      }
      return beaten / 360
    }
    // It beat 39% of them against a line's 49% before this, which is the one
    // Formation whose whole purpose is having no blind side coming off worse
    // all round than the Formation that is all flank.
    expect(share("square", 60)).toBe(1)
    expect(share("square", 60)).toBeGreaterThan(share("line", 60))
  })

  it("still fires with one Face's muskets, and only those that bear", () => {
    // Nothing about how much a square shoots moves. A Face 36m wide firing at
    // something that presents less than that across the line of fire fires with
    // the share of it that bears, exactly as a line does.
    const wide = facingOff(60, { formation: "line" }, { formation: "square" })
    const narrow = facingOff(60, { formation: "attack-column" }, { formation: "square" })
    expect(aim(wide.battle, wide.shooter)!.overlap).toBe(1)
    expect(aim(narrow.battle, narrow.shooter)!.overlap).toBe(1)
    // A square is 36m across, so it takes something narrower than that to lose
    // fire — and then it loses it in proportion.
    const thin = facingOff(60, { formation: "line", strength: 40 }, { formation: "square" })
    expect(aim(thin.battle, thin.shooter)!.overlap).toBeLessThan(0.5)
  })

  it("ploughs a column and lets a screen through: depth and dispersal are not the same", () => {
    // One eight-gun battery at four hundred metres, against the same seven
    // hundred men stood three ways. Round shot finds what is deep and behind
    // what it has already hit — and finds much less of a screen at 1.6m
    // intervals, which is mostly the ground between men.
    const shot = (formation: FormationName) => {
      const { battle, shooter } = facingOff(
        400,
        { formation },
        { arm: "artillery", formation: "in-battery", strength: 120 },
      )
      return volleyCasualties(shooter, aim(battle, shooter)!)
    }
    const line = shot("line")
    expect(shot("attack-column")).toBeGreaterThan(line * 3)
    // And under guns a screen is the safest place on the Field, square included:
    // charging its Density made it the second worst, worse than a square, which
    // is the opposite of what a battalion sends its skirmishers out for.
    expect(shot("open-order")).toBeLessThan(line * 0.7)
    expect(shot("open-order")).toBeLessThan(shot("square"))
  })

  it("tells the screen what it is aiming at", () => {
    const { battle, shooter, enemy } = facingOff(60)
    const aimingOf = (id: string) =>
      snapshot(battle, shooter.army).units.find((u) => u.id === id)!.report?.aiming ?? null
    expect(aimingOf(shooter.id)).toBe(enemy.id)
    // In march column it has nothing in its sights, because it has no fire.
    shooter.formation = "march-column"
    expect(aimingOf(shooter.id)).toBeNull()
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

  it("holds a battalion together by the ranks standing behind its fight", () => {
    const stiff = (formation: FormationName) => stiffening(battalion({ formation }))
    // A line is one rank deep behind its fight and a column is seven.
    expect(stiff("attack-column")).toBeGreaterThan(stiff("line"))
    // A square is four ranks to a Face, so it sits between the two — its answer
    // to horse is that it has no flank, and was never meant to be this.
    expect(stiff("square")).toBeGreaterThan(stiff("line"))
    expect(stiff("square")).toBeLessThan(stiff("attack-column"))
    // And nothing at all for the Formations with no Face. Depth on a road is
    // not men holding onto each other, and neither is a screen at 1.6m
    // intervals — both stand exactly where they stood before any of this.
    expect(stiff("march-column")).toBe(1)
    expect(stiff("open-order")).toBe(1)
  })

  it("spends depth on being rushed and never on being shot at, which is what keeps F10 still", () => {
    // Where a Unit Breaks by the men it has lost, taken one at a time so
    // nothing about the rate of fire or Morale creeping back is in the answer.
    // Casualties are almost all fire, so this is the number F10's band is drawn
    // on, and no amount of depth may move it.
    const breaksAt = (formation: FormationName) => {
      const unit = battalion({ formation })
      let lost = 0
      while (!hasBroken(unit) && lost < 700) {
        shake(unit, 1, { x: 2000, y: unit.position.y })
        unit.strength -= 1
        lost += 1
      }
      return lost / 700
    }
    const line = breaksAt("line")
    expect(line).toBeGreaterThan(0.15)
    expect(line).toBeLessThan(0.3)
    for (const formation of ["attack-column", "square", "march-column", "open-order"] as const) {
      expect(breaksAt(formation)).toBeCloseTo(line)
    }
  })

  it("costs a column less nerve than a line to have horse coming on at it", () => {
    const watching = (formation: FormationName) => {
      const unit = battalion({ formation })
      const horse = battalion({ id: "au", army: "austrian", arm: "cavalry", formation: "line" })
      for (let i = 0; i < 300; i++) dread(unit, horse, false, STEP)
      return unit.morale
    }
    expect(watching("attack-column")).toBeGreaterThan(watching("line"))
    expect(watching("square")).toBeGreaterThan(watching("line"))
    expect(watching("march-column")).toBeLessThan(watching("line"))
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
    cavalry.charging = { targetId: enemy.id, launchedAt: 0, recoiling: false, pursuing: false }
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
      theirs.charging = { targetId: mine.id, launchedAt: 0, recoiling: false, pursuing: false }
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
      theirs.charging = { targetId: foot.id, launchedAt: 0, recoiling: false, pursuing: false }
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
      expect(mine.standing).toBe("hold-ground")
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
      charging: { targetId: "ca", launchedAt: 0, recoiling: false, pursuing: false },
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
      charging: { targetId: "ca", launchedAt: 0, recoiling: true, pursuing: false },
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

  /** A battalion in `formation`, already touching a steady line, Contact resolved. */
  function footStrikes(formation: FormationName) {
    const enemy = targetOf({ formation: "line" })
    const foot = battalion({ id: "fr", formation, facing: 0 })
    place(foot, enemy, 1)
    foot.charging = { targetId: enemy.id, launchedAt: 0, recoiling: false, pursuing: false }
    const battle = emptyBattle(blankField(250, 250), [foot, enemy])
    resolveContact(battle, foot, enemy)
    return { foot, enemy, contact: battle.contacts[0] }
  }

  it("lets a column punch a hole where a line only pushes, for a third of the men", () => {
    // Both onto the same steady line. The column meets a third of the front, so
    // it kills a third as many and loses a third as many — and costs the same
    // nerve, because a line struck in one place has a hole in it and a line
    // struck along its whole length has only been shoved.
    const inLine = footStrikes("line")
    const inColumn = footStrikes("attack-column")
    expect(inColumn.contact.width).toBeLessThan(inLine.contact.width / 2)
    expect(inColumn.contact.targetCasualties).toBeLessThan(inLine.contact.targetCasualties / 2)
    expect(inColumn.contact.casualties).toBeLessThan(inLine.contact.casualties / 2)
    expect(inColumn.enemy.morale).toBeCloseTo(inLine.enemy.morale, 1)
  })

  it("gives no hole to a Formation with no Face, whatever its Frontage", () => {
    // A battalion on the road is three metres across and would otherwise punch
    // the hardest hole on the Field. It is the one shape that must not.
    const road = footStrikes("march-column")
    expect(road.contact.width).toBeLessThan(10)
    expect(road.enemy.morale).toBeGreaterThan(footStrikes("line").enemy.morale)
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
    // Read off the ladder rather than off the tuning: 0.3 is `shaken`, which is
    // the rung this is about. Horse carries a line up to about 0.37 now that the
    // rank behind its fight is worth something to it — a line one notch further
    // gone than it used to need, and still a shaken one and not a broken one.
    expect(struck({ morale: 0.3 }).contact.outcome).toBe("broke")
  })

  it("decides by Morale and not by Strength: the loser Breaks with most of its men", () => {
    const { enemy, contact } = struck({ morale: 0.3 })
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

  it("does not offer a Unit it would only pull up in front of", () => {
    // What the screen outlines while a Charge is being aimed, and what the
    // press will spend a Courier on. It has to agree with what C6 does with the
    // Order, or the player buys ninety seconds of ride and gets a regiment
    // standing still — so a mob is offered to horse and to nothing else.
    const formed = { army: "austrian", routing: false }
    expect(chargeable(formed, "french", "cavalry")).toBe(true)
    expect(chargeable(formed, "french", "infantry")).toBe(true)
    expect(chargeable({ ...formed, routing: true }, "french", "cavalry")).toBe(true)
    expect(chargeable({ ...formed, routing: true }, "french", "infantry")).toBe(false)
    expect(chargeable({ ...formed, routing: true }, "french", null)).toBe(false)
    expect(chargeable({ ...formed, army: "french" }, "french", "cavalry")).toBe(false)
  })

  describe("the Pursuit", () => {
    /** Horse already among a mob, committed to it, on a Field with room to run. */
    function ridingDown() {
      const mob = targetOf({ formation: "march-column", morale: 0 })
      mob.routing = { heading: 0, brokeAt: 0 }
      const cavalry = regiment()
      place(cavalry, mob, 1)
      cavalry.charging = { targetId: mob.id, launchedAt: 0, recoiling: false, pursuing: true }
      cavalry.order = {
        order: {
          id: "o1",
          unitId: cavalry.id,
          body: { kind: "charge", targetId: mob.id },
          issuedAt: 0,
        },
        arrivedAt: 0,
      }
      return { cavalry, mob, battle: emptyBattle(blankField(400, 400), [cavalry, mob]) }
    }

    it("rides on after the battalion it broke, rather than pulling up", () => {
      const { cavalry, enemy, battle } = untilItStrikes(140)
      expect(isRouting(enemy)).toBe(true)
      expect(cavalry.charging?.pursuing).toBe(true)
      expect(cavalry.order).not.toBeNull()
      expect(battle.dispatches.some((d) => d.text.includes("rode on after it"))).toBe(true)
    })

    it("pulls foot up, a mob at the run being faster than a battalion at the charge", () => {
      const mob = targetOf({ formation: "march-column" })
      mob.routing = { heading: 0, brokeAt: 0 }
      const foot = battalion({ id: "fr", army: "french", formation: "attack-column" })
      place(foot, mob, 80)
      foot.order = {
        order: {
          id: "o1",
          unitId: foot.id,
          body: { kind: "charge", targetId: mob.id },
          issuedAt: 0,
        },
        arrivedAt: 0,
      }
      const battle = emptyBattle(blankField(250, 250), [foot, mob])
      step(battle)
      expect(foot.charging).toBeNull()
      expect(foot.order).toBeNull()
      expect(battle.dispatches.some((d) => d.text.includes("pulled up"))).toBe(true)
    })

    it("takes a third of what is left off the mob every minute, and raises no Contact", () => {
      const { mob, battle } = ridingDown()
      const mustered = mob.strength
      while (battle.time < 60) step(battle)
      // Two thirds of it left, less the men a Rout sheds on its own account.
      expect(mob.strength / mustered).toBeCloseTo(0.63, 1)
      // Contact is two blocks touching and is over in seconds. This is neither.
      expect(battle.contacts).toHaveLength(0)
    })

    it("denies the mob its Rally, and goes on denying it after the horse has gone", () => {
      const { cavalry, mob, battle } = ridingDown()
      while (battle.time < 60) step(battle)
      expect(mob.morale).toBeLessThan(-1)
      // Called off, and five minutes of running clear afterwards. A Unit that
      // merely broke would be back under command inside that; this one is not
      // coming back at all, which is what finishing a Unit means here.
      battle.units = battle.units.filter((u) => u !== cavalry)
      while (battle.time < 360) step(battle)
      expect(canRally(battle, mob)).toBe(false)
      expect(isRouting(mob)).toBe(true)
    })

    it("goes where the mob goes, and leaves the regiment out there", () => {
      const { cavalry, mob, battle } = ridingDown()
      const from = { ...cavalry.position }
      while (battle.time < 120) step(battle)
      // Two minutes at the mob's own pace, all of it away from where the
      // regiment was standing: the third cost, and nothing charges it.
      expect(distance(cavalry.position, from)).toBeGreaterThan(250)
      expect(gapTo(cavalry, mob)).toBeLessThan(3)
    })
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

describe("C8 the ground a Unit stands on", () => {
  /**
   * Two thousand men do not walk through two thousand men. Everything in here
   * is one fact read three ways: a march is held against what it cannot enter,
   * a Charge strikes the first Face it comes to rather than the one it was
   * aimed at, and a Unit walked through has had its ranks opened.
   */

  /** A regiment of horse, facing east, ready to be let go at something. */
  function regiment(overrides: Partial<Unit> = {}): Unit {
    return battalion({
      id: "ca",
      name: "1er Hussards",
      arm: "cavalry",
      strength: 400,
      formation: "line",
      position: { x: 500, y: 1000 },
      facing: 0,
      ...overrides,
    })
  }

  function austrian(overrides: Partial<Unit> = {}): Unit {
    return battalion({
      id: "au",
      army: "austrian",
      name: "IR 23",
      position: { x: 1000, y: 1000 },
      facing: Math.PI,
      ...overrides,
    })
  }

  function letGoAt(unit: Unit, targetId: string): void {
    unit.order = {
      order: { id: "o1", unitId: unit.id, body: { kind: "charge", targetId }, issuedAt: 0 },
      arrivedAt: 0,
    }
  }

  function sendTo(unit: Unit, destination: Vec2): void {
    unit.order = {
      order: {
        id: "m1",
        unitId: unit.id,
        body: {
          kind: "move",
          destination,
          arrivalFacing: unit.facing,
          arrivalFormation: unit.formation,
        },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }
  }

  function run(battle: Battle, seconds: number): void {
    for (let t = 0; t < seconds; t += STEP) step(battle)
  }

  describe("a Charge strikes the first Face it comes to", () => {
    /** A screen, the battery it screens, and the horse let go at the battery. */
    function through(screen: Partial<Unit> = {}) {
      const horse = regiment()
      const line = austrian({ id: "au-line", name: "IR 23", position: { x: 900, y: 1000 } })
      Object.assign(line, screen)
      const guns = austrian({
        id: "au-guns",
        name: "Kavalleriebatterie Nr. 1",
        arm: "artillery",
        strength: 100,
        formation: "in-battery",
        position: { x: 1100, y: 1000 },
      })
      letGoAt(horse, guns.id)
      const battle = emptyBattle(blankField(400, 400), [horse, line, guns])
      while (battle.time < 600 && battle.contacts.length === 0) step(battle)
      return { horse, line, guns, battle, contact: battle.contacts[0] }
    }

    it("meets the line standing in front of the guns it was aimed at", () => {
      const { horse, line, guns, contact } = through()
      expect(contact?.unitId).toBe(horse.id)
      expect(contact?.targetId).toBe(line.id)
      expect(guns.strength).toBe(100)
    })

    it("commits the Charge to what it ran into, and not only that one blow", () => {
      // The recoil is the tell: a regiment thrown back goes back from the Unit
      // that threw it, so a Charge still aimed two hundred metres beyond would
      // measure its distance from the wrong body of men.
      const { horse, line } = through()
      expect(horse.charging?.targetId ?? null).not.toBe("au-guns")
      if (horse.charging) expect(horse.charging.targetId).toBe(line.id)
    })

    it("rides past a screen, which holds no ground", () => {
      const { line, guns, contact } = through({ formation: "open-order" })
      expect(contact?.targetId).toBe(guns.id)
      expect(line.strength).toBe(700)
    })

    it("rides past what is clear of its lane", () => {
      // Two hundred metres wide, and the battalion is four hundred off the line
      // of the charge. Measured centre to centre the horse would read as
      // touching it; measured along the charge it rides by.
      const { guns, contact } = through({ position: { x: 900, y: 1400 } })
      expect(contact?.targetId).toBe(guns.id)
    })
  })

  describe("a march is held against what it cannot walk through", () => {
    const standingOf = (unit: Unit) => ({
      shape: unitFootprint(unit),
      at: unit.position,
      facing: unit.facing,
    })

    /** March one of ours at an enemy two hundred metres off, and watch the ground. */
    function marchInto(theirs: Partial<Unit> = {}) {
      const mine = battalion({ position: { x: 800, y: 1000 } })
      const enemy = austrian({ position: { x: 1000, y: 1000 }, ...theirs })
      sendTo(mine, { x: 1200, y: 1000 })
      const battle = emptyBattle(blankField(400, 400), [mine, enemy])
      let met = false
      for (let t = 0; t < 400; t += STEP) {
        step(battle)
        // A mob is nobody's Footprint, so a Rout that either of them fell into
        // is not the question being asked here.
        if (isRouting(mine)) break
        if (overlaps(standingOf(mine), standingOf(enemy))) met = true
      }
      return { mine, enemy, met, battle }
    }

    it("never puts two thousand men in the same ground, and the Order stands", () => {
      const { mine, enemy, met } = marchInto()
      expect(met).toBe(false)
      expect(mine.position.x).toBeLessThan(enemy.position.x)
      // Held and not cancelled, the same answer `admits` gives at a Crossing.
      expect(mine.order).not.toBeNull()
    })

    it("walks through a screen, which holds no ground", () => {
      const { met } = marchInto({ formation: "open-order" })
      expect(met).toBe(true)
    })

    it("walks through a mob, which has no ground left to hold", () => {
      // Horse on the road, because a mob runs at 2.6 metres a second and only
      // march column catches it. It is not a Pursuit: no Charge was asked for
      // and none is let go — it is a column marching over men in its way.
      const mine = battalion({
        arm: "cavalry",
        name: "1er Hussards",
        strength: 400,
        formation: "march-column",
        position: { x: 800, y: 1000 },
      })
      const mob = austrian({
        position: { x: 1000, y: 1000 },
        formation: "march-column",
        routing: { heading: 0, brokeAt: 0 },
        morale: 0,
      })
      sendTo(mine, { x: 1600, y: 1000 })
      const battle = emptyBattle(blankField(400, 400), [mine, mob])
      let met = false
      for (let t = 0; t < 400; t += STEP) {
        step(battle)
        if (overlaps(standingOf(mine), standingOf(mob))) met = true
      }
      expect(met).toBe(true)
    })

    it("lets a Unit already standing in one walk out of it", () => {
      // Two Units that begin the day in each other would otherwise have no step
      // either of them could take, and would stand there all afternoon. The
      // guns are limbered so that nothing shoots the answer out of the test.
      const mine = battalion({ position: { x: 1000, y: 1000 } })
      const guns = austrian({
        arm: "artillery",
        name: "Kavalleriebatterie Nr. 1",
        strength: 100,
        formation: "limbered",
      })
      sendTo(mine, { x: 700, y: 1000 })
      const battle = emptyBattle(blankField(400, 400), [mine, guns])
      run(battle, 400)
      expect(mine.position.x).toBeLessThan(750)
      expect(overlaps(standingOf(mine), standingOf(guns))).toBe(false)
    })
  })

  it("pulls a recoil up when it is thrown back onto ground it cannot give", () => {
    // A regiment thrown back has one way out of the Charge state, which is
    // putting RECOIL_DISTANCE between itself and what threw it. Penned in, it
    // would stand in contact with it for the rest of the afternoon.
    const horse = regiment({ position: { x: 995, y: 1000 } })
    const enemy = austrian()
    const behind = austrian({ id: "au-2", name: "IR 45", position: { x: 940, y: 1000 } })
    horse.charging = { targetId: enemy.id, launchedAt: 0, recoiling: true, pursuing: false }
    letGoAt(horse, enemy.id)
    const battle = emptyBattle(blankField(400, 400), [horse, enemy, behind])
    while (battle.time < 200 && horse.charging) step(battle)
    expect(horse.charging).toBeNull()
    // Pulled up well short of the distance that would otherwise have ended it.
    expect(gapTo(horse, enemy)).toBeLessThan(RECOIL_DISTANCE)
    expect(battle.dispatches.map((d) => d.text)).toContain(
      "1er Hussards was thrown back onto ground it could not give",
    )
  })

  describe("walking through a formed Unit opens its ranks", () => {
    /** Two of ours, one marched across the other's front. */
    function crossing(over: Partial<Unit> = {}, mover: Partial<Unit> = {}) {
      const standing = battalion({ id: "a", position: { x: 1000, y: 1000 }, ...over })
      const marching = battalion({
        id: "b",
        name: "5e Ligne",
        position: { x: 1000, y: 800 },
        facing: Math.PI / 2,
        ...mover,
      })
      sendTo(marching, { x: 1000, y: 1200 })
      const battle = emptyBattle(blankField(400, 400), [standing, marching])
      run(battle, 200)
      return { standing, marching, battle }
    }

    it("costs the pair of them their shape", () => {
      const { standing, marching } = crossing()
      expect(isDisordered(standing)).toBe(true)
      expect(isDisordered(marching)).toBe(true)
    })

    it("names what came through in the Dispatch", () => {
      const { battle } = crossing()
      const said = battle.dispatches.map((d) => d.text)
      expect(said).toContain("12e Ligne is in disorder, 5e Ligne came through its ranks")
    })

    it("costs a screen nothing, either way round", () => {
      const { standing, marching } = crossing({ formation: "open-order" })
      expect(isDisordered(standing)).toBe(false)
      expect(isDisordered(marching)).toBe(false)
    })

    it("is not a tax on standing in each other, only on walking through", () => {
      // Nobody moves. Two battalions drawn up in each other are crowded and not
      // ruined, and standing still is what mends ranks in any case — so a rule
      // that charged them every step would hold them under it for the whole
      // afternoon over a state neither of them was doing anything about.
      const one = battalion({ id: "a", position: { x: 1000, y: 1000 } })
      const two = battalion({ id: "b", name: "5e Ligne", position: { x: 1000, y: 1000 } })
      const battle = emptyBattle(blankField(400, 400), [one, two])
      run(battle, 200)
      expect(isDisordered(one)).toBe(false)
      expect(isDisordered(two)).toBe(false)
    })
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
