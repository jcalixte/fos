import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { loadScenarioFromDisk } from "./disk"
import { step } from "@/sim/battle"
import { beatsPoint } from "@/sim/fighting"
import { HARRIED_RANGE } from "@/sim/headquarters"
import type { Battle, Headquarters } from "@/sim/types"

/**
 * Rules an authored **initial deployment** has to satisfy — checked against
 * every Scenario on the shelf rather than against the two the design
 * cross-checks against, because an authoring rule is worth nothing if it only
 * holds where somebody happened to look.
 *
 * These are rules about the state at the moment the clock starts, and about
 * nothing after it. What a Commander then does with the staff is his own
 * affair: ADR-0008 makes a Headquarters something the enemy can reach on
 * purpose, and siting it badly is a decision the player is allowed to make.
 * Being handed one already sited badly is not.
 */

const BATTLES = JSON.parse(readFileSync("public/scenarios/index.json", "utf8")) as string[]

/** Why the staff is harried, in words, so a failure says what to move and off what. */
function whatIsOnIt(battle: Battle, headquarters: Headquarters): string {
  const firing = battle.units.filter(
    (u) => u.army !== headquarters.army && beatsPoint(u, headquarters.position),
  )
  const close = battle.units
    .filter((u) => u.army !== headquarters.army)
    .map((u) => ({
      name: u.name,
      range: Math.hypot(
        u.position.x - headquarters.position.x,
        u.position.y - headquarters.position.y,
      ),
    }))
    .filter((u) => u.range <= HARRIED_RANGE)
  const said = [
    ...firing.map((u) => `under fire from ${u.name}`),
    ...close.map((u) => `${u.name} is ${u.range.toFixed(0)}m off`),
  ]
  return said.join("; ") || "harried, and nothing in range says why"
}

describe("no staff starts under the enemy's guns", () => {
  /**
   * A Headquarters authored inside an enemy's beaten ground charges every Order
   * the HARRIED_SURCHARGE from the first minute of the battle to the last, and
   * a Commander who never thinks to move the staff never finds out why. It
   * costs the Book nothing at all — a Plan applies its Orders where they land
   * rather than couriering them — so the Dispatch announces a surcharge that
   * only a human is ever charged. Whatever else an opening position is, it must
   * not be a tax the player cannot see.
   */
  for (const id of BATTLES) {
    it(`${id}: neither Headquarters is Harried when the clock starts`, () => {
      const { battle } = loadScenarioFromDisk(id)
      // One step, because `harried` is set by the rule running and not by the
      // Scenario being read. Nothing has moved a metre in a tenth of a second,
      // so what this catches is the authored position and never a consequence
      // of the battle.
      step(battle)
      for (const army of battle.armies) {
        const headquarters = army.headquarters
        if (!headquarters) continue
        const complaint = headquarters.harried ? whatIsOnIt(battle, headquarters) : ""
        expect(`${army.id}: ${complaint}`).toBe(`${army.id}: `)
      }
    })
  }
})
