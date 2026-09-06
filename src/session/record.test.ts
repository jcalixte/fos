import { describe, expect, it } from "bun:test"
import { battleRecord, recordName, type RecordHead } from "./record"
import type { ArmyReturn } from "@/sim/return"
import type { BattleSnapshot, UnitSnapshot } from "@/sim/snapshot"

/**
 * The record is a workbench tool, so the thing worth testing is the promise it
 * makes to whoever reads one: that what is not in it is said to be missing
 * rather than left to look like nothing happened.
 */

function unit(over: Partial<UnitSnapshot> = {}): UnitSnapshot {
  return {
    id: "fr-1",
    army: "fr",
    name: "12e Ligne",
    arm: "infantry",
    grade: "line",
    strength: 480,
    position: { x: 1204.4, y: 880.6 },
    facing: 0,
    formation: "line",
    changingTo: null,
    changeProgress: 0,
    morale: "steady",
    disordered: false,
    routing: false,
    charging: null,
    recoiling: false,
    pursuing: false,
    report: {
      fatigue: "fresh",
      aiming: null,
      suspendedBy: null,
      hasOrder: true,
      standing: "hold-ground",
      briefedTo: null,
      dictated: false,
      shifting: false,
      speed: 1.2,
    },
    ...over,
  }
}

function snapshot(over: Partial<BattleSnapshot> = {}): BattleSnapshot {
  return {
    time: 1420,
    units: [unit()],
    couriers: [],
    ghosts: [],
    headquarters: [],
    keyGround: [],
    volleys: [],
    contacts: [],
    dispatches: [{ at: 60, unitId: "fr-1", army: "fr", text: "12e Ligne is under fire" }],
    ...over,
  }
}

const RETURNS: ArmyReturn[] = [
  {
    id: "fr",
    name: "French",
    colour: 0x1e40af,
    inHand: 12,
    running: 2,
    gone: 1,
    strength: 4810,
    mustered: 6000,
    towardBreak: 0.21,
    keyGround: ["the chapel"],
  },
  {
    id: "au",
    name: "Austrians",
    colour: 0xb91c1c,
    inHand: 9,
    running: 0,
    gone: 0,
    strength: 5200,
    mustered: 5600,
    towardBreak: 0.04,
    keyGround: [],
  },
]

const SEAT: RecordHead = {
  battle: "rivoli",
  name: "Rivoli",
  clock: 2400,
  army: "fr",
  outcome: null,
}

describe("the record", () => {
  it("stamps the moment it was taken against the length of the day", () => {
    expect(battleRecord(SEAT, snapshot(), RETURNS)).toStartWith("Rivoli — 23:40 of 40:00\n")
  })

  it("says which seat it was written from, and that a seat is a cut", () => {
    const written = battleRecord(SEAT, snapshot(), RETURNS)
    expect(written).toContain("the French seat")
    // The whole point of the line: a reader must not take a quiet feed for a
    // quiet afternoon on the other side of the Field.
    expect(written).toContain("were never sent to it")
  })

  it("says the Book withheld nothing", () => {
    const written = battleRecord({ ...SEAT, army: null }, snapshot(), RETURNS)
    expect(written).toContain("the Book")
    expect(written).toContain("nothing is withheld")
  })

  it("carries the Return, the Units and the feed, not the feed alone", () => {
    const written = battleRecord(SEAT, snapshot(), RETURNS)
    expect(written).toContain("4810 of 6000")
    expect(written).toContain("12e Ligne")
    expect(written).toContain("12e Ligne is under fire")
    // The stamp on a Dispatch is battle time, minutes and seconds.
    expect(written).toContain("1:00")
  })

  it("names the other army's Units and reports nothing about them", () => {
    const enemy = unit({ id: "au-1", army: "au", name: "IR 44", report: null })
    const written = battleRecord(SEAT, snapshot({ units: [unit(), enemy] }), RETURNS)
    const row = written.split("\n").find((line) => line.includes("IR 44"))
    // On the Field and so on the roll, with the Report-only columns dashed:
    // a blank there would read as a Unit with no orders rather than one whose
    // orders are none of this Commander's business.
    expect(row).toContain("Austrians")
    expect(row).toContain("—")
  })

  it("says outright when nothing has been reported", () => {
    expect(battleRecord(SEAT, snapshot({ dispatches: [] }), RETURNS)).toContain(
      "Nothing has been reported.",
    )
  })

  it("names the file for the battle, the seat and the moment", () => {
    expect(recordName(SEAT, 1420)).toBe("rivoli-fr-23m40s.txt")
    expect(recordName({ ...SEAT, army: null }, 65)).toBe("rivoli-book-1m05s.txt")
  })
})
