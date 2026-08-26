import { markRaw, onBeforeUnmount, reactive, shallowRef } from "vue"
import { armyColours, BattleView, type ViewState } from "@/render/BattleView"
import { loadScenario } from "@/scenario/loader"
import { BattleRunner } from "@/sim/runner"
import { issueOrder } from "@/sim/orders"
import { poseFootprint } from "@/sim/formation"
import type { Dispatch, FormationName, Grade, OrderBody, Vec2 } from "@/sim/types"
import type { UnitSnapshot } from "@/sim/snapshot"
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
      }
      return
    }

    // Pressing on any Unit selects it, enemy included — you cannot order an
    // enemy about, but you can read it, and a press that lands on one must not
    // quietly become an Order aimed at where it stands.
    const hit = v.unitAt(ui.units, point)
    if (hit && hit.army !== ui.playerArmy) {
      ui.selected = hit.id
      dragFrom = null
      return
    }
    if (hit) {
      ui.selected = hit.id
      ui.arrivalFormation = hit.formation
      dragFrom = null
      return
    }
    const from = commandable()
    if (from) {
      dragFrom = point
      viewState.drag = { at: point, facing: unitById(ui.selected)?.facing ?? 0 }
    }
  }

  function onPointerMove(event: PointerEvent): void {
    const point = fieldPoint(event)
    if (viewState.placing) {
      viewState.placing.at = point
      movePlaced(point)
      return
    }
    if (!dragFrom || !viewState.drag) return
    viewState.drag.facing =
      distance(dragFrom, point) > AIM_THRESHOLD
        ? bearing(dragFrom, point)
        : (unitById(ui.selected)?.facing ?? 0)
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
    const shape = poseFootprint({
      arm: unit.arm,
      strength: unit.strength,
      formation: unit.formation,
      changingTo: null,
      changeProgress: 0,
    })
    // A Unit is placed by its centre, so its whole Footprint has to fit.
    const zone = viewState.deploymentZone
    if (!zone) return
    const [zx, zy, zw, zh] = zone
    const half = Math.max(shape.width, shape.depth) / 2
    unit.position = {
      x: Math.max(zx + half, Math.min(zx + zw - half, point.x)),
      y: Math.max(zy + half, Math.min(zy + zh - half, point.y)),
    }
    r.current = {
      ...r.current,
      units: r.current.units.map((u) =>
        u.id === unit.id ? { ...u, position: { ...unit.position } } : u,
      ),
    }
    r.previous = r.current
    ui.units = r.current.units
  }

  function onPointerUp(event: PointerEvent): void {
    if (viewState.placing) {
      viewState.placing = null
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
    viewState.drag = null
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
    deselect,
    unitById,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
