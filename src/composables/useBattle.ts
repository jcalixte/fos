import { markRaw, onBeforeUnmount, reactive, shallowRef } from "vue"
import { armyColours, BattleView, type ViewState } from "@/render/BattleView"
import { loadScenario } from "@/scenario/loader"
import { BattleRunner } from "@/sim/runner"
import { issueOrder } from "@/sim/orders"
import { canCharge, chargeable } from "@/sim/charge"
import { allows, canFire, FIGHTING_FORMATION, unitFootprint } from "@/sim/formation"
import type { Dispatch, FormationName, Grade, OrderBody, Unit, Vec2 } from "@/sim/types"
import { snapshot, type UnitSnapshot } from "@/sim/snapshot"
import { bearing, distance } from "@/sim/vec"

export type Phase = "loading" | "deployment" | "battle" | "over"

/** Metres of drag below which the player is placing, not aiming. */
const AIM_THRESHOLD = 24

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
  arrivalFormation: FormationName | null
  dispatches: Dispatch[]
  gradeNames: Record<string, Record<Grade, string>>
  playerArmy: string
}

export function useBattle(scenarioPath: string) {
  const view = shallowRef<BattleView | null>(null)
  const runner = shallowRef<BattleRunner | null>(null)

  const ui = reactive<BattleUi>({
    phase: "loading",
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
    arrivalFormation: null,
    dispatches: [],
    gradeNames: {},
    playerArmy: "french",
  })

  const viewState: ViewState = {
    selected: null,
    playerArmy: "french",
    headquarters: null,
    keyGround: [],
    deploymentZone: null,
    drag: null,
    placing: null,
    armyColours: {},
    fireZones: false,
    arming: false,
  }

  let frame = 0
  let last = 0
  let uiClock = 0

  async function start(host: HTMLElement): Promise<void> {
    try {
      const loaded = await loadScenario(scenarioPath)
      const battle = loaded.battle
      const player = loaded.file.armies[0]
      ui.playerArmy = player.id
      ui.scenarioName = loaded.file.name
      ui.scenarioSummary = loaded.file.summary
      ui.clock = battle.clock
      for (const army of loaded.file.armies) {
        ui.gradeNames[army.id] = loaded.rosters[army.roster].grades
      }

      const v = markRaw(new BattleView())
      await v.mount(host)
      v.setField(battle.field)
      view.value = v

      const r = markRaw(new BattleRunner(battle))
      r.tempo = ui.tempo
      runner.value = r

      viewState.playerArmy = player.id
      viewState.armyColours = armyColours(battle)
      viewState.headquarters = battle.armies[0].headquarters?.position ?? null
      viewState.keyGround = battle.keyGround
      viewState.deploymentZone = player.deploymentZone ?? null

      ui.phase = "deployment"
      ui.units = r.current.units
      last = performance.now()
      frame = requestAnimationFrame(tick)
    } catch (error) {
      ui.error = error instanceof Error ? error.message : String(error)
      ui.phase = "loading"
    }
  }

  function tick(now: number): void {
    frame = requestAnimationFrame(tick)
    const r = runner.value
    const v = view.value
    if (!r || !v) return
    r.advance((now - last) / 1000)
    last = now
    viewState.selected = ui.selected
    v.draw(r.previous, r.current, r.alpha, viewState)

    // The screen runs at 60fps; the panels have no business re-rendering there.
    if (now - uiClock < 100) return
    uiClock = now
    ui.time = r.battle.time
    ui.units = r.current.units
    ui.ordersInFlight = r.current.couriers.length
    ui.running = r.running
    if (ui.dispatches.length !== r.battle.dispatches.length) {
      ui.dispatches = [...r.battle.dispatches]
    }
    if (r.battle.time >= r.battle.clock && ui.phase === "battle") {
      ui.phase = "over"
      r.running = false
    }
  }

  function unitById(id: string | null): UnitSnapshot | null {
    if (!id) return null
    return ui.units.find((u) => u.id === id) ?? null
  }

  function beginBattle(): void {
    const r = runner.value
    if (!r) return
    ui.phase = "battle"
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

  function order(body: OrderBody): void {
    const r = runner.value
    if (!r || !ui.selected || ui.phase !== "battle") return
    // An enemy Unit can be selected to read it, never to order it about.
    if (!commandable()) return
    const from = r.battle.armies.find((a) => a.id === ui.playerArmy)?.headquarters?.position
    if (!from) return
    issueOrder(r.battle, ui.selected, body, from)
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
   * Deployment: the point an aiming press began at, and the facing the Unit
   * had before it. The facing is applied live so the player aims by watching
   * the battalion turn, so the old one has to be kept to put back if the drag
   * is walked back and cancelled.
   */
  let aim: { from: Vec2; facing: number } | null = null

  function onPointerDown(event: PointerEvent): void {
    const v = view.value
    const r = runner.value
    if (!v || !r) return
    ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
    const point = fieldPoint(event)

    if (ui.phase === "deployment") {
      const hq = viewState.headquarters
      if (hq && distance(point, hq) < 30) {
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
    if (hit && hit.army !== ui.playerArmy) {
      ui.selected = hit.id
      dragFrom = null
      return
    }
    if (hit) {
      if (hit.id !== ui.selected) setArming(false)
      ui.selected = hit.id
      // Seed from what the Unit is standing in, unless that is a travelling
      // Formation — Initiative puts Units into column on its own, and seeding
      // from it would quietly order the next move to *arrive* in column, which
      // is a battalion standing at its destination unable to fire.
      ui.arrivalFormation = canFire(hit.arm, hit.formation)
        ? hit.formation
        : FIGHTING_FORMATION[hit.arm]
      dragFrom = null
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
      const hq = r.battle.armies.find((a) => a.id === ui.playerArmy)?.headquarters
      if (hq && inZone(point)) {
        hq.position = { ...point }
        viewState.headquarters = hq.position
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
    aim = null
    viewState.drag = null
    setArming(false)
  }

  onBeforeUnmount(() => {
    cancelAnimationFrame(frame)
    view.value?.destroy()
  })

  return {
    ui,
    start,
    beginBattle,
    setTempo,
    toggleFireZones,
    togglePause,
    order,
    form,
    armCharge,
    deselect,
    unitById,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
