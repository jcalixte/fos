import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { type Campaign, type CatalogueEntry, shelve } from "./catalogue"
import type { ScenarioFile } from "@/sim/scenario"

/**
 * A Campaign is a shelf, and a shelf's whole job is that everything on offer is
 * on one. The membership lives in two files that never mention each other — a
 * Scenario names its Campaign, `campaigns.json` names what Campaigns there are
 * — so the only place the two can be checked against each other is here.
 */

function battle(id: string, campaign: string): CatalogueEntry {
  return { id, name: id, campaign, summary: "", clock: 1800, armies: [] }
}

const SHELVES: Campaign[] = [
  { id: "italy-1796", name: "Italy", years: "1796–97", summary: "" },
  { id: "drills", name: "Drills", summary: "" },
]

describe("shelve", () => {
  it("puts each battle under the Campaign it named", () => {
    const shelved = shelve(SHELVES, [battle("rivoli", "italy-1796"), battle("bridge", "drills")])
    expect(shelved.map((s) => s.id)).toEqual(["italy-1796", "drills"])
    expect(shelved[0]?.battles.map((b) => b.id)).toEqual(["rivoli"])
    expect(shelved[1]?.battles.map((b) => b.id)).toEqual(["bridge"])
  })

  it("keeps both orderings the ones somebody authored", () => {
    // Reversed against the shelf order, and out of the order they are given in.
    const shelved = shelve(SHELVES, [
      battle("bridge", "drills"),
      battle("rivoli", "italy-1796"),
      battle("arcole", "italy-1796"),
    ])
    expect(shelved.map((s) => s.id)).toEqual(["italy-1796", "drills"])
    expect(shelved[0]?.battles.map((b) => b.id)).toEqual(["rivoli", "arcole"])
  })

  it("leaves out a Campaign nothing was shelved under", () => {
    const shelved = shelve(SHELVES, [battle("rivoli", "italy-1796")])
    expect(shelved.map((s) => s.id)).toEqual(["italy-1796"])
  })

  it("throws on a battle shelved under a Campaign that does not exist", () => {
    // Silently dropping it would take the battle off the list it is named in,
    // which is the one failure a player could not tell from a missing file.
    expect(() => shelve(SHELVES, [battle("wagram", "danube-1809")])).toThrow(/danube-1809/)
  })
})

describe("the authored shelf", () => {
  const campaigns = JSON.parse(readFileSync("public/campaigns.json", "utf8")) as Campaign[]
  const offered = JSON.parse(
    readFileSync(join("public", "scenarios", "index.json"), "utf8"),
  ) as string[]
  const files = offered.map(
    (id) =>
      [
        id,
        JSON.parse(
          readFileSync(join("public", "scenarios", id, "scenario.json"), "utf8"),
        ) as ScenarioFile,
      ] as const,
  )

  it("names every Campaign exactly once", () => {
    const ids = campaigns.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("shelves every battle on offer", () => {
    const entries = files.map(([id, file]) => ({ ...battle(id, file.campaign), name: file.name }))
    const shelved = shelve(campaigns, entries)
    expect(shelved.flatMap((s) => s.battles).length).toBe(offered.length)
  })
})
