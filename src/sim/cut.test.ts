import { describe, expect, it } from "bun:test"
import { loadScenarioFromDisk } from "../../scripts/load-headless"
import { step } from "./battle"
import { ENEMY_COURIERS, snapshot, STRENGTH_STEP } from "./snapshot"
import type { Battle } from "./types"

/**
 * F22, the cut, asserted against a real authored battle rather than a fixture.
 *
 * DESIGN section 8 ranks this eighth and says of it that there is no partial
 * credit and nothing to tune: a leak is not a slowdown, and the fallback is
 * *fix it*. So it is watched the way that row says to watch it — headless, on a
 * built Castiglione, with both armies busy — and the assertions are about what
 * is in the snapshot rather than about what the renderer does with it. A filter
 * in `BattleView` is a rule the far machine is trusted to keep (ADR-0013).
 *
 * Neither army is taken, so both authored Plans fire and there are Orders,
 * riders, Ghosts and Dispatches on both sides to be cut.
 */

const FRENCH = "french"
const AUSTRIAN = "austrian"

/** Castiglione, stepped far enough that both armies have said and done things. */
function underway(): Battle {
  const { battle } = loadScenarioFromDisk("castiglione")
  // Five minutes. Long enough for the Plans to have put riders on the road and
  // for the leading battalions to be firing; short enough to stay a unit test.
  for (let i = 0; i < 3000; i++) step(battle)
  // And then on to a step somebody fired in. A Volley lives for one step, so a
  // snapshot taken between two of them has an empty `volleys` and would assert
  // nothing at all about what a Volley carries.
  for (let i = 0; i < 600 && battle.volleys.length === 0; i++) step(battle)
  return battle
}

describe("the cut", () => {
  const battle = underway()
  const mine = snapshot(battle, FRENCH)
  const enemyUnits = mine.units.filter((unit) => unit.army !== FRENCH)
  const ownUnits = mine.units.filter((unit) => unit.army === FRENCH)

  it("has both armies on the Field to cut between", () => {
    expect(ownUnits.length).toBeGreaterThan(0)
    expect(enemyUnits.length).toBeGreaterThan(0)
  })

  it("sends no Report about the other army, and one about every Unit of its own", () => {
    for (const unit of enemyUnits) expect(unit.report).toBeNull()
    for (const unit of ownUnits) expect(unit.report).not.toBeNull()
  })

  it("still sends what the map shows of the other army", () => {
    // The cut narrows and never blanks: an enemy the Commander cannot see the
    // Formation, Grade or Morale of is not a cut, it is a broken Field.
    for (const unit of enemyUnits) {
      expect(unit.arm).toBeTruthy()
      expect(unit.grade).toBeTruthy()
      expect(unit.formation).toBeTruthy()
      expect(unit.morale).toBeTruthy()
      expect(Number.isFinite(unit.position.x)).toBe(true)
      expect(unit.strength).toBeGreaterThan(0)
    }
  })

  it("gives the other army's Strength at the Field's resolution and not to the man", () => {
    for (const unit of enemyUnits) expect(unit.strength % STRENGTH_STEP).toBe(0)
    // And its own to the man, or the Return would be reading a rounded army.
    const exact = new Map(battle.units.map((unit) => [unit.id, Math.round(unit.strength)]))
    for (const unit of ownUnits) expect(unit.strength).toBe(exact.get(unit.id)!)
    // Not vacuous: somebody has been shot at by now, so at least one Unit of
    // the other army is standing at a figure the rounding actually moves.
    const moved = battle.units.filter(
      (unit) => unit.army !== FRENCH && Math.round(unit.strength) % STRENGTH_STEP !== 0,
    )
    expect(moved.length).toBeGreaterThan(0)
  })

  it("sends no Ghost, and no rider, belonging to the other army", () => {
    const armyOf = new Map(battle.units.map((unit) => [unit.id, unit.army]))
    expect(mine.ghosts.length).toBeGreaterThan(0)
    for (const ghost of mine.ghosts) expect(armyOf.get(ghost.unitId)).toBe(FRENCH)
    expect(ENEMY_COURIERS).toBe(false)
    for (const courier of mine.couriers) expect(armyOf.get(courier.unitId)).toBe(FRENCH)
  })

  it("sends no Dispatch out of the other army's feed", () => {
    expect(mine.dispatches.length).toBeGreaterThan(0)
    for (const dispatch of mine.dispatches) {
      expect(dispatch.army === null || dispatch.army === FRENCH).toBe(true)
    }
    // Both armies are saying things, so what came through is a filter and not
    // an empty log.
    const theirs = battle.dispatches.filter((dispatch) => dispatch.army === AUSTRIAN)
    expect(theirs.length).toBeGreaterThan(0)
    expect(mine.dispatches.length).toBeLessThan(battle.dispatches.length)
  })

  it("puts no casualty figure on a Volley or a Contact", () => {
    // Per-Volley losses would add back up to the exact Strength the cut above
    // has just taken out, so they are off the wire entirely rather than zeroed.
    expect(mine.volleys.length).toBeGreaterThan(0)
    for (const volley of mine.volleys) expect("casualties" in volley).toBe(false)
    for (const contact of mine.contacts) {
      expect("casualties" in contact).toBe(false)
      expect("targetCasualties" in contact).toBe(false)
    }
  })

  it("puts both Headquarters on the Field and only its own staff's business", () => {
    expect(mine.headquarters).toHaveLength(2)
    const own = mine.headquarters.find((hq) => hq.army === FRENCH)!
    const theirs = mine.headquarters.find((hq) => hq.army === AUSTRIAN)!
    // The enemy staff is on the Field — that is what makes it possible to ride
    // at, and it is the whole reason Harried and Overrun are not a rule one
    // army is exempt from.
    expect(Number.isFinite(theirs.position.x)).toBe(true)
    expect(theirs.report).toBeNull()
    expect(own.report).not.toBeNull()
  })

  it("cuts the other way round for the other Commander", () => {
    const theirs = snapshot(battle, AUSTRIAN)
    for (const unit of theirs.units) {
      expect(unit.report === null).toBe(unit.army !== AUSTRIAN)
    }
    for (const dispatch of theirs.dispatches) {
      expect(dispatch.army === null || dispatch.army === AUSTRIAN).toBe(true)
    }
    // The two feeds partition the log: every Dispatch reaches exactly one
    // Commander, except the one that says how the day ended and reaches both.
    const shared = battle.dispatches.filter((dispatch) => dispatch.army === null).length
    expect(mine.dispatches.length + theirs.dispatches.length - shared).toBe(
      battle.dispatches.length,
    )
  })

  it("cuts nothing for nobody in particular", () => {
    // What a headless run and the plate get, and what the Field shows in the
    // moment before an Army has been taken.
    const all = snapshot(battle, null)
    expect(all.dispatches).toHaveLength(battle.dispatches.length)
    expect(all.units.every((unit) => unit.report !== null)).toBe(true)
    expect(all.headquarters.every((hq) => hq.report !== null)).toBe(true)
    const exact = new Map(battle.units.map((unit) => [unit.id, Math.round(unit.strength)]))
    for (const unit of all.units) expect(unit.strength).toBe(exact.get(unit.id)!)
  })
})
