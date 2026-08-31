import type { BattleSession, Command } from "./index"
import type { LoadedScenario } from "@/scenario/build"
import { concede } from "@/sim/battle"
import * as deployment from "@/sim/deployment"
import { rideTo, sendOrder } from "@/sim/headquarters"
import { armyReturns, type ArmyReturn } from "@/sim/return"
import { BattleRunner } from "@/sim/runner"
import { takeCommand } from "@/sim/scenario"
import type { BattleSnapshot } from "@/sim/snapshot"
import type { ArmyId, Battle, Headquarters, Outcome, Unit } from "@/sim/types"

/**
 * The battle in the tab: the whole of it, held and stepped where the screen is.
 *
 * This is what keeps the answer to *does this still work as a static site* yes
 * (F19). It holds a `BattleRunner` and nothing else of consequence — every
 * Command below turns into a call on `src/sim/`, which is the same code the
 * server runs, so a rule cannot end up in one game and not the other by
 * anybody's accident (ADR-0013).
 */
export class LocalSession implements BattleSession {
  private readonly runner: BattleRunner
  private readonly scenario: LoadedScenario
  private army_: ArmyId | null = null

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

  get army(): ArmyId | null {
    return this.army_
  }

  /** Nobody to hand a link to. Solo is a static site and always was (F19). */
  get address(): string | null {
    return null
  }

  /** There is no other Commander, so there is never anybody to wait for. */
  get waitingForTheOther(): boolean {
    return false
  }

  get stoodTo(): boolean {
    return this.runner.running
  }

  /** Nothing between the Commander and the battle, so nothing to go wrong. */
  get trouble(): string | null {
    return null
  }

  /** A battle in your own tab has no door to be turned away at. */
  get turnedAway(): boolean {
    return false
  }

  advance(seconds: number): void {
    this.runner.advance(seconds)
  }

  returns(): ArmyReturn[] {
    return armyReturns(this.battle)
  }

  close(): void {
    this.runner.running = false
  }

  send(command: Command): void {
    const zone = deployment.deploymentZone(this.scenario.file, this.army_)
    switch (command.kind) {
      case "take-army":
        this.army_ = command.army
        // Half the Plan stops being authored intent, because the Commander is
        // the intent now — and from here the battle is only ever seen through
        // one pair of eyes (C17).
        takeCommand(this.battle, command.army)
        this.runner.forArmy = command.army
        return
      case "place": {
        const unit = this.mine(command.unitId)
        if (unit) deployment.place(zone, unit, command.at)
        return this.arranged()
      }
      case "face": {
        const unit = this.mine(command.unitId)
        if (unit) deployment.face(zone, unit, command.facing)
        return this.arranged()
      }
      case "form-up": {
        const unit = this.mine(command.unitId)
        if (unit) deployment.formUp(zone, unit, command.formation)
        return this.arranged()
      }
      case "brief": {
        const unit = this.mine(command.unitId)
        if (unit) deployment.brief(unit, command.latitude)
        return this.arranged()
      }
      case "post-headquarters": {
        const staff = this.headquarters()
        if (staff) deployment.postHeadquarters(zone, staff, command.at)
        return this.arranged()
      }
      case "stand-to":
        // Solo, Standing To is the whole barrier: there is nobody else to wait
        // for, so the arranging ends when the one Commander says it has.
        this.runner.running = true
        return
      case "order": {
        const staff = this.headquarters()
        // An Order is accepted only from the Commander whose Army it names.
        // Free here because there is only one Commander; written anyway, so the
        // rule lives in both sessions from the start (F21).
        if (!staff || !this.mine(command.unitId)) return
        sendOrder(this.battle, staff, command.unitId, command.body)
        return this.said()
      }
      case "ride": {
        const staff = this.headquarters()
        if (staff) rideTo(this.battle, staff, command.at)
        return this.said()
      }
      case "tempo":
        this.runner.tempo = command.tempo
        return
      case "pause":
        this.runner.running = !command.on
        return
      case "concede":
        if (this.army_) concede(this.battle, this.army_)
        return this.said()
    }
  }

  private get battle(): Battle {
    return this.scenario.battle
  }

  /** The Commander's own staff, which is where his Orders come from. */
  private headquarters(): Headquarters | null {
    return this.battle.armies.find((a) => a.id === this.army_)?.headquarters ?? null
  }

  /** A Unit of the Commander's own army, by id, or nothing. */
  private mine(unitId: string): Unit | null {
    const unit = this.battle.units.find((u) => u.id === unitId)
    return unit && unit.army === this.army_ ? unit : null
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
