import { describe, expect, it } from "vitest"
import { STEP, step } from "./battle"
import { cellAt, cellIndex } from "./field"
import { GROUNDS } from "./ground"
import { issueOrder } from "./orders"
import { blankField } from "./scenario"
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
  }
}

function battle(field: Field, units: Unit[]): Battle {
  return {
    time: 0,
    field,
    armies: [{ id: "french", name: "French", colour: 0x2f4d8f, headquarters: null }],
    units,
    couriers: [],
    dispatches: [],
    crossings: [],
    keyGround: [],
    arrivals: [],
    plan: [],
    clock: 1800,
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
    expect(said).toContain("1er/4e de Ligne took march column for the road")
    expect(crossedTheBridge).toBe(true)
    expect(unit.order).toBeNull()
    expect(distance(unit.position, destination)).toBeLessThan(10)
    expect(unit.formation).toBe("line")
    expect(said.at(-1)).toBe("1er/4e de Ligne is in position, line")
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
})
