import { GROUND_COLOURS, GROUNDS } from "@/sim/ground"
import type { Field, Ground, Vec2 } from "@/sim/types"

/**
 * C9 Field Renderer, drawn as the staff map a commander of 1797 would have had
 * spread on a drum in front of him.
 *
 * Everything here is derived from the Field's own three grids — Ground, Height,
 * Crossing — and from nothing else. No Scenario carries art, so a Field painted
 * in an image editor this afternoon gets woods, a river bank and a bridge for
 * free, and the simulation never learns that any of it happened.
 *
 * The whole style is decided by one constraint that has nothing to do with
 * taste. DESIGN.md §7 has already spent every channel a Unit owns: hue says
 * which army, keyline weight says Grade, `#d8632f` says Morale. A battalion in
 * line is 102px by 2.6px. So the map may be as detailed as it likes and may not
 * be *loud*: terrain is drawn in sepia hairlines, Units in near-black solids,
 * and the two never meet in weight or in hue. Where the period would lay a
 * hachure black, this lays it brown and thin.
 */

/** Texture pixels per Field cell. Twice the screen's own 0.7px/m, so the ink
 * has somewhere to be thin. */
const CELL_PX = 12

/**
 * Paper, and the reason it is tanned rather than cream.
 *
 * A staff map wants to be near-white. One of the two armies *is* near-white
 * (`#e3e7ef`), so cream paper is a paper the Austrians vanish into. The tone is
 * therefore not chosen by eye but measured against the grass it replaces, and
 * held to the contrast the old renderer already gave every mark on the Field.
 * `tanned` is the one that holds it; the others are here to be tried, and the
 * number beside each is what the white army costs on it.
 *
 * A lighter, prettier paper was the first choice and is what the measuring was
 * for: at `light` the white army falls to 1.88, which is a battalion the player
 * has to hunt for. Beauty does not get to spend G2's budget.
 *
 * The Rout's orange sits at about 1.2 on any of them and always did — it is
 * read as a *change* from white and by the mob's own dark keyline, never
 * against the ground.
 */
export const PAPERS = {
  /** white 2.53 · blue 2.59 · gold 2.51 — the old grass's own budget. */
  tanned: "#9e9670",
  /** white 2.14 — prettier, and a fifth of the Austrians' contrast gone. */
  buff: "#a89f79",
  /** white 1.88 — the first draft, kept as the thing to argue against. */
  light: "#b1ab84",
  /** white 3.08 · blue 2.13 — the other way, and it costs the French. */
  foxed: "#8a835f",
  /** white 2.55 · blue 2.55 — the same budget with the warmth taken out. */
  grey: "#999a90",
} as const

export type PaperName = keyof typeof PAPERS

/** Toward white, for the deck of a bridge and the metal of a road. */
function lift(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  return `rgb(${mix((n >> 16) & 0xff)}, ${mix((n >> 8) & 0xff)}, ${mix(n & 0xff)})`
}

/** Terrain ink. Brown, never black: black belongs to a Unit's keyline. */
const INK = "rgba(66, 52, 34, 1)"
const INK_SOFT = "rgba(66, 52, 34, 0.55)"

/**
 * How strongly a Ground's wash is laid over the paper.
 *
 * The colour itself is never chosen here: it is `GROUND_COLOURS`, the palette a
 * Field is *painted* in (ADR-0005), so what someone lays down in an image
 * editor is the hue that comes back at him on the map. Only the strength is the
 * renderer's, and only because a wash is a wash — the paper's mottle and grain
 * have to come through it or the map goes back to being flat fills with better
 * manners.
 *
 * Open ground gets one too, which a period survey would not have done: bare
 * paper is what open ground is on a real staff map, and it read as desert over
 * four hundred hectares of Rivoli. At 0.58 the old renderer's own grass comes
 * back through the paper at `#8a9764`, which is within a tenth of the contrast
 * every mark on the Field had before the map was ever restyled.
 *
 * **A wash says which Ground it is; the symbol is what makes it visible.** The
 * strengths above are as far as each colour can usefully be pushed and no
 * further, because two of them cannot be pushed at all. Measured over the
 * grass, at *any* alpha:
 *
 * | Ground  | best contrast vs grass | what carries it |
 * |---------|-----------------------:|-----------------|
 * | wood    |                   1.64 | the wash, and the canopies |
 * | water   |                   1.73 | the wash, and a firm bank |
 * | marsh   |                   1.34 | the reeds |
 * | village |                   1.29 | the roofs |
 *
 * Marsh and village are near enough the grass in *value* that no amount of
 * their own colour will separate them — which is not a flaw in the palette.
 * `GROUND_COLOURS` were chosen to be told apart as flat fills, where each was
 * the only thing on the cell. As a wash over green they collapse, and the
 * period's answer is the one taken here: a marsh is drawn as reed hatching and
 * a village as its roofs, not as a tint. Castiglione is the case that proved
 * it — its Redone is 456 cells of marsh and not a drop of water, and at 0.36 it
 * was a scratch on a lawn.
 */
const WASH: Record<Ground, number> = {
  open: 0.58,
  wood: 0.55,
  village: 0.35,
  marsh: 0.5,
  water: 0.9,
  // Unused. A road is drawn and not washed — see where it is stroked.
  road: 0,
}

/**
 * What the plate is allowed to turn. Every one of these is a judgement someone
 * should be able to disagree with by looking rather than by arguing, so each is
 * a knob on `/plate` and a default here.
 */
export interface StaffMapOptions {
  paper: PaperName
  /** How much of open ground's own colour comes back through the paper. */
  grass: "none" | "wash" | "full"
  /** The invented field boundaries. Texture, or nothing. */
  enclosure: "off" | "faint" | "firm"
  /** How hard the relief is laid in. */
  hachures: "off" | "light" | "full"
}

export const STAFF_MAP_DEFAULTS: StaffMapOptions = {
  paper: "tanned",
  grass: "wash",
  enclosure: "faint",
  hachures: "full",
}

const GRASS: Record<StaffMapOptions["grass"], number> = { none: 0, wash: 0.58, full: 0.88 }
const ENCLOSURE: Record<StaffMapOptions["enclosure"], number> = {
  off: 0,
  faint: 0.15,
  firm: 0.3,
}
const HACHURES: Record<StaffMapOptions["hachures"], number> = { off: 0, light: 0.55, full: 1 }

function wash(ground: Ground, alpha = WASH[ground]): string {
  const [r, g, b] = GROUND_COLOURS[ground]
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Rise over run below which the ground is drawn as flat, and left blank. */
const HACHURE_FLOOR = 0.04

/** Rise over run at which a hachure is as dark and as short as it gets. */
const HACHURE_CEILING = 0.45

// ---------------------------------------------------------------------------
// Deterministic noise
// ---------------------------------------------------------------------------

/**
 * A hash on a place rather than a stream from a generator, so every mark on the
 * map is a function of *where* it is and not of the order the passes ran in.
 * Re-ordering the drawing then cannot move a tree.
 */
function hash(x: number, y: number, salt: number): number {
  let h =
    (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Value noise, so a wood's edge wanders over tens of metres and not over one. */
function noise(x: number, y: number, salt: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash(x0, y0, salt)
  const b = hash(x0 + 1, y0, salt)
  const c = hash(x0, y0 + 1, salt)
  const d = hash(x0 + 1, y0 + 1, salt)
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy
}

// ---------------------------------------------------------------------------
// Regions: from a grid of cells to a drawn line
// ---------------------------------------------------------------------------

/**
 * A traced boundary, and which of its points are not really boundary at all.
 *
 * A region that runs off the Field is closed by the trace against the Field's
 * own frame, and that closing run is a fiction: the road carries on to Verona.
 * Drawing it puts a cross-piece across the road's mouth and turns a way through
 * into a cul-de-sac. So the points lying on the frame are marked as they are
 * traced, held still through every pass that would move them, and left out of
 * the ink — the fill still runs to the edge of the paper, and only the line
 * that would have capped it is missing.
 */
interface Loop {
  points: Vec2[]
  pinned: boolean[]
}

/** Whether a lattice point sits on the Field's own frame rather than on ground. */
function onFrame(p: Vec2, width: number, height: number): boolean {
  const edge = 1e-6
  return (
    p.x <= -0.5 + edge ||
    p.y <= -0.5 + edge ||
    p.x >= width - 0.5 - edge ||
    p.y >= height - 0.5 - edge
  )
}

/**
 * Marching squares over the cell grid.
 *
 * This is half the answer to the staircase. The Ground grid is 8m cells, so
 * every boundary in it is a flight of 8m steps; filling the cells paints the
 * steps, and a river, a road and a wood all end up with the same sawtooth edge.
 * Tracing the boundary as a line means the edge can be *drawn* — stroked as a
 * bank, doubled as a road casing, broken as a wood — which is what a map does
 * and a fill cannot.
 *
 * Corners of the marching lattice sit on cell centres, so a lattice point
 * (cx, cy) is at (cx + 0.5, cy + 0.5) cells.
 */
function trace(mask: Uint8Array, width: number, height: number): Vec2[][] {
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x]

  const segments: [Vec2, Vec2][] = []
  // One cell beyond the grid on every side, so a region touching the Field's
  // edge still closes instead of trailing off it.
  for (let y = -1; y < height; y++) {
    for (let x = -1; x < width; x++) {
      const code = at(x, y) * 8 + at(x + 1, y) * 4 + at(x + 1, y + 1) * 2 + at(x, y + 1)
      if (code === 0 || code === 15) continue
      const T = { x: x + 0.5, y }
      const R = { x: x + 1, y: y + 0.5 }
      const B = { x: x + 0.5, y: y + 1 }
      const L = { x, y: y + 0.5 }
      switch (code) {
        case 1:
        case 14:
          segments.push([L, B])
          break
        case 2:
        case 13:
          segments.push([B, R])
          break
        case 3:
        case 12:
          segments.push([L, R])
          break
        case 4:
        case 11:
          segments.push([T, R])
          break
        case 6:
        case 9:
          segments.push([T, B])
          break
        case 7:
        case 8:
          segments.push([T, L])
          break
        // The two saddles, resolved the same way every time so a diagonal
        // string of cells reads as one thing rather than as a dotted one.
        case 5:
          segments.push([T, L], [B, R])
          break
        case 10:
          segments.push([T, R], [L, B])
          break
      }
    }
  }

  return chain(segments)
}

/** Link loose segments end to end into polylines, either way round. */
function chain(segments: [Vec2, Vec2][]): Vec2[][] {
  const key = (p: Vec2) => `${p.x * 2},${p.y * 2}`
  const ends = new Map<string, number[]>()
  segments.forEach(([a, b], index) => {
    for (const p of [a, b]) {
      const k = key(p)
      const list = ends.get(k)
      if (list) list.push(index)
      else ends.set(k, [index])
    }
  })

  const used: boolean[] = Array.from({ length: segments.length }, () => false)
  const walk = (from: Vec2, seed: number): Vec2[] => {
    const points: Vec2[] = []
    let here = from
    let index: number | undefined = seed
    while (index !== undefined && !used[index]) {
      used[index] = true
      const [a, b] = segments[index]
      const next = key(a) === key(here) ? b : a
      points.push(next)
      here = next
      index = ends.get(key(here))?.find((i) => !used[i])
    }
    return points
  }

  const loops: Vec2[][] = []
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue
    const [a, b] = segments[i]
    // Walk both ways from the seed so an open run — a region cut by the Field's
    // own edge — comes out whole rather than as two halves.
    const forward = walk(a, i)
    used[i] = false
    const backward = walk(b, i)
    const loop = [...backward.reverse(), ...forward]
    if (loop.length > 3) loops.push(loop)
  }
  return loops
}

/**
 * The other half of the answer to the staircase, and the half that matters.
 *
 * Chaikin alone rounds the *corners* of an 8m step and leaves the step itself
 * standing, which is why a diagonal road came out as a flight of rounded
 * stairs. A moving average over the neighbours shortens the sawtooth instead of
 * softening it, so the two run in that order: average the steps away, then cut
 * the corners of what is left.
 */
function relax(loop: Loop, passes: number): Loop {
  let current = loop.points
  for (let pass = 0; pass < passes; pass++) {
    const next: Vec2[] = Array.from({ length: current.length })
    for (let i = 0; i < current.length; i++) {
      if (loop.pinned[i]) {
        next[i] = current[i]
        continue
      }
      const a = current[(i - 1 + current.length) % current.length]
      const b = current[i]
      const c = current[(i + 1) % current.length]
      next[i] = { x: (a.x + 2 * b.x + c.x) / 4, y: (a.y + 2 * b.y + c.y) / 4 }
    }
    current = next
  }
  return { points: current, pinned: loop.pinned }
}

/** Chaikin corner cutting, over ground the moving average has already levelled. */
function smooth(loop: Loop, passes: number): Loop {
  let current = loop
  for (let pass = 0; pass < passes; pass++) {
    const points: Vec2[] = []
    const pinned: boolean[] = []
    for (let i = 0; i < current.points.length; i++) {
      const a = current.points[i]
      const b = current.points[(i + 1) % current.points.length]
      points.push(
        { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 },
        { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 },
      )
      // Each cut point takes the pinning of whichever end it sits nearest, so a
      // run along the frame stays a run along the frame however often it is cut.
      pinned.push(current.pinned[i], current.pinned[(i + 1) % current.points.length])
    }
    current = { points, pinned }
  }
  return current
}

/**
 * Wander a boundary, so a wood stops being the perfect ellipse the Field
 * generator stamped and starts being a wood.
 *
 * **Inward only, and that is not a detail.** A drawn edge that bulged outward
 * would promise concealment where the grid grants none, and the player would
 * lose a battalion to the difference. Eroding instead means the drawing only
 * ever under-promises: ground that looks open at the fringe of a wood may
 * actually still be in it, which costs him nothing.
 */
function wander(
  loop: Loop,
  mask: Uint8Array,
  width: number,
  height: number,
  amplitude: number,
  salt: number,
  inwardOnly: boolean,
): Loop {
  const points = loop.points
  const inside = (x: number, y: number) => {
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix < 0 || iy < 0 || ix >= width || iy >= height) return 0
    return mask[iy * width + ix]
  }
  const moved = points.map((p, i) => {
    // A point held to the frame is held through the wander too: a wood that
    // runs off the Field must not shrink back from the edge and reveal that it
    // was ever cut there.
    if (loop.pinned[i]) return p
    const a = points[(i - 1 + points.length) % points.length]
    const b = points[(i + 1) % points.length]
    const tx = b.x - a.x
    const ty = b.y - a.y
    const length = Math.hypot(tx, ty) || 1
    // Which way is in is asked of the mask rather than assumed from a winding
    // order, because a traced loop's winding depends on which case of the
    // marching square it happened to start from.
    let nx = -ty / length
    let ny = tx / length
    if (!inside(p.x + nx * 0.8, p.y + ny * 0.8)) {
      nx = -nx
      ny = -ny
    }
    const d =
      (noise(p.x / 17, p.y / 17, salt) * 0.56 +
        noise(p.x / 6.5, p.y / 6.5, salt + 1) * 0.34 +
        noise(p.x / 2.4, p.y / 2.4, salt + 2) * 0.1) *
      amplitude
    // Water may wander either way, and by less. Eroding a torrent gully two
    // cells wide takes it to a point, and the honest bound on a river is the
    // grid's own: half a cell out either way says nothing the 8m cell was not
    // already unsure about.
    const throwOff = inwardOnly ? d : d - amplitude / 2
    return { x: p.x + nx * throwOff, y: p.y + ny * throwOff }
  })
  return { points: moved, pinned: loop.pinned }
}

function maskOf(field: Field, ground: Ground): Uint8Array {
  const index = GROUNDS.indexOf(ground)
  const mask = new Uint8Array(field.width * field.height)
  for (let i = 0; i < mask.length; i++) mask[i] = field.ground[i] === index ? 1 : 0
  return mask
}

interface RegionOptions {
  /** Cells of inward wander. Zero for anything built by hand — a road and a
   * village are surveyed, and a surveyor's line does not wobble. */
  amplitude?: number
  /** Passes of the moving average. More for a thin region, whose sawtooth is
   * the whole of its width. */
  relaxPasses?: number
  /** Whether the wander may only eat into the region. True for anything that
   * grants Concealment, for the reason `wander` gives. */
  inwardOnly?: boolean
}

interface Region {
  /** Closed, and used for the wash and for clipping. */
  fill: Path2D
  /** Broken wherever the boundary is only the Field's frame. */
  stroke: Path2D
}

function regionPath(
  field: Field,
  ground: Ground,
  { amplitude = 0, relaxPasses = 3, inwardOnly = true }: RegionOptions = {},
): Region {
  const mask = maskOf(field, ground)
  const fill = new Path2D()
  const stroke = new Path2D()
  const salt = GROUNDS.indexOf(ground) * 977 + 13
  const px = (p: Vec2) => (p.x + 0.5) * CELL_PX
  const py = (p: Vec2) => (p.y + 0.5) * CELL_PX

  for (const traced of trace(mask, field.width, field.height)) {
    let loop: Loop = {
      points: traced,
      pinned: traced.map((p) => onFrame(p, field.width, field.height)),
    }
    loop = relax(loop, relaxPasses)
    if (amplitude > 0) {
      loop = relax(wander(loop, mask, field.width, field.height, amplitude, salt, inwardOnly), 2)
    }
    loop = smooth(loop, 2)

    const { points, pinned } = loop
    fill.moveTo(px(points[0]), py(points[0]))
    for (let i = 1; i < points.length; i++) fill.lineTo(px(points[i]), py(points[i]))
    fill.closePath()

    // Runs of real boundary, each carried one point into the frame at either
    // end so the ink reaches the edge of the paper and is cut off by it rather
    // than stopping short of it.
    let drawing = false
    for (let i = 0; i <= points.length; i++) {
      const here = points[i % points.length]
      const real = !pinned[i % points.length]
      if (real && !drawing) {
        const before = points[(i - 1 + points.length) % points.length]
        stroke.moveTo(px(before), py(before))
        drawing = true
      }
      if (drawing) stroke.lineTo(px(here), py(here))
      if (!real) drawing = false
    }
  }
  return { fill, stroke }
}

// ---------------------------------------------------------------------------
// Passes
// ---------------------------------------------------------------------------

/** Laid paper: a flat tone, a slow mottle, and a fine grain over the top. */
function paper(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  tone: string,
): void {
  context.fillStyle = tone
  context.fillRect(0, 0, width, height)

  // The mottle is what stops a thousand square metres of open ground reading as
  // a bedsheet. It is deliberately far too slow to be mistaken for terrain.
  for (let i = 0; i < 90; i++) {
    const x = hash(i, 0, 11) * width
    const y = hash(i, 0, 12) * height
    const r = (0.06 + hash(i, 0, 13) * 0.16) * Math.max(width, height)
    const wash = context.createRadialGradient(x, y, 0, x, y, r)
    const light = hash(i, 0, 14) > 0.5
    wash.addColorStop(0, light ? "rgba(255,248,224,0.11)" : "rgba(88,70,46,0.10)")
    wash.addColorStop(1, "rgba(0,0,0,0)")
    context.fillStyle = wash
    context.fillRect(x - r, y - r, r * 2, r * 2)
  }

  // Grain as a 128px tile rather than per-pixel: five million pixels of
  // JavaScript noise costs a tenth of a second, and a tile costs nothing.
  const tile = document.createElement("canvas")
  tile.width = 128
  tile.height = 128
  const grain = tile.getContext("2d")
  if (!grain) return
  const image = grain.createImageData(128, 128)
  for (let i = 0; i < 128 * 128; i++) {
    const n = hash(i % 128, Math.floor(i / 128), 7)
    image.data[i * 4] = 60
    image.data[i * 4 + 1] = 48
    image.data[i * 4 + 2] = 32
    image.data[i * 4 + 3] = n > 0.72 ? 18 : n < 0.12 ? 9 : 0
  }
  grain.putImageData(image, 0, 0)
  const pattern = context.createPattern(tile, "repeat")
  if (!pattern) return
  context.fillStyle = pattern
  context.fillRect(0, 0, width, height)
}

/**
 * High ground pale, low ground shaded. Hachures say how *steep* the ground is
 * and cannot say how *high* it is, so a plateau and a plain would be the same
 * blank paper without this. Drawn a cell at a time into a tiny canvas and blown
 * up, which buys the smoothing for free.
 */
function relief(
  context: CanvasRenderingContext2D,
  field: Field,
  width: number,
  height: number,
): void {
  let ceiling = 1
  for (const metres of field.elevation) if (metres > ceiling) ceiling = metres

  const small = document.createElement("canvas")
  small.width = field.width
  small.height = field.height
  const tint = small.getContext("2d")
  if (!tint) return
  const image = tint.createImageData(field.width, field.height)
  for (let i = 0; i < field.elevation.length; i++) {
    // A Heightmap is eight bits, so over Rivoli's 250m a step is a metre — and
    // tinting a step paints a terrace across ground that is in fact a slope.
    // Dithering by one step is what keeps the wash smooth.
    const step = ceiling / 255
    const t =
      (field.elevation[i] + (hash(i % field.width, (i / field.width) | 0, 71) - 0.5) * step * 2) /
      ceiling
    const above = t > 0.45
    image.data[i * 4] = above ? 255 : 74
    image.data[i * 4 + 1] = above ? 248 : 60
    image.data[i * 4 + 2] = above ? 226 : 40
    image.data[i * 4 + 3] = Math.round(Math.abs(t - 0.45) * 2 * 78)
  }
  tint.putImageData(image, 0, 0)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  context.drawImage(small, 0, 0, width, height)
}

/**
 * Hachures: strokes drawn straight down the slope, thickening and closing up as
 * the ground steepens, absent altogether where it is flat. The period's own way
 * of drawing relief, and the reason it beats contours here is that it needs no
 * numbers and no reading — a gorge simply looks like a gorge.
 *
 * Laid on a lattice in the paper's own coordinates rather than one stroke per
 * cell with a jitter on it. A jittered stroke is a hair, and a field of hairs is
 * fur; hachures are ruled work, and it is the ruling that makes them read as a
 * draughtsman's answer rather than as a texture.
 */
function hachures(context: CanvasRenderingContext2D, field: Field, weight: number): void {
  const at = (x: number, y: number) => {
    const ix = Math.max(0, Math.min(field.width - 1, x))
    const iy = Math.max(0, Math.min(field.height - 1, y))
    return field.elevation[iy * field.width + ix]
  }
  const water = GROUNDS.indexOf("water")
  const step = CELL_PX * 0.62

  // Bucketed by weight, so a hundred thousand hairlines cost a dozen strokes of
  // the context instead of a hundred thousand.
  const BUCKETS = 6
  const paths = Array.from({ length: BUCKETS }, () => new Path2D())

  for (let py = step; py < field.height * CELL_PX; py += step) {
    // Rows offset by a half step, so the lattice reads as laid work and not as
    // graph paper.
    const row = Math.round(py / step)
    for (let px = (row % 2) * step * 0.5; px < field.width * CELL_PX; px += step) {
      const cx = Math.floor(px / CELL_PX)
      const cy = Math.floor(py / CELL_PX)
      if (field.ground[cy * field.width + cx] === water) continue
      const dx = (at(cx + 1, cy) - at(cx - 1, cy)) / (2 * field.cellSize)
      const dy = (at(cx, cy + 1) - at(cx, cy - 1)) / (2 * field.cellSize)
      const slope = Math.hypot(dx, dy)
      if (slope < HACHURE_FLOOR) continue

      // Steepness runs 0 to 1, and everything about the stroke hangs off it:
      // steeper is shorter, fatter and darker, which is Lehmann's rule and
      // reads correctly even to someone who has never heard of it.
      const steep = Math.min(1, (slope - HACHURE_FLOOR) / (HACHURE_CEILING - HACHURE_FLOOR))
      const bucket = Math.min(BUCKETS - 1, Math.floor(steep * BUCKETS))
      const angle = Math.atan2(dy, dx)
      const half = step * (0.62 - steep * 0.22)
      const wobble = (hash(Math.round(px), Math.round(py), 3) - 0.5) * step * 0.16
      const ox = px + wobble
      const oy = py + wobble
      paths[bucket].moveTo(ox - Math.cos(angle) * half, oy - Math.sin(angle) * half)
      paths[bucket].lineTo(ox + Math.cos(angle) * half, oy + Math.sin(angle) * half)
    }
  }

  context.lineCap = "round"
  for (let b = 0; b < BUCKETS; b++) {
    const steep = (b + 0.5) / BUCKETS
    context.strokeStyle = `rgba(66, 52, 34, ${((0.13 + steep * 0.4) * weight).toFixed(3)})`
    context.lineWidth = 0.7 + steep * 1.5
    context.stroke(paths[b])
  }
}

/**
 * Enclosure. The one pass here that draws something the Field does not contain.
 *
 * Rivoli's plateau is four hundred hectares of Ground `open` with no relief on
 * it, so hachures leave it blank and the mottle is all that is left — which is
 * the bedsheet the old renderer was accused of, in another colour. It is also
 * a lie: that plateau was under vines and maize in January 1797, and every
 * survey of the period draws the parcels.
 *
 * So the parcels are invented, and invented in the one way that stays honest —
 * they carry no information. Each district of the map takes an angle and a
 * spacing from its own coordinates, which is why the hedge lines change bearing
 * across the Field the way farmland does; nothing about them is readable, and
 * nothing in the simulation can be inferred from them. They are held at an
 * alpha where they are texture and not marks, because a Unit's own keyline goes
 * down to one pixel at conscript (§7) and this may not compete with it.
 */
function hedges(
  context: CanvasRenderingContext2D,
  field: Field,
  open: Region,
  alpha: number,
): void {
  /** Cells to a district. About 300m, which is a hamlet's worth of fields. */
  const DISTRICT = 38

  context.save()
  context.clip(open.fill, "evenodd")
  context.strokeStyle = `rgba(66, 52, 34, ${alpha})`
  context.lineWidth = 0.9

  for (let by = 0; by * DISTRICT < field.height; by++) {
    for (let bx = 0; bx * DISTRICT < field.width; bx++) {
      const x0 = bx * DISTRICT * CELL_PX
      const y0 = by * DISTRICT * CELL_PX
      const side = DISTRICT * CELL_PX
      const angle = hash(bx, by, 61) * Math.PI
      const ux = Math.cos(angle)
      const uy = Math.sin(angle)
      const cx = x0 + side / 2
      const cy = y0 + side / 2
      // Reach past the district's own corner, then clip: a line has to cross
      // the whole square whatever angle it was given.
      const reach = side * 0.75
      const path = new Path2D()
      const lay = (spacing: number, vx: number, vy: number) => {
        for (let t = -reach; t <= reach; t += spacing) {
          const px = cx - vy * t
          const py = cy + vx * t
          path.moveTo(px - vx * reach, py - vy * reach)
          path.lineTo(px + vx * reach, py + vy * reach)
        }
      }
      lay(CELL_PX * (3.4 + hash(bx, by, 62) * 3), ux, uy)
      // The cross hedges are laid wider, so a parcel is a strip of land with a
      // headland at each end rather than a square of graph paper.
      lay(CELL_PX * (9 + hash(bx, by, 63) * 7), -uy, ux)

      context.save()
      context.beginPath()
      context.rect(x0, y0, side, side)
      context.clip()
      context.stroke(path)
      context.restore()
    }
  }
  context.restore()
}

/** A wash inside a region, and a line round it. */
function region(
  context: CanvasRenderingContext2D,
  shape: Region,
  fill: string | null,
  stroke: string | null,
  lineWidth = 1,
  dash: number[] = [],
): void {
  if (fill) {
    context.fillStyle = fill
    context.fill(shape.fill, "evenodd")
  }
  if (stroke) {
    context.save()
    context.setLineDash(dash)
    context.strokeStyle = stroke
    context.lineWidth = lineWidth
    context.lineJoin = "round"
    context.lineCap = "butt"
    context.stroke(shape.stroke)
    context.restore()
  }
}

/**
 * Woods, as the period drew them: a scatter of little scalloped canopies rather
 * than a green blob. The blob is what the Field grid literally is, and it is
 * exactly why the old map's woods read as spilt oil — a wood is a countable
 * number of trees, and drawing a few hundred of them is what says so.
 */
function trees(context: CanvasRenderingContext2D, field: Field, region: Region): void {
  const wood = GROUNDS.indexOf("wood")
  context.save()
  context.clip(region.fill)
  const crowns = new Path2D()
  for (let cy = 0; cy < field.height; cy++) {
    for (let cx = 0; cx < field.width; cx++) {
      if (field.ground[cy * field.width + cx] !== wood) continue
      // Two crowns a cell — one per 32m of frontage — is dense enough to read
      // as a canopy and sparse enough that the paper still shows through it.
      for (let t = 0; t < 2; t++) {
        const x = (cx + hash(cx, cy, t * 5 + 21)) * CELL_PX
        const y = (cy + hash(cx, cy, t * 5 + 22)) * CELL_PX
        const r = CELL_PX * (0.3 + hash(cx, cy, t * 5 + 23) * 0.2)
        // Five lobes, so the mark is a crown and not a dot.
        for (let a = 0; a <= 14; a++) {
          const angle = (a / 14) * Math.PI * 2
          const lobe = r * (1 + Math.sin(angle * 5) * 0.24)
          const lx = x + Math.cos(angle) * lobe
          const ly = y + Math.sin(angle) * lobe * 0.85
          if (a === 0) crowns.moveTo(lx, ly)
          else crowns.lineTo(lx, ly)
        }
        crowns.closePath()
      }
    }
  }
  context.fillStyle = "rgba(60, 80, 44, 0.32)"
  context.fill(crowns)
  context.strokeStyle = "rgba(44, 58, 32, 0.5)"
  context.lineWidth = 0.85
  context.stroke(crowns)
  context.restore()
}

/**
 * A village as its buildings. Every roof in one village shares an angle,
 * because a hamlet grows along its street and a scatter of randomly turned
 * blocks reads as rubble.
 */
function buildings(context: CanvasRenderingContext2D, field: Field, region: Region): void {
  const village = GROUNDS.indexOf("village")
  context.save()
  context.clip(region.fill)
  context.fillStyle = "rgba(52, 38, 24, 0.88)"
  for (let cy = 0; cy < field.height; cy++) {
    for (let cx = 0; cx < field.width; cx++) {
      if (field.ground[cy * field.width + cx] !== village) continue
      // The angle is hashed off a coarse block of the Field, not off the cell,
      // so one village keeps one street.
      const angle = hash(Math.floor(cx / 16), Math.floor(cy / 16), 31) * Math.PI - Math.PI / 2
      for (let b = 0; b < 3; b++) {
        const x = (cx + hash(cx, cy, b * 7 + 41)) * CELL_PX
        const y = (cy + hash(cx, cy, b * 7 + 42)) * CELL_PX
        const w = CELL_PX * (0.28 + hash(cx, cy, b * 7 + 43) * 0.2)
        const h = w * (0.55 + hash(cx, cy, b * 7 + 44) * 0.5)
        context.save()
        context.translate(x, y)
        context.rotate(angle + (hash(cx, cy, b * 7 + 45) - 0.5) * 0.25)
        context.fillRect(-w / 2, -h / 2, w, h)
        context.restore()
      }
    }
  }
  context.restore()
}

/** Marsh: the standard rows of broken water lines, with a tuft over them. */
function reeds(context: CanvasRenderingContext2D, field: Field, region: Region): void {
  const marsh = GROUNDS.indexOf("marsh")
  context.save()
  context.clip(region.fill)
  context.strokeStyle = "rgba(44, 68, 80, 0.8)"
  context.lineWidth = 1.15
  context.lineCap = "round"
  const reed = new Path2D()
  for (let cy = 0; cy < field.height; cy++) {
    for (let cx = 0; cx < field.width; cx++) {
      if (field.ground[cy * field.width + cx] !== marsh) continue
      // Two courses to a cell rather than one. The Redone is a single cell wide
      // for most of its length, so one dash per cell is one dash per sixteen
      // metres of watercourse — which reads as a dotted line somebody drew by
      // accident rather than as standing water.
      for (let row = 0; row < 2; row++) {
        const y = (cy + 0.28 + row * 0.44) * CELL_PX
        const x = (cx + hash(cx, cy, 51 + row) * 0.45) * CELL_PX
        reed.moveTo(x, y)
        reed.lineTo(x + CELL_PX * 0.52, y)
        if (hash(cx, cy, 53 + row) > 0.55) {
          const tx = x + CELL_PX * 0.26
          reed.moveTo(tx, y - CELL_PX * 0.05)
          reed.lineTo(tx, y - CELL_PX * 0.3)
        }
      }
    }
  }
  context.stroke(reed)
  context.restore()
}

/**
 * Bridges, at the Crossings that carry a road over water.
 *
 * Drawn rather than imported. A bridge sprite has one length, one width and one
 * bearing; the Crossings on this campaign run from a five-cell ford to the
 * fifty-four-cell Osteria defile, and only some of them are over water at all —
 * a defile through a gorge is a Crossing for the same reason and wants no
 * parapets.
 *
 * **The road decides the bearing and the water decides the span.** The first
 * cut took both from the Crossing, and drew the bridge at Lodi lying square to
 * the paper across a road running off on the diagonal — because a Crossing is a
 * rectangle somebody typed into a Scenario, an axis-aligned box that says *this
 * is a way across* and nothing whatever about which way the way runs. What
 * actually crosses the river is the road. So:
 *
 * - the bearing is the principal axis of the road cells around the Crossing;
 * - the centre is where that road meets the water;
 * - the span is the water measured along that same bearing, plus an abutment
 *   at each end so the deck lands on a bank rather than in the stream;
 * - the width is a road's width, not the Crossing's, because a Crossing painted
 *   four cells deep would otherwise be drawn as a viaduct.
 *
 * All four fall out of the Ground grid, so a bridge is right on a Field nobody
 * has looked at yet.
 */
function bridges(context: CanvasRenderingContext2D, field: Field, deckTone: string): void {
  const water = GROUNDS.indexOf("water")
  const road = GROUNDS.indexOf("road")
  const seen = new Uint8Array(field.width * field.height)
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= field.width || y >= field.height ? -1 : field.ground[y * field.width + x]

  /** The long axis of a cloud of cells, and how much of it lies off that axis. */
  const axisOf = (cells: number[]) => {
    let mx = 0
    let my = 0
    for (const index of cells) {
      mx += index % field.width
      my += (index / field.width) | 0
    }
    mx /= cells.length
    my /= cells.length
    let sxx = 0
    let sxy = 0
    let syy = 0
    for (const index of cells) {
      const dx = (index % field.width) - mx
      const dy = ((index / field.width) | 0) - my
      sxx += dx * dx
      sxy += dx * dy
      syy += dy * dy
    }
    return { mx, my, angle: 0.5 * Math.atan2(2 * sxy, sxx - syy) }
  }

  for (let cy = 0; cy < field.height; cy++) {
    for (let cx = 0; cx < field.width; cx++) {
      const start = cy * field.width + cx
      if (field.crossing[start] !== 1 || seen[start]) continue

      const crossing: number[] = []
      const queue = [start]
      seen[start] = 1
      while (queue.length) {
        const index = queue.pop() as number
        crossing.push(index)
        const x = index % field.width
        const y = (index / field.width) | 0
        for (const [ox, oy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + ox
          const ny = y + oy
          if (nx < 0 || ny < 0 || nx >= field.width || ny >= field.height) continue
          const n = ny * field.width + nx
          if (field.crossing[n] !== 1 || seen[n]) continue
          seen[n] = 1
          queue.push(n)
        }
      }

      // What the Crossing is standing on, and what stands beside it. A defile
      // has road and no water; a bridge has both.
      const anchor = axisOf(crossing)
      const REACH = 5
      const roadNear: number[] = []
      const waterNear: number[] = []
      for (let y = Math.round(anchor.my) - REACH; y <= anchor.my + REACH; y++) {
        for (let x = Math.round(anchor.mx) - REACH; x <= anchor.mx + REACH; x++) {
          const ground = at(x, y)
          if (ground === road || field.crossing[y * field.width + x] === 1) {
            roadNear.push(y * field.width + x)
          } else if (ground === water) waterNear.push(y * field.width + x)
        }
      }
      // No water within a hundred metres of the tables is a dry defile, and the
      // Osteria is exactly that: fifty-four cells of road under a cliff.
      if (waterNear.length < 2 || roadNear.length < 2) continue

      // The road's own bearing, taken over a stretch long enough to have one.
      // The Crossing's is not asked for: it is a typed rectangle.
      const line = axisOf(roadNear)
      const ux = Math.cos(line.angle)
      const uy = Math.sin(line.angle)

      // The river measured along the road, from the cells the road actually
      // passes through rather than from every drop within reach — a bend in the
      // bank a hundred metres upstream is not part of this span.
      let lowest = 0
      let highest = 0
      let wet = false
      for (const index of waterNear) {
        const dx = (index % field.width) - anchor.mx
        const dy = ((index / field.width) | 0) - anchor.my
        const along = dx * ux + dy * uy
        const off = -dx * uy + dy * ux
        if (Math.abs(off) > 1.6) continue
        lowest = Math.min(lowest, along)
        highest = Math.max(highest, along)
        wet = true
      }
      if (!wet) continue

      /** Cells of masonry landed on the bank at each end. */
      const ABUTMENT = 1.4
      const half = (highest - lowest) / 2 + ABUTMENT
      const centre = (highest + lowest) / 2

      // The deck is as wide as the road it carries and a little wider, so the
      // parapets sit outside the road's own edges. Drawn narrower, the road's
      // fill spilled past them on both sides and the bridge read as a gate
      // somebody had left lying across the way.
      let carriage = 0.5
      for (const index of roadNear) {
        const dx = (index % field.width) - anchor.mx
        const dy = ((index / field.width) | 0) - anchor.my
        if (Math.abs(dx * ux + dy * uy) > 2.5) continue
        carriage = Math.max(carriage, Math.abs(-dx * uy + dy * ux))
      }
      const deck = Math.min(carriage * 2 + 1.1, 3) * CELL_PX
      const span = half * CELL_PX

      context.save()
      context.translate(
        (anchor.mx + 0.5 + ux * centre) * CELL_PX,
        (anchor.my + 0.5 + uy * centre) * CELL_PX,
      )
      context.rotate(line.angle)
      context.fillStyle = deckTone
      context.fillRect(-span, -deck / 2, span * 2, deck)
      // Cutwaters first, so the parapets are drawn over their ends and the deck
      // reads as one piece of masonry.
      const piers = Math.max(1, Math.round((span * 2) / (CELL_PX * 2.2)) - 1)
      context.strokeStyle = INK_SOFT
      context.lineWidth = 1.1
      const cutwaters = new Path2D()
      for (let p = 1; p <= piers; p++) {
        const x = -span + ((span * 2) / (piers + 1)) * p
        cutwaters.moveTo(x, -deck / 2 - CELL_PX * 0.12)
        cutwaters.lineTo(x, deck / 2 + CELL_PX * 0.12)
      }
      context.stroke(cutwaters)
      context.strokeStyle = INK
      context.lineWidth = 1.8
      const parapets = new Path2D()
      parapets.moveTo(-span, -deck / 2)
      parapets.lineTo(span, -deck / 2)
      parapets.moveTo(-span, deck / 2)
      parapets.lineTo(span, deck / 2)
      context.stroke(parapets)
      context.restore()
    }
  }
}

// ---------------------------------------------------------------------------

export function buildStaffMapCanvas(
  field: Field,
  options: StaffMapOptions = STAFF_MAP_DEFAULTS,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = field.width * CELL_PX
  canvas.height = field.height * CELL_PX
  const context = canvas.getContext("2d")
  if (!context) throw new Error("no 2d context to draw the Field on")

  // Anything grown wanders; anything surveyed does not. A road is levelled and
  // a village is built, so both keep the line the Field was painted with — but
  // a road is one cell wide, which is to say its sawtooth is as big as it is,
  // so it takes the moving average harder than anything else on the map.
  const wood = regionPath(field, "wood", { amplitude: 2.4 })
  const water = regionPath(field, "water", { amplitude: 0.9, relaxPasses: 1, inwardOnly: false })
  const marsh = regionPath(field, "marsh", { amplitude: 0.9, relaxPasses: 2, inwardOnly: false })
  const village = regionPath(field, "village", { relaxPasses: 2 })
  const road = regionPath(field, "road", { relaxPasses: 7 })
  const open = regionPath(field, "open", { relaxPasses: 2 })

  const tone = PAPERS[options.paper] ?? PAPERS.tanned
  paper(context, canvas.width, canvas.height, tone)
  relief(context, field, canvas.width, canvas.height)
  // Under the washes, so anything the enclosure overhangs is painted out by the
  // Ground that is actually there.
  // Grass, laid over the whole sheet rather than clipped to the open region.
  // Clipped, it left a rim of bare paper wherever a wood had been eroded
  // inward, and the wood came away wearing a halo. Open ground is the ground
  // everything else is painted *on*, here as in the Field's own grid.
  context.fillStyle = wash("open", GRASS[options.grass])
  context.fillRect(0, 0, canvas.width, canvas.height)
  if (ENCLOSURE[options.enclosure] > 0) hedges(context, field, open, ENCLOSURE[options.enclosure])

  // Order is the order a map is drawn in: the washes that say what the ground
  // is, then the relief under everything built, then the ink.
  region(context, marsh, wash("marsh"), null)
  region(context, wood, wash("wood"), null)
  region(context, village, wash("village"), null)

  if (HACHURES[options.hachures] > 0) hachures(context, field, HACHURES[options.hachures])

  // The Redone at Castiglione is one cell wide, and a one-cell region filled is
  // eight metres of blue at 0.7px/m — a scratch. Laying the same colour along
  // the bank as a stroke floors a watercourse at a width it can be seen at,
  // without widening the Ground the simulation routes on.
  region(context, water, wash("water"), wash("water"), CELL_PX * 0.5)
  region(context, water, null, "rgba(34, 54, 74, 0.9)", 2)
  region(context, marsh, null, INK_SOFT, 1.2)
  reeds(context, field, marsh)
  region(context, wood, null, INK_SOFT, 1.1, [CELL_PX * 0.55, CELL_PX * 0.4])
  trees(context, field, wood)
  // A road drawn as a filled strip is a road drawn as a field. Stroking the
  // region's own outline gives the two parallel lines of a chaussée for
  // nothing, because the outline of a strip *is* both its verges.
  // The road is the one Ground not washed in its own colour. A wash says what
  // the country is; a road is a thing built on it, and every survey of the
  // period draws it as a pale way between two ruled lines rather than as a
  // strip of tinted ground.
  region(context, road, "rgba(222, 210, 176, 0.85)", "rgba(66, 52, 34, 0.62)", 1.9)
  region(context, village, null, INK_SOFT, 1.1)
  buildings(context, field, village)

  bridges(context, field, lift(tone, 0.42))

  return canvas
}
