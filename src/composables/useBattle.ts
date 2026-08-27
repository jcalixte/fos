import { markRaw, onBeforeUnmount, reactive, shallowRef } from "vue"
import { armyColours, BattleView, type ViewState } from "@/render/BattleView"
import { loadScenario } from "@/scenario/loader"
import { rememberBattle } from "@/scenario/catalogue"
import { concede, isOver } from "@/sim/battle"
import { BattleRunner } from "@/sim/runner"
import { isRiding, rideTo, sendOrder } from "@/sim/headquarters"
import { canCharge, chargeable } from "@/sim/charge"
import { allows, canFire, FIGHTING_FORMATION, unitFootprint } from "@/sim/formation"
import type {
  Dispatch,
  FormationName,
  Grade,
  Latitude,
  OrderBody,
  Outcome,
  Unit,
  Vec2,
} from "@/sim/types"
import { armyReturns, type ArmyReturn } from "@/sim/return"
import { snapshot, type UnitSnapshot } from "@/sim/snapshot"
import { takeCommand, type ScenarioFile } from "@/sim/scenario"
import { bearing, distance } from "@/sim/vec"

export type Phase = "menu" | "loading" | "command" | "deployment" | "battle" | "over"

/** Metres of drag below which the player is placing, not aiming. */
const AIM_THRESHOLD = 24

/**
 * Metres from the Headquarters at which a press takes hold of it rather than of
 * the ground under it. About the outer ring it is drawn with, so what can be
 * grabbed is what the player can see — and it is checked before Units are hit
 * tested, on the grounds that the marker is small and the only thing on the
 * Field that is not a Unit, so a press that lands on it means it.
 */
const HEADQUARTERS_GRAB = 30

/**
 * Metres of drag below which no Order is sent at all. A press that does not
 * travel this far is a selection, not a command.
 *
 * A near-miss on a Unit used to commit a move Order the player then spent
 * ninety seconds of Courier time undoing — the cost of a slip was wildly out of
 * proportion to the slip. Releasing back inside this radius cancels, so a drag
 * begun by accident can be walked back to where it started.
 */
const COMMIT_THRESHOLD = 12

export interface BattleUi {
  phase: Phase
  error: string | null
  scenarioName: string
  scenarioSummary: string
  time: number
  clock: number
  tempo: number
  /** Show beaten ground for every Unit, not just the selected one. */
  fireZones: boolean
  running: boolean
  ordersInFlight: number
  units: UnitSnapshot[]
  selected: string | null
  /** A Charge is armed and waiting for the player to pick what to go at. */
  arming: boolean
  /**
   * The Unit is waiting to be pointed: the next press on the Field is a
   * direction and not a destination.
   */
  pointing: boolean
  arrivalFormation: FormationName | null
  dispatches: Dispatch[]
  gradeNames: Record<string, Record<Grade, string>>
  /** Both armies, as they are offered before one of them is taken. */
  armies: { id: string; name: string; colour: string; brief: string }[]
  /** Empty until an Army is taken, which is the first thing a battle asks. */
  playerArmy: string
  /** How the battle ended, once it has, and what the player is to make of it. */
  verdict: { headline: string; detail: string } | null
  /** What each army had to show for it, filled in once the battle is over. */
  returns: ArmyReturn[]
  /** Breaking off has been offered and is waiting to be taken or dropped. */
  conceding: boolean
  /**
   * Every piece of Key Ground and who ended on it, filled in with the Return.
   * The armies' own counts do not add up to it — a piece nobody reached is in
   * neither of them, and it is exactly that case the reader has to see to
   * understand a day decided on condition rather than on ground.
   */
  keyGround: { name: string; holder: string | null }[]
  /** What decided it, carried through so the Return can point at the figure. */
  decidedBy: Outcome["by"] | null
  /**
   * The player's own Headquarters, as the screen has to read it: nothing can be
   * ordered while it is riding, and everything is later while it is harried
   * (ADR-0008).
   */
  headquarters: { riding: boolean; harried: boolean; surcharge: number }
}

/** A Battle Ui as it stands with no Scenario on the Field. */
function blankUi(): BattleUi {
  return {
    phase: "menu",
    error: null,
    scenarioName: "",
    scenarioSummary: "",
    time: 0,
    clock: 0,
    tempo: 4,
    fireZones: false,
    running: false,
    ordersInFlight: 0,
    units: [],
    selected: null,
    arming: false,
    pointing: false,
    arrivalFormation: null,
    dispatches: [],
    gradeNames: {},
    armies: [],
    playerArmy: "",
    verdict: null,
    returns: [],
    conceding: false,
    keyGround: [],
    decidedBy: null,
    headquarters: { riding: false, harried: false, surcharge: 0 },
  }
}

/** A View State as it stands with no Scenario on the Field. */
function blankViewState(): ViewState {
  return {
    selected: null,
    playerArmy: "",
    headquarters: null,
    keyGround: [],
    deploymentZone: null,
    drag: null,
    placing: null,
    armyColours: {},
    fireZones: false,
    arming: false,
  }
}

export function useBattle() {
  const view = shallowRef<BattleView | null>(null)
  const runner = shallowRef<BattleRunner | null>(null)
  /** The decoded Scenario, kept for the half of it an Army is read out of. */
  let scenario: ScenarioFile | null = null
  /** Where the Scenario on the Field was loaded from, so it can be remembered. */
  let scenarioPath = ""

  const ui = reactive<BattleUi>(blankUi())

  /**
   * The Outcome in the second person. The simulation decides who was left
   * holding the Field and never who the player is, so the reading is done here
   * — and it is a reading, not a score: there is no tally to show, because T11
   * gave up the countable bar and F11 refuses to end a battle by annihilation.
   */
  function readVerdict(outcome: Outcome): { headline: string; detail: string } {
    const mine = outcome.winner === ui.playerArmy
    if (outcome.by === "conceded") {
      return mine
        ? {
            headline: "The enemy has broken off the action.",
            detail: "They have taken their army off the Field, and left it to you.",
          }
        : {
            headline: "You have broken off the action.",
            detail: "Your army is off the Field, and the day belongs to the enemy.",
          }
    }
    if (outcome.by === "army-break") {
      if (outcome.winner === null) {
        return {
          headline: "Both armies have quit the Field.",
          detail: "Neither had enough left standing to hold it.",
        }
      }
      return mine
        ? {
            headline: "The enemy army has quit the Field.",
            detail: "They had nothing left in hand. The day is yours.",
          }
        : {
            headline: "Your army has quit the Field.",
            detail: "There was nothing of it left in hand.",
          }
    }
    if (outcome.winner === null) {
      const held = outcome.keyGround.filter((g) => g.holder !== null)
      return {
        headline: "The clock has run out, undecided.",
        detail:
          held.length === 0
            ? "Neither army was left standing on the Key Ground, and neither is in the worse state."
            : "The Key Ground was evenly shared, and neither army is in the worse state.",
      }
    }
    if (outcome.by === "condition") {
      return mine
        ? {
            headline: "The clock has run out, and the Field is yours.",
            detail:
              "The Key Ground was even, and theirs is the army in the worse state for the day.",
          }
        : {
            headline: "The clock has run out, and the Field is theirs.",
            detail:
              "The Key Ground was even, and yours is the army in the worse state for the day.",
          }
    }
    const names = outcome.keyGround
      .filter((g) => g.holder === outcome.winner)
      .map((g) => g.name)
      .join(", ")
    return mine
      ? { headline: "The clock has run out, and you hold the Field.", detail: `You hold ${names}.` }
      : {
          headline: "The clock has run out, and the enemy holds the Field.",
          detail: `They hold ${names}.`,
        }
  }

  const viewState: ViewState = blankViewState()

  let frame = 0
  let last = 0
  let uiClock = 0
  /**
   * Bumped by every start and by every leave. A Field takes a moment to decode,
   * and the player can walk out of it while it is still coming: without this,
   * that Scenario finishes loading into a menu and mounts a renderer nobody can
   * reach or put away.
   */
  let loads = 0

  /**
   * Put a Scenario on the Field. `army` takes it in the same breath, skipping
   * the offer — that is the shortcut back onto a Field under work, and it is
   * the only way the first decision of a battle is ever made for the player.
   */
  async function start(host: HTMLElement, path: string, army?: string): Promise<void> {
    const load = ++loads
    ui.phase = "loading"
    ui.error = null
    scenarioPath = path
    try {
      const loaded = await loadScenario(path)
      if (load !== loads) return
      const battle = loaded.battle
      scenario = loaded.file
      ui.armies = loaded.file.armies.map((army) => ({
        id: army.id,
        name: army.name,
        colour: army.colour,
        brief: army.brief ?? "",
      }))
      ui.scenarioName = loaded.file.name
      ui.scenarioSummary = loaded.file.summary
      ui.clock = battle.clock
      for (const army of loaded.file.armies) {
        ui.gradeNames[army.id] = loaded.rosters[army.roster].grades
      }

      const v = markRaw(new BattleView())
      await v.mount(host)
      if (load !== loads) {
        v.destroy()
        return
      }
      v.setField(battle.field)
      view.value = v

      const r = markRaw(new BattleRunner(battle))
      r.tempo = ui.tempo
      runner.value = r

      viewState.armyColours = armyColours(battle)
      viewState.keyGround = battle.keyGround

      ui.phase = "command"
      ui.units = r.current.units
      last = performance.now()
      frame = requestAnimationFrame(tick)
      if (army) commandArmy(army)
    } catch (error) {
      if (load !== loads) return
      const message = error instanceof Error ? error.message : String(error)
      leave()
      ui.error = message
    }
  }

  /**
   * Take the army off this Field and go back to the menu. Whatever the battle
   * had reached is gone: nothing here is saved, and there is nothing to come
   * back to.
   */
  function leave(): void {
    loads++
    cancelAnimationFrame(frame)
    frame = 0
    view.value?.destroy()
    view.value = null
    runner.value = null
    scenario = null
    scenarioPath = ""
    Object.assign(ui, blankUi())
    Object.assign(viewState, blankViewState())
  }

  function tick(now: number): void {
    frame = requestAnimationFrame(tick)
    const r = runner.value
    const v = view.value
    if (!r || !v) return
    r.advance((now - last) / 1000)
    last = now
    viewState.selected = ui.selected
    // It moves now, so the screen's copy is a frame old at best if it is not
    // re-read here (ADR-0008).
    readHeadquarters()
    v.draw(r.previous, r.current, r.alpha, viewState)

    // The screen runs at 60fps; the panels have no business re-rendering there.
    if (now - uiClock < 100) return
    uiClock = now
    ui.time = r.battle.time
    ui.units = r.current.units
    ui.ordersInFlight = r.current.couriers.length
    ui.running = r.running
    const hq = headquarters()
    if (hq) {
      ui.headquarters.riding = isRiding(hq)
      ui.headquarters.harried = hq.harried
      ui.headquarters.surcharge = hq.surcharge
    }
    if (ui.dispatches.length !== r.battle.dispatches.length) {
      ui.dispatches = [...r.battle.dispatches]
    }
    if (isOver(r.battle) && ui.phase === "battle") finish(r)
  }

  /** Close the battle down and read what it came to. */
  function finish(r: BattleRunner): void {
    if (!r.battle.outcome) return
    ui.phase = "over"
    ui.verdict = readVerdict(r.battle.outcome)
    ui.returns = armyReturns(r.battle)
    ui.keyGround = r.battle.outcome.keyGround
    ui.decidedBy = r.battle.outcome.by
    ui.running = false
    r.running = false
  }

  /**
   * The arrival Formation the player most likely wants for this Unit: what it
   * is standing in, unless that is a travelling Formation — Initiative puts
   * Units into column on its own, and seeding from it would quietly order the
   * next move to *arrive* in column, which is a battalion standing at its
   * destination unable to fire.
   */
  function seedArrival(unit: UnitSnapshot | null): void {
    if (!unit) return
    ui.arrivalFormation = canFire(unit.arm, unit.formation)
      ? unit.formation
      : FIGHTING_FORMATION[unit.arm]
  }

  function unitById(id: string | null): UnitSnapshot | null {
    if (!id) return null
    return ui.units.find((u) => u.id === id) ?? null
  }

  /**
   * Take an Army, which is the first thing a battle asks and the one decision
   * that cannot be revisited: an army is arranged by the hand that will command
   * it. Everything an Army owns is read out of the Scenario here — where its
   * Headquarters stands, the ground it may arrange itself on, and which half of
   * the Plan stops being authored intent, because you are the intent now.
   */
  function commandArmy(armyId: string): void {
    const r = runner.value
    if (!r || !scenario || ui.phase !== "command") return
    const mine = scenario.armies.find((a) => a.id === armyId)
    if (!mine) return
    ui.playerArmy = mine.id
    viewState.playerArmy = mine.id
    readHeadquarters()
    viewState.deploymentZone = mine.deploymentZone ?? null
    takeCommand(r.battle, mine.id)
    ui.phase = "deployment"
    rememberBattle({ path: scenarioPath, army: mine.id })
  }

  function beginBattle(): void {
    const r = runner.value
    if (!r) return
    ui.phase = "battle"
    // Deployment hides the arrival Formation — there is no arrival to dress for
    // while the army is still being arranged — so a Unit selected in that phase
    // reaches the first minute of the battle with nothing chosen. Seed it here
    // or the row opens blank and the first Order arrives in whatever the Unit
    // happens to be standing in, which is not what the player read.
    seedArrival(unitById(ui.selected))
    viewState.deploymentZone = null
    r.running = true
  }

  function setTempo(tempo: number): void {
    const r = runner.value
    if (!r) return
    r.tempo = tempo
    ui.tempo = tempo
  }

  function toggleFireZones(): void {
    viewState.fireZones = !viewState.fireZones
    ui.fireZones = viewState.fireZones
  }

  /**
   * Break off the action. Two presses and not one: it ends the battle outright
   * and there is no taking it back, which is the same reason a Charge is armed
   * before it is aimed. The offer stands until it is taken or dropped.
   */
  function offerToConcede(on: boolean): void {
    ui.conceding = on && ui.phase === "battle"
  }

  function breakOff(): void {
    const r = runner.value
    if (!r || ui.phase !== "battle") return
    ui.conceding = false
    concede(r.battle, ui.playerArmy)
    finish(r)
  }

  function togglePause(): void {
    const r = runner.value
    if (!r || ui.phase !== "battle") return
    r.running = !r.running
    ui.running = r.running
  }

  /** The selected Unit, when it is one you may actually command. */
  function commandable(): UnitSnapshot | null {
    const unit = unitById(ui.selected)
    return unit && unit.army === ui.playerArmy ? unit : null
  }

  /**
   * Arm a Charge. Two acts, not one: a Charge is the only Order aimed at a Unit
   * rather than at a piece of ground, and a press that lands on a Unit has
   * always meant "read this one". Arming first is what keeps it meaning that —
   * a slip cannot spend ninety seconds of Courier time on a committed run.
   */
  function armCharge(): void {
    const unit = commandable()
    if (!unit || ui.phase !== "battle" || unit.routing) return
    if (!canCharge(unit.arm)) return
    setArming(!ui.arming)
  }

  function setArming(on: boolean): void {
    ui.arming = on
    viewState.arming = on
    if (on) ui.pointing = false
  }

  /**
   * Wait for a direction. The counterpart of arming a Charge, and armed for the
   * same reason: what the player presses next is neither a Unit nor a piece of
   * ground to stand on, so the press has to be spoken for in advance.
   */
  function armPoint(): void {
    const unit = commandable()
    if (!unit || ui.phase !== "battle" || unit.routing) return
    setArming(false)
    ui.pointing = !ui.pointing
  }

  /**
   * Point a Unit where it stands. A Move Order onto the ground the Unit is
   * already on — no new kind of Order, because a Move already carries an
   * arrival facing and this is one with no ground in it.
   *
   * It is the only Order guns can obey without hitching up: a battery In
   * Battery has no speed at all, and the Initiative rule that limbers it stands
   * down when the Order leaves it nothing to march. Ordered anywhere else, even
   * fifty metres, the guns come off their trails and go on their limbers.
   *
   * The destination is the Unit's own centre and never where the press landed.
   * A six-gun battery is 108m across, so a press on its flank is a destination
   * fifty metres away — which is a march, and would limber it up to make it.
   */
  function pointAt(unit: UnitSnapshot, facing: number): void {
    order({
      kind: "move",
      destination: { ...unit.position },
      arrivalFacing: facing,
      arrivalFormation: ui.arrivalFormation ?? unit.formation,
    })
  }

  /** The selected Unit in the Battle itself, when it is yours to arrange. */
  function deployable(): Unit | null {
    const r = runner.value
    if (!r || ui.phase !== "deployment" || !ui.selected) return null
    const unit = r.battle.units.find((u) => u.id === ui.selected)
    return unit && unit.army === ui.playerArmy ? unit : null
  }

  /**
   * Form up at Deployment. Not an Order: it sets the Formation outright, with no
   * Courier to ride and no drill to serve.
   *
   * Sending the real thing here would have been the wrong model twice over. The
   * clock is stopped, so the dispatch would sit frozen on the Field until the
   * battle began, and then a rider would set off and the army would spend its
   * first minutes drilling instead of standing where it was put. Deployment is
   * the hour before the battle, when an army is arranged rather than commanded.
   */
  function deployFormation(formation: FormationName): void {
    const unit = deployable()
    if (!unit || !allows(unit.arm, formation) || unit.formation === formation) return
    unit.formation = formation
    // Nothing has stepped yet, so there is no change under way to abandon —
    // cleared rather than trusted, because a half-formed battalion at
    // Deployment would be a bug somewhere else and this must not carry it.
    unit.changing = null
    clampIntoZone(unit, unit.position)
    resync()
  }

  /** Face a Unit at Deployment. Instant, for the same reason forming up is. */
  function deployFacing(facing: number): void {
    const unit = deployable()
    if (!unit) return
    unit.facing = facing
    resync()
  }

  /**
   * Form up, by whichever means the phase allows: an Order once the clock runs,
   * and a hand on the map before it does. The screen presses one button either
   * way and has no business knowing which of the two it got.
   */
  function form(formation: FormationName): void {
    if (ui.phase === "deployment") {
      deployFormation(formation)
      return
    }
    order({ kind: "form", formation })
  }

  /**
   * Give the selected Unit a new brief, by whichever means the phase allows: a
   * hand on the map before the clock runs, and a Courier once it does. Free at
   * Deployment because that is the hour a subordinate is briefed in; couriered
   * after, because every other instruction is and a dial that was not would
   * hand back instantaneous army-wide command (ADR-0007).
   *
   * Both halves of the brief ride together whichever button was pressed. The
   * Order carries the whole of it, so a rider who left before the player
   * changed his mind about the fire cannot arrive and undo the change.
   */
  function brief(change: { latitude?: Latitude; holdFire?: boolean }): void {
    const carrying = deployable() ?? commandable()
    if (!carrying) return
    const standing = {
      latitude: change.latitude ?? carrying.standing.latitude,
      holdFire: change.holdFire ?? carrying.standing.holdFire,
    }
    if (ui.phase === "deployment") {
      const unit = deployable()
      if (!unit) return
      unit.standing = standing
      resync()
      return
    }
    order({ kind: "standing", ...standing })
  }

  /** The player's own Headquarters, which is where his Orders come from. */
  function headquarters() {
    const r = runner.value
    if (!r) return null
    return r.battle.armies.find((a) => a.id === ui.playerArmy)?.headquarters ?? null
  }

  /**
   * Re-read the Headquarters onto the screen. Called every frame, because it
   * moves now — and it carries the ride the player is still dragging out, so the
   * mark he is aiming at is drawn before he has committed to it.
   */
  function readHeadquarters(): void {
    const hq = headquarters()
    viewState.headquarters = hq
      ? {
          position: hq.position,
          destination: sending?.at ?? hq.destination,
          harried: hq.harried,
        }
      : null
  }

  function order(body: OrderBody): void {
    const r = runner.value
    if (!r || !ui.selected || ui.phase !== "battle") return
    // An enemy Unit can be selected to read it, never to order it about.
    if (!commandable()) return
    const hq = headquarters()
    if (!hq) return
    // Nothing to say if there is nobody to carry it: a staff in the saddle
    // sends no riders, and the Field and the panel both say so while it is.
    if (!sendOrder(r.battle, hq, ui.selected, body)) return
    ui.dispatches = [...r.battle.dispatches]
  }

  /** Metres, from a pointer event. */
  function fieldPoint(event: PointerEvent | MouseEvent): Vec2 {
    return view.value?.toField(event.clientX, event.clientY) ?? { x: 0, y: 0 }
  }

  function inZone(point: Vec2): boolean {
    const zone = viewState.deploymentZone
    if (!zone) return false
    const [x, y, w, h] = zone
    return point.x >= x && point.y >= y && point.x <= x + w && point.y <= y + h
  }

  let dragFrom: Vec2 | null = null

  /**
   * A ride the player is dragging out of the Headquarters and has not let go of
   * yet. Held here rather than in the simulation because nothing is committed
   * until the release: the ride costs him command of the whole army while it
   * lasts, so it is not something a slip should buy.
   */
  let sending: { at: Vec2 } | null = null

  /**
   * Deployment: the point an aiming press began at, and the facing the Unit
   * had before it. The facing is applied live so the player aims by watching
   * the battalion turn, so the old one has to be kept to put back if the drag
   * is walked back and cancelled.
   */
  let aim: { from: Vec2; facing: number } | null = null

  /**
   * A Unit being pointed by a drag off its own body: where the press began, and
   * the Unit's own centre. Two points, because they answer two questions — the
   * press point says whether this was a drag or a slip, and the centre is what
   * the bearing has to be read from, since the body of a battery is a hundred
   * metres wide and a press on its flank already points somewhere.
   */
  let turning: { from: Vec2; centre: Vec2 } | null = null

  /**
   * True if a press begun on a Unit's body and let go at `to` amounts to a
   * direction. Two tests, because two things can go wrong: a press that went
   * nowhere is a slip and must not spend a Courier ride, and a release too near
   * the Unit's own centre has no bearing in it however far the finger went.
   */
  function pointed(held: { from: Vec2; centre: Vec2 }, to: Vec2): boolean {
    return distance(held.from, to) >= COMMIT_THRESHOLD && distance(held.centre, to) >= AIM_THRESHOLD
  }

  function onPointerDown(event: PointerEvent): void {
    const v = view.value
    const r = runner.value
    if (!v || !r) return
    ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
    const point = fieldPoint(event)

    if (ui.phase === "deployment") {
      const hq = viewState.headquarters
      if (hq && distance(point, hq.position) < HEADQUARTERS_GRAB) {
        viewState.placing = { id: "__hq", at: point }
        return
      }
      const unit = v.unitAt(
        ui.units.filter((u) => u.army === ui.playerArmy),
        point,
      )
      if (unit) {
        ui.selected = unit.id
        viewState.placing = { id: unit.id, at: point }
        return
      }
      // Bare ground, with one of yours in hand: point where you want it
      // looking. The body of a Unit is already spoken for by placing it, so the
      // facing gesture has to begin off it — which reads well enough, since
      // what the player presses is the direction rather than the battalion.
      const aimed = deployable()
      if (aimed) aim = { from: point, facing: aimed.facing }
      return
    }

    // Asked for two gestures ago, so it takes the press before anything else
    // can read it — a direction is any ground at all, the Unit's own body
    // included, and hit-testing first would have the player pointing a Unit at
    // itself by selecting whatever stands that way.
    if (ui.pointing) {
      ui.pointing = false
      const aimed = commandable()
      if (aimed && distance(aimed.position, point) > AIM_THRESHOLD) {
        pointAt(aimed, bearing(aimed.position, point))
      }
      dragFrom = null
      return
    }

    // Pressing on any Unit selects it, enemy included — you cannot order an
    // enemy about, but you can read it, and a press that lands on one must not
    // quietly become an Order aimed at where it stands.
    const hit = v.unitAt(ui.units, point)
    if (ui.arming) {
      // The one press that means something else, and only because the player
      // asked for it two gestures ago. Anywhere but a Unit a Charge may be
      // aimed at calls it off — which includes a Routing enemy, since C6 would
      // pull the chargers up the moment the Order arrived.
      setArming(false)
      if (hit && chargeable(hit, ui.playerArmy)) {
        order({ kind: "charge", targetId: hit.id })
        // The selection stays on the Unit that was let go, not on what it was
        // let go at: what the player wants to watch now is their own regiment.
        dragFrom = null
        return
      }
    }
    // Take hold of the Headquarters and drag it where the staff is to go. After
    // arming, which is a gesture the player asked for two presses ago, and
    // before selection: the marker is small, and pressing it is unambiguous.
    const hq = viewState.headquarters
    if (hq && ui.phase === "battle" && distance(point, hq.position) < HEADQUARTERS_GRAB) {
      sending = { at: point }
      dragFrom = null
      viewState.drag = null
      return
    }
    if (hit && hit.army !== ui.playerArmy) {
      ui.selected = hit.id
      dragFrom = null
      return
    }
    if (hit) {
      // A press on a Unit already in hand aims it where it stands. The gesture
      // is dead otherwise — selecting what is already selected — and turning on
      // the spot is the one Order whose destination the player cannot press,
      // because the Unit is standing on the whole of it.
      const again = hit.id === ui.selected
      if (!again) setArming(false)
      ui.selected = hit.id
      seedArrival(hit)
      dragFrom = null
      if (again && ui.phase === "battle" && !hit.routing) {
        turning = { from: point, centre: { ...hit.position } }
        viewState.drag = {
          at: turning.centre,
          facing: hit.facing,
          formation: ui.arrivalFormation ?? hit.formation,
        }
      }
      return
    }
    const from = commandable()
    if (from) {
      dragFrom = point
      viewState.drag = {
        at: point,
        facing: from?.facing ?? 0,
        // The preview stands in the Formation it will arrive in, not the one
        // it is standing in now — that is what the player is deciding.
        formation: ui.arrivalFormation ?? from?.formation ?? "line",
      }
    }
  }

  function onPointerMove(event: PointerEvent): void {
    const point = fieldPoint(event)
    if (sending) {
      sending.at = point
      readHeadquarters()
      return
    }
    if (viewState.placing) {
      viewState.placing.at = point
      movePlaced(point)
      return
    }
    if (aim) {
      const unit = deployable()
      // Aimed from the Unit, not from where the press landed: the player is
      // pointing at a direction on the Field, and the bearing has to be read
      // from the battalion doing the looking. Too near it to mean anything and
      // the facing is left alone rather than snapped to a pixel of jitter.
      if (unit && distance(unit.position, point) > AIM_THRESHOLD) {
        deployFacing(bearing(unit.position, point))
      }
      return
    }
    if (turning && viewState.drag) {
      // The same two tests the release is judged by, so the outline never shows
      // a facing the letting-go would refuse.
      const unit = unitById(ui.selected)
      viewState.drag.facing = pointed(turning, point)
        ? bearing(turning.centre, point)
        : (unit?.facing ?? 0)
      viewState.drag.formation = ui.arrivalFormation ?? unit?.formation ?? "line"
      return
    }
    if (!dragFrom || !viewState.drag) return
    const dragged = unitById(ui.selected)
    viewState.drag.facing =
      distance(dragFrom, point) > AIM_THRESHOLD ? bearing(dragFrom, point) : (dragged?.facing ?? 0)
    // Re-read every move: the player may pick the arrival Formation mid-drag.
    viewState.drag.formation = ui.arrivalFormation ?? dragged?.formation ?? "line"
  }

  /** Deployment only: arranging the army inside its zone before the clock runs. */
  function movePlaced(point: Vec2): void {
    const r = runner.value
    const placing = viewState.placing
    if (!r || !placing) return
    if (placing.id === "__hq") {
      const hq = headquarters()
      if (hq && inZone(point)) {
        hq.position = { ...point }
        readHeadquarters()
      }
      return
    }
    const unit = r.battle.units.find((u) => u.id === placing.id)
    if (!unit) return
    clampIntoZone(unit, point)
    resync()
  }

  /**
   * Hold a Unit inside its zone. A Unit is placed by its centre, so its whole
   * Footprint has to fit — and the Footprint is read fresh every time, because
   * Formation decides it. A 720-man battalion measures 144m by 3.6m in line and
   * 2.8m by 162m in march column, so the margin it needs moves with the
   * Formation, and a battalion legally placed in one would hang out of the zone
   * in the other if the margin were not recomputed.
   *
   * Known simplification: the margin is the larger of the two dimensions, so it
   * ignores facing and reserves a square. Conservative, never wrong, and it
   * costs a battalion a few metres of a zone it has hundreds of.
   */
  function clampIntoZone(unit: Unit, point: Vec2): void {
    const zone = viewState.deploymentZone
    if (!zone) return
    const [zx, zy, zw, zh] = zone
    const shape = unitFootprint(unit)
    const half = Math.max(shape.width, shape.depth) / 2
    unit.position = {
      x: Math.max(zx + half, Math.min(zx + zw - half, point.x)),
      y: Math.max(zy + half, Math.min(zy + zh - half, point.y)),
    }
    // Arranging the army is how a Unit is given its ground before there is
    // anybody to ride an Order to it, so the Post goes where the hand puts it.
    // Left behind, a Unit deployed across the zone would open the battle with
    // its whole Latitude already spent.
    unit.post = { ...unit.position }
  }

  /**
   * Re-read the screen's copy after arranging the Battle by hand. Deployment
   * mutates Units directly rather than sending Orders, so nothing steps and
   * nothing would otherwise take a new snapshot. Both snapshots are set to the
   * same one: with the clock stopped there is nothing to interpolate between,
   * and leaving `previous` behind would slide the Unit back every frame.
   */
  function resync(): void {
    const r = runner.value
    if (!r) return
    r.current = snapshot(r.battle)
    r.previous = r.current
    ui.units = r.current.units
  }

  function onPointerUp(event: PointerEvent): void {
    if (sending) {
      const r = runner.value
      const to = sending.at
      const hq = headquarters()
      sending = null
      // A press on the Headquarters that went nowhere is not a ride. It costs
      // the whole army's command until the staff is established again, so it is
      // the one gesture that must never happen by accident.
      if (r && hq && distance(hq.position, to) >= COMMIT_THRESHOLD) rideTo(r.battle, hq, to)
      readHeadquarters()
      ui.dispatches = r ? [...r.battle.dispatches] : ui.dispatches
      return
    }
    if (viewState.placing) {
      viewState.placing = null
      return
    }
    if (aim) {
      const cancelled = distance(aim.from, fieldPoint(event)) < COMMIT_THRESHOLD
      if (cancelled) {
        // A press on bare ground that went nowhere, which is what clicking away
        // from everything looks like. Put the facing back and let go of the
        // Unit, the same as it means once the battle is running.
        deployFacing(aim.facing)
        ui.selected = null
      }
      aim = null
      return
    }
    if (turning) {
      const point = fieldPoint(event)
      const unit = commandable()
      const held = turning
      turning = null
      viewState.drag = null
      // Nothing pointed leaves the Unit selected, unlike a press on bare
      // ground that goes nowhere: the player pressed the Unit and meant to
      // have it, so a slip costs the gesture and not the selection.
      if (unit && pointed(held, point)) pointAt(unit, bearing(held.centre, point))
      return
    }
    if (!dragFrom || !viewState.drag) return
    const point = fieldPoint(event)
    const travelled = distance(dragFrom, point)
    if (travelled < COMMIT_THRESHOLD) {
      // A click, or a drag walked back to where it began. Nothing was
      // commanded. The press can only have landed on bare ground — a press on
      // a Unit selects and never sets `dragFrom` — so this clears the
      // selection, which is what clicking away from everything should do.
      ui.selected = null
      dragFrom = null
      viewState.drag = null
      return
    }
    const unit = unitById(ui.selected)
    const facing = travelled > AIM_THRESHOLD ? bearing(dragFrom, point) : (unit?.facing ?? 0)
    order({
      kind: "move",
      destination: dragFrom,
      arrivalFacing: facing,
      arrivalFormation: ui.arrivalFormation ?? unit?.formation ?? "line",
    })
    dragFrom = null
    viewState.drag = null
  }

  function deselect(): void {
    ui.selected = null
    dragFrom = null
    sending = null
    aim = null
    turning = null
    viewState.drag = null
    ui.pointing = false
    setArming(false)
  }

  onBeforeUnmount(() => {
    cancelAnimationFrame(frame)
    view.value?.destroy()
  })

  return {
    ui,
    start,
    leave,
    commandArmy,
    beginBattle,
    setTempo,
    toggleFireZones,
    togglePause,
    offerToConcede,
    breakOff,
    order,
    form,
    brief,
    armCharge,
    armPoint,
    deselect,
    unitById,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
