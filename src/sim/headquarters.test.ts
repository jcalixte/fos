import { describe, expect, it } from "bun:test"
import { step, STEP } from "./battle"
import { GROUNDS } from "./ground"
import {
  advanceHeadquarters,
  canSendCourier,
  courierHold,
  HARRIED_RANGE,
  HARRIED_SURCHARGE,
  HEADQUARTERS_SPEED,
  isRiding,
  MOST_SURCHARGE,
  OVERRUN_RANGE,
  OVERRUN_SURCHARGE,
  rideTo,
  sendOrder,
} from "./headquarters"
import { unitWeight } from "./morale"
import { COURIER_SPEED, estimateDelay, ghosts } from "./orders"
import { blankField, entryToUnit } from "./scenario"
import { snapshot } from "./snapshot"
import type { Battle, Field, Headquarters, Unit, Vec2 } from "./types"
import { distance } from "./vec"

/**
 * C1's other half (ADR-0008): the Headquarters rides, and the enemy can come at
 * it. What is being tested throughout is that the wait is at the *table* — the
 * ride is the same length whatever the staff is going through, and every second
 * the enemy costs is spent before the rider sets off.
 */

function unit(overrides: Partial<Unit> = {}): Unit {
  const base = entryToUnit(
    {
      id: overrides.id ?? "u1",
      name: overrides.name ?? "12e Ligne",
      arm: overrides.arm ?? "infantry",
      grade: "line",
      strength: overrides.strength ?? 700,
      formation: overrides.formation ?? "line",
      position: overrides.position ?? { x: 100, y: 500 },
      facing: overrides.facing ?? 0,
    } as never,
    overrides.army ?? "french",
  )
  // The Roster entry carries only what a Roster carries, so anything else a
  // fixture wants to say — a Unit already Routing, say — is laid on after.
  return { ...base, ...overrides, post: overrides.post ?? { ...base.position } }
}

function headquarters(at: Vec2, army = "french"): Headquarters {
  return {
    army,
    position: { ...at },
    destination: null,
    dictated: [],
    surcharge: 0,
    harried: false,
  }
}

function fixture(units: Unit[], hq: Headquarters, field?: Field): Battle {
  const armies = new Map<string, Battle["armies"][number]>()
  for (const u of units) {
    const army = armies.get(u.army) ?? {
      id: u.army,
      name: u.army,
      colour: 0x2c7c40,
      headquarters: u.army === hq.army ? hq : null,
      weight: 0,
      strength: 0,
      units: 0,
    }
    army.weight += unitWeight(u)
    army.strength += u.strength
    army.units += 1
    armies.set(u.army, army)
  }
  if (!armies.has(hq.army)) {
    armies.set(hq.army, {
      id: hq.army,
      name: hq.army,
      colour: 0x2c7c40,
      headquarters: hq,
      weight: 1,
      strength: 1,
      units: 1,
    })
  }
  return {
    time: 0,
    field: field ?? blankField(300, 300),
    armies: [...armies.values()],
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

/** Run the Headquarters alone, without the rest of the battle stepping. */
function run(battle: Battle, seconds: number): void {
  for (let t = 0; t < seconds; t += STEP) {
    battle.time += STEP
    advanceHeadquarters(battle, STEP)
  }
}

describe("what an Order waits before its rider sets off", () => {
  it("charges nothing at all for a staff standing clear", () => {
    const hq = headquarters({ x: 100, y: 500 })
    expect(courierHold(hq)).toBe(0)
    expect(canSendCourier(hq)).toBe(true)
  })

  it("spends the harrying at the table and never on the road", () => {
    const target = unit({ position: { x: 500, y: 500 } })
    const clear = fixture([target], headquarters({ x: 100, y: 500 }))
    const harried = fixture(
      [unit({ position: { x: 500, y: 500 } })],
      headquarters({ x: 100, y: 500 }),
    )
    const harriedHq = harried.armies[0].headquarters
    if (!harriedHq) throw new Error("fixture has no Headquarters")
    harriedHq.harried = true

    const ride = estimateDelay({ x: 100, y: 500 }, target.position)
    expect(courierHold(harriedHq)).toBe(HARRIED_SURCHARGE)

    // The two Orders are the same ride. The difference between them is exactly
    // the wait at the table, which is the whole claim of ADR-0008's surcharge.
    const arrival = (battle: Battle): number => {
      const hq = battle.armies[0].headquarters
      if (!hq) throw new Error("fixture has no Headquarters")
      sendOrder(battle, hq, battle.units[0].id, { kind: "halt" })
      let elapsed = 0
      while (elapsed < 300 && !battle.units[0].order) {
        step(battle)
        elapsed += STEP
      }
      return elapsed
    }
    const plain = arrival(clear)
    const late = arrival(harried)
    expect(plain).toBeCloseTo(ride, 0)
    expect(late - plain).toBeCloseTo(HARRIED_SURCHARGE, 0)
  })

  it("carries the scar of every Overrun, and the harrying on top of it", () => {
    const hq = headquarters({ x: 100, y: 500 })
    hq.surcharge = OVERRUN_SURCHARGE
    expect(courierHold(hq)).toBe(OVERRUN_SURCHARGE)
    hq.harried = true
    expect(courierHold(hq)).toBe(OVERRUN_SURCHARGE + HARRIED_SURCHARGE)
  })
})

describe("a staff in the saddle", () => {
  it("sends no rider at all, and takes up again once it is established", () => {
    const target = unit({ position: { x: 900, y: 500 } })
    const battle = fixture([target], headquarters({ x: 100, y: 500 }))
    const hq = battle.armies[0].headquarters
    if (!hq) throw new Error("fixture has no Headquarters")

    rideTo(battle, hq, { x: 300, y: 500 })
    expect(isRiding(hq)).toBe(true)
    expect(canSendCourier(hq)).toBe(false)
    sendOrder(battle, hq, target.id, { kind: "halt" })
    expect(battle.couriers).toHaveLength(0)

    // 200m at a staff's pace, and then it is a Headquarters again.
    run(battle, 200 / HEADQUARTERS_SPEED + 1)
    expect(isRiding(hq)).toBe(false)
    expect(hq.position.x).toBeCloseTo(300, 0)
    sendOrder(battle, hq, target.id, { kind: "halt" })
    expect(battle.couriers).toHaveLength(2)
  })

  it("takes down what is said in the saddle, and sends it the moment it settles", () => {
    const target = unit({ position: { x: 900, y: 500 } })
    const battle = fixture([target], headquarters({ x: 100, y: 500 }))
    const hq = battle.armies[0].headquarters
    if (!hq) throw new Error("fixture has no Headquarters")

    rideTo(battle, hq, { x: 300, y: 500 })
    sendOrder(battle, hq, target.id, {
      kind: "move",
      destination: { x: 700, y: 200 },
      arrivalFacing: 0,
      arrivalFormation: "line",
    })
    // Nothing is on the road, and nothing has been thrown away either.
    expect(battle.couriers).toHaveLength(0)
    expect(hq.dictated).toHaveLength(1)
    // It is a thing the player can see, the same as any Order in flight: the
    // Ghost stands on the ground he named, with no rider out yet.
    const ghost = ghosts(battle).find((g) => g.unitId === target.id)
    expect(ghost?.position).toEqual({ x: 700, y: 200 })
    // And the Unit says so on its own card, so a Ghost with nothing riding at
    // it is never left to be read as an Order the app has mislaid.
    expect(snapshot(battle, target.army).units[0].report?.dictated).toBe(true)

    run(battle, 200 / HEADQUARTERS_SPEED + 1)
    expect(hq.dictated).toHaveLength(0)
    expect(snapshot(battle, target.army).units[0].report?.dictated).toBe(false)
    expect(battle.couriers).toHaveLength(1)
    // From the ground the staff ended up on, not the ground it dictated from.
    expect(battle.couriers[0].origin.x).toBeCloseTo(300, 0)
  })

  it("holds one dictated Order per Unit, the last one said", () => {
    const target = unit({ position: { x: 900, y: 500 } })
    const other = unit({ id: "u2", name: "3e Ligne", position: { x: 800, y: 500 } })
    const battle = fixture([target, other], headquarters({ x: 100, y: 500 }))
    const hq = battle.armies[0].headquarters
    if (!hq) throw new Error("fixture has no Headquarters")

    rideTo(battle, hq, { x: 300, y: 500 })
    sendOrder(battle, hq, target.id, { kind: "halt" })
    sendOrder(battle, hq, other.id, { kind: "halt" })
    sendOrder(battle, hq, target.id, { kind: "form", formation: "square" })

    expect(hq.dictated).toHaveLength(2)
    const held = hq.dictated.find((d) => d.unitId === target.id)
    expect(held?.body).toEqual({ kind: "form", formation: "square" })
  })

  it("charges the dictated Orders whatever the table costs when they leave it", () => {
    const target = unit({ position: { x: 900, y: 500 } })
    const battle = fixture([target], headquarters({ x: 100, y: 500 }))
    const hq = battle.armies[0].headquarters
    if (!hq) throw new Error("fixture has no Headquarters")

    rideTo(battle, hq, { x: 300, y: 500 })
    sendOrder(battle, hq, target.id, { kind: "halt" })
    // Nothing at the table when it was said; the enemy is up to the ground it
    // settles on. The wait is at the table, so this is the table it pays for.
    hq.surcharge = OVERRUN_SURCHARGE
    run(battle, 200 / HEADQUARTERS_SPEED + 1)

    expect(battle.couriers[0].hold).toBeCloseTo(OVERRUN_SURCHARGE, 0)
  })

  it("shortens the ride it has bought, because a Courier leaves from where it stands", () => {
    const far = unit({ position: { x: 1500, y: 500 } })
    const battle = fixture([far], headquarters({ x: 100, y: 500 }))
    const hq = battle.armies[0].headquarters
    if (!hq) throw new Error("fixture has no Headquarters")
    const before = estimateDelay(hq.position, far.position)

    rideTo(battle, hq, { x: 500, y: 500 })
    run(battle, 400 / HEADQUARTERS_SPEED + 1)

    expect(estimateDelay(hq.position, far.position)).toBeCloseTo(before - 400 / COURIER_SPEED, 0)
  })

  it("pulls up at impassable Ground rather than fording it", () => {
    const field = blankField(300, 300)
    const water = GROUNDS.indexOf("water")
    // A river down the Field at x = 400m, two cells wide.
    for (let cy = 0; cy < field.height; cy++) {
      for (const cx of [50, 51]) field.ground[cy * field.width + cx] = water
    }
    const battle = fixture([unit()], headquarters({ x: 200, y: 500 }), field)
    const hq = battle.armies[0].headquarters
    if (!hq) throw new Error("fixture has no Headquarters")

    rideTo(battle, hq, { x: 700, y: 500 })
    run(battle, 500 / HEADQUARTERS_SPEED + 1)

    expect(isRiding(hq)).toBe(false)
    expect(hq.position.x).toBeLessThan(400)
    expect(hq.position.x).toBeGreaterThan(380)
  })

  it("pulls up under a face too steep to ride, which no Ground says a word about", () => {
    const field = blankField(300, 300)
    // A scarp at x = 400m: open country the whole way, and a hundred metres of
    // rise across one cell. Rivoli's east face, in the small — nothing painted,
    // and no Unit goes up it.
    for (let cy = 0; cy < field.height; cy++) {
      for (let cx = 50; cx < field.width; cx++) field.elevation[cy * field.width + cx] = 100
    }
    const battle = fixture([unit()], headquarters({ x: 200, y: 500 }), field)
    const hq = battle.armies[0].headquarters
    if (!hq) throw new Error("fixture has no Headquarters")

    rideTo(battle, hq, { x: 700, y: 500 })
    run(battle, 500 / HEADQUARTERS_SPEED + 1)

    expect(isRiding(hq)).toBe(false)
    expect(hq.position.x).toBeLessThan(400)
    expect(hq.position.x).toBeGreaterThan(380)
  })

  it("says it fell short rather than reporting the ground it never reached", () => {
    const field = blankField(300, 300)
    const water = GROUNDS.indexOf("water")
    for (let cy = 0; cy < field.height; cy++) {
      for (const cx of [50, 51]) field.ground[cy * field.width + cx] = water
    }
    const battle = fixture([unit()], headquarters({ x: 200, y: 500 }), field)
    const hq = battle.armies[0].headquarters
    if (!hq) throw new Error("fixture has no Headquarters")

    rideTo(battle, hq, { x: 700, y: 500 })
    run(battle, 500 / HEADQUARTERS_SPEED + 1)

    const settled = battle.dispatches.at(-1)?.text ?? ""
    expect(settled).toContain("could get no further")
    // The distance it fell short is the actionable half: the player has to know
    // how far off the ground he chose the staff is standing.
    expect(settled).toMatch(/\d+m short of the ground it was sent to/)
  })

  it("still says plainly that it arrived, where it did", () => {
    const battle = fixture([unit()], headquarters({ x: 200, y: 500 }))
    const hq = battle.armies[0].headquarters
    if (!hq) throw new Error("fixture has no Headquarters")

    rideTo(battle, hq, { x: 400, y: 500 })
    run(battle, 200 / HEADQUARTERS_SPEED + 1)

    expect(hq.position.x).toBeCloseTo(400, 0)
    expect(battle.dispatches.at(-1)?.text).toBe(
      "The Headquarters is established, and its riders can set off again",
    )
  })
})

describe("the enemy coming at a Headquarters", () => {
  it("harries it from musket shot, and lets it go once the enemy is well clear", () => {
    const enemy = unit({
      id: "e1",
      army: "austrian",
      position: { x: 100 + HARRIED_RANGE - 20, y: 500 },
    })
    const battle = fixture([unit(), enemy], headquarters({ x: 100, y: 500 }))
    const hq = battle.armies.find((a) => a.id === "french")?.headquarters
    if (!hq) throw new Error("fixture has no Headquarters")

    run(battle, STEP)
    expect(hq.harried).toBe(true)

    // Just outside the ring is not clear of it: the release band is wider than
    // the ring on purpose, so a Unit on the threshold cannot flap the state.
    enemy.position = { x: 100 + HARRIED_RANGE + 20, y: 500 }
    run(battle, STEP)
    expect(hq.harried).toBe(true)

    enemy.position = { x: 1000, y: 500 }
    run(battle, STEP)
    expect(hq.harried).toBe(false)
  })

  it("counts a Routing enemy as no threat at all", () => {
    const mob = unit({
      id: "e1",
      army: "austrian",
      position: { x: 150, y: 500 },
      routing: { heading: 0, brokeAt: 0 },
      formation: "march-column",
    })
    const battle = fixture([unit(), mob], headquarters({ x: 100, y: 500 }))
    const hq = battle.armies.find((a) => a.id === "french")?.headquarters
    if (!hq) throw new Error("fixture has no Headquarters")

    run(battle, STEP)
    expect(hq.harried).toBe(false)
  })

  it("is harried by a battery that beats the ground it stands on, from well beyond musket shot", () => {
    const battery = unit({
      id: "e1",
      army: "austrian",
      arm: "artillery",
      formation: "in-battery",
      strength: 120,
      position: { x: 900, y: 500 },
      facing: Math.PI,
    })
    const battle = fixture([unit(), battery], headquarters({ x: 400, y: 500 }))
    const hq = battle.armies.find((a) => a.id === "french")?.headquarters
    if (!hq) throw new Error("fixture has no Headquarters")

    run(battle, STEP)
    expect(distance(battery.position, hq.position)).toBeGreaterThan(HARRIED_RANGE)
    expect(hq.harried).toBe(true)

    // Turned about, the same battery at the same range beats nothing where the
    // staff is standing. The Faces are the rule, not the radius.
    battery.facing = 0
    hq.harried = false
    run(battle, STEP)
    expect(hq.harried).toBe(false)
  })
})

describe("being ridden over", () => {
  it("sends the staff bolting away from whatever reached it, and charges for it once", () => {
    const horse = unit({
      id: "e1",
      army: "austrian",
      arm: "cavalry",
      formation: "line",
      strength: 400,
      position: { x: 100 + OVERRUN_RANGE - 10, y: 500 },
    })
    const battle = fixture([unit(), horse], headquarters({ x: 100, y: 500 }))
    const hq = battle.armies.find((a) => a.id === "french")?.headquarters
    if (!hq) throw new Error("fixture has no Headquarters")

    run(battle, STEP)
    expect(hq.surcharge).toBe(OVERRUN_SURCHARGE)
    expect(isRiding(hq)).toBe(true)
    // Away from the horsemen, which are to the east.
    expect(hq.destination?.x).toBeLessThan(hq.position.x)

    // One Overrun per bolt, however long the regiment sits there: a staff
    // already in the saddle cannot be ridden over again.
    run(battle, 5)
    expect(hq.surcharge).toBe(OVERRUN_SURCHARGE)
    expect(hq.position.x).toBeLessThan(100)
  })

  it("wears the staff down no further than the ceiling", () => {
    const hq = headquarters({ x: 800, y: 500 })
    const horse = unit({ id: "e1", army: "austrian", arm: "cavalry", strength: 400 })
    const battle = fixture([unit(), horse], hq)

    // Ride it over again and again: the enemy is put back on the tables every
    // time the staff settles, which is the chase the ceiling exists to bound.
    for (let i = 0; i < 12; i++) {
      horse.position = { ...hq.position }
      hq.destination = null
      run(battle, STEP)
    }
    expect(hq.surcharge).toBe(MOST_SURCHARGE)
  })
})
