import { describe, expect, it } from "bun:test"
import { step, STEP, unitSpeed } from "./battle"
import { beginCharge } from "./charge"
import { describeFatigue, FRESH, isBlown, weary } from "./fatigue"
import { cellIndex } from "./field"
import { GROUNDS } from "./ground"
import { fireEffect, shake, unitWeight } from "./morale"
import { blankField, entryToUnit } from "./scenario"
import type { Battle, Field, Unit, Vec2 } from "./types"

/**
 * C7's other half: what a Unit spends on its legs, as against what it spends on
 * its nerve. What is being tested throughout is that it is bought by the *pace*
 * and by nothing else — no rule in here knows what a Unit was told to do, so a
 * flank march, a Rout and a gallop are the same arithmetic asked three times,
 * and Formation reaches it only through how fast the Formation walks (F8).
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
      position: overrides.position ?? { x: 100, y: 500 },
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

function run(battle: Battle, seconds: number): void {
  for (let t = 0; t < seconds; t += STEP) step(battle)
}

/** Step until the Unit has put its Order down, and answer what it cost it. */
function marchOff(battle: Battle, unit: Unit, limit = 900): number {
  let elapsed = 0
  while (elapsed < limit && unit.order) {
    step(battle)
    elapsed += STEP
  }
  expect(unit.order).toBeNull()
  return unit.fatigue
}

/** A Field of nothing but marsh, to be waded rather than walked. */
function marsh(): Field {
  const field = blankField(300, 300)
  const wet = GROUNDS.indexOf("marsh")
  for (let y = 0; y < field.height; y++) {
    for (let x = 0; x < field.width; x++) field.ground[cellIndex(field, x, y)] = wet
  }
  return field
}

describe("what tires a Unit", () => {
  it("puts it on the Field with its whole wind, and no Roster says otherwise", () => {
    expect(unit().fatigue).toBe(FRESH)
    expect(describeFatigue(unit())).toBe("fresh")
    expect(isBlown(unit())).toBe(false)
  })

  it("tires on the march, and gives it back to a Unit standing still", () => {
    const marching = unit({ formation: "march-column" })
    const battle = fixture([marching])
    sendTo(marching, { x: 250, y: 500 })
    run(battle, 100)
    const spent = marching.fatigue
    expect(spent).toBeGreaterThan(0)

    // Halted, and getting its wind back — slowly enough that it is a decision
    // about the rest of the afternoon and not a pause. Half a minute standing
    // does not undo a minute and a half of marching.
    marching.order = null
    run(battle, 30)
    expect(marching.fatigue).toBeLessThan(spent)
    expect(marching.fatigue).toBeGreaterThan(0)
  })

  it("charges the pace and not the Order, so a column pays a line thrice over the same ground", () => {
    const column = unit({ formation: "march-column" })
    const columnBattle = fixture([column])
    sendTo(column, { x: 250, y: 500 })

    const line = unit({ formation: "line" })
    const lineBattle = fixture([line])
    sendTo(line, { x: 250, y: 500 })

    // The same hundred and fifty metres, walked at 1.4 m/s and at 0.8. Short of
    // DEPLOY_RANGE on purpose: Initiative files a Unit into column for anything
    // longer, and what is being measured here is the Formation's own pace.
    const hurried = marchOff(columnBattle, column)
    const dawdled = marchOff(lineBattle, line)
    expect(hurried).toBeGreaterThan(dawdled)
    // The cube of 1.4 against 0.8, over the same ground: about three. It is the
    // whole of what Formation does to Fatigue, and it is not authored anywhere
    // — there is no rate per Formation, only a speed per Formation (F8).
    const ratio = hurried / dawdled
    expect(ratio).toBeGreaterThan(2.5)
    expect(ratio).toBeLessThan(3.6)
  })

  it("pays for a marsh in work rather than being refunded it", () => {
    const wading = unit({ formation: "march-column" })
    const wet = fixture([wading], marsh())
    sendTo(wading, { x: 250, y: 500 })

    const walking = unit({ formation: "march-column" })
    const dry = fixture([walking])
    sendTo(walking, { x: 250, y: 500 })

    // The same ground both times. The marsh gives back none of the effort it
    // takes off the pace: a battalion in it is putting in a column's work for a
    // fraction of the distance, and it is in there twice as long doing it.
    expect(marchOff(wet, wading)).toBeGreaterThan(marchOff(dry, walking) * 1.8)
  })

  it("costs a gallop many times what the same ground costs at the march", () => {
    const battle = fixture([unit({ arm: "cavalry" })])
    const galloping = unit({ arm: "cavalry" })
    const walking = unit({ arm: "cavalry", id: "u2" })
    // A hundred metres each: fourteen seconds at seven metres a second against
    // forty at two and a half.
    weary(battle, galloping, 7, 100 / 7)
    weary(battle, walking, 2.5, 100 / 2.5)
    const ratio = galloping.fatigue / walking.fatigue
    expect(ratio).toBeGreaterThan(6)
    expect(ratio).toBeLessThan(10)
  })

  it("says a Unit is blown once, at the moment it stops being able to charge", () => {
    const battle = fixture([unit({ arm: "cavalry" })])
    const horse = battle.units[0]
    while (!isBlown(horse)) weary(battle, horse, 7, STEP)
    const said = (text: string): number =>
      battle.dispatches.filter((d) => d.text === `${horse.name} ${text}`).length
    expect(said("is blown")).toBe(1)
    expect(describeFatigue(horse)).toBe("blown")

    // And not again for every step it stays blown.
    weary(battle, horse, 7, 60)
    expect(said("is blown")).toBe(1)
  })

  it("does not un-blow a regiment on half a minute's standing, and says when it does", () => {
    const battle = fixture([unit({ arm: "cavalry" })])
    const horse = battle.units[0]
    while (!isBlown(horse)) weary(battle, horse, 7, STEP)

    // Thirty seconds in hand, which under one mark was a regiment let go again:
    // its Fatigue is back under the mark it crossed and it is still blown.
    const rest = (seconds: number): void => {
      for (let t = 0; t < seconds; t += STEP) weary(battle, horse, 0, STEP)
    }
    rest(30)
    expect(horse.fatigue).toBeLessThan(0.6)
    expect(isBlown(horse)).toBe(true)
    expect(describeFatigue(horse)).toBe("blown")

    // Four minutes is the price, and the way back out is said once, because a
    // Charge going back on the table is a thing the player can act on.
    rest(240)
    expect(isBlown(horse)).toBe(false)
    expect(
      battle.dispatches.filter((d) => d.text === `${horse.name} has its wind back`),
    ).toHaveLength(1)
  })

  it("reads the state and not the figure, so two regiments alike in Fatigue differ", () => {
    const rested = unit({ arm: "cavalry", strength: 400, fatigue: 0.5 })
    const spent = unit({ id: "u2", arm: "cavalry", strength: 400, fatigue: 0.5, blown: true })
    const enemy = unit({ id: "e1", army: "austrian", position: { x: 400, y: 500 } })
    const battle = fixture([rested, spent, enemy])

    // The same Fatigue, between the two marks. One of them has been blown this
    // afternoon and the other has only been marching, and that is the whole
    // difference — the way out is not the way in.
    expect(beginCharge(battle, rested, enemy.id)).toBe(true)
    expect(beginCharge(battle, spent, enemy.id)).toBe(false)
  })
})

describe("what Fatigue costs", () => {
  it("slows a blown Unit without stopping it", () => {
    const battle = fixture([unit(), unit({ id: "u2", fatigue: 1 })])
    const [fresh, blown] = battle.units
    const spentPace = unitSpeed(battle, blown)
    expect(spentPace).toBeLessThan(unitSpeed(battle, fresh))
    expect(spentPace).toBeGreaterThan(unitSpeed(battle, fresh) / 2)
  })

  it("blunts its fire, at the one place Morale already answers for it", () => {
    // The same nerve and different legs: heavy arms and a slow cartridge, which
    // is a fact about the men and not about the Volley's geometry.
    expect(fireEffect(unit({ fatigue: 1 }))).toBeLessThan(fireEffect(unit()))
  })

  it("makes a tired battalion go sooner than a fresh one under the same fire", () => {
    const fresh = unit()
    const blown = unit({ fatigue: 1 })
    const from = { x: fresh.position.x, y: fresh.position.y + 100 }
    shake(fresh, 100, from)
    shake(blown, 100, from)
    expect(blown.morale).toBeLessThan(fresh.morale)
  })

  it("will not let a blown regiment go at anybody, and says why", () => {
    const horse = unit({ arm: "cavalry", name: "7e Hussards", strength: 400, fatigue: 1 })
    const enemy = unit({ id: "e1", name: "IR 23", army: "austrian", position: { x: 300, y: 500 } })
    const battle = fixture([horse, enemy])
    horse.order = {
      order: {
        id: "o1",
        unitId: horse.id,
        body: { kind: "charge", targetId: enemy.id },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }

    step(battle)
    expect(horse.charging).toBeNull()
    // The Order goes down with it: a regiment that will not go is not left
    // walking up to be ridden down by whatever it was aimed at.
    expect(horse.order).toBeNull()
    expect(battle.dispatches.at(-1)?.text).toBe("7e Hussards is blown, and would not go at IR 23")
  })

  it("stands a blown regiment to receive rather than letting it meet the charge", () => {
    const mine = unit({ arm: "cavalry", strength: 400, fatigue: 1, position: { x: 100, y: 500 } })
    const theirs = unit({
      id: "e1",
      army: "austrian",
      arm: "cavalry",
      strength: 400,
      position: { x: 200, y: 500 },
      facing: Math.PI,
    })
    theirs.charging = { targetId: mine.id, launchedAt: 0, recoiling: false, pursuing: false }
    const battle = fixture([mine, theirs])

    step(battle)
    // Horse standing to receive is horse ridden over, and that is the price of
    // having been let go twice already — the rule list offers the countercharge
    // and the regiment has nothing left to take it up with.
    expect(mine.charging).toBeNull()
  })
})

describe("what an afternoon comes to", () => {
  it("leaves a battalion that marched the whole clock winded, and not blown", () => {
    const marching = unit({ formation: "march-column" })
    const battle = fixture([marching], blankField(600, 600))
    // Thirty minutes of marching, which is the whole of ADR-0006's clock and
    // more ground than any Field holds. Re-aimed rather than left to arrive,
    // so what is being measured is the march and never the standing about.
    for (let t = 0; t < 1800; t += STEP) {
      if (!marching.order) sendTo(marching, { x: 4000, y: 500 })
      step(battle)
    }
    // Half spent, and not three quarters, because the cost is self-limiting: a
    // tired battalion is walking slower and is therefore asking less of its men
    // than a fresh one on the same Order. Thirty minutes on the road is a Unit
    // worth less than the one that stood still, and still a Unit that fights.
    expect(marching.fatigue).toBeGreaterThan(0.45)
    expect(marching.fatigue).toBeLessThan(0.65)
    expect(describeFatigue(marching)).toBe("winded")
  })
})
