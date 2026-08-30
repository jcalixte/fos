import { describe, expect, it } from "vitest"
import { step, STEP } from "./battle"
import { beginCharge } from "./charge"
import { disarrange, isDisordered, ORDERED, orderLeft, reformingSeconds } from "./disorder"
import { beginChange, drillSeconds } from "./formation"
import { breakUnit, fireEffect, unitWeight } from "./morale"
import { blankField, entryToUnit } from "./scenario"
import type { Battle, Field, Unit, Vec2 } from "./types"

/**
 * C7's third: what a Unit spends on its ranks, as against its nerve and its
 * legs. What is being tested throughout is that Disorder is something that
 * *happens* to a Unit and never something it does — two causes and no third,
 * three costs and no fourth, and one way out, which is standing still.
 */

function unit(overrides: Partial<Unit> = {}): Unit {
  const base = entryToUnit(
    {
      id: overrides.id ?? "u1",
      name: overrides.name ?? "12e Ligne",
      arm: overrides.arm ?? "infantry",
      grade: overrides.grade ?? "line",
      strength: overrides.strength ?? 700,
      formation: overrides.formation ?? "line",
      position: overrides.position ?? { x: 400, y: 400 },
      facing: overrides.facing ?? 0,
    } as never,
    overrides.army ?? "french",
  )
  return { ...base, ...overrides, post: overrides.post ?? { ...base.position } }
}

function fixture(units: Unit[], field?: Field): Battle {
  const armies = new Map<string, Battle["armies"][number]>()
  for (const u of units) {
    const army = armies.get(u.army) ?? {
      id: u.army,
      name: u.army,
      colour: 0x2c7c40,
      headquarters: null,
      weight: 0,
      strength: 0,
      units: 0,
    }
    army.weight += unitWeight(u)
    army.strength += u.strength
    army.units += 1
    armies.set(u.army, army)
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
    clock: 3600,
    outcome: null,
    seed: 1,
    nextId: 1,
  }
}

function run(battle: Battle, seconds: number): void {
  for (let t = 0; t < seconds; t += STEP) step(battle)
}

/**
 * A Charge Order already arrived, which is how a Pursuit is reached: the Charge
 * *state* alone is never advanced by C8 — an Order carries it, or the rule list
 * suspends one — so a fixture that only set `charging` would watch a regiment
 * stand still with its sabres out.
 */
function letGoAt(unit: Unit, targetId: string): void {
  unit.order = {
    order: { id: `c-${unit.id}`, unitId: unit.id, body: { kind: "charge", targetId }, issuedAt: 0 },
    arrivedAt: 0,
  }
}

/** A Move Order already arrived, since no Courier rides in these fixtures. */
function sendTo(unit: Unit, destination: Vec2): void {
  unit.order = {
    order: {
      id: `o-${unit.id}`,
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
  unit.post = { ...destination }
}

describe("what Disorder is", () => {
  it("puts a Unit on the Field with its ranks its own, and no Roster says otherwise", () => {
    expect(unit().disorder).toBe(ORDERED)
    expect(isDisordered(unit())).toBe(false)
  })

  it("is a state and not a scale: either Ordered or in Disorder", () => {
    const battle = fixture([unit()])
    const u = battle.units[0]
    disarrange(battle, u, "for the test")
    expect(isDisordered(u)).toBe(true)
    // Half a drill in is still exactly as disordered as none of one.
    run(battle, reformingSeconds(u) / 2)
    expect(isDisordered(u)).toBe(true)
    expect(orderLeft(u)).toBe(orderLeft(battle.units[0]))
  })

  it("costs the drill out of the loosest order there is, and takes it from C3", () => {
    // Nothing in `disorder.ts` says how long re-forming takes: it is the same
    // table that says how long a battalion takes to file into square, read from
    // the one row that stands for men who have let go of each other.
    for (const formation of ["line", "square", "attack-column"] as const) {
      const u = unit({ formation })
      expect(reformingSeconds(u)).toBe(drillSeconds(u.arm, u.grade, "open-order", formation))
    }
  })

  it("costs a conscript more than an elite, because re-forming is drill", () => {
    const green = reformingSeconds(unit({ grade: "conscript" }))
    const old = reformingSeconds(unit({ grade: "elite" }))
    expect(green).toBeGreaterThan(old)
  })

  it("says so once when it sets in, however long the cause stays on it", () => {
    const battle = fixture([unit()])
    const u = battle.units[0]
    disarrange(battle, u, "for the test")
    disarrange(battle, u, "for the test")
    disarrange(battle, u, "for the test")
    expect(battle.dispatches.filter((d) => d.text.includes("in disorder"))).toHaveLength(1)
  })
})

describe("what buys it", () => {
  it("is bought by riding a mob down, which is the third price of a Pursuit", () => {
    const horse = unit({
      id: "cav",
      name: "1er Hussards",
      arm: "cavalry",
      strength: 280,
      position: { x: 400, y: 400 },
    })
    // Well clear of it, so what disorders the horse can only be the ride and
    // never the mob having been standing on top of it when it broke.
    const mob = unit({ id: "mob", name: "IR 10", army: "austrian", position: { x: 600, y: 400 } })
    const battle = fixture([horse, mob])
    breakUnit(battle, mob)
    letGoAt(horse, mob.id)
    run(battle, 5)
    expect(isDisordered(horse)).toBe(false)
    run(battle, 60)
    expect(isDisordered(horse)).toBe(true)
    expect(battle.dispatches.some((d) => d.text.includes("loose among"))).toBe(true)
  })

  it("is bought by a mob coming back through a formed Unit, either army's", () => {
    for (const army of ["french", "austrian"] as const) {
      const line = unit({ id: "line", name: "12e Ligne" })
      const mob = unit({ id: "mob", name: "IR 10", army, position: { x: 400, y: 340 } })
      const battle = fixture([line, mob])
      breakUnit(battle, mob)
      // Pointed at the line, so the run for the rear takes it straight through.
      mob.routing = { heading: Math.PI / 2, brokeAt: 0 }
      run(battle, 30)
      expect(isDisordered(line)).toBe(true)
      expect(battle.dispatches.some((d) => d.text.includes("came back through it"))).toBe(true)
    }
  })

  it("is not carried by the mob itself: a Rout is a dearer bill, charged instead", () => {
    const battle = fixture([unit()])
    const u = battle.units[0]
    disarrange(battle, u, "for the test")
    breakUnit(battle, u)
    expect(u.disorder).toBe(ORDERED)
  })
})

describe("what it costs", () => {
  it("takes half a Unit's fire, beside Morale and Fatigue and never instead of them", () => {
    const battle = fixture([unit()])
    const u = battle.units[0]
    const formed = fireEffect(u)
    disarrange(battle, u, "for the test")
    expect(fireEffect(u)).toBeCloseTo(formed / 2, 6)
  })

  it("denies a Formation change, and the Order stands until the ranks are back", () => {
    const battle = fixture([unit()])
    const u = battle.units[0]
    disarrange(battle, u, "for the test")
    u.order = {
      order: { id: "o1", unitId: u.id, body: { kind: "form", formation: "square" }, issuedAt: 0 },
      arrivedAt: 0,
    }
    step(battle)
    expect(u.changing).toBeNull()
    // Standing still is what mends it, and the Order it could not obey is what
    // it obeys the moment it has.
    run(battle, reformingSeconds(u) + 1)
    expect(isDisordered(u)).toBe(false)
    expect(u.changing?.to).toBe("square")
  })

  it("lets go of the rule that suspended the Order for the drill it ruined", () => {
    // Without this the rule that fired goes on holding the Order — it is asked
    // no further questions while it is the one suspending — and the Unit stands
    // in an empty field with a square it will never start.
    const horse = unit({ id: "cav", name: "1er Hussards", arm: "cavalry", strength: 280 })
    const line = unit({ id: "line", army: "austrian", position: { x: 560, y: 400 } })
    const mob = unit({ id: "mob", name: "IR 10", army: "austrian", position: { x: 560, y: 340 } })
    const battle = fixture([horse, line, mob])
    letGoAt(horse, line.id)
    // Far enough to be still walking up, and near enough that the battalion has
    // begun its square: the rule is holding the Order and the drill is running.
    run(battle, 2)
    expect(line.suspendedBy).toBe("formed square, cavalry coming on")
    expect(line.changing?.to).toBe("square")
    breakUnit(battle, mob)
    mob.routing = { heading: Math.PI / 2, brokeAt: battle.time }
    run(battle, 20)
    expect(isDisordered(line)).toBe(true)
    expect(line.changing).toBeNull()
    expect(line.suspendedBy).toBeNull()
  })

  it("ruins a drill already under way", () => {
    const battle = fixture([unit()])
    const u = battle.units[0]
    expect(beginChange(u, "square")).toBe(true)
    run(battle, 10)
    expect(u.changing).not.toBeNull()
    disarrange(battle, u, "for the test")
    expect(u.changing).toBeNull()
    expect(u.formation).toBe("line")
  })

  it("denies a Charge, whoever asks for it", () => {
    const horse = unit({ id: "cav", arm: "cavalry", strength: 280 })
    const enemy = unit({ id: "e", army: "austrian", position: { x: 600, y: 400 } })
    const battle = fixture([horse, enemy])
    disarrange(battle, horse, "for the test")
    expect(beginCharge(battle, horse, enemy.id)).toBe(false)
  })

  it("kills a Charge Order at the Unit, with a Dispatch saying why", () => {
    const horse = unit({ id: "cav", name: "1er Hussards", arm: "cavalry", strength: 280 })
    const enemy = unit({ id: "e", army: "austrian", position: { x: 600, y: 400 } })
    const battle = fixture([horse, enemy])
    disarrange(battle, horse, "for the test")
    horse.order = {
      order: { id: "o1", unitId: horse.id, body: { kind: "charge", targetId: "e" }, issuedAt: 0 },
      arrivedAt: 0,
    }
    step(battle)
    expect(horse.order).toBeNull()
    expect(horse.charging).toBeNull()
    expect(battle.dispatches.some((d) => d.text.includes("is in disorder, and would not go"))).toBe(
      true,
    )
  })

  it("does not stop a Unit marching: it is the ranks that are lost, not the legs", () => {
    const battle = fixture([unit({ formation: "march-column" })])
    const u = battle.units[0]
    disarrange(battle, u, "for the test")
    sendTo(u, { x: 700, y: 400 })
    run(battle, 30)
    expect(u.position.x).toBeGreaterThan(420)
  })
})

describe("the way out", () => {
  it("is standing still, and nothing else", () => {
    const battle = fixture([unit({ formation: "march-column" })])
    const u = battle.units[0]
    disarrange(battle, u, "for the test")
    const owed = u.disorder
    sendTo(u, { x: 2000, y: 400 })
    run(battle, owed * 2)
    expect(u.disorder).toBe(owed)
    expect(isDisordered(u)).toBe(true)
  })

  it("takes the whole drill, and says so when it is done", () => {
    const battle = fixture([unit()])
    const u = battle.units[0]
    disarrange(battle, u, "for the test")
    const owed = reformingSeconds(u)
    run(battle, owed - 1)
    expect(isDisordered(u)).toBe(true)
    run(battle, 2)
    expect(isDisordered(u)).toBe(false)
    expect(fireEffect(u)).toBe(fireEffect(unit()))
    expect(battle.dispatches.some((d) => d.text.includes("has its ranks back"))).toBe(true)
  })

  it("does not start while the cause is still on it: a Pursuit is paid for on the walk home", () => {
    const horse = unit({
      id: "cav",
      name: "1er Hussards",
      arm: "cavalry",
      strength: 280,
      position: { x: 400, y: 400 },
    })
    const mob = unit({ id: "mob", name: "IR 10", army: "austrian", position: { x: 600, y: 400 } })
    const battle = fixture([horse, mob])
    breakUnit(battle, mob)
    letGoAt(horse, mob.id)
    // Long enough that the whole drill would have run twice over if standing
    // among them counted as standing still.
    run(battle, 60 + reformingSeconds(horse) * 2)
    expect(isDisordered(horse)).toBe(true)
  })
})
