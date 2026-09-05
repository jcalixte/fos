import { describe, expect, it } from "bun:test"
import { loadScenarioFromDisk } from "@/scenario/disk"
import { step } from "@/sim/battle"
import { sendOrder } from "@/sim/headquarters"
import { noSnapshot, snapshot, type UnitSnapshot, type VolleySnapshot } from "@/sim/snapshot"
import type { Battle } from "@/sim/types"
import { listen, listening, type Noise, SOUNDINGS_PER_STEP } from "./listen"

/**
 * F15, asserted against a real authored battle rather than a fixture, the way
 * F22's cut is in `sim/cut.test.ts`.
 *
 * What is worth testing about sound is not what it sounds like. It is that a
 * Volley is heard once and not six times — the screen runs at 60fps over a
 * simulation at 10Hz, so every snapshot is handed over about six times — that a
 * Rout is heard when a Unit breaks and not for every step it spends running,
 * and that a Commander hears his own Orders arrive and not the other man's.
 * Every one of those is a thing that goes wrong silently and is heard as *the
 * game sounds wrong* rather than reported as a fault.
 *
 * An untaken Castiglione will not do. Its authored Plans set Orders directly
 * and put no rider on the road at all, so in twenty headless minutes it makes
 * gunfire, two Routs and nothing else. The battle below is therefore commanded:
 * every French battalion is sent at the nearest Austrian, which buys Couriers,
 * Charges, Contacts, musketry and Routs out of one run.
 */

const FRENCH = "french"
const AUSTRIAN = "austrian"

/** Fifteen minutes, which is where the last of the six kinds has been heard. */
const STEPS = 9000

/** Frames the screen draws one step of simulation over: 60fps against 10Hz. */
const FRAMES_PER_STEP = 6

interface Run {
  battle: Battle
  /** What each Commander heard, and what a snapshot cut for nobody carries. */
  french: Record<string, number>
  austrian: Record<string, number>
  uncut: Record<string, number>
  /** Volleys the battle actually fired, split by who fired them. */
  fired: { gun: number; musket: number }
  /** Units that went from standing to Routing, counted off the Battle itself. */
  routs: number
  /** The most Soundings any one step produced. */
  busiest: number
}

function commanded(): Run {
  const { battle } = loadScenarioFromDisk("castiglione")
  const staff = (army: string) => battle.armies.find((a) => a.id === army)!.headquarters!
  const mine = battle.units.filter((unit) => unit.army === FRENCH)
  const theirs = battle.units.filter((unit) => unit.army === AUSTRIAN)

  for (const unit of mine) {
    const near = theirs.reduce((best, t) =>
      Math.hypot(t.position.x - unit.position.x, t.position.y - unit.position.y) <
      Math.hypot(best.position.x - unit.position.x, best.position.y - unit.position.y)
        ? t
        : best,
    )
    sendOrder(battle, staff(FRENCH), unit.id, { kind: "charge", targetId: near.id })
  }
  // The other Commander says something too, so that "he hears his own Orders"
  // is a claim with something on the far side of it to not hear.
  for (const unit of theirs) {
    sendOrder(battle, staff(AUSTRIAN), unit.id, { kind: "standing", latitude: "hold-ground" })
  }

  const ears = { french: listening(), austrian: listening(), uncut: listening() }
  const run: Run = {
    battle,
    french: {},
    austrian: {},
    uncut: {},
    fired: { gun: 0, musket: 0 },
    routs: 0,
    busiest: 0,
  }
  const arm = new Map(battle.units.map((unit) => [unit.id, unit.arm]))
  let routing = new Set<string>()

  for (let i = 0; i < STEPS; i++) {
    step(battle)
    // Counted off the Battle rather than off the snapshot, so the expectation
    // is arrived at by a different road from the one being tested.
    for (const volley of battle.volleys) {
      if (arm.get(volley.unitId) === "artillery") run.fired.gun++
      else run.fired.musket++
    }
    for (const unit of battle.units) if (unit.routing && !routing.has(unit.id)) run.routs++
    routing = new Set(battle.units.filter((unit) => unit.routing).map((unit) => unit.id))

    // Handed over the way the screen hands it over: one step of simulation is
    // drawn about six times, and every one of those is a call to `listen`.
    const state = snapshot(battle, FRENCH)
    const heard = listen(ears.french, state)
    run.busiest = Math.max(run.busiest, heard.length)
    for (const sounding of heard) tally(run.french, sounding.noise)
    for (let frame = 1; frame < FRAMES_PER_STEP; frame++) {
      for (const sounding of listen(ears.french, state)) tally(run.french, sounding.noise)
    }
    for (const s of listen(ears.austrian, snapshot(battle, AUSTRIAN))) tally(run.austrian, s.noise)
    for (const s of listen(ears.uncut, snapshot(battle, null))) tally(run.uncut, s.noise)
    if (battle.outcome) break
  }
  return run
}

function tally(into: Record<string, number>, noise: Noise): void {
  into[noise] = (into[noise] ?? 0) + 1
}

describe("what the Field is heard doing", () => {
  const run = commanded()

  it("makes every one of the six sounds F15 asks for", () => {
    const kinds: Noise[] = ["volley", "gun", "charge", "contact", "rout", "order"]
    for (const kind of kinds) expect(run.french[kind] ?? 0).toBeGreaterThan(0)
  })

  it("hears every Volley once, and tells a gun from a battalion", () => {
    // The whole point. A snapshot is handed over about six times — 60fps over
    // 10Hz — and a Volley heard per frame rather than per step is six volleys.
    expect(run.french.gun).toBe(run.fired.gun)
    expect(run.french.volley).toBe(run.fired.musket)
  })

  it("hears a Rout when a Unit breaks, and not once for every step it runs", () => {
    expect(run.french.rout).toBe(run.routs)
    // Not vacuous: a Unit that Routs stays Routing for many steps, so a rule
    // reading the state instead of the change would be out by two orders here.
    expect(run.routs).toBeGreaterThan(0)
  })

  it("never hands over more than one step's worth at once", () => {
    expect(run.busiest).toBeLessThanOrEqual(SOUNDINGS_PER_STEP)
    // And the cap did not quietly do the work of the assertions above.
    expect(run.busiest).toBeLessThan(SOUNDINGS_PER_STEP)
  })

  it("is silent when handed a snapshot it has already heard", () => {
    const memory = listening()
    const fired = { ...noSnapshot(), time: 0.1, units: [unit()], volleys: [volley()] }
    expect(listen(memory, fired).map((s) => s.noise)).toEqual(["volley"])
    // The same step again, and again as a fresh object off the wire: one
    // discharge, however many times the screen is drawn over it.
    expect(listen(memory, fired)).toEqual([])
    expect(listen(memory, { ...fired, units: [unit()], volleys: [volley()] })).toEqual([])
  })

  it("hears the fighting of both armies and the Orders of only one (F22)", () => {
    // Fire, Charges, Contacts and Routs are on the Field for anybody to see, so
    // both Commanders hear the same afternoon.
    for (const kind of ["volley", "gun", "charge", "contact", "rout"] as const) {
      expect(run.french[kind]).toBe(run.austrian[kind])
      expect(run.french[kind]).toBe(run.uncut[kind])
    }
    // Orders are not. Each Commander hears his own riders arrive; a snapshot
    // cut for nobody carries both sets and hears both.
    expect(run.french.order).toBe(run.austrian.order)
    expect(run.uncut.order).toBe(run.french.order + run.austrian.order)
  })
})

/**
 * The two rules a headless Castiglione will not reliably produce, put to it
 * directly. Both are about a Courier being taken off the road for a reason that
 * is not an arrival — which is the one way this module can claim something
 * happened that did not.
 */
/** One battalion, standing, with nothing the matter with it. */
function unit(over: Partial<UnitSnapshot> = {}): UnitSnapshot {
  return {
    id: "fr-32e",
    army: FRENCH,
    name: "32e de Ligne",
    arm: "infantry",
    grade: "line",
    strength: 600,
    position: { x: 100, y: 100 },
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
    report: null,
    ...over,
  }
}

/** One discharge, from it. */
function volley(): VolleySnapshot {
  return {
    id: "v1",
    at: 0.1,
    unitId: "fr-32e",
    targetId: "au-ir43-1",
    from: { x: 100, y: 100 },
    direction: 0,
    width: 144,
  }
}

/** One rider, on the road to it. */
const riding = [
  { id: "c1", unitId: "fr-32e", position: { x: 0, y: 0 }, origin: { x: 0, y: 0 }, held: false },
]

describe("a rider who handed nothing over", () => {
  it("is heard when he reaches a Unit standing where it was", () => {
    const memory = listening()
    listen(memory, { ...noSnapshot(), time: 0.1, units: [unit()], couriers: riding })
    const heard = listen(memory, { ...noSnapshot(), time: 0.2, units: [unit()] })
    expect(heard.map((s) => s.noise)).toEqual(["order"])
  })

  it("is silent when the Unit he reached is Routing, because it is deaf", () => {
    const memory = listening()
    listen(memory, { ...noSnapshot(), time: 0.1, units: [unit()], couriers: riding })
    // The Rout itself is heard; the Order that found nobody is not.
    const heard = listen(memory, {
      ...noSnapshot(),
      time: 0.2,
      units: [unit({ routing: true })],
    })
    expect(heard.map((s) => s.noise)).toEqual(["rout"])
  })

  it("is silent when the Unit he was riding at has gone off the Field", () => {
    const memory = listening()
    listen(memory, { ...noSnapshot(), time: 0.1, units: [unit()], couriers: riding })
    expect(listen(memory, { ...noSnapshot(), time: 0.2 })).toEqual([])
  })
})

describe("a battle restarted under a listener that outlived the old one", () => {
  it("forgets the riders of the battle before it rather than hearing them arrive", () => {
    const memory = listening()
    listen(memory, { ...noSnapshot(), time: 30, units: [unit()], couriers: riding })
    // A second Castiglione on the same Field: the same Unit ids, standing where
    // they were authored, and the clock back at the start. Without the guard
    // the rider still on the road from the first battle is gone from this one,
    // which reads exactly like an arrival.
    expect(listen(memory, { ...noSnapshot(), time: 0.1, units: [unit()] })).toEqual([])
  })

  it("still hears the new battle, having forgotten the old one", () => {
    const memory = listening()
    listen(memory, { ...noSnapshot(), time: 30, units: [unit()], couriers: riding })
    const fired = { ...noSnapshot(), time: 0.1, units: [unit()], volleys: [volley()] }
    expect(listen(memory, fired).map((s) => s.noise)).toEqual(["volley"])
  })
})
