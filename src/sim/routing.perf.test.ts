import { describe, expect, it } from "vitest"
import { cellIndex } from "./field"
import { GROUNDS } from "./ground"
import { route } from "./routing"
import { blankField } from "./scenario"

/** F4's target: a Route across the biggest Field in the campaign under 10ms. */
describe("C5 Routing performance", () => {
  it("routes corner to corner on a 250x250 Field inside the budget", () => {
    const field = blankField(250, 250)
    const wood = GROUNDS.indexOf("wood")
    const water = GROUNDS.indexOf("water")
    for (let cy = 0; cy < 250; cy++) {
      for (let cx = 0; cx < 250; cx++) {
        if ((cx * 7 + cy * 13) % 23 === 0) field.ground[cellIndex(field, cx, cy)] = wood
        // A ridge east of the river: passable, but it costs to climb.
        const rise = Math.max(0, Math.min(1, (cx - 190) / 20)) * 20
        field.elevation[cellIndex(field, cx, cy)] = rise
      }
      field.ground[cellIndex(field, 125, cy)] = water
    }
    // One bridge, at the far end of the river from the shortest line.
    field.crossing[cellIndex(field, 125, 230)] = 1

    const from = { x: 20, y: 20 }
    const to = { x: 1960, y: 1960 }
    expect(route(field, from, to).length).toBeGreaterThan(0)

    const runs = 20
    const started = performance.now()
    for (let i = 0; i < runs; i++) route(field, from, { x: to.x, y: to.y - i })
    const each = (performance.now() - started) / runs
    console.log(`worst-case Route on 250x250: ${each.toFixed(2)}ms`)
    expect(each).toBeLessThan(10)
  })
})
