import {
  AlphaFilter,
  Application,
  CanvasSource,
  Container,
  Graphics,
  Sprite,
  Texture,
  type ColorSource,
} from "pixi.js"
import {
  bodyCount,
  faces,
  figureSlots,
  fireZone,
  footprint,
  mobRadius,
  poseFootprint,
  reachOnBearing,
} from "@/sim/formation"
import { chargeable } from "@/sim/charge"
import { HARRIED_RANGE } from "@/sim/headquarters"
import { moraleRung } from "@/sim/morale"
import type { Arm, Battle, Field, FormationName, Grade, HeldGround, Vec2 } from "@/sim/types"
import type { BattleSnapshot, UnitSnapshot } from "@/sim/snapshot"
import { angleDelta } from "@/sim/vec"
import { buildStaffMapCanvas, STAFF_MAP_DEFAULTS, type StaffMapOptions } from "./staffmap"
import { buildContourCanvas, buildTerrainCanvas } from "./terrain"

/**
 * Which of the two Field renderers is drawn. A parameter and not a constant so
 * the plate can put them side by side: the only way to judge either is to look
 * at the same ground twice.
 */
export type FieldStyle = "staff" | "shaded"

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
 * A fourth read arrived after those three and had nowhere to go, which is what
 * T18 wrote down as the cost of spending every channel a Unit has. It is
 * **Disorder**, and it takes the glyph — the last rung §8 rank 7 left on the
 * ladder — because unlike the three above it has no geometry and no colour of
 * its own to be read off, and unlike Formation it is not already being said by
 * the silhouette.
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
 * The Disorder glyph, and the whole of what §8 rank 7 called the last rung of
 * F5's fallback ladder — the one channel a Unit had left after T18 spent its
 * silhouette, its hue, its keyline, its edge, its Figures and its ring.
 *
 * It is spent on Disorder and not on Formation. A glyph that named the
 * Formation would be labelling something the silhouette already says and would
 * mean G2 was being carried by UI; Disorder has no silhouette, no colour and no
 * edge of its own to be read off, and it decides whether the Unit can make
 * square or go at anybody — so it is the one read on a Unit that cannot be had
 * any other way.
 *
 * Drawn as a saw-tooth, on the Unit and not beside it. A mark standing off the
 * body would be a mark the player has to attribute to one of two Units packed a
 * few pixels apart; laid across the middle in the same dark ink Grade's keyline
 * uses, it is unambiguously this Unit's, it reads on a white army and a blue
 * one alike, and what it says is what it looks like — ranks that are no longer
 * straight.
 *
 * Fixed in screen pixels rather than in metres, because it is a legend and not
 * a piece of ground: it has to read the same on a battery forty metres wide and
 * a battalion a hundred and forty.
 */
const GLYPH_PX = 18

/** Peak to trough, in screen pixels. Deeper than a line is, on purpose. */
const GLYPH_RISE_PX = 5

/** Teeth across it. Three reads as a zigzag; two reads as a chevron. */
const GLYPH_TEETH = 3

/** Glyph stroke weight, in screen pixels: heavier than any keyline it lies over. */
const GLYPH_WEIGHT = 1.8

/** The dark ink Grade's keyline is cut in, and the only ink that reads on both armies. */
const DARK_INK = 0x11150f

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
   * Draw Powder Smoke. Optional and on by default — it exists so the plate can
   * show the same ground with and without it, which is the only way the roof's
   * F13 x F5 tension can actually be judged.
   */
  smoke?: boolean
  /**
   * A Charge is armed and waiting to be aimed. Every enemy that may be charged
   * is outlined while it is, because the thing the player is about to pick is a
   * Unit and not a point on the ground — the only Order in the game of which
   * that is true.
   */
  arming: boolean
  /**
   * What a harried Headquarters is drawn in. Optional, and defaulting to the
   * mob's own orange, because that is the colour everything going wrong is
   * already drawn in — but the orange was chosen against grass at 1.13 and read
   * on *hue* rather than on value, and the staff map's ground is warm. On it
   * the alarm sits at 1.16 and the mark all but disappears at the moment it
   * most needs seeing. A knob on the plate rather than a decision taken here.
   */
  alarm?: number
}

/** The mob's orange. The alarm until something is measured to beat it. */
export const ALARM = 0xd8632f

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

/** How long a flash stays on screen, in milliseconds. Its smoke outlives it by
 * two orders of magnitude and is aged on a different clock — see SMOKE_LIFE. */
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

/**
 * A cloud of Powder Smoke. Renderer-only, like a Flash and a Clash, and for a
 * stronger reason than either: T10 keeps smoke **drawn but inert**, so nothing
 * here may ever be read back. The simulation does not know the Field is full of
 * it, and the day it does the rule moves into C6 and stops living in this file.
 */
interface Puff {
  /** The muzzles, in metres — out in front of the Face, not on the men. */
  at: Vec2
  /** Along the Face, unit length: the axis a discharge is spread on. */
  across: Vec2
  /** Metres of Face that fired. */
  width: number
  /** Battle time it was fired at, in seconds. */
  born: number
  /** Stable per-cloud jitter, so a bank is ragged and never boils. */
  seed: number
}

/**
 * How long a cloud lasts, in **battle** seconds — and that is the whole of why
 * it is not a Flash.
 *
 * A Flash and a Clash burn down on the wall clock because they are sub-second
 * marks that would flicker on anything else. Smoke cannot: Tempo defaults to 4,
 * so a bank aged on the wall clock would be four times as thick at the Tempo
 * the game is played at as at the Tempo it is measured at — and thickness is
 * exactly what the roof warns about (F13 x F5). On battle time a bank is the
 * same bank at any Tempo.
 *
 * Forty-five seconds is about two musket reloads (F9's 20-25s) and one gun's,
 * so a battalion in a steady firefight keeps two clouds up and a battery one,
 * and the ground clears inside a minute of the firing stopping.
 */
const SMOKE_LIFE = 45

/**
 * Where a cloud is born, in metres in front of the Face. Smoke comes out of the
 * muzzles and not out of the men — which is also the one thing keeping a
 * battalion out of its own cloud, and SMOKE_CAP records the single Unit in the
 * campaign for which that matters.
 */
const SMOKE_MUZZLE = 18

/** A cloud's radius at birth and at its death, in metres. */
const SMOKE_RADIUS = [11, 34] as const

/**
 * The breeze, as a unit vector and a speed in metres per second. One direction
 * for the whole Field and the whole campaign: weather is not something a
 * Scenario carries (G5), and smoke is the only thing on the map that would read
 * it if it did.
 *
 * 1.2 m/s carries a cloud 54m over its life — far enough to read as drift, near
 * enough that the smoke never leaves the Unit that made it.
 */
const SMOKE_BREEZE: Vec2 = { x: 0.866, y: 0.5 }
const SMOKE_DRIFT = 1.2

/**
 * What the smoke may never be thicker than, and what colour it is. Both are
 * measured and not picked: this is the roof's own warning (F13 x F5) and it
 * does not survive being eyeballed.
 *
 * **The cap is exact rather than hoped for.** Every cloud is drawn into one
 * Container and composited once through an AlphaFilter, so ten battalions
 * firing into the same hundred metres come out at 0.268 and so does one. That
 * is T10's "one accumulator" taken literally — without it, capping means
 * choosing a per-cloud alpha low enough that a *plausible* stack stays legible,
 * which is not a cap at all.
 *
 * **White is what powder smoke is, and it is the one colour this map cannot
 * have.** Over the open wash at this cap, true white (#f2f2f0) takes the
 * Austrians — who are #e3e7ef — to 1.72 against the ground they stand on,
 * under the 1.88 `settings.ts` keeps on file as the tone to argue against.
 * #dcdcd6 is as white as the white army can afford.
 *
 * What it costs, worst case over every paper tone on offer, counting a Unit's
 * keyline as well as its body — the keyline is dark ink, so smoke *sharpens* it
 * by as much as it flattens the body:
 *
 * | Grade     | bare | under the cap |
 * |-----------|-----:|--------------:|
 * | elite     | 4.71 |          6.05 |
 * | line      | 3.13 |          3.66 |
 * | conscript | 2.27 |          1.84 |
 *
 * So smoke makes every Unit easier to find but one. A conscript has almost no
 * keyline *by design* — the faint edge is what its Grade is drawn as — so a
 * conscript in the white army has only its body left, and smoke takes a fifth
 * of it. There is exactly one such battalion in the six Rosters authored, in
 * Castiglione's Austrians, and SMOKE_MUZZLE keeps it out of its own cloud.
 * Recorded rather than fixed: the alternative is a Grade channel that stops
 * saying anything.
 */
const SMOKE_CAP = 0.268
const SMOKE_COLOUR = 0xdcdcd6

/**
 * A single cloud's share of the cap, before the group is composited. Not 1:
 * with the cap exact, this is the only thing left that lets a firefight read
 * thicker than a volley. One cloud lands at 0.16 of the way to the ground,
 * two overlapping at 0.23, three at 0.25 — so density says how much is being
 * fired here, and stops saying it before it can hide anything.
 */
const PUFF_ALPHA = 0.6

/**
 * A backstop on live clouds, oldest dropped first. Fire rate times SMOKE_LIFE
 * puts a full Rivoli at about eighty, so this is never reached in a battle and
 * is here so a pathological one costs frames instead of the tab. Stated because
 * a cap that silently drops what it cannot draw reads as having drawn it.
 */
const SMOKE_MAX = 160

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

/**
 * A stable number from a Volley's id, so a cloud's raggedness is decided once
 * and never per frame. Renderer-only: nothing seeded here reaches the
 * simulation, whose own randomness is C8's and is not this.
 */
function hashId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

/** A repeatable 0..1 from a cloud's seed and a disc's place in it. */
function jitter(seed: number, i: number): number {
  const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453
  return x - Math.floor(x)
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
  private terrain: Sprite[] = []
  private field: Field | null = null
  private host: HTMLElement | null = null
  private observer: ResizeObserver | null = null
  private pxPerMetre = 1
  private flashes: Flash[] = []
  private flashed = new Set<string>()
  private clashes: Clash[] = []
  private clashed = new Set<string>()
  /**
   * Under the Units and over the beaten ground, in a Container of its own
   * because the cap is a *group* alpha: the whole bank is drawn, then
   * composited once. See SMOKE_CAP.
   */
  private smokeLayer = new Container()
  private smoke = new Graphics()
  private puffs: Puff[] = []
  private smoked = new Set<string>()

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
    // Half resolution, deliberately. The filter is a full render-texture pass
    // over the bank's bounds every frame, and smoke is the one thing on the map
    // with no edge detail worth a retina one — the softening is free legibility
    // and the fill cost is quartered.
    const cap = new AlphaFilter({ alpha: SMOKE_CAP })
    cap.resolution = 1
    this.smokeLayer.filters = [cap]
    this.smokeLayer.addChild(this.smoke)
    this.world.addChild(
      this.overlay,
      this.fireLayer,
      // Behind the Units and behind the Ghosts, which is the roof's own
      // mitigation for F13 x F5: a Unit is never drawn through its own smoke,
      // so the silhouette G2 rests on is untouched and only the ground it
      // stands on is veiled.
      this.smokeLayer,
      this.ghostLayer,
      this.unitLayer,
      this.effects,
    )
  }

  /** Draw the Field once. Terrain never changes during a battle. */
  setField(
    field: Field,
    style: FieldStyle = "staff",
    options: StaffMapOptions = STAFF_MAP_DEFAULTS,
  ): void {
    this.field = field
    // Destroyed and not merely removed. A Field set over another one left the
    // old terrain's texture alive on the GPU, and the new one came back sampled
    // over a fraction of its own sprite.
    for (const sprite of this.terrain) sprite.destroy({ texture: true, textureSource: true })
    this.terrain = []
    const metresX = field.width * field.cellSize
    const metresY = field.height * field.cellSize
    // Scaled from the canvas it was drawn on rather than through Sprite's own
    // width setter. The two renderers draw at different resolutions, and the
    // setter reads the texture's size at the moment it is assigned — which was
    // enough to leave the second Field ever set on a BattleView at 1:1 texture
    // pixels. Stating the scale cannot be early.
    const lay = (canvas: HTMLCanvasElement, at: number) => {
      // Built rather than fetched through `Texture.from`, which goes through a
      // cache: setting a second Field on the same view came back holding the
      // first one's dimensions, so the new canvas was sampled over a fraction
      // of the sprite and the rest came out empty. One Field per view never
      // showed it; the plate, which sets several, showed it at once.
      const sprite = new Sprite(new Texture({ source: new CanvasSource({ resource: canvas }) }))
      sprite.scale.set(metresX / canvas.width, metresY / canvas.height)
      this.world.addChildAt(sprite, at)
      this.terrain.push(sprite)
      return sprite
    }
    lay(style === "staff" ? buildStaffMapCanvas(field, options) : buildTerrainCanvas(field), 0)
    if (style === "shaded") {
      // Hachures carry the relief on the staff map, so contours would be a
      // second answer to a question already answered.
      lay(buildContourCanvas(field), 1)
    }
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
    // Battle time, interpolated the same way a Unit's position is. Smoke ages
    // and drifts on it rather than on the wall clock (SMOKE_LIFE), so it stops
    // with a paused battle and thickens the same at any Tempo.
    const time = previous.time + (current.time - previous.time) * alpha
    this.collectFlashes(current)
    this.collectClashes(current)
    this.collectSmoke(current, time)
    this.drawOverlay(view)
    this.drawFireZones(units, view)
    this.drawAimLines(units, view)
    this.drawSmoke(time, view)
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
   * Raise a cloud for every Volley not seen yet — one per Volley, which is what
   * F13 asks for. Remembered by id for the same reason a Flash is: the same
   * snapshot is drawn for several frames and an unremembered Volley would smoke
   * once per frame. The memory is pruned with the clouds so it cannot grow.
   */
  private collectSmoke(current: BattleSnapshot, time: number): void {
    for (const volley of current.volleys) {
      if (this.smoked.has(volley.id)) continue
      this.smoked.add(volley.id)
      const cos = Math.cos(volley.direction)
      const sin = Math.sin(volley.direction)
      this.puffs.push({
        at: { x: volley.from.x + cos * SMOKE_MUZZLE, y: volley.from.y + sin * SMOKE_MUZZLE },
        across: { x: -sin, y: cos },
        width: volley.width,
        born: time,
        // The id, not a counter: two clouds raised in the same step have to
        // differ, and the id is the only thing about a Volley that is unique.
        seed: hashId(volley.id),
      })
    }
    // A cloud born after `time` is a battle that has restarted under a view
    // that outlived it — the ids start at v1 again, so the memory has to go
    // with them or the new battle's first Volleys are silently already seen.
    const alive = this.puffs.filter((p) => {
      const age = time - p.born
      return age >= 0 && age < SMOKE_LIFE
    })
    if (alive.length !== this.puffs.length) {
      this.puffs = alive
      if (alive.length === 0) this.smoked.clear()
    }
    if (this.puffs.length > SMOKE_MAX) this.puffs.splice(0, this.puffs.length - SMOKE_MAX)
  }

  /**
   * The bank. Each cloud is a run of overlapping discs laid along the Face that
   * fired, swelling and thinning as it goes downwind — so a battalion's
   * discharge is a bar of smoke a hundred metres wide and a gun's is a knot,
   * which is the same thing the flash says and the only thing left saying it
   * once the flash has gone.
   *
   * Every disc goes into one Graphics inside one filtered Container, so what
   * bounds the whole is SMOKE_CAP and never the arithmetic here.
   */
  private drawSmoke(time: number, view: ViewState): void {
    const g = this.smoke
    g.clear()
    this.smokeLayer.visible = view.smoke !== false && this.puffs.length > 0
    if (!this.smokeLayer.visible) return
    for (const puff of this.puffs) {
      const t = Math.min(1, Math.max(0, (time - puff.born) / SMOKE_LIFE))
      // Lingers, then thins: powder smoke goes when the air takes it and not on
      // a straight line down from the moment it was made.
      const alpha = PUFF_ALPHA * (1 - t) ** 0.7
      if (alpha <= 0.004) continue
      // Fast out of the muzzle and slowing, which is what a cloud does.
      const radius = SMOKE_RADIUS[0] + (SMOKE_RADIUS[1] - SMOKE_RADIUS[0]) * Math.sqrt(t)
      const carried = SMOKE_DRIFT * SMOKE_LIFE * t
      const cx = puff.at.x + SMOKE_BREEZE.x * carried
      const cy = puff.at.y + SMOKE_BREEZE.y * carried
      const discs = Math.min(14, Math.max(2, Math.round(puff.width / radius) + 1))
      for (let i = 0; i < discs; i++) {
        // Spread along the Face, ends included, so the bar is as wide as the
        // Frontage that fired and not a disc's worth wider.
        const along = (i / (discs - 1) - 0.5) * puff.width
        const wobble = (jitter(puff.seed, i) - 0.5) * radius * 0.9
        const size = radius * (0.72 + 0.5 * jitter(puff.seed, i + 64))
        g.circle(
          cx + puff.across.x * along - SMOKE_BREEZE.x * wobble,
          cy + puff.across.y * along - SMOKE_BREEZE.y * wobble,
          size,
        ).fill({ color: SMOKE_COLOUR, alpha })
      }
    }
  }

  /**
   * The flash alone. Its Powder Smoke is a layer down and a different clock —
   * the flash is the discharge and the cloud is what the discharge leaves, and
   * the second outlives the first by forty-five seconds.
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
      if (zone.faces !== 1) {
        // Every way at once, and for the same two reasons the sim has: a screen
        // has no Face to point, and a square has four and therefore no way it is
        // not pointing. Either way the beaten ground is the Unit's own Footprint
        // blown out by the range on every side — a lozenge and not a circle.
        // Traced off the same shape the sim measures its gaps against, so what
        // is drawn is where the fire reaches and not near it — corners rounded
        // off at the range, because that is what blowing a rectangle out on
        // every side gives you.
        const ring: number[] = []
        for (let i = 0; i < ALL_ROUND_STEPS; i++) {
          const bearing = (i / ALL_ROUND_STEPS) * Math.PI * 2
          const reach = reachOnBearing(zone, unit.facing, bearing)
          ring.push(unit.position.x + Math.cos(bearing) * reach)
          ring.push(unit.position.y + Math.sin(bearing) * reach)
        }
        g.poly(ring)
          .fill({ color: colour, alpha: alpha * 0.7 })
          .stroke({ width: line * 1.5, color: colour, alpha: alpha * 3 })
        continue
      }
      // One Face, one band: as wide as the Unit, standing off its edge, and
      // bare to either side of it, which is what having flanks looks like.
      this.fillBand(
        g,
        unit.position,
        unit.facing,
        zone.width,
        zone.depth / 2,
        zone.range,
        colour,
        alpha,
        line,
      )
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
      g.moveTo(unit.position.x, unit.position.y)
      g.lineTo(target.position.x, target.position.y)
      g.stroke(style)
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
        unit.disordered,
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
        color: DARK_INK,
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
    if (unit.disordered) this.buildGlyph(g, line)
    if (selected) {
      const pad = 6 * line
      g.rect(-width / 2 - pad, -depth / 2 - pad, width + pad * 2, depth + pad * 2)
      g.stroke({ width: line * 2, color: 0xf5e6a8, alpha: 0.95 })
    }
  }

  /**
   * The saw-tooth that says a Unit's ranks are not its own, laid across the
   * middle of it. Over the Figures, because it is the one thing on a Unit that
   * has to be read before anything else about it: a battalion in disorder will
   * not make square and a regiment in disorder will not charge, and neither
   * fact is anywhere else on the Field.
   *
   * Nothing about it is read off the Unit — not its Frontage, not its Arm and
   * not its depth. It is the same mark on everything that can carry it, which
   * is what makes it a glyph rather than a fifth thing the silhouette is doing.
   */
  private buildGlyph(g: Graphics, line: number): void {
    const half = (GLYPH_PX * line) / 2
    const rise = (GLYPH_RISE_PX * line) / 2
    const teeth = GLYPH_TEETH * 2
    const points: Vec2[] = []
    for (let i = 0; i <= teeth; i++) {
      points.push({ x: -half + (i * half * 2) / teeth, y: i % 2 === 0 ? rise : -rise })
    }
    this.strokeOpen(g, points, 1, line * DASH_PX, {
      width: line * GLYPH_WEIGHT,
      color: DARK_INK,
      alpha: 0.9,
    })
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
   *
   * A Pursuit is drawn the same and in the same colour. The line is short by
   * then — the horse is on the mob's heels — and what the player needs off it
   * is which mob his regiment has gone away with.
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
   * target. Which those are depends on what is doing the aiming: a Routing
   * enemy is outlined for horse, which can ride it down, and not for foot,
   * which cannot catch it. The offer has to be exactly what C6 will accept, or
   * the player spends a Courier ride and watches the regiment stand still.
   */
  private drawArming(units: UnitSnapshot[], view: ViewState): void {
    if (!view.arming) return
    const g = this.effects
    const mpp = this.metresPerPixel()
    const by = units.find((u) => u.id === view.selected)?.arm ?? null
    for (const unit of units) {
      if (!chargeable(unit, view.playerArmy, by)) continue
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
      // Only his own army's, because only his own Headquarters is drawn — and
      // only his own dictates anything.
      const dictated = units.filter((u) => u.dictated && u.army === view.playerArmy)
      this.drawHeadquarters(g, view.headquarters, mpp, dictated, view.alarm ?? ALARM)
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
  private drawHeadquarters(
    g: Graphics,
    hq: HeadquartersView,
    mpp: number,
    dictated: UnitSnapshot[],
    alarm: number,
  ): void {
    const { x, y } = hq.position
    const r = 7 * mpp
    const colour = hq.harried ? alarm : 0xf5e6a8
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
    // What was said in the saddle, drawn the way a Courier held at the table is:
    // a hollow mark on the staff and a thread to the Unit it is for. Without it
    // the press puts a Ghost on the Field with no rider anywhere behind it,
    // which reads as an Order the app has mislaid — the notebook is the one
    // thing the player has to be able to see while nothing is leaving.
    for (const unit of dictated) {
      g.moveTo(x, y).lineTo(unit.position.x, unit.position.y)
      g.stroke({ width: mpp, color: colour, alpha: 0.12 })
    }
    if (dictated.length > 0) {
      g.circle(x, y, 4.5 * mpp).stroke({ width: mpp, color: colour, alpha: 0.8 })
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
