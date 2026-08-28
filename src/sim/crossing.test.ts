import { describe, expect, it } from "vitest"
import { admits, STEP, step } from "./battle"
import { cellAt, cellIndex } from "./field"
import { FRESH } from "./fatigue"
import { GROUNDS } from "./ground"
import { unitWeight } from "./morale"
import { issueOrder } from "./orders"
import { blankField } from "./scenario"
import { defaultStanding } from "./standing"
import type { Battle, Field, Unit } from "./types"
import { distance } from "./vec"

/**
 * The bridge march, headless: the whole chain from a Courier leaving
 * Headquarters to a battalion standing formed on the far bank. This is the
 * fixture DESIGN section 8 names for the courier-delay target, minus its
 * painted terrain — the PNGs are the same Field, drawn.
 */
function bridgeField(): { field: Field; bridge: number } {
  const field = blankField(200, 120)
  const water = GROUNDS.indexOf("water")
  for (let cy = 0; cy < field.height; cy++) {
    for (let d = -2; d <= 2; d++) field.ground[cellIndex(field, 100 + d, cy)] = water
  }
  const bridge = cellIndex(field, 100, 74)
  for (let d = -4; d <= 4; d++) field.crossing[cellIndex(field, 100 + d, 74)] = 1
  return { field, bridge }
}

function battalion(): Unit {
  return {
    id: "fr-4e-1",
    army: "french",
    name: "1er/4e de Ligne",
    arm: "infantry",
    grade: "line",
    strength: 720,
    position: { x: 280, y: 470 },
    facing: 0,
    formation: "line",
    changing: null,
    order: null,
    route: [],
    suspendedBy: null,
    standing: defaultStanding(),
    post: { x: 280, y: 470 },
    shift: null,
    reload: 0,
    morale: 1,
    moraleCeiling: 1,
    fatigue: FRESH,
    blown: false,
    routing: null,
    charging: null,
  }
}

function battle(field: Field, units: Unit[]): Battle {
  return {
    time: 0,
    field,
    armies: [
      {
        id: "french",
        name: "French",
        colour: 0x2f4d8f,
        headquarters: null,
        // What is on the Field is the whole of this fixture's army, so nothing
        // is missing from it and it is nowhere near Army Break.
        weight: units.reduce((total, unit) => total + unitWeight(unit), 0),
        strength: units.reduce((total, unit) => total + unit.strength, 0),
        units: units.length,
      },
    ],
    units,
    couriers: [],
    volleys: [],
    contacts: [],
    dispatches: [],
    crossings: [],
    keyGround: [],
    arrivals: [],
    plan: [],
    clock: 1800,
    outcome: null,
    seed: 179605,
    nextId: 1,
  }
}

describe("the bridge march", () => {
  it("rides an Order out, funnels over the Crossing, and forms up on the far bank", () => {
    const { field } = bridgeField()
    const unit = battalion()
    const b = battle(field, [unit])
    const headquarters = { x: 352, y: 557 }
    const destination = { x: 1000, y: 560 }

    issueOrder(
      b,
      unit.id,
      {
        kind: "move",
        destination,
        arrivalFacing: 0,
        arrivalFormation: "line",
      },
      headquarters,
    )

    let crossedTheBridge = false
    let delivered = false
    let elapsed = 0
    while (elapsed < 3600) {
      step(b)
      elapsed += STEP
      if (unit.order) delivered = true
      else if (delivered) break
      const { cx, cy } = cellAt(field, unit.position)
      if (cx >= 98 && cx <= 102) {
        crossedTheBridge = true
        // Only a march column fits on a Crossing, and it took one on its own.
        expect(unit.formation).toBe("march-column")
        expect(cy).toBe(74)
      }
    }
    expect(delivered).toBe(true)

    const said = b.dispatches.map((d) => d.text)
    expect(said[0]).toContain("received its Order")
    expect(said).toContain("1er/4e de Ligne took march column to cover the ground")
    expect(crossedTheBridge).toBe(true)
    expect(unit.order).toBeNull()
    expect(distance(unit.position, destination)).toBeLessThan(10)
    expect(unit.formation).toBe("line")
    expect(said.at(-1)).toBe("1er/4e de Ligne is in position, line")
  })

  it("will not let a Formation onto a Crossing it does not fit through", () => {
    const { field } = bridgeField()
    const unit = battalion()
    const b = battle(field, [unit])
    const deck = { x: 800, y: 596 }
    // The deck is one cell, eight metres. A battalion in line is 144m across.
    expect(admits(b, { ...unit, formation: "line" }, deck, 0)).toBe(false)
    expect(admits(b, { ...unit, formation: "attack-column" }, deck, 0)).toBe(false)
    expect(admits(b, { ...unit, formation: "march-column" }, deck, 0)).toBe(true)
    // Off the Crossing the question does not arise: open ground admits anything.
    expect(admits(b, { ...unit, formation: "line" }, { x: 400, y: 596 }, 0)).toBe(true)
  })

  it("lets a wider gap through a wider Formation, without being told which", () => {
    // The bridge deck is one cell and only a march column fits. Widen the way
    // through to seven cells — a gorge rather than a bridge — and an attack
    // column 44m across has no reason to file into column for it. Nothing here
    // is authored per Formation: it is Frontage against the gap (F8).
    const { field } = bridgeField()
    for (let cy = 71; cy <= 77; cy++) {
      for (let d = -4; d <= 4; d++) field.crossing[cellIndex(field, 100 + d, cy)] = 1
    }
    const unit = {
      ...battalion(),
      formation: "attack-column" as const,
      position: { x: 700, y: 596 },
    }
    const b = battle(field, [unit])
    // Short of DEPLOY_RANGE, so no rule about covering ground fires either.
    unit.order = {
      order: {
        id: "o1",
        unitId: unit.id,
        body: {
          kind: "move",
          destination: { x: 860, y: 596 },
          arrivalFacing: 0,
          arrivalFormation: "attack-column",
        },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }
    let over = false
    while (b.time < 1200 && unit.order) {
      step(b)
      const { cx } = cellAt(field, unit.position)
      if (cx >= 98 && cx <= 102) {
        over = true
        expect(unit.formation).toBe("attack-column")
      }
    }
    expect(over).toBe(true)
    expect(distance(unit.position, { x: 860, y: 596 })).toBeLessThan(10)
    expect(b.dispatches.map((d) => d.text)).not.toContain(
      "1er/4e de Ligne squeezed into march column for the crossing",
    )
  })

  it("does not deploy for an enemy it can see when the bridge it cannot see is nearer", () => {
    // The band between the two horizons. The battalion is marching in column
    // with the enemy inside ENGAGEMENT_RANGE and the deck two hundred metres
    // off — near enough that it will have to file into column for it, far
    // enough that the lookahead the squeezing rule uses cannot see it.
    //
    // Reading only the lookahead, the deploying rule formed line here, the
    // squeezing rule undid it eighty metres later, and the far bank made line
    // of it a third time: three drills and the best part of two minutes
    // standing still, inside the enemy's reach, to arrive as it set off. So the
    // deploying rule looks as far for a Crossing as it does for the enemy, and
    // the battalion crosses in the column it is already in.
    const { field } = bridgeField()
    const unit = {
      ...battalion(),
      formation: "march-column" as const,
      position: { x: 500, y: 596 },
    }
    const austrian: Unit = {
      ...battalion(),
      id: "au-1",
      army: "austrian",
      name: "IR 14",
      position: { x: 850, y: 700 },
    }
    const b = battle(field, [unit, austrian])
    const destination = { x: 1100, y: 596 }
    unit.order = {
      order: {
        id: "o1",
        unitId: unit.id,
        body: { kind: "move", destination, arrivalFacing: 0, arrivalFormation: "line" },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }

    // The deck is cells 96 to 104 on row 74. Where the Unit stood when it chose
    // to deploy is the whole assertion: on the far side of it, not short of it.
    const deployedAt: number[] = []
    let said = 0
    while (b.time < 1800 && unit.order) {
      step(b)
      while (said < b.dispatches.length) {
        const text = b.dispatches[said++].text
        if (!text.endsWith("the enemy too close to stay on the march")) continue
        deployedAt.push(cellAt(field, unit.position).cx)
      }
    }

    expect(deployedAt).toHaveLength(1)
    expect(deployedAt[0]).toBeGreaterThan(104)
    expect(b.dispatches.map((d) => d.text)).not.toContain(
      "1er/4e de Ligne squeezed into march column for the crossing",
    )
    expect(unit.order).toBeNull()
    expect(unit.formation).toBe("line")
    expect(distance(unit.position, destination)).toBeLessThan(10)
  })

  it("takes longer to reach a Unit on the far flank than one at hand", () => {
    const { field } = bridgeField()
    const near = battalion()
    const far = { ...battalion(), id: "far", position: { x: 1500, y: 900 } }
    const b = battle(field, [near, far])
    const headquarters = { x: 352, y: 557 }
    issueOrder(b, near.id, { kind: "halt" }, headquarters)
    issueOrder(b, far.id, { kind: "halt" }, headquarters)

    let nearAt = 0
    let farAt = 0
    while (b.couriers.length > 0 && b.time < 600) {
      step(b)
      if (nearAt === 0 && near.order) nearAt = b.time
      if (farAt === 0 && far.order) farAt = b.time
    }
    expect(nearAt).toBeGreaterThan(0)
    expect(farAt).toBeGreaterThan(nearAt * 5)
    // 1500m of it, at 13 m/s, is the better part of two minutes.
    expect(farAt).toBeGreaterThan(90)
  })

  it("crosses in column with the enemy in reach, rather than forming and re-forming at the mouth", () => {
    // The rule that squeezes a Unit into column for a Crossing is deliberately
    // not guarded by the enemy being away — crossing under fire is the period's
    // answer. So the rule that deploys a Unit caught on the march must give way
    // to it, or the two take turns and the battalion never sets foot on the deck.
    const { field } = bridgeField()
    const skirmishers: Unit = {
      ...battalion(),
      id: "fr-9e",
      name: "9e Légère",
      strength: 500,
      formation: "open-order",
      position: { x: 700, y: 596 },
    }
    // Within ENGAGEMENT_RANGE of the bank, and beyond either side's range, so
    // it is the threat that is being tested and not the firefight.
    const austrian: Unit = {
      ...battalion(),
      id: "au-1",
      army: "austrian",
      name: "IR 14",
      position: { x: 700, y: 776 },
    }
    const b = battle(field, [skirmishers, austrian])
    const destination = { x: 1000, y: 596 }
    skirmishers.order = {
      order: {
        id: "o1",
        unitId: skirmishers.id,
        body: { kind: "move", destination, arrivalFacing: 0, arrivalFormation: "open-order" },
        issuedAt: 0,
      },
      arrivedAt: 0,
    }

    let over = false
    while (b.time < 1800 && skirmishers.order) {
      step(b)
      const { cx } = cellAt(field, skirmishers.position)
      if (cx >= 98 && cx <= 102) over = true
    }
    const said = b.dispatches.map((d) => d.text)
    const times = (text: string) => said.filter((t) => t === text).length
    expect(times("9e Légère squeezed into march column for the crossing")).toBe(1)
    expect(times("9e Légère deployed, the enemy too close to stay on the march")).toBeLessThan(2)
    expect(over).toBe(true)
    expect(skirmishers.order).toBeNull()
    expect(distance(skirmishers.position, destination)).toBeLessThan(10)
  })
})
