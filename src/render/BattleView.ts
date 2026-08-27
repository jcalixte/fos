import { Application, Container, Graphics, Sprite, Texture, type ColorSource } from "pixi.js"
import { bodyCount, faces, figureSlots, fireZone, footprint, poseFootprint } from "@/sim/formation"
import type { Battle, Field, FormationName, KeyGround, Vec2 } from "@/sim/types"
import type { BattleSnapshot, UnitSnapshot } from "@/sim/snapshot"
import { angleDelta } from "@/sim/vec"
import { buildContourCanvas, buildTerrainCanvas } from "./terrain"

/**
 * C10 Unit Renderer and C11 Effects.
 *
 * The camera is fixed at the whole Field: no zoom, no pan (F6). That forces
 * legibility at the hardest scale first — if a Formation cannot be told from
 * its silhouette here, adding a zoom would only hide the problem.
 */

/**
 * A facing of 0 means east, because that is what `bearing` returns and what the
 * simulation marches on. A slot layout is written with +x across the Face and
 * +y toward the rear, so its Face points along local -y. Rotating by a quarter
 * turn is what reconciles the two — without it a battalion is drawn square to
 * the direction it is actually facing.
 */
const QUARTER_TURN = Math.PI / 2

/** Men one Figure stands for. A Figure is not a man and never counts as one. */
const MEN_PER_FIGURE = 10

/** Floor on a Figure's size, so a line never collapses into a smear (F5). */
const MIN_FIGURE_PX = 3

/** Smallest a Unit may be to press on, in screen pixels. */
const GRAB_FLOOR_PX = 28

export interface ViewState {
  selected: string | null
  playerArmy: string
  headquarters: Vec2 | null
  keyGround: KeyGround[]
  deploymentZone: [number, number, number, number] | null
  /** The Order being drawn but not yet issued, shown as it will arrive. */
  drag: { at: Vec2; facing: number; formation: FormationName } | null
  /** Deployment: the Unit or Headquarters being placed. */
  placing: { id: string; at: Vec2 } | null
  armyColours: Record<string, number>
  /** Show every Unit's beaten ground. Off, only the selected Unit shows its own. */
  fireZones: boolean
  /**
   * A Charge is armed and waiting to be aimed. Every enemy is outlined while it
   * is, because the thing the player is about to pick is a Unit and not a point
   * on the ground — the only Order in the game of which that is true.
   */
  arming: boolean
}

/** Mix a colour toward white, so Figures read against their own Unit's base. */
function lighten(colour: number, amount: number): number {
  const r = (colour >> 16) & 0xff
  const g = (colour >> 8) & 0xff
  const b = colour & 0xff
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  return (mix(r) << 16) | (mix(g) << 8) | mix(b)
}

function figureTexture(): Texture {
  const canvas = document.createElement("canvas")
  canvas.width = 16
  canvas.height = 16
  const context = canvas.getContext("2d")
  if (!context) throw new Error("no 2d context for a Figure")
  context.fillStyle = "#ffffff"
  context.beginPath()
  context.arc(8, 8, 7, 0, Math.PI * 2)
  context.fill()
  return Texture.from(canvas)
}

/**
 * A discharge on screen. The simulation reports a Volley for the one step it
 * happened in; the flash has to outlive that step to be seen at all, so the
 * renderer keeps it and burns it down on wall-clock time. Renderer-only state,
 * which is the only reason it is allowed to exist: nothing here goes back in.
 */
interface Flash {
  at: Vec2
  facing: number
  width: number
  /** performance.now() when it was raised. */
  born: number
}

/** How long a flash and its smoke stay on screen, in milliseconds. */
const FLASH_MS = 420

/**
 * Two blocks touching, on screen. The same renderer-only trick as a Flash and
 * for the same reason: the simulation keeps a Contact for one step, and one step
 * at 10Hz is six frames of nothing much.
 */
interface Clash {
  at: Vec2
  /** The way the charge went in, in radians. */
  facing: number
  /** Metres of front that met, which is how wide it is drawn. */
  width: number
  /** True when it ended in a Break rather than in the chargers being thrown back. */
  broke: boolean
  born: number
}

/** Longer than a flash: a Contact is the loudest thing that happens. */
const CLASH_MS = 750

interface UnitVisual {
  container: Container
  base: Graphics
  figures: Sprite[]
  /** What the slot layout was last built for, so it is rebuilt only when it moves. */
  builtFor: string
}

/** Interpolate one Unit between the last two simulation states. */
function tween(a: UnitSnapshot | undefined, b: UnitSnapshot, alpha: number): UnitSnapshot {
  if (!a) return b
  return {
    ...b,
    position: {
      x: a.position.x + (b.position.x - a.position.x) * alpha,
      y: a.position.y + (b.position.y - a.position.y) * alpha,
    },
    facing: a.facing + angleDelta(a.facing, b.facing) * alpha,
    changeProgress:
      a.changingTo === b.changingTo
        ? a.changeProgress + (b.changeProgress - a.changeProgress) * alpha
        : b.changeProgress,
  }
}

export class BattleView {
  readonly app = new Application()
  private world = new Container()
  private overlay = new Graphics()
  private fireLayer = new Graphics()
  private ghostLayer = new Graphics()
  private unitLayer = new Container()
  private effects = new Graphics()
  private visuals = new Map<string, UnitVisual>()
  private texture: Texture | null = null
  private field: Field | null = null
  private host: HTMLElement | null = null
  private observer: ResizeObserver | null = null
  private pxPerMetre = 1
  private flashes: Flash[] = []
  private flashed = new Set<string>()
  private clashes: Clash[] = []
  private clashed = new Set<string>()

  async mount(host: HTMLElement): Promise<void> {
    this.host = host
    await this.app.init({
      background: "#171a17",
      antialias: true,
      resizeTo: host,
      resolution: Math.min(2, globalThis.devicePixelRatio || 1),
      autoDensity: true,
    })
    host.appendChild(this.app.canvas)
    // Pixi's `resizeTo` only listens for a window resize, and the host box moves
    // without one: the footer grows the moment a Unit is selected, and again
    // whenever its controls wrap to another row. The canvas is absolutely
    // positioned, so a stale height does not just letterbox — it hangs over the
    // footer and paints out the row underneath it.
    this.observer = new ResizeObserver(() => {
      this.app.resize()
      this.layout()
    })
    this.observer.observe(host)
    this.texture = figureTexture()
    this.app.stage.addChild(this.world)
    this.world.addChild(this.overlay, this.fireLayer, this.ghostLayer, this.unitLayer, this.effects)
  }

  /** Draw the Field once. Terrain never changes during a battle. */
  setField(field: Field): void {
    this.field = field
    const terrain = new Sprite(Texture.from(buildTerrainCanvas(field)))
    terrain.width = field.width * field.cellSize
    terrain.height = field.height * field.cellSize
    const contours = new Sprite(Texture.from(buildContourCanvas(field)))
    contours.width = terrain.width
    contours.height = terrain.height
    this.world.addChildAt(contours, 0)
    this.world.addChildAt(terrain, 0)
    this.layout()
  }

  /** Fit the whole Field on screen. There are no camera controls to fit it with. */
  layout(): void {
    if (!this.field || !this.host) return
    const metresX = this.field.width * this.field.cellSize
    const metresY = this.field.height * this.field.cellSize
    const width = this.host.clientWidth
    const height = this.host.clientHeight
    this.pxPerMetre = Math.min(width / metresX, height / metresY)
    this.world.scale.set(this.pxPerMetre)
    this.world.position.set(
      (width - metresX * this.pxPerMetre) / 2,
      (height - metresY * this.pxPerMetre) / 2,
    )
  }

  /** Screen point to Field metres. */
  toField(clientX: number, clientY: number): Vec2 {
    const bounds = this.app.canvas.getBoundingClientRect()
    return {
      x: (clientX - bounds.left - this.world.position.x) / this.pxPerMetre,
      y: (clientY - bounds.top - this.world.position.y) / this.pxPerMetre,
    }
  }

  metresPerPixel(): number {
    return 1 / this.pxPerMetre
  }

  /** The Unit whose Footprint covers a point, nearest centre first. */
  unitAt(units: UnitSnapshot[], point: Vec2): UnitSnapshot | null {
    let best: UnitSnapshot | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    for (const unit of units) {
      const shape = footprint(unit.arm, unit.formation, unit.strength)
      const dx = point.x - unit.position.x
      const dy = point.y - unit.position.y
      const cos = Math.cos(-(unit.facing + QUARTER_TURN))
      const sin = Math.sin(-(unit.facing + QUARTER_TURN))
      const local = { x: dx * cos - dy * sin, y: dx * sin + dy * cos }
      // A battalion in line is 144m across and 3.6m deep, so front-to-rear it
      // is a hairline at this scale and the floor is doing all the work. 28px
      // is roughly a fingertip on a trackpad.
      const grabX = Math.max(shape.width, GRAB_FLOOR_PX * this.metresPerPixel()) / 2
      const grabY = Math.max(shape.depth, GRAB_FLOOR_PX * this.metresPerPixel()) / 2
      if (Math.abs(local.x) > grabX || Math.abs(local.y) > grabY) continue
      const distance = Math.hypot(dx, dy)
      if (distance < bestDistance) {
        bestDistance = distance
        best = unit
      }
    }
    return best
  }

  draw(previous: BattleSnapshot, current: BattleSnapshot, alpha: number, view: ViewState): void {
    const byId = new Map(previous.units.map((u) => [u.id, u]))
    const units = current.units.map((u) => tween(byId.get(u.id), u, alpha))
    this.collectFlashes(current)
    this.collectClashes(current)
    this.drawOverlay(view)
    this.drawFireZones(units, view)
    this.drawGhosts(current, view)
    this.drawUnits(units, view)
    this.drawEffects(previous, current, alpha, units, view)
  }

  /**
   * Raise a flash for every Volley not seen yet. The same snapshot is drawn for
   * several frames, so a Volley has to be remembered as fired or it flashes once
   * per frame — and the memory is pruned with the flashes so it cannot grow.
   */
  private collectFlashes(current: BattleSnapshot): void {
    const now = performance.now()
    for (const volley of current.volleys) {
      if (this.flashed.has(volley.id)) continue
      this.flashed.add(volley.id)
      this.flashes.push({
        at: { ...volley.from },
        facing: volley.direction,
        width: volley.width,
        born: now,
      })
    }
    if (this.flashes.length === 0) {
      this.flashed.clear()
      return
    }
    const alive = this.flashes.filter((f) => now - f.born < FLASH_MS)
    if (alive.length !== this.flashes.length) this.flashes = alive
  }

  /**
   * Raise a clash for every Contact not seen yet. The direction is read off the
   * two Units where they stood in the step it happened, which is the one frame
   * they were touching in.
   */
  private collectClashes(current: BattleSnapshot): void {
    const now = performance.now()
    for (const contact of current.contacts) {
      if (this.clashed.has(contact.id)) continue
      this.clashed.add(contact.id)
      const charger = current.units.find((u) => u.id === contact.unitId)
      const target = current.units.find((u) => u.id === contact.targetId)
      const facing =
        charger && target
          ? Math.atan2(
              target.position.y - charger.position.y,
              target.position.x - charger.position.x,
            )
          : 0
      this.clashes.push({
        at: { ...contact.where },
        facing,
        width: contact.width,
        broke: contact.outcome === "broke",
        born: now,
      })
    }
    if (this.clashes.length === 0) {
      this.clashed.clear()
      return
    }
    const alive = this.clashes.filter((c) => now - c.born < CLASH_MS)
    if (alive.length !== this.clashes.length) this.clashes = alive
  }

  /**
   * A Contact: a bar of steel across the front that met, and a ring going out of
   * it. Pale when the Face held and the chargers were thrown back, red when
   * something broke — the two outcomes have to read apart at a glance, because
   * they are the only two there are.
   */
  private drawClashes(): void {
    const now = performance.now()
    const mpp = this.metresPerPixel()
    const g = this.effects
    for (const clash of this.clashes) {
      const t = Math.min(1, (now - clash.born) / CLASH_MS)
      const fade = (1 - t) ** 1.6
      if (fade <= 0.01) continue
      const across = { x: -Math.sin(clash.facing), y: Math.cos(clash.facing) }
      const half = Math.max(6 * mpp, clash.width / 2)
      const colour = clash.broke ? 0xe0663c : 0xdfe4ec
      g.circle(clash.at.x, clash.at.y, half * (0.4 + 0.9 * t)).stroke({
        width: mpp * 2,
        color: colour,
        alpha: 0.6 * fade,
      })
      g.moveTo(clash.at.x - across.x * half, clash.at.y - across.y * half)
        .lineTo(clash.at.x + across.x * half, clash.at.y + across.y * half)
        .stroke({ width: mpp * 4, color: colour, alpha: 0.95 * fade })
    }
  }

  /**
   * The flash, and nothing else yet: Powder Smoke is a drifting accumulator the
   * design keeps deliberately inert (T10) and it belongs to its own slice.
   */
  private drawFlashes(): void {
    const now = performance.now()
    const mpp = this.metresPerPixel()
    const g = this.effects
    for (const flash of this.flashes) {
      const t = Math.min(1, (now - flash.born) / FLASH_MS)
      const fade = (1 - t) ** 2
      if (fade <= 0.01) continue
      const cos = Math.cos(flash.facing)
      const sin = Math.sin(flash.facing)
      const across = { x: -sin, y: cos }
      const half = flash.width / 2
      // A bar of fire along the Face, growing out of it as the smoke lifts, so a
      // battalion's discharge reads as one act at a glance and a battery's as
      // eight separate ones.
      const out = Math.max(6 * mpp, 5 + 22 * t)
      const corners: Vec2[] = [
        { x: flash.at.x - across.x * half, y: flash.at.y - across.y * half },
        { x: flash.at.x + across.x * half, y: flash.at.y + across.y * half },
        {
          x: flash.at.x + across.x * half * 0.8 + cos * out,
          y: flash.at.y + across.y * half * 0.8 + sin * out,
        },
        {
          x: flash.at.x - across.x * half * 0.8 + cos * out,
          y: flash.at.y - across.y * half * 0.8 + sin * out,
        },
      ]
      g.poly(corners.flatMap((c) => [c.x, c.y])).fill({ color: 0xf7e2a0, alpha: 0.55 * fade })
      g.moveTo(flash.at.x - across.x * half, flash.at.y - across.y * half)
        .lineTo(flash.at.x + across.x * half, flash.at.y + across.y * half)
        .stroke({ width: mpp * 2.5, color: 0xfff4d0, alpha: 0.95 * fade })
    }
  }

  private drawOverlay(view: ViewState): void {
    const g = this.overlay
    g.clear()
    if (view.deploymentZone) {
      const [x, y, w, h] = view.deploymentZone
      g.rect(x, y, w, h)
        .fill({ color: 0xffffff, alpha: 0.05 })
        .stroke({ width: 2 * this.metresPerPixel(), color: 0xffffff, alpha: 0.35 })
    }
    for (const key of view.keyGround) {
      g.circle(key.position.x, key.position.y, key.radius).stroke({
        width: 2 * this.metresPerPixel(),
        color: 0xf0d27a,
        alpha: 0.55,
      })
      g.circle(key.position.x, key.position.y, 4 * this.metresPerPixel()).fill({
        color: 0xf0d27a,
        alpha: 0.85,
      })
    }
  }

  /**
   * Beaten ground, under everything else so it never fights the Units for
   * legibility. A Unit that cannot fire draws nothing, which is the point:
   * order a battalion into march column and watch its reach leave the Field.
   */
  private drawFireZones(units: UnitSnapshot[], view: ViewState): void {
    const g = this.fireLayer
    g.clear()
    for (const unit of units) {
      if (!view.fireZones && unit.id !== view.selected) continue
      const zone = fireZone(unit.arm, unit.changingTo ?? unit.formation, unit.strength)
      if (!zone) continue
      const colour = view.armyColours[unit.army] ?? 0xffffff
      const alpha = unit.id === view.selected ? 0.16 : 0.07
      const line = this.metresPerPixel()
      if (zone.faces === 0) {
        // No Face: skirmishers shoot every way at once.
        g.circle(unit.position.x, unit.position.y, zone.range + zone.width / 2)
          .fill({ color: colour, alpha: alpha * 0.7 })
          .stroke({ width: line * 1.5, color: colour, alpha: alpha * 3 })
        continue
      }
      // A band per Face, each as wide as the Unit and standing off its edge.
      // Square gets four and its corners stay bare, as they were in life.
      const sides = zone.faces === 4 ? [0, 1, 2, 3] : [0]
      for (const side of sides) {
        const facing = unit.facing + (side * Math.PI) / 2
        const across = side % 2 === 0 ? zone.width : zone.depth
        const out = side % 2 === 0 ? zone.depth : zone.width
        this.fillBand(g, unit.position, facing, across, out / 2, zone.range, colour, alpha, line)
      }
    }
  }

  /** A rectangle `range` deep, standing `standoff` metres off the Unit's centre. */
  private fillBand(
    g: Graphics,
    at: Vec2,
    facing: number,
    across: number,
    standoff: number,
    range: number,
    colour: ColorSource,
    alpha: number,
    line: number,
  ): void {
    const cos = Math.cos(facing + QUARTER_TURN)
    const sin = Math.sin(facing + QUARTER_TURN)
    const corners: Vec2[] = [
      { x: -across / 2, y: -standoff },
      { x: across / 2, y: -standoff },
      { x: across / 2, y: -standoff - range },
      { x: -across / 2, y: -standoff - range },
    ].map((p) => ({
      x: at.x + p.x * cos - p.y * sin,
      y: at.y + p.x * sin + p.y * cos,
    }))
    g.poly(corners.flatMap((c) => [c.x, c.y]))
      .fill({ color: colour, alpha })
      .stroke({ width: line * 1.5, color: colour, alpha: Math.min(1, alpha * 3) })
  }

  private drawGhosts(current: BattleSnapshot, view: ViewState): void {
    const g = this.ghostLayer
    g.clear()
    const line = 1.5 * this.metresPerPixel()
    for (const ghost of current.ghosts) {
      const unit = current.units.find((u) => u.id === ghost.unitId)
      if (!unit || unit.army !== view.playerArmy) continue
      const shape = footprint(unit.arm, ghost.formation, unit.strength)
      g.moveTo(unit.position.x, unit.position.y)
      g.lineTo(ghost.position.x, ghost.position.y)
      g.stroke({ width: line, color: 0xf5e6a8, alpha: 0.4 })
      const colour = view.armyColours[unit.army] ?? 0xffffff
      this.strokeFootprint(g, ghost.position, ghost.facing, shape, 0x11150f, 0.55, line * 2.6)
      this.strokeFootprint(g, ghost.position, ghost.facing, shape, colour, 0.95, line * 1.4)
    }
  }

  private strokeFootprint(
    g: Graphics,
    at: Vec2,
    facing: number,
    shape: { width: number; depth: number },
    colour: ColorSource,
    alpha: number,
    line: number,
  ): void {
    const cos = Math.cos(facing + QUARTER_TURN)
    const sin = Math.sin(facing + QUARTER_TURN)
    const corners: Vec2[] = [
      { x: -shape.width / 2, y: -shape.depth / 2 },
      { x: shape.width / 2, y: -shape.depth / 2 },
      { x: shape.width / 2, y: shape.depth / 2 },
      { x: -shape.width / 2, y: shape.depth / 2 },
    ].map((p) => ({
      x: at.x + p.x * cos - p.y * sin,
      y: at.y + p.x * sin + p.y * cos,
    }))
    g.poly(corners.flatMap((c) => [c.x, c.y]))
    g.stroke({ width: line, color: colour, alpha })
  }

  private drawUnits(units: UnitSnapshot[], view: ViewState): void {
    const seen = new Set<string>()
    const figureMetres = Math.max(2.2, MIN_FIGURE_PX * this.metresPerPixel())
    for (const unit of units) {
      seen.add(unit.id)
      let visual = this.visuals.get(unit.id)
      if (!visual) {
        const container = new Container()
        const base = new Graphics()
        container.addChild(base)
        this.unitLayer.addChild(container)
        visual = { container, base, figures: [], builtFor: "" }
        this.visuals.set(unit.id, visual)
      }
      visual.container.position.set(unit.position.x, unit.position.y)
      visual.container.rotation = unit.facing + QUARTER_TURN

      const colour = view.armyColours[unit.army] ?? 0x888888
      const selected = view.selected === unit.id
      const figureCount = Math.max(
        3,
        Math.min(
          120,
          unit.arm === "artillery"
            ? bodyCount(unit.arm, unit.strength)
            : Math.round(unit.strength / MEN_PER_FIGURE),
        ),
      )

      // Rebuild the slot layout only when it has actually changed shape. A Unit
      // simply marching is a container move and nothing else.
      const key = `${unit.formation}|${unit.changingTo}|${unit.changeProgress.toFixed(3)}|${figureCount}|${figureMetres.toFixed(2)}|${unit.strength}`
      if (visual.builtFor !== key) {
        visual.builtFor = key
        this.buildFigures(visual, unit, figureCount, figureMetres, colour)
        this.buildBase(visual, unit, colour, selected)
      } else {
        this.buildBase(visual, unit, colour, selected)
      }
      for (const figure of visual.figures) figure.tint = lighten(colour, 0.45)
    }
    for (const [id, visual] of this.visuals) {
      if (seen.has(id)) continue
      visual.container.destroy({ children: true })
      this.visuals.delete(id)
    }
  }

  private buildFigures(
    visual: UnitVisual,
    unit: UnitSnapshot,
    count: number,
    size: number,
    colour: number,
  ): void {
    const slots = figureSlots(unit, count)
    while (visual.figures.length < slots.length) {
      const sprite = new Sprite(this.texture ?? Texture.WHITE)
      sprite.anchor.set(0.5)
      visual.container.addChild(sprite)
      visual.figures.push(sprite)
    }
    while (visual.figures.length > slots.length) {
      visual.figures.pop()?.destroy()
    }
    for (let i = 0; i < slots.length; i++) {
      const sprite = visual.figures[i]
      sprite.position.set(slots[i].x, slots[i].y)
      sprite.width = size
      sprite.height = size
      sprite.tint = lighten(colour, 0.45)
    }
  }

  private buildBase(
    visual: UnitVisual,
    unit: UnitSnapshot,
    colour: number,
    selected: boolean,
  ): void {
    const shape = poseFootprint(unit)
    const width = shape.width
    const depth = shape.depth
    const line = this.metresPerPixel()
    const g = visual.base
    g.clear()
    // A dark keyline first, so an army colour never has to fight the grass it
    // is standing on to be seen.
    g.rect(-width / 2 - line, -depth / 2 - line, width + line * 2, depth + line * 2)
    g.stroke({ width: line * 2.5, color: 0x11150f, alpha: 0.7 })
    g.rect(-width / 2, -depth / 2, width, depth).fill({ color: colour, alpha: 0.85 })
    g.stroke({ width: line * 1.2, color: 0xffffff, alpha: 0.35 })
    // The Face is what a Charge resolves against, so it is what gets the ink.
    // A Routing Unit is drawn without one: it has stopped presenting a front to
    // anybody, and losing the white edge is what makes a mob read as a mob at a
    // glance rather than as a column marching the other way.
    const faceCount = unit.routing ? 0 : faces(unit.arm, unit.changingTo ?? unit.formation)
    if (faceCount > 0) {
      g.moveTo(-width / 2, -depth / 2).lineTo(width / 2, -depth / 2)
      if (faceCount === 4) {
        g.moveTo(width / 2, -depth / 2).lineTo(width / 2, depth / 2)
        g.moveTo(width / 2, depth / 2).lineTo(-width / 2, depth / 2)
        g.moveTo(-width / 2, depth / 2).lineTo(-width / 2, -depth / 2)
      }
      g.stroke({ width: line * 2.4, color: 0xffffff, alpha: 0.8 })
    }
    if (unit.routing) {
      const pad = 3 * line
      g.rect(-width / 2 - pad, -depth / 2 - pad, width + pad * 2, depth + pad * 2)
      g.stroke({ width: line * 2, color: 0xd8632f, alpha: 0.9 })
    }
    if (selected) {
      const pad = 6 * line
      g.rect(-width / 2 - pad, -depth / 2 - pad, width + pad * 2, depth + pad * 2)
      g.stroke({ width: line * 2, color: 0xf5e6a8, alpha: 0.95 })
    }
  }

  /**
   * Every Charge under way, as a taut line onto what it is aimed at. The Unit is
   * visibly running, but which of several enemies it was let go at is a fact
   * about the Order and not about the running, so it has to be drawn.
   */
  private drawCharges(units: UnitSnapshot[]): void {
    const g = this.effects
    const mpp = this.metresPerPixel()
    for (const unit of units) {
      if (!unit.charging) continue
      const target = units.find((u) => u.id === unit.charging)
      if (!target) continue
      const colour = unit.recoiling ? 0x8d94a0 : 0xe0663c
      g.moveTo(unit.position.x, unit.position.y)
        .lineTo(target.position.x, target.position.y)
        .stroke({ width: mpp * 1.5, color: colour, alpha: unit.recoiling ? 0.3 : 0.55 })
    }
  }

  /** Every enemy outlined while a Charge is looking for one to be aimed at. */
  private drawArming(units: UnitSnapshot[], view: ViewState): void {
    if (!view.arming) return
    const g = this.effects
    const mpp = this.metresPerPixel()
    for (const unit of units) {
      if (unit.army === view.playerArmy) continue
      const shape = poseFootprint(unit)
      const grown = { width: shape.width + 12 * mpp, depth: shape.depth + 12 * mpp }
      this.strokeFootprint(g, unit.position, unit.facing, grown, 0xe0663c, 0.85, mpp * 2)
    }
  }

  private drawEffects(
    previous: BattleSnapshot,
    current: BattleSnapshot,
    alpha: number,
    units: UnitSnapshot[],
    view: ViewState,
  ): void {
    const g = this.effects
    g.clear()
    const mpp = this.metresPerPixel()
    this.drawFlashes()
    this.drawClashes()
    this.drawCharges(units)
    this.drawArming(units, view)
    const before = new Map(previous.couriers.map((c) => [c.id, c]))

    for (const courier of current.couriers) {
      const was = before.get(courier.id)
      const at = was
        ? {
            x: was.position.x + (courier.position.x - was.position.x) * alpha,
            y: was.position.y + (courier.position.y - was.position.y) * alpha,
          }
        : courier.position
      const target = units.find((u) => u.id === courier.unitId)
      g.moveTo(courier.origin.x, courier.origin.y).lineTo(at.x, at.y)
      g.stroke({ width: mpp, color: 0xf5e6a8, alpha: 0.35 })
      if (target) {
        g.moveTo(at.x, at.y).lineTo(target.position.x, target.position.y)
        g.stroke({ width: mpp, color: 0xf5e6a8, alpha: 0.18 })
      }
      g.circle(at.x, at.y, 3.5 * mpp).fill({ color: 0xf5e6a8, alpha: 0.95 })
    }

    if (view.headquarters) {
      const { x, y } = view.headquarters
      const r = 7 * mpp
      g.poly([x, y - r * 1.6, x + r, y + r, x - r, y + r]).fill({
        color: 0xf5e6a8,
        alpha: 0.95,
      })
      g.circle(x, y, r * 2.2).stroke({ width: mpp, color: 0xf5e6a8, alpha: 0.4 })
    }

    if (view.drag) {
      const unit = units.find((u) => u.id === view.selected)
      if (unit) {
        const shape = footprint(unit.arm, view.drag.formation, unit.strength)
        g.moveTo(unit.position.x, unit.position.y)
          .lineTo(view.drag.at.x, view.drag.at.y)
          .stroke({ width: mpp * 1.5, color: 0xf5e6a8, alpha: 0.6 })
        this.strokeFootprint(g, view.drag.at, view.drag.facing, shape, 0xf5e6a8, 0.9, mpp * 1.5)
        const nose = 26 * mpp
        g.moveTo(view.drag.at.x, view.drag.at.y)
          .lineTo(
            view.drag.at.x + Math.cos(view.drag.facing) * nose,
            view.drag.at.y + Math.sin(view.drag.facing) * nose,
          )
          .stroke({ width: mpp * 2, color: 0xffffff, alpha: 0.85 })
      }
    }
  }

  destroy(): void {
    this.observer?.disconnect()
    this.observer = null
    this.app.destroy(true, { children: true })
  }
}

export function armyColours(battle: Battle): Record<string, number> {
  const out: Record<string, number> = {}
  for (const army of battle.armies) out[army.id] = army.colour
  return out
}
