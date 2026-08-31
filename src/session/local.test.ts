import { describe, expect, it } from "bun:test"
import { LocalSession } from "./local"
import { loadScenarioFromDisk } from "@/scenario/disk"

/**
 * C16's local half, held to the readings the screen drives its phase machine
 * off. There is no phase in `useBattle` any more that it decides for itself —
 * it asks the session — so what these assert is the difference between two
 * things that read alike and are not: **a stopped afternoon is not an army
 * back in the middle of being arranged.**
 *
 * That distinction went missing once. Deriving the phase from `running` put a
 * paused solo Castiglione back at Deployment with the clock reading 0:34, and
 * only playing it in a browser found it.
 */

function castiglione(): LocalSession {
  return new LocalSession(loadScenarioFromDisk("castiglione"))
}

describe("the battle in the tab", () => {
  it("has taken no army and begun nothing until it is told to", () => {
    const session = castiglione()
    expect(session.army).toBeNull()
    expect(session.begun).toBe(false)
    expect(session.running).toBe(false)
    expect(session.outcome).toBeNull()
  })

  it("has nobody to hand a link to and nobody to wait for", () => {
    const session = castiglione()
    // The three readings that only a two-Commander battle has anything to say
    // about. Answering them at all is what lets the screen not know which
    // session it has (ADR-0013).
    expect(session.address).toBeNull()
    expect(session.waitingForTheOther).toBe(false)
    expect(session.turnedAway).toBe(false)
    expect(session.trouble).toBeNull()
  })

  it("takes an army, and Standing To is the whole barrier", () => {
    const session = castiglione()
    session.send({ kind: "take-army", army: "french" })
    expect(session.army).toBe("french")
    expect(session.begun).toBe(false)
    session.send({ kind: "stand-to" })
    expect(session.begun).toBe(true)
    expect(session.running).toBe(true)
    expect(session.stoodTo).toBe(true)
  })

  it("stops the clock without un-beginning the battle", () => {
    const session = castiglione()
    session.send({ kind: "take-army", army: "french" })
    session.send({ kind: "stand-to" })
    session.advance(1)
    const reached = session.current.time
    expect(reached).toBeGreaterThan(0)

    session.send({ kind: "pause", on: true })
    expect(session.running).toBe(false)
    // The reading the screen's phase hangs on. It must not follow the clock.
    expect(session.begun).toBe(true)
    session.advance(1)
    expect(session.current.time).toBe(reached)

    session.send({ kind: "pause", on: false })
    expect(session.running).toBe(true)
    session.advance(1)
    expect(session.current.time).toBeGreaterThan(reached)
  })

  it("cuts its snapshots for the army it was given, from the moment it is given", () => {
    const session = castiglione()
    // Nobody in particular yet, so nothing is cut: the Field is drawn while the
    // offer is still being read.
    expect(session.current.units.every((unit) => unit.report !== null)).toBe(true)
    session.send({ kind: "take-army", army: "french" })
    const own = session.current.units.filter((unit) => unit.army === "french")
    const other = session.current.units.filter((unit) => unit.army !== "french")
    expect(own.length).toBeGreaterThan(0)
    expect(other.length).toBeGreaterThan(0)
    expect(own.every((unit) => unit.report !== null)).toBe(true)
    expect(other.every((unit) => unit.report === null)).toBe(true)
  })

  it("arranges an army by hand, and holds it inside its zone", () => {
    const session = castiglione()
    session.send({ kind: "take-army", army: "french" })
    const unit = session.current.units.find((u) => u.army === "french")!
    // Far outside the zone, on purpose: what comes back is the edge and not the
    // point that was asked for.
    session.send({ kind: "place", unitId: unit.id, at: { x: -5000, y: -5000 } })
    const moved = session.current.units.find((u) => u.id === unit.id)!
    expect(moved.position.x).toBeGreaterThan(0)
    expect(moved.position.y).toBeGreaterThan(0)
    // And a Unit of the other army is not his to arrange.
    const theirs = session.current.units.find((u) => u.army !== "french")!
    const was = { ...theirs.position }
    session.send({ kind: "place", unitId: theirs.id, at: { x: 100, y: 100 } })
    const still = session.current.units.find((u) => u.id === theirs.id)!
    expect(still.position).toEqual(was)
  })

  it("takes an Order once the clock runs, and puts a rider on the Field for it", () => {
    const session = castiglione()
    session.send({ kind: "take-army", army: "french" })
    session.send({ kind: "stand-to" })
    const unit = session.current.units.find((u) => u.army === "french")!
    session.send({
      kind: "order",
      unitId: unit.id,
      body: {
        kind: "move",
        destination: { x: 900, y: 620 },
        arrivalFacing: 0,
        arrivalFormation: "line",
      },
    })
    expect(session.current.couriers).toHaveLength(1)
    expect(session.current.ghosts).toHaveLength(1)
    // And an Order for the other army's battalion is not an Order at all.
    const theirs = session.current.units.find((u) => u.army !== "french")!
    session.send({ kind: "order", unitId: theirs.id, body: { kind: "halt" } })
    expect(session.current.couriers).toHaveLength(1)
  })

  it("reports the Outcome, and stops running when there is one", () => {
    const session = castiglione()
    session.send({ kind: "take-army", army: "french" })
    session.send({ kind: "stand-to" })
    session.advance(1)
    session.send({ kind: "concede" })
    expect(session.outcome?.by).toBe("conceded")
    expect(session.outcome?.winner).toBe("austrian")
    expect(session.running).toBe(false)
    // Still begun. A decided battle is not an army being arranged either.
    expect(session.begun).toBe(true)
    expect(session.returns()).toHaveLength(2)
  })
})
