import { describe, expect, it } from "bun:test"
import { BattleRegister, DEPLOYMENT_SECONDS, tempoOf } from "./register"
import { snapshot } from "@/sim/snapshot"

/**
 * C18, the Battle Register, and the two-Commander rules that live beside it:
 * two seats and the tokens that claim them, blind Deployment, the barrier the
 * clock starts on, the Tempo both Commanders ask for, and Out of Contact.
 *
 * The register is tested and not the socket. What a socket adds is JSON and a
 * proxy, and neither of them decides anything — everything below is a rule, and
 * a rule is worth a test.
 */

const CASTIGLIONE = "castiglione"

function opened() {
  const register = new BattleRegister()
  const battle = register.open(CASTIGLIONE)
  return { register, battle }
}

describe("the Battle Register", () => {
  it("seats two Commanders and turns the third away", () => {
    const { register, battle } = opened()
    const first = register.sit(battle, undefined)
    const second = register.sit(battle, undefined)
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(register.hasRoom(battle, undefined)).toBe(false)
    expect(register.sit(battle, undefined)).toBeNull()
  })

  it("gives a seat back to the token that holds it, and to nobody else", () => {
    const { register, battle } = opened()
    const seat = register.sit(battle, undefined)!
    register.takeArmy(battle, seat, "french")
    // The plug is pulled. The seat, the army and everything sent stay put.
    seat.present = false
    const again = register.sit(battle, seat.token)
    expect(again).toBe(seat)
    expect(again!.army).toBe("french")
    expect(again!.present).toBe(true)
    // A token nobody issued is not a seat, it is somebody new.
    const stranger = register.sit(battle, "not-a-token")
    expect(stranger).not.toBe(seat)
    expect(register.hasRoom(battle, undefined)).toBe(false)
    expect(register.hasRoom(battle, seat.token)).toBe(true)
  })

  it("gives each army to one Commander and refuses a second claim on it", () => {
    const { register, battle } = opened()
    const first = register.sit(battle, undefined)!
    const second = register.sit(battle, undefined)!
    expect(register.takeArmy(battle, first, "french")).toBe(true)
    expect(register.takeArmy(battle, second, "french")).toBe(false)
    expect(register.takeArmy(battle, second, "austrian")).toBe(true)
    // An army is arranged by the hand that will command it, so nobody swaps.
    expect(register.takeArmy(battle, second, "french")).toBe(false)
    expect(register.takeArmy(battle, first, "nobody's army")).toBe(false)
  })

  it("does not start the arranging clock until there are two armies to arrange", () => {
    const { register, battle } = opened()
    const first = register.sit(battle, undefined)!
    register.takeArmy(battle, first, "french")
    // A battle waiting for somebody to be handed the link has nothing to count.
    expect(battle.deadline).toBeNull()
    const second = register.sit(battle, undefined)!
    register.takeArmy(battle, second, "austrian")
    expect(battle.deadline).not.toBeNull()
  })

  it("runs the clock when both have Stood To, and not before", () => {
    const { register, battle } = opened()
    const first = register.sit(battle, undefined)!
    const second = register.sit(battle, undefined)!
    register.takeArmy(battle, first, "french")
    register.takeArmy(battle, second, "austrian")
    first.stoodTo = true
    register.advance(0.1)
    expect(battle.running).toBe(false)
    expect(battle.loaded.battle.time).toBe(0)
    second.stoodTo = true
    register.advance(0.1)
    expect(battle.running).toBe(true)
  })

  it("runs the clock on the three minutes even if nobody Stood To", () => {
    const { register, battle } = opened()
    const first = register.sit(battle, undefined)!
    const second = register.sit(battle, undefined)!
    register.takeArmy(battle, first, "french")
    register.takeArmy(battle, second, "austrian")
    // The deadline is wall clock, so it is wound back rather than waited out.
    battle.deadline = battle.deadline! - DEPLOYMENT_SECONDS * 1000 - 1
    register.advance(0.1)
    expect(battle.running).toBe(true)
  })

  it("runs at the slower Tempo of the two asked for", () => {
    const { register, battle } = opened()
    const first = register.sit(battle, undefined)!
    const second = register.sit(battle, undefined)!
    first.tempo = 8
    second.tempo = 2
    expect(tempoOf(battle)).toBe(2)
    // A seat with nobody in it is not asking for anything.
    second.present = false
    expect(tempoOf(battle)).toBe(8)
  })

  it("does not pause the clock for a Commander who has gone", () => {
    const { register, battle } = opened()
    const first = register.sit(battle, undefined)!
    const second = register.sit(battle, undefined)!
    register.takeArmy(battle, first, "french")
    register.takeArmy(battle, second, "austrian")
    first.stoodTo = true
    second.stoodTo = true
    register.advance(0.1)
    // Both plugs pulled. The armies fight on their Standing Orders (F24).
    first.present = false
    second.present = false
    const was = battle.loaded.battle.time
    for (let i = 0; i < 20; i++) register.advance(0.1)
    expect(battle.loaded.battle.time).toBeGreaterThan(was)
  })

  it("shows each Commander his own army only, while both are being arranged", () => {
    const { register, battle } = opened()
    const first = register.sit(battle, undefined)!
    const second = register.sit(battle, undefined)!
    register.takeArmy(battle, first, "french")
    register.takeArmy(battle, second, "austrian")
    const field = battle.loaded.battle
    const arranging = snapshot(field, "french", true)
    expect(arranging.units.length).toBeGreaterThan(0)
    expect(arranging.units.every((unit) => unit.army === "french")).toBe(true)
    expect(arranging.headquarters).toHaveLength(1)
    // And both, the moment the clock runs.
    first.stoodTo = true
    second.stoodTo = true
    register.advance(0.1)
    const open = snapshot(field, "french", !battle.running)
    expect(open.units.some((unit) => unit.army === "austrian")).toBe(true)
    expect(open.headquarters).toHaveLength(2)
  })

  it("forgets a battle nobody ever joined, and keeps one being fought", () => {
    const { register, battle } = opened()
    register.sit(battle, undefined)
    battle.openedAt -= 60 * 60 * 1000
    register.sweep()
    expect(register.get(battle.id)).toBeNull()

    const two = opened()
    two.register.sit(two.battle, undefined)
    two.register.sit(two.battle, undefined)
    two.battle.openedAt -= 60 * 60 * 1000
    two.register.sweep()
    expect(two.register.get(two.battle.id)).not.toBeNull()
  })
})
