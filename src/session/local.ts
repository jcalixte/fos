import type { BattleSession, Command } from "./index"
import type { LoadedScenario } from "@/scenario/build"
import { concede } from "@/sim/battle"
import { allows, spanAlong, unitFootprint } from "@/sim/formation"
import { rideTo, sendOrder } from "@/sim/headquarters"
import { armyReturns, type ArmyReturn } from "@/sim/return"
import { BattleRunner } from "@/sim/runner"
import { takeCommand } from "@/sim/scenario"
import type { BattleSnapshot } from "@/sim/snapshot"
import type { ArmyId, Battle, Headquarters, Outcome, Unit, Vec2 } from "@/sim/types"

/**
 * The battle in the tab: the whole of it, held and stepped where the screen is.
 *
 * This is what keeps the answer to *does this still work as a static site* yes
 * (F19). It holds a `BattleRunner` and nothing else of consequence — every
 * Command below turns into a call on `src/sim/`, which is the same code the
 * server runs, so a rule cannot end up in one game and not the other by
 * anybody's accident (ADR-0013).
 *
 * The one thing it does that reads like a rule is holding a Unit inside its
 * Deployment zone. That is the Scenario's rectangle applied to the Unit's own
 * Footprint, and it lives here because Deployment is the one hour in which a
 * Commander moves men by hand rather than by Courier — there is no `sim/`
 * function to send it to, and there will not be until the server needs one.
 */
export class LocalSession implements BattleSession {
  private readonly runner: BattleRunner
  private readonly scenario: LoadedScenario
  private army: ArmyId | null = null

  constructor(scenario: LoadedScenario) {
    this.scenario = scenario
    this.runner = new BattleRunner(scenario.battle, null)
  }

  get previous(): BattleSnapshot {
    return this.runner.previous
  }

  get current(): BattleSnapshot {
    return this.runner.current
  }

  get alpha(): number {
    return this.runner.alpha
  }

  get running(): boolean {
    // A decided battle is not running, whatever the runner still holds. It is
    // the runner that declines to step it, so this is the same fact said where
    // the screen can read it.
    return this.runner.running && this.battle.outcome === null
  }

  get tempo(): number {
    return this.runner.tempo
  }

  get outcome(): Outcome | null {
    return this.battle.outcome
  }

  advance(seconds: number): void {
    this.runner.advance(seconds)
  }

  returns(): ArmyReturn[] {
    return armyReturns(this.battle)
  }

  send(command: Command): void {
    switch (command.kind) {
      case "take-army":
        this.army = command.army
        // Half the Plan stops being authored intent, because the Commander is
        // the intent now — and from here the battle is only ever seen through
        // one pair of eyes (C17).
        takeCommand(this.battle, command.army)
        this.runner.forArmy = command.army
        return
      case "place": {
        const unit = this.mine(command.unitId)
        if (unit) this.holdInZone(unit, command.at)
        return this.arranged()
      }
      case "face": {
        const unit = this.mine(command.unitId)
        if (!unit) return
        unit.facing = command.facing
        // Wheeling swings the Footprint across the zone's corner: a line
        // standing a few metres off the top edge is 3.6m deep facing east and
        // 144m deep facing north, and turning it would otherwise post it
        // outside its own zone.
        this.holdInZone(unit, unit.position)
        return this.arranged()
      }
      case "form-up": {
        const unit = this.mine(command.unitId)
        if (!unit || !allows(unit.arm, command.formation)) return
        if (unit.formation === command.formation) return
        unit.formation = command.formation
        // Nothing has stepped yet, so there is no change under way to abandon —
        // cleared rather than trusted, because a half-formed battalion at
        // Deployment would be a bug somewhere else and this must not carry it.
        unit.changing = null
        this.holdInZone(unit, unit.position)
        return this.arranged()
      }
      case "brief": {
        const unit = this.mine(command.unitId)
        if (!unit) return
        unit.standing = command.latitude
        return this.arranged()
      }
      case "post-headquarters": {
        const headquarters = this.headquarters()
        if (headquarters && this.inZone(command.at)) {
          headquarters.position = { ...command.at }
        }
        return this.arranged()
      }
      case "stand-to":
        this.runner.running = true
        return
      case "order": {
        const headquarters = this.headquarters()
        const unit = this.mine(command.unitId)
        // An Order is accepted only from the Commander whose Army it names.
        // Free here because there is only one Commander; the check is written
        // anyway, so that the rule lives in both sessions from the start (F21).
        if (!headquarters || !unit) return
        sendOrder(this.battle, headquarters, command.unitId, command.body)
        return this.said()
      }
      case "ride": {
        const headquarters = this.headquarters()
        if (headquarters) rideTo(this.battle, headquarters, command.at)
        return this.said()
      }
      case "tempo":
        this.runner.tempo = command.tempo
        return
      case "pause":
        this.runner.running = !command.on
        return
      case "concede":
        if (this.army) concede(this.battle, this.army)
        return this.said()
    }
  }

  private get battle(): Battle {
    return this.scenario.battle
  }

  /** The Commander's own staff, which is where his Orders come from. */
  private headquarters(): Headquarters | null {
    return this.battle.armies.find((a) => a.id === this.army)?.headquarters ?? null
  }

  /** A Unit of the Commander's own army, by id, or nothing. */
  private mine(unitId: string): Unit | null {
    const unit = this.battle.units.find((u) => u.id === unitId)
    return unit && unit.army === this.army ? unit : null
  }

  /** The ground this Commander may arrange his army inside, if his Scenario names one. */
  private zone(): [number, number, number, number] | null {
    return this.scenario.file.armies.find((a) => a.id === this.army)?.deploymentZone ?? null
  }

  private inZone(point: Vec2): boolean {
    const zone = this.zone()
    if (!zone) return false
    const [x, y, w, h] = zone
    return point.x >= x && point.y >= y && point.x <= x + w && point.y <= y + h
  }

  /**
   * Hold a Unit inside its zone. A Unit is placed by its centre, so its whole
   * Footprint has to fit — and the Footprint is read fresh every time, because
   * Formation decides it. A 720-man battalion measures 144m by 3.6m in line and
   * 2.8m by 162m in march column, so the margin it needs moves with the
   * Formation, and a battalion legally placed in one would hang out of the zone
   * in the other if the margin were not recomputed.
   *
   * Facing decides it too, so the margin is the Footprint's real span on each
   * axis and not the larger of its two dimensions. Reserving a square was
   * conservative on the axis nobody cares about and dear on the one that
   * decides the battle: a line is a few metres deep, and at Castiglione a
   * square margin held the 5e 80m off the edge it was meant to crowd — 22 times
   * its own depth, and a third of the lateral room the whole zone has. The
   * consequence is that a battalion gains ground as it is wheeled, which is
   * what the Field already shows: what stops it is the ground it covers.
   */
  private holdInZone(unit: Unit, point: Vec2): void {
    const zone = this.zone()
    if (!zone) return
    const [zx, zy, zw, zh] = zone
    const shape = unitFootprint(unit)
    const halfX = spanAlong(shape, unit.facing, { x: 1, y: 0 }) / 2
    const halfY = spanAlong(shape, unit.facing, { x: 0, y: 1 }) / 2
    unit.position = {
      x: Math.max(zx + halfX, Math.min(zx + zw - halfX, point.x)),
      y: Math.max(zy + halfY, Math.min(zy + zh - halfY, point.y)),
    }
    // Arranging the army is how a Unit is given its ground before there is
    // anybody to ride an Order to it, so the Post goes where the hand puts it.
    // Left behind, a Unit deployed across the zone would open the battle with
    // its whole Latitude already spent.
    unit.post = { ...unit.position }
  }

  /**
   * A Battle arranged by hand, with the clock stopped. Both snapshots are set
   * to the same one: there is nothing to interpolate between, and leaving
   * `previous` behind would slide every Unit back for a frame.
   */
  private arranged(): void {
    this.runner.resnap()
    this.runner.previous = this.runner.current
  }

  /** Something said mid-step, which puts a Dispatch in the feed and a rider on the road. */
  private said(): void {
    this.runner.resnap()
  }
}
