import { Application, Container, Graphics, Sprite, Texture, type ColorSource } from "pixi.js"
import {
  allRoundStandoff,
  bodyCount,
  faces,
  figureSlots,
  fireZone,
  footprint,
  mobRadius,
  poseFootprint,
} from "@/sim/formation"
import { chargeable } from "@/sim/charge"
import { HARRIED_RANGE } from "@/sim/headquarters"
import { moraleRung } from "@/sim/morale"
import type { Arm, Battle, Field, FormationName, Grade, HeldGround, Vec2 } from "@/sim/types"
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

/** Points around a Faceless Unit's beaten ground. Enough that it reads smooth. */
const ALL_ROUND_STEPS = 48

/**
 * Three reads the Field owes the player that no panel can give him, because he
 * is looking at the map and not at a Unit: what a Unit *is*, how good it is, and
 * how it is holding up. The whole Field is on screen at about 0.7px/m (T8), so a
 * battalion in line is a 100px bar three pixels thick — there is no inside to
 * draw in, and each read has to have a channel of its own or they smear
 * together.
 *
 * - **Arm** takes the length, the one axis with pixels to spend: infantry is
 *   solid, cavalry breaks into squadrons, a battery is guns standing apart.
 * - **Grade** takes the keyline, in dark ink: an elite battalion is hard-edged
 *   and a conscript one lets the grass through its outline.
 * - **Morale** takes the dressing and the Face, and brings the Rout's own colour
 *   in with it, so a Unit is visibly coming apart before it goes.
 *
 * Hue is not available to any of them: it says which army, and one of the two
 * armies is white (#e3e7ef), which rules out saying anything by paling a Unit
 * out. Everything here is geometry or dark ink for that reason.
 */

/**
 * Squadrons a cavalry Unit is drawn in. Cosmetic, and it has to stay that way:
 * Frontage is C3's and the simulation never sees these gaps. A regiment that
 * fought in four squadrons is the reason for the number, not a rule.
 */
const SQUADRONS = 4

/** How wide a squadron interval is drawn, in screen pixels. */
const SQUADRON_GAP_PX = 3

/** One dash and one gap of a broken line, in screen pixels. */
const DASH_PX = 7

/**
 * How deep a Unit must be drawn before its whole outline may be broken, in
 * screen pixels. Under this a battalion in line is 2.6px front to rear, and
 * dashes laid along both long edges land two pixels apart and close up into a
 * chain of little boxes — which reads as segmentation, the one thing cavalry's
 * squadron intervals are supposed to be saying. So a broken outline is for
 * square and nothing else; every thinner Unit breaks only its Face, which is a
 * single line and can only read as broken.
 */
const RAGGED_FLOOR_PX = 10

/**
 * How a Grade shows on a Unit's outline. Drill is what buys a battalion its hard
 * edge, so Grade is drawn as how hard that edge is: an elite Unit is cut out of
 * the grass in dark ink and a conscript one bleeds into it. Weight and not
 * pattern, for the reason RAGGED_FLOOR_PX gives.
 *
 * Dark ink throughout, because it has to read on a white army as well as on a
 * blue one.
 */
interface GradeEdge {
  /** Keyline width, in screen pixels. */
  width: number
  alpha: number
}

const GRADE_EDGE: Record<Grade, GradeEdge> = {
  elite: { width: 2.8, alpha: 0.9 },
  line: { width: 2, alpha: 0.65 },
  conscript: { width: 1, alpha: 0.3 },
}

/**
 * How a rung of Morale is drawn. Two carriers, because a Unit in march column
 * has no Face to say it with:
 *
 * - the dressed edge, all the way round and never broken, walks in colour from
 *   white to the same orange a mob is drawn in (`mobBase`);
 * - the Face line, which does break, because it is one line and a broken single
 *   line cannot read as anything but broken.
 *
 * The shared orange is the point of the whole thing: a Rout stops being a shape
 * changing without warning and becomes the end of something the player watched.
 *
 * Worst rung first, matching `MORALE_WORDS`.
 */
interface MoraleInk {
  colour: number
  /** Share of a dash period of the Face line that is ink. 1 draws it unbroken. */
  faceDuty: number
  /** Face line width, in screen pixels. */
  face: number
  faceAlpha: number
  /** Dressed edge width, in screen pixels. */
  dress: number
  dressAlpha: number
}

const MORALE_INK: MoraleInk[] = [
  { colour: 0xd8632f, faceDuty: 0.3, face: 1.8, faceAlpha: 0.95, dress: 1.7, dressAlpha: 0.9 },
  { colour: 0xe3874a, faceDuty: 0.5, face: 2, faceAlpha: 0.9, dress: 1.5, dressAlpha: 0.7 },
  { colour: 0xf2e3cb, faceDuty: 0.75, face: 2.2, faceAlpha: 0.85, dress: 1.2, dressAlpha: 0.5 },
  { colour: 0xffffff, faceDuty: 1, face: 2.4, faceAlpha: 0.8, dress: 1.2, dressAlpha: 0.35 },
]

/**
 * How a Figure is drawn per Arm, across the Face by front-to-rear, as multiples
 * of the Figure size. A trooper is his horse and stands 2.4m nose to tail
 * against a man's 0.6m, so the mark is long — which is also the only thing that
 * tells cavalry from infantry once the Figures overlap into one smear.
 */
const FIGURE_ASPECT: Record<Arm, { across: number; deep: number }> = {
  infantry: { across: 1, deep: 1 },
  cavalry: { across: 0.8, deep: 1.9 },
  artillery: { across: 1.15, deep: 1.15 },
}

/** A rectangle in Unit-local metres: +x across the Face, +y toward the rear. */
interface LocalRect {
  x: number
  y: number
  width: number
  depth: number
}

/**
 * The player's own Headquarters, as the Field draws it: where it stands, the
 * ground it is riding to while it is on the move, and whether the enemy is
 * harrying it (ADR-0008).
 */
export interface HeadquartersView {
  position: Vec2
  destination: Vec2 | null
  harried: boolean
}

export interface ViewState {
  selected: string | null
  playerArmy: string
  headquarters: HeadquartersView | null
  keyGround: HeldGround[]
  deploymentZone: [number, number, number, number] | null
  /** The Order being drawn but not yet issued, shown as it will arrive. */
  drag: { at: Vec2; facing: number; formation: FormationName } | null
  /** Deployment: the Unit or Headquarters being placed. */
  placing: { id: string; at: Vec2 } | null
  armyColours: Record<string, number>
  /** Show every Unit's beaten ground. Off, only the selected Unit shows its own. */
  fireZones: boolean
  /**
   * A Charge is armed and waiting to be aimed. Every enemy that may be charged
   * is outlined while it is, because the thing the player is about to pick is a
   * Unit and not a point on the ground — the only Order in the game of which
   * that is true.
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

/**
 * One mark per Arm. Drawn pointing up the canvas because a Figure is a child of
 * the Unit's container and turns with it, and the slot layout puts the Face
 * along local -y — so "up" here comes out as "toward the enemy" on the Field.
 */
function figureTexture(arm: Arm): Texture {
  const canvas = document.createElement("canvas")
  canvas.width = 16
  canvas.height = 16
  const context = canvas.getContext("2d")
  if (!context) throw new Error("no 2d context for a Figure")
  context.fillStyle = "#ffffff"
  if (arm === "cavalry") {
    // A capsule the full height of the canvas: stretched by FIGURE_ASPECT it
    // becomes a horse and rider seen from above, and a rank of them reads as
    // streaks where a rank of infantry reads as a smear.
    context.beginPath()
    context.roundRect(3.5, 0.5, 9, 15, 4.5)
    context.fill()
    return Texture.from(canvas)
  }
  if (arm === "artillery") {
    // The only mark on the Field with corners. A gun is a piece of furniture and
    // not a body, and at 18m between pieces it is the one Figure with room to be
    // seen as an individual thing.
    context.fillRect(1, 1, 14, 14)
    return Texture.from(canvas)
  }
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
  /** Body and keyline, under the Figures: what the Unit is, and how good it is. */
  base: Graphics
  figures: Sprite[]
  /**
   * Dressing, Face and selection, over the Figures. A Figure is drawn larger
   * than an infantry line is deep — 4.3m against 3.6m at this scale — so a
   * battalion's Figures blanket its own block. Anything the player has to read
   * off the edge has to be laid over them or it is simply not there.
   */
  trim: Graphics
  /** What the drawing was last built for, so it is rebuilt only when it changes. */
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
  private textures: Record<Arm, Texture> | null = null
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
    this.textures = {
      infantry: figureTexture("infantry"),
      cavalry: figureTexture("cavalry"),
      artillery: figureTexture("artillery"),
    }
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
      // A mob is drawn as a disc and has to be grabbed as one: its travelling
      // Formation is a 157m needle, and nothing that reaches that far is under
      // the player's finger.
      const shape = unit.routing
        ? {
            width: mobRadius(unit.arm, unit.strength) * 2,
            depth: mobRadius(unit.arm, unit.strength) * 2,
          }
        : footprint(unit.arm, unit.formation, unit.strength)
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
    this.drawAimLines(units, view)
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
    // Key Ground in the colour of whoever holds it, so who is winning the thing
    // the battle is about is a glance and not a panel. Gold while it is nobody's
    // — a piece of ground neither army has reached yet is still worth the ring,
    // and colouring it in advance would be claiming it for somebody.
    for (const key of view.keyGround) {
      const held = key.holder !== null
      const colour = key.holder === null ? 0xf0d27a : (view.armyColours[key.holder] ?? 0xf0d27a)
      g.circle(key.position.x, key.position.y, key.radius)
        .fill({ color: colour, alpha: held ? 0.1 : 0 })
        .stroke({
          width: (held ? 3 : 2) * this.metresPerPixel(),
          color: colour,
          alpha: held ? 0.8 : 0.55,
        })
      g.circle(key.position.x, key.position.y, 4 * this.metresPerPixel()).fill({
        color: colour,
        alpha: 0.9,
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
        // No Face: skirmishers shoot every way at once, so the beaten ground is
        // the screen's own Footprint blown out by the range on every side — a
        // long lozenge and not a circle. Sampled off the same standoff the sim
        // reads, so what is drawn is where the fire reaches and not near it.
        const ring: number[] = []
        for (let i = 0; i < ALL_ROUND_STEPS; i++) {
          const bearing = (i / ALL_ROUND_STEPS) * Math.PI * 2
          const reach = zone.range + allRoundStandoff(zone, unit.facing, bearing)
          ring.push(unit.position.x + Math.cos(bearing) * reach)
          ring.push(unit.position.y + Math.sin(bearing) * reach)
        }
        g.poly(ring)
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

  /**
   * What each Unit has in its sights, as a line onto it. The beaten ground says
   * how far a Unit's fire reaches; this says which of the enemies standing in it
   * the next Volley will actually find — the nearest, which is often not the one
   * the player had in mind, and which cannot be read off a Face and a Footprint
   * by eye once three Units are jostling in front of a battalion.
   *
   * Broken where the Unit has been told to hold its fire, because that is the
   * case worth seeing at a glance: a battalion laid on a column crossing its
   * front and, on the player's own instruction, not shooting.
   *
   * Ridden on the beaten-ground toggle rather than given a switch of its own.
   * They answer one question between them and separating them would mean a
   * player could ask where the fire goes while hiding how far it carries.
   */
  private drawAimLines(units: UnitSnapshot[], view: ViewState): void {
    const g = this.fireLayer
    const mpp = this.metresPerPixel()
    for (const unit of units) {
      if (!view.fireZones && unit.id !== view.selected) continue
      if (!unit.aiming) continue
      const target = units.find((u) => u.id === unit.aiming)
      if (!target) continue
      const selected = unit.id === view.selected
      const style = {
        width: mpp * (selected ? 2 : 1.2),
        color: view.armyColours[unit.army] ?? 0xffffff,
        alpha: selected ? 0.85 : 0.4,
      }
      // From the centre and not from the Face: the line is under the Unit for
      // the few metres of its own depth, and comes out of the front by itself.
      const duty = unit.standing.holdFire ? 0.35 : 1
      this.strokeOpen(g, [unit.position, target.position], duty, mpp * DASH_PX, style)
      g.circle(target.position.x, target.position.y, mpp * 4).stroke(style)
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
    const line = this.metresPerPixel()
    const figureMetres = Math.max(2.2, MIN_FIGURE_PX * line)
    for (const unit of units) {
      seen.add(unit.id)
      let visual = this.visuals.get(unit.id)
      if (!visual) {
        const container = new Container()
        // The Figures are added and dropped as a Unit loses men, so the two
        // Graphics cannot hold their place by insertion order alone.
        container.sortableChildren = true
        const base = new Graphics()
        base.zIndex = 0
        const trim = new Graphics()
        trim.zIndex = 2
        container.addChild(base, trim)
        this.unitLayer.addChild(container)
        visual = { container, base, trim, figures: [], builtFor: "" }
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

      // Rebuild only when the drawing has actually changed. A Unit simply
      // marching is a container move and nothing else — which matters more now
      // than it did, because a frayed outline is a few dozen dashes and used to
      // be one rectangle.
      const key = [
        unit.formation,
        unit.changingTo,
        unit.changeProgress.toFixed(3),
        figureCount,
        figureMetres.toFixed(2),
        unit.strength,
        unit.routing,
        unit.grade,
        unit.morale,
        selected,
        line.toFixed(3),
      ].join("|")
      if (visual.builtFor === key) continue
      visual.builtFor = key
      this.buildFigures(visual, unit, figureCount, figureMetres, colour)
      this.buildBase(visual, unit, colour, line)
      this.buildTrim(visual, unit, selected, line)
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
    const texture = this.textures?.[unit.arm] ?? Texture.WHITE
    const aspect = FIGURE_ASPECT[unit.arm]
    const slots = this.dressSlots(unit, figureSlots(unit, count))
    while (visual.figures.length < slots.length) {
      const sprite = new Sprite(texture)
      sprite.anchor.set(0.5)
      sprite.zIndex = 1
      visual.container.addChild(sprite)
      visual.figures.push(sprite)
    }
    while (visual.figures.length > slots.length) {
      visual.figures.pop()?.destroy()
    }
    for (let i = 0; i < slots.length; i++) {
      const sprite = visual.figures[i]
      sprite.texture = texture
      sprite.position.set(slots[i].x, slots[i].y)
      sprite.width = size * aspect.across
      sprite.height = size * aspect.deep
      sprite.tint = lighten(colour, 0.45)
    }
  }

  /**
   * Open the squadron intervals in a cavalry Unit's Figures. The base is drawn
   * with the same gaps, but a Figure is wider than the interval and would paper
   * straight over them, so the Figures have to be squeezed into the squadrons
   * too or the gaps are invisible.
   *
   * Renderer-only, exactly like `tween`: the slots C3 handed over are the ones
   * the simulation fights on, and these are the ones the player looks at.
   */
  private dressSlots(unit: UnitSnapshot, slots: Vec2[]): Vec2[] {
    if (unit.arm !== "cavalry" || unit.routing) return slots
    const shape = poseFootprint(unit)
    const along = shape.width >= shape.depth ? "x" : "y"
    const span = along === "x" ? shape.width : shape.depth
    const gap = this.gapFraction(span)
    if (gap <= 0) return slots
    return slots.map((slot) => {
      const u = ((along === "x" ? slot.x : slot.y) + span / 2) / span
      const moved = (this.squeeze(u, gap) - 0.5) * span
      return along === "x" ? { x: moved, y: slot.y } : { x: slot.x, y: moved }
    })
  }

  /** One squadron interval as a share of the Unit's length, or 0 if it will not fit. */
  private gapFraction(span: number): number {
    if (span <= 0) return 0
    const gap = (SQUADRON_GAP_PX * this.metresPerPixel()) / span
    // Three intervals eating a third of the regiment is a different formation,
    // not a legibility aid. A Unit too short to spare them keeps none.
    return gap * (SQUADRONS - 1) > 0.33 ? 0 : gap
  }

  /**
   * Squeeze a position along the Unit, 0 to 1, into whichever of `SQUADRONS`
   * blocks it falls in, leaving `gap` between each pair.
   */
  private squeeze(u: number, gap: number): number {
    const block = (1 - gap * (SQUADRONS - 1)) / SQUADRONS
    const slice = 1 / SQUADRONS
    const index = Math.min(SQUADRONS - 1, Math.max(0, Math.floor(u / slice)))
    return index * (block + gap) + ((u - index * slice) / slice) * block
  }

  /**
   * The Unit's body, and the outline that says what quality of troops it is.
   * Under the Figures, which is where the Arm read belongs: what the player is
   * being shown is the shape a Unit of this Arm occupies the ground in.
   */
  private buildBase(visual: UnitVisual, unit: UnitSnapshot, colour: number, line: number): void {
    const g = visual.base
    g.clear()
    if (unit.routing) {
      this.mobBase(g, unit, colour, line)
      return
    }
    const edge = GRADE_EDGE[unit.grade]
    for (const rect of this.bodyRects(unit, line)) {
      // A dark keyline first, so an army colour never has to fight the grass it
      // is standing on to be seen — and, now, so Grade has somewhere to live
      // that neither army's colour can drown.
      const around = this.rectCorners({
        x: rect.x - line,
        y: rect.y - line,
        width: rect.width + line * 2,
        depth: rect.depth + line * 2,
      })
      this.strokePoly(g, around, 1, line * DASH_PX, {
        width: line * edge.width,
        color: 0x11150f,
        alpha: edge.alpha,
      })
      g.rect(rect.x, rect.y, rect.width, rect.depth).fill({ color: colour, alpha: 0.85 })
    }
  }

  /**
   * The rectangles a Unit's body is drawn as, in Unit-local metres. One for
   * infantry; one per squadron for cavalry, because a regiment is drawn with its
   * intervals open and that is what tells it from a battalion when both are a
   * hundred-pixel bar; and one per gun for artillery, because a battery is
   * pieces standing eighteen metres apart and never a block at all.
   *
   * The intervals are cosmetic. Frontage is C3's, and widening it here to make
   * room for them would be the renderer deciding how much ground a regiment
   * covers.
   */
  private bodyRects(unit: UnitSnapshot, line: number): LocalRect[] {
    const shape = poseFootprint(unit)
    if (unit.arm === "artillery") {
      const guns = Math.max(1, bodyCount(unit.arm, unit.strength))
      const long = Math.max(shape.width, shape.depth)
      const short = Math.min(shape.width, shape.depth)
      const side = Math.max(4 * line, Math.min(short, (long / guns) * 0.8))
      return figureSlots(unit, guns).map((slot) => ({
        x: slot.x - side / 2,
        y: slot.y - side / 2,
        width: side,
        depth: side,
      }))
    }
    const whole: LocalRect = {
      x: -shape.width / 2,
      y: -shape.depth / 2,
      width: shape.width,
      depth: shape.depth,
    }
    if (unit.arm !== "cavalry") return [whole]
    const alongWidth = shape.width >= shape.depth
    const span = alongWidth ? shape.width : shape.depth
    const gap = this.gapFraction(span)
    if (gap <= 0) return [whole]
    const block = ((1 - gap * (SQUADRONS - 1)) / SQUADRONS) * span
    const stride = block + gap * span
    return Array.from({ length: SQUADRONS }, (_, i) => {
      const start = -span / 2 + i * stride
      return alongWidth
        ? { x: start, y: whole.y, width: block, depth: shape.depth }
        : { x: whole.x, y: start, width: shape.width, depth: block }
    })
  }

  /**
   * Dressing, Face and selection ring — everything the player reads off a Unit's
   * edge, laid over the Figures that would otherwise cover it.
   *
   * Morale is the whole of the first two. The dressed edge goes all the way
   * round, so a Unit in march column with no Face at all still says how it is
   * holding up; the Face line takes the same ink at more weight, because the
   * Face is what a Charge resolves against and it is the last thing to go.
   */
  private buildTrim(visual: UnitVisual, unit: UnitSnapshot, selected: boolean, line: number): void {
    const g = visual.trim
    g.clear()
    if (unit.routing) {
      // A mob has no dressing left to fray, and is already drawn in the colour
      // Morale walks toward. Saying it twice would say it less.
      if (selected) {
        const r = mobRadius(unit.arm, unit.strength) + 6 * line
        g.circle(0, 0, r).stroke({ width: line * 2, color: 0xf5e6a8, alpha: 0.95 })
      }
      return
    }
    const shape = poseFootprint(unit)
    const width = shape.width
    const depth = shape.depth
    const ink = MORALE_INK[moraleRung(unit.morale)]
    const dash = line * DASH_PX
    const outline = this.rectCorners({ x: -width / 2, y: -depth / 2, width, depth })
    const faceCount = faces(unit.arm, unit.changingTo ?? unit.formation)
    if (faceCount === 4) {
      // Square is prepared every way, so every side is a Face and the whole
      // outline takes the Face's ink. It is also the one Formation deep enough
      // to be broken all round without closing up into a chain.
      const duty = Math.min(width, depth) >= RAGGED_FLOOR_PX * line ? ink.faceDuty : 1
      this.strokePoly(g, outline, duty, dash, {
        width: line * ink.face,
        color: ink.colour,
        alpha: ink.faceAlpha,
      })
    } else {
      this.strokePoly(g, outline, 1, dash, {
        width: line * ink.dress,
        color: ink.colour,
        alpha: ink.dressAlpha,
      })
      if (faceCount === 1) {
        this.strokeOpen(
          g,
          [
            { x: -width / 2, y: -depth / 2 },
            { x: width / 2, y: -depth / 2 },
          ],
          ink.faceDuty,
          dash,
          { width: line * ink.face, color: ink.colour, alpha: ink.faceAlpha },
        )
      }
    }
    if (selected) {
      const pad = 6 * line
      g.rect(-width / 2 - pad, -depth / 2 - pad, width + pad * 2, depth + pad * 2)
      g.stroke({ width: line * 2, color: 0xf5e6a8, alpha: 0.95 })
    }
  }

  private rectCorners(rect: LocalRect): Vec2[] {
    return [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.depth },
      { x: rect.x, y: rect.y + rect.depth },
    ]
  }

  /** A closed outline, whole or broken. */
  private strokePoly(
    g: Graphics,
    points: Vec2[],
    duty: number,
    period: number,
    style: { width: number; color: number; alpha: number },
  ): void {
    this.strokeOpen(g, [...points, points[0]], duty, period, style)
  }

  /**
   * An outline laid down as dashes, `duty` of each `period` being ink. Pixi has
   * no dashed stroke, and a broken line is not a decoration here — it is how a
   * conscript battalion's outline and a shaken one's dressing are drawn, so it
   * has to be walked by hand.
   */
  private strokeOpen(
    g: Graphics,
    points: Vec2[],
    duty: number,
    period: number,
    style: { width: number; color: number; alpha: number },
  ): void {
    if (duty >= 1) {
      g.moveTo(points[0].x, points[0].y)
      for (const point of points.slice(1)) g.lineTo(point.x, point.y)
      g.stroke(style)
      return
    }
    const ink = Math.max(period * duty, period * 0.15)
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i]
      const b = points[i + 1]
      const length = Math.hypot(b.x - a.x, b.y - a.y)
      if (length <= 0) continue
      const ux = (b.x - a.x) / length
      const uy = (b.y - a.y) / length
      for (let at = 0; at < length; at += period) {
        const end = Math.min(length, at + ink)
        g.moveTo(a.x + ux * at, a.y + uy * at).lineTo(a.x + ux * end, a.y + uy * end)
      }
    }
    g.stroke(style)
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

  /**
   * Every enemy a Charge may be aimed at, outlined while one is looking for a
   * target. A Routing enemy is not one of them and gets no outline: the offer
   * has to be exactly what C6 will accept, or the player spends a Courier ride
   * and watches the regiment stand still.
   */
  private drawArming(units: UnitSnapshot[], view: ViewState): void {
    if (!view.arming) return
    const g = this.effects
    const mpp = this.metresPerPixel()
    for (const unit of units) {
      if (!chargeable(unit, view.playerArmy)) continue
      const shape = poseFootprint(unit)
      const grown = { width: shape.width + 12 * mpp, depth: shape.depth + 12 * mpp }
      this.strokeFootprint(g, unit.position, unit.facing, grown, 0xe0663c, 0.85, mpp * 2)
    }
  }

  /**
   * A mob: a ragged disc of a Unit, drawn where a block would be. No keyline
   * rectangle, no Face and no dressed edge — a Routing Unit has stopped
   * presenting a front to anybody, and the shape is what says so at a glance
   * rather than a colour the player has to learn. Two arcs off centre for the
   * edge, so the crowd does not read as a tidy counter.
   */
  private mobBase(g: Graphics, unit: UnitSnapshot, colour: number, line: number): void {
    const r = mobRadius(unit.arm, unit.strength)
    g.circle(0, 0, r + line).stroke({ width: line * 2.5, color: 0x11150f, alpha: 0.7 })
    // Thinner than a block's fill: a crowd is gaps, and the Figures on top of
    // it are what there is to count.
    g.circle(0, 0, r).fill({ color: colour, alpha: 0.45 })
    g.circle(0, 0, r).stroke({ width: line * 1.2, color: 0xd8632f, alpha: 0.9 })
    g.arc(-r * 0.18, r * 0.12, r * 0.92, 0.6, 3.4).stroke({
      width: line * 1.6,
      color: 0xd8632f,
      alpha: 0.55,
    })
    g.arc(r * 0.2, -r * 0.1, r * 0.86, 3.6, 6.1).stroke({
      width: line * 1.6,
      color: 0xd8632f,
      alpha: 0.4,
    })
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
      // Still at the table, with a harried staff round him: a hollow mark and no
      // ride drawn behind him, because he has not ridden anywhere yet. The
      // Ghost is already out on the Field, so the Order is visibly *written*
      // and visibly not gone (ADR-0008).
      if (courier.held) {
        g.circle(at.x, at.y, 4.5 * mpp).stroke({ width: mpp, color: 0xf5e6a8, alpha: 0.8 })
        if (target) {
          g.moveTo(at.x, at.y).lineTo(target.position.x, target.position.y)
          g.stroke({ width: mpp, color: 0xf5e6a8, alpha: 0.12 })
        }
        continue
      }
      g.moveTo(courier.origin.x, courier.origin.y).lineTo(at.x, at.y)
      g.stroke({ width: mpp, color: 0xf5e6a8, alpha: 0.35 })
      if (target) {
        g.moveTo(at.x, at.y).lineTo(target.position.x, target.position.y)
        g.stroke({ width: mpp, color: 0xf5e6a8, alpha: 0.18 })
      }
      g.circle(at.x, at.y, 3.5 * mpp).fill({ color: 0xf5e6a8, alpha: 0.95 })
    }

    if (view.headquarters) {
      this.drawHeadquarters(g, view.headquarters, mpp)
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

  /**
   * The Headquarters, in its three states. Harrying takes the mob's own orange,
   * which is the colour everything going wrong is already drawn in, and the
   * ride is drawn as the ground it is trying to reach — the player is out of
   * command until the mark and the staff are the same place, so the wait has to
   * be something he can see the end of.
   */
  private drawHeadquarters(g: Graphics, hq: HeadquartersView, mpp: number): void {
    const { x, y } = hq.position
    const r = 7 * mpp
    const colour = hq.harried ? 0xd8632f : 0xf5e6a8
    if (hq.destination) {
      const to = hq.destination
      g.moveTo(x, y).lineTo(to.x, to.y).stroke({ width: mpp, color: colour, alpha: 0.45 })
      g.circle(to.x, to.y, r * 1.4).stroke({ width: mpp * 1.5, color: colour, alpha: 0.7 })
    }
    // The ring an enemy has to cross before every Order starts waiting at the
    // table. Faint while nothing has crossed it, because it is a distance to
    // judge against and not a thing to watch. It is only the near half of the
    // rule — fire harries a staff from as far off as it carries — so the ring
    // is the walk-up-to-the-tables way in, and the beaten ground says the rest.
    g.circle(x, y, HARRIED_RANGE).stroke({
      width: mpp * (hq.harried ? 1.5 : 1),
      color: colour,
      alpha: hq.harried ? 0.4 : 0.18,
    })
    g.poly([x, y - r * 1.6, x + r, y + r, x - r, y + r]).fill({ color: colour, alpha: 0.95 })
    g.circle(x, y, r * 2.2).stroke({ width: mpp, color: colour, alpha: hq.harried ? 0.8 : 0.4 })
    // A second ring, and only while it is harried: one ring changing colour is
    // not a state change a player catches out of the corner of his eye.
    if (hq.harried) {
      g.circle(x, y, r * 3.2).stroke({ width: mpp, color: colour, alpha: 0.45 })
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
