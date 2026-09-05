/**
 * Paints the Arcole Field — the third battle of the first Italian campaign, and
 * the one where the ground stops an army rather than the enemy does.
 *
 * Rivoli is impassability by gradient; this is impassability by Ground, which
 * is the other half of the same rule and had no Field of its own. Nothing here
 * is steep — the Adige flood plain is flat, and the audit below throws on any
 * gradient a battalion cannot walk up. What it cannot walk through is water:
 * two rivers, and between them a marsh in flood with sloughs standing in it.
 *
 * The tactical problem falls straight out of C3 rather than out of anything
 * authored here, because Ground reaches a Unit by averaging the cells under its
 * whole Footprint. A battalion of 700 in march column is 2.8m across and 157m
 * deep, so on the dike the whole of it is on the bank and it makes 2.00 m/s;
 * the same battalion in line is 140m across, has five-sixths of itself in the
 * marsh, and makes 0.55. The dike does not forbid a line, it merely makes one
 * crawl — and the guns in Arcole reach 900m down the length of it. That is
 * Arcole: you arrive fast and in a worm, or slowly and in a fighting line, and
 * the marsh is what makes you choose. The campi are the only ground in the fork
 * that charges a Formation nothing for being one, and the culverts are the two
 * places the choice is taken away from you altogether.
 *
 * ADR-0005 wants a Field traced by hand over a period map, and that is still
 * the better way to get one. This is generated for the reason the other two
 * are: the ground in the fork of the Adige and the Alpone has a shape that can
 * be stated — two rivers meeting, a marsh in the fork of them, three raised
 * roads across it and a village commanding the only bridge over the smaller
 * river — and stating it in a script is honest about the Field being a reading
 * of the ground rather than a survey of it. Repaint ground.png over a traced
 * map and delete this file: nothing else in the Scenario moves.
 *
 *   node scripts/make-arcole-field.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { encodePng } from "../src/scenario/png.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const out = join(root, "public", "scenarios", "arcole")

const CELLS_X = 240
const CELLS_Y = 150
const CELL = 8
const METRES_X = CELLS_X * CELL
const METRES_Y = CELLS_Y * CELL

// Must match GROUND_COLOURS in src/sim/ground.ts.
const COLOUR = {
  open: [124, 152, 92],
  road: [186, 160, 116],
  wood: [46, 82, 52],
  village: [150, 118, 96],
  marsh: [104, 126, 118],
  water: [70, 104, 148],
}

// Must match IMPASSABLE_SLOPE in src/sim/field.ts.
const IMPASSABLE_SLOPE = 0.45

/**
 * Marsh, and not open with marsh in it. The fork of the two rivers in November
 * was under water and the campi standing out of it were the exception, so the
 * Field is painted the way the ground was: a sea with islands, rather than
 * fields with puddles.
 */
const ground = Array.from({ length: CELLS_X * CELLS_Y }, () => "marsh")
const index = (cx, cy) => cy * CELLS_X + cx
const inField = (cx, cy) => cx >= 0 && cy >= 0 && cx < CELLS_X && cy < CELLS_Y
const at = (cx, cy) => ground[index(cx, cy)]
const set = (cx, cy, g) => {
  if (!inField(cx, cy)) return
  ground[index(cx, cy)] = g
}

const blob = (ox, oy, rx, ry, g, over = ["marsh"]) => {
  for (let cy = oy - ry; cy <= oy + ry; cy++) {
    for (let cx = ox - rx; cx <= ox + rx; cx++) {
      if (!inField(cx, cy)) continue
      const d = ((cx - ox) / rx) ** 2 + ((cy - oy) / ry) ** 2
      if (d <= 1 && over.includes(at(cx, cy))) set(cx, cy, g)
    }
  }
}

/** A river, as a band of a given half-width about a polyline. */
const river = (points, half) => {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4)
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps
      const ox = x0 + (x1 - x0) * t
      const oy = y0 + (y1 - y0) * t
      for (let cy = Math.floor(oy - half); cy <= Math.ceil(oy + half); cy++) {
        for (let cx = Math.floor(ox - half); cx <= Math.ceil(ox + half); cx++) {
          if (Math.hypot(cx - ox, cy - oy) <= half) set(cx, cy, "water")
        }
      }
    }
  }
}

/** A road, as a run of straight legs a cell or two wide. As Rivoli's. */
const roadLine = (points, width = 2) => {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2)
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps
      const cx = Math.round(x0 + (x1 - x0) * t)
      const cy = Math.round(y0 + (y1 - y0) * t)
      for (let w = 0; w < width; w++) {
        // Widened across whichever way the leg is going, so a road never doubles
        // its own width where two legs meet.
        if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) set(cx, cy + w, "road")
        else set(cx + w, cy, "road")
      }
    }
  }
}

/* ── The two rivers ────────────────────────────────────────────────────────
 *
 * North is up. The Adige comes down the west side and turns east across the
 * south; the Alpone comes down the east and runs into it in the south-east
 * corner. Everything between them is the fork the battle is fought in, and it
 * is open only to the north.
 */

/**
 * The Adige: the big river, and the French army's own back. It leaves by the
 * bottom edge rather than the right one, so the road up from Albaredo can run
 * the length of the east bank without fording it anywhere. A road laid across
 * water is a Crossing nobody authored and no Formation is ever held against,
 * which is the one way this Field could quietly stop meaning what it says.
 */
const ADIGE = [
  [10, 0],
  [16, 40],
  [26, 78],
  [44, 112],
  [90, 132],
  [152, 142],
  [196, 146],
  [206, 149],
]
/** The Alpone: small enough to bridge and deep enough to stop a battalion. */
const ALPONE = [
  [198, 0],
  [193, 26],
  [188, 50],
  [184, 76],
  [183, 100],
  [188, 124],
  [194, 144],
  [198, 149],
]

river(ADIGE, 4)
river(ALPONE, 2)

/* ── The three raised roads ───────────────────────────────────────────────
 *
 * The roads go on last and over everything, for the reason a road is a road: it
 * was banked up out of the marsh, culverted over the sloughs and paved through
 * the village, and none of those are supposed to slow a column down again.
 */

/** Where the two dikes fork, a few hundred metres above the Ronco bridge. */
const FORK = [48, 100]

/**
 * The Arcole dike: the fork to the bridge, north-east across the whole fork of
 * the rivers. Augereau's road, and the one the guns in the village are laid
 * along. Its middle leg is deliberately level so a culvert on it can be a
 * rectangle measured across a heading the Units actually hold.
 */
const ARCOLE_DIKE = [FORK, [74, 88], [128, 88], [158, 72], [184, 56]]
/** The Porcile dike: the fork northward along the Adige, toward Belfiore.
 * Masséna's road, and the way the Austrians come down out of the north. */
const PORCILE_DIKE = [
  [46, 98],
  [47, 70],
  [54, 40],
  [61, 6],
]
/** The Bionde track: a farm bank between the two dikes, one cell of made road
 * and no more. It is the difference between a Field with two corridors on it
 * and a Field with a choice on it — the northern way round to the bridge, for
 * an army willing to march the long side of the triangle to get out from under
 * the battery. */
const BIONDE_TRACK = [
  [52, 48],
  [98, 44],
  [140, 42],
  [170, 48],
  [184, 56],
]

/* ── What stands out of the water ────────────────────────────────────────── */

/**
 * Only the fork is flooded. Everything the two rivers cut off from it is
 * ordinary dry Veronese farmland — the far bank at Ronco, the plain south of
 * the Adige, and above all the east bank the village stands on.
 *
 * Found rather than drawn, by flooding out from a cell in the middle of the
 * fork and stopping at water. Drawn, it was a straight line at a row number,
 * which is a border no river put there and which showed on the Field as one.
 */
const flooded = new Uint8Array(CELLS_X * CELLS_Y)
{
  const seed = index(100, 80)
  const queue = [seed]
  flooded[seed] = 1
  while (queue.length > 0) {
    const current = queue.pop()
    const cx = current % CELLS_X
    const cy = (current / CELLS_X) | 0
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx
      const ny = cy + dy
      if (!inField(nx, ny)) continue
      const n = index(nx, ny)
      if (flooded[n] === 1 || ground[n] === "water") continue
      flooded[n] = 1
      queue.push(n)
    }
  }
  for (let i = 0; i < ground.length; i++) {
    if (ground[i] === "marsh" && flooded[i] === 0) ground[i] = "open"
  }
}

/**
 * A band of a given half-width about a polyline, for ground that follows a line
 * rather than sitting in a heap.
 */
const band = (points, half, g, over = ["marsh"]) => {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4)
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps
      const ox = x0 + (x1 - x0) * t
      const oy = y0 + (y1 - y0) * t
      for (let cy = Math.floor(oy - half); cy <= Math.ceil(oy + half); cy++) {
        for (let cx = Math.floor(ox - half); cx <= Math.ceil(ox + half); cx++) {
          if (!inField(cx, cy)) continue
          if (Math.hypot(cx - ox, cy - oy) <= half && over.includes(at(cx, cy))) set(cx, cy, g)
        }
      }
    }
  }
}

/**
 * The levees: the ribbon of dry ground each dike was banked up along, because
 * that is the order the two came in — the road is where it is because the
 * ground there was already the highest going, and a road across a flood plain
 * that ignored its levee would have been under water every spring.
 *
 * Sixteen metres of campo either side of the metalling, and the width is the
 * whole point. Ground reaches a Unit by averaging the cells under its whole
 * Footprint, so what a dike costs is decided by how much of the Unit fits on
 * it: a march column is 2.8m across and rides the bank end to end, while a
 * battalion of 700 in line is 140m and has five-sixths of itself in the marsh.
 * Measured on the level middle leg, that is 0.75 against 1.85 — the column
 * makes four times the pace of the line, and neither is forbidden anything.
 *
 * A wider levee reads better and destroys the Field. At six cells a line kept
 * its wings on dry ground and paid 1.09 against a column's 0.95, which is no
 * choice at all: the causeway stopped being a causeway and became a road
 * across a meadow. Forming up is what the campi are for, and they are the only
 * thing on this Field that is for it.
 */
band(ARCOLE_DIKE, 3, "open")
band(PORCILE_DIKE, 3, "open")
band(BIONDE_TRACK, 2, "open")

/**
 * The campi: three pieces of the fork standing high enough to be farmed, and
 * the only ground between the rivers a Unit can form and fight on at its own
 * pace. They are sized to hold a battalion in line with room to face — a dry
 * patch too small to deploy on is scenery and not ground — and they are sited
 * where they are worth taking: the ground the French debouch onto, the island
 * in the middle of the fork that both dikes can be reached from, and the last
 * dry going short of the Alpone, where an assault on the bridge has to form.
 */
blob(62, 94, 15, 10, "open") // the bridgehead campo
blob(116, 74, 17, 11, "open") // the campo di mezzo, between the dikes
blob(164, 64, 13, 9, "open") // the Alpone campo, under the guns
blob(84, 12, 14, 8, "open") // Belfiore's fields, at the head of the Porcile dike

/**
 * The sloughs: standing water in the backswamps, which is where a flood plain
 * keeps it — in the low ground between the levees, and not scattered over the
 * whole of it. They are what makes the marsh a place with a shape instead of a
 * flat rate for crossing it: a Unit off the roads is picking its way between
 * them, and going round one is the difference between a flank march that
 * arrives and one that is still wading when the clock stops.
 *
 * Two lie square across a dike. Those are the culverts, and they are the only
 * ground on the Field where the Formation a Unit is in decides whether it may
 * pass at all. The rest are sited clear of the Bionde track, which is a farm
 * bank one cell wide and not a bridge — a slough across it would be a gap with
 * no width rule on it, which is the one thing a Crossing must never be.
 */
const SLOUGHS = [
  [98, 88, 9, 6], // across the Arcole dike: the culvert
  [46, 83, 10, 5], // across the Porcile dike: the other one
  [90, 110, 16, 7], // the backswamp between the Arcole dike and the Adige
  [136, 104, 18, 8],
  [172, 92, 11, 6],
  [88, 62, 13, 6], // and the one between the Arcole dike and the Bionde track
  [140, 56, 12, 5],
  [96, 24, 15, 7], // the northern backswamp, above the track
  [150, 22, 13, 6],
  [122, 122, 14, 6],
]
for (const [ox, oy, rx, ry] of SLOUGHS) blob(ox, oy, rx, ry, "water", ["marsh", "open"])

/** The willow and poplar the ditches were planted with, in the few places the
 * ground carried anything taller than reed. They break the sight lines the guns
 * want down the dikes, which is the only cover in the fork worth the name. */
blob(76, 80, 8, 5, "wood", ["marsh", "open"])
blob(134, 84, 8, 5, "wood", ["marsh", "open"])
blob(160, 106, 10, 6, "wood", ["marsh", "open"])
blob(56, 34, 8, 5, "wood", ["marsh", "open"])
blob(216, 78, 11, 8, "wood", ["open"])
blob(212, 116, 9, 6, "wood", ["open"])

/** Arcole, on the east bank and hard against its own bridge. Whoever holds the
 * village holds the crossing, which is the whole of why the day is named after
 * a place of no other importance whatever. */
blob(202, 54, 9, 6, "village", ["open", "wood", "marsh"])
/** San Bonifacio's outlying houses, north up the east bank. */
blob(220, 26, 6, 4, "village", ["open", "wood"])

roadLine(ARCOLE_DIKE, 2)
roadLine(PORCILE_DIKE, 2)
roadLine(BIONDE_TRACK, 1)
/** The east bank's own road, Arcole north to San Bonifacio and Caldiero. */
roadLine(
  [
    [200, 60],
    [206, 40],
    [218, 20],
    [222, 0],
  ],
  2,
)
/** And south out of Arcole toward Albaredo, which is the road the flanking
 * column comes up in the corner nobody is watching. It keeps east of the Adige
 * the whole way down, so the corner it comes out of is on the same bank as the
 * village and not a way round the river. */
roadLine(
  [
    [206, 62],
    [214, 92],
    [224, 120],
    [232, 149],
  ],
  2,
)

const groundPixels = new Uint8Array(CELLS_X * CELLS_Y * 3)
for (let i = 0; i < ground.length; i++) {
  const [r, g, b] = COLOUR[ground[i]]
  groundPixels[i * 3] = r
  groundPixels[i * 3 + 1] = g
  groundPixels[i * 3 + 2] = b
}
writeFileSync(join(out, "ground.png"), encodePng(CELLS_X, CELLS_Y, 3, groundPixels))

/* ── The relief, such as it is ────────────────────────────────────────────
 *
 * Height is painted low and upsampled, as Castiglione's is: relief here is
 * smooth, low-frequency and very nearly absent, and painting it per cell would
 * give stair-stepping and phantom sight-blockers over ground that is flat.
 *
 * Nothing on this Field is impassable by gradient and nothing is meant to be.
 * The dikes themselves are not in the heightmap at all — a bank two metres
 * proud does not survive an upsample from a 32m grid, and it does not need to:
 * what a dike does to a Unit is Ground and Footprint, not elevation.
 */
const HX = 60
const HY = 38
const ELEVATION_MAX = 30

const bell = (t) => Math.exp(-(t ** 2))

function metresAt(u, v) {
  // The plain tilts a very little from north-west down to the confluence in the
  // south-east, which is why the water goes where it goes.
  const tilt = 16 * (1 - v) * 0.5 + 5 * (1 - u)
  // The east bank stands a few metres above the fork, and Arcole stands on the
  // highest of it. That is the whole of the relief on this Field, and it is
  // worth exactly what it looks worth: somewhere to put guns.
  const eastBank = 6 * bell((u - 0.93) / 0.09)
  const arcole = 3 * bell((u - 0.85) / 0.05) * bell((v - 0.36) / 0.07)
  // A long low swell through the middle of the fork, which is what the campi
  // are standing on.
  const campi = 3 * bell((v - 0.45) / 0.3) * (0.4 + 0.6 * (1 - u))
  const roll = 1.2 * Math.sin(u * 4.1 + 0.6) + 0.9 * Math.sin(v * 3.7 + 1.3)
  return Math.max(0, 6 + tilt + eastBank + arcole + campi + roll)
}

const heightPixels = new Uint8Array(HX * HY)
for (let y = 0; y < HY; y++) {
  for (let x = 0; x < HX; x++) {
    const metres = metresAt(x / (HX - 1), y / (HY - 1))
    heightPixels[y * HX + x] = Math.round((Math.min(metres, ELEVATION_MAX) / ELEVATION_MAX) * 255)
  }
}
writeFileSync(join(out, "height.png"), encodePng(HX, HY, 1, heightPixels))

/** The loader's own upsample, replicated so gradients can be measured as the
 * simulation will see them: bilinear from the quantised bytes. */
function upsampled() {
  const elevation = new Float64Array(CELLS_X * CELLS_Y)
  const sample = (x, y) =>
    heightPixels[Math.max(0, Math.min(HY - 1, y)) * HX + Math.max(0, Math.min(HX - 1, x))] / 255
  for (let cy = 0; cy < CELLS_Y; cy++) {
    const v = (cy / (CELLS_Y - 1)) * (HY - 1)
    const y0 = Math.floor(v)
    const ty = v - y0
    for (let cx = 0; cx < CELLS_X; cx++) {
      const u = (cx / (CELLS_X - 1)) * (HX - 1)
      const x0 = Math.floor(u)
      const tx = u - x0
      const top = sample(x0, y0) * (1 - tx) + sample(x0 + 1, y0) * tx
      const bottom = sample(x0, y0 + 1) * (1 - tx) + sample(x0 + 1, y0 + 1) * tx
      elevation[index(cx, cy)] = (top * (1 - ty) + bottom * ty) * ELEVATION_MAX
    }
  }
  return elevation
}

const elevation = upsampled()
const slopeBetween = (a, b, run) => Math.abs(elevation[b] - elevation[a]) / run

let steepest = 0
let cliffs = 0
for (let cy = 0; cy < CELLS_Y; cy++) {
  for (let cx = 0; cx < CELLS_X; cx++) {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ]) {
      const nx = cx + dx
      const ny = cy + dy
      if (!inField(nx, ny)) continue
      const slope = slopeBetween(index(cx, cy), index(nx, ny), Math.hypot(dx, dy) * CELL)
      if (slope > steepest) steepest = slope
      if (slope > IMPASSABLE_SLOPE) cliffs++
    }
  }
}

const counts = {}
for (const g of ground) counts[g] = (counts[g] ?? 0) + 1
console.log(`ground.png ${CELLS_X}x${CELLS_Y} cells at ${CELL}m — ${METRES_X}x${METRES_Y}m`, counts)
console.log(`height.png ${HX}x${HY}, 0-${ELEVATION_MAX}m`)
console.log(`steepest gradient ${steepest.toFixed(3)} (impassable above ${IMPASSABLE_SLOPE})`)
if (cliffs > 0) {
  throw new Error(
    `${cliffs} cell steps are impassable by gradient. Everything this Field stops, it stops with water; soften the relief.`,
  )
}

/* ── The Crossings this Field wants ──────────────────────────────────────── */

/**
 * A Crossing is authored in scenario.json and read back below, because the
 * Scenario owns what the Field means. But a bridge that stops a cell short of
 * the far bank is a bridge to nowhere, and a culvert whose rectangle has
 * drifted off the road it was measured on quietly stops being a gap in
 * anything. So the rectangles are *derived here from the painted ground* and
 * printed ready to paste, and the audit below then checks what the Scenario
 * actually says against them.
 */
const wanted = []

/** A bridge: the run of water across a row or a column, with a cell of dry
 * bank at each end so the Crossing lands on ground somebody can stand on. */
function bridge(name, { row, column, from, to }) {
  const cells = []
  for (let i = from; i <= to; i++) {
    const cx = row === undefined ? column : i
    const cy = row === undefined ? i : row
    cells.push([cx, cy])
  }
  const water = cells.filter(([cx, cy]) => at(cx, cy) === "water")
  if (water.length === 0) throw new Error(`the ${name} spans no water at all`)
  const lo = cells.findIndex(([cx, cy]) => at(cx, cy) === "water") - 1
  let hi = lo + 1
  while (hi + 1 < cells.length && at(...cells[hi + 1]) === "water") hi++
  hi++
  if (lo < 0 || hi >= cells.length) throw new Error(`the ${name} runs off its own bank`)
  const [x0, y0] = cells[lo]
  const [x1, y1] = cells[hi]
  const rect = [Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) + 1, Math.abs(y1 - y0) + 1]
  wanted.push({ name, cells: rect })
  return rect
}

/**
 * A culvert: the width-limited point where a dike is carried over a slough.
 * The rectangle is the road itself over that stretch, measured off the paint,
 * so it is exactly as wide as the bank is and no wider — which is the number
 * `crossingWidth` will read back and hold a Formation against.
 */
function culvert(name, { xs, ys }) {
  let x0 = CELLS_X
  let x1 = -1
  let y0 = CELLS_Y
  let y1 = -1
  for (const cy of ys) {
    for (const cx of xs) {
      if (at(cx, cy) !== "road") continue
      x0 = Math.min(x0, cx)
      x1 = Math.max(x1, cx)
      y0 = Math.min(y0, cy)
      y1 = Math.max(y1, cy)
    }
  }
  if (x1 < 0) throw new Error(`the ${name} was measured off a stretch with no road on it`)
  const rect = [x0, y0, x1 - x0 + 1, y1 - y0 + 1]
  wanted.push({ name, cells: rect })
  return rect
}

const span = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

bridge("the bridge at Ronco", { row: 100, from: 20, to: 60 })
bridge("the bridge at Arcole", { row: 56, from: 170, to: 200 })
culvert("the culvert on the Arcole dike", { xs: span(94, 103), ys: span(84, 94) })
culvert("the culvert on the Porcile dike", { xs: span(40, 54), ys: span(79, 87) })

console.log(`\nthe Crossings this Field wants, ready to paste into scenario.json:`)
console.log(
  JSON.stringify(
    wanted.map((c) => ({ name: c.name, cells: c.cells })),
    null,
    2,
  )
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n"),
)

/* ── What the Scenario put on it ─────────────────────────────────────────── */

const scenarioPath = join(out, "scenario.json")
if (!existsSync(scenarioPath)) {
  console.log("\nno scenario.json beside the Field yet, so nothing to audit")
  process.exit(0)
}
const file = JSON.parse(readFileSync(scenarioPath, "utf8"))

/** The Crossings, off the Scenario, because passability depends on them. */
const crossing = new Uint8Array(CELLS_X * CELLS_Y)
for (const c of file.crossings) {
  const [x, y, w, h] = c.cells
  for (let cy = y; cy < y + h; cy++) {
    for (let cx = x; cx < x + w; cx++) crossing[index(cx, cy)] = 1
  }
}

// Must match GROUND_COST in src/sim/ground.ts: only water is impassable.
const passableCell = (i) => crossing[i] === 1 || ground[i] !== "water"

/**
 * Every cell a Unit standing here could walk to, by the rules C5 routes with:
 * Ground or gradient stops it, a Crossing overrules both, and a diagonal may
 * not cut the corner past something impassable.
 *
 * On this Field it is the check that matters most. Everything here is decided
 * by which side of the water a body of men is on, and a battalion authored
 * across a slough from the road it was meant to march up has no symptom at all
 * — the Route comes back empty and the Unit stands there all afternoon.
 */
function reachableFrom(start) {
  const found = new Uint8Array(CELLS_X * CELLS_Y)
  if (!passableCell(start)) return found
  const queue = [start]
  found[start] = 1
  while (queue.length > 0) {
    const current = queue.pop()
    const cx = current % CELLS_X
    const cy = (current / CELLS_X) | 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = cx + dx
        const ny = cy + dy
        if (!inField(nx, ny)) continue
        const n = index(nx, ny)
        if (found[n] === 1 || !passableCell(n)) continue
        if (dx !== 0 && dy !== 0) {
          if (!passableCell(index(nx, cy)) || !passableCell(index(cx, ny))) continue
        }
        const run = dx !== 0 && dy !== 0 ? CELL * Math.SQRT2 : CELL
        if (crossing[n] !== 1 && slopeBetween(current, n, run) > IMPASSABLE_SLOPE) continue
        found[n] = 1
        queue.push(n)
      }
    }
  }
  return found
}

/** The cell a point in metres falls in, and the nearest one anybody can stand
 * on if that cell is not one — C5 shoves Units off cliffs the same way. */
function cellOf(p) {
  const cx = Math.max(0, Math.min(CELLS_X - 1, Math.floor(p.x / CELL)))
  const cy = Math.max(0, Math.min(CELLS_Y - 1, Math.floor(p.y / CELL)))
  const start = index(cx, cy)
  if (passableCell(start)) return start
  for (let r = 1; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        if (!inField(cx + dx, cy + dy)) continue
        const i = index(cx + dx, cy + dy)
        if (passableCell(i)) return i
      }
    }
  }
  return start
}

const groundAt = (p) => {
  const cx = Math.floor(p.x / CELL)
  const cy = Math.floor(p.y / CELL)
  if (!inField(cx, cy)) return "off the Field"
  return at(cx, cy)
}
const metresAtPoint = (p) => elevation[cellOf(p)]

const problems = []
const rows = []
const known = new Map()
const rosterOf = new Map()
for (const army of file.armies) {
  const roster = JSON.parse(readFileSync(join(root, "public", army.roster), "utf8"))
  for (const entry of roster.entries) {
    known.set(entry.id, entry)
    rosterOf.set(entry.id, army)
  }
}

/**
 * The Crossings the Scenario authored against the ones the ground wants. A
 * rectangle that has drifted is the failure this Field is most exposed to and
 * the one nothing else would report: the bridge still draws, the Route still
 * finds a way over it, and the width rule is simply measuring a gap that is not
 * where the water is.
 */
const authored = new Map(file.crossings.map((c) => [c.name, c.cells.join(",")]))
for (const c of wanted) {
  const said = authored.get(c.name)
  if (said === undefined) problems.push(`the Scenario has no Crossing called "${c.name}"`)
  else if (said !== c.cells.join(","))
    problems.push(
      `"${c.name}" is authored at [${said}] and the ground wants [${c.cells.join(",")}]`,
    )
  authored.delete(c.name)
}
for (const name of authored.keys()) {
  problems.push(`the Scenario authors a Crossing "${name}" the Field does not paint`)
}

// Where each Unit can get to from where it starts, so both its own arrival
// Order and every line of the Plan can be checked against it.
const reach = new Map()
for (const [id, entry] of known) {
  reach.set(id, reachableFrom(cellOf(entry.position ?? entry.arrival.entry)))
}
const canReach = (id, p, what) => {
  if (reach.get(id)[cellOf(p)] !== 1) {
    problems.push(`${what} sends ${id} to ground it cannot walk to from where it starts`)
  }
}

for (const army of file.armies) {
  const roster = JSON.parse(readFileSync(join(root, "public", army.roster), "utf8"))
  const zone = army.deploymentZone
  for (const entry of roster.entries) {
    const point = entry.position ?? entry.arrival?.entry
    const where = entry.position ? "deployed" : "walks on"
    const g = groundAt(point)
    rows.push(
      `  ${entry.id.padEnd(22)} ${where.padEnd(9)} ${g.padEnd(8)} ${metresAtPoint(point).toFixed(0).padStart(3)}m`,
    )
    if (g === "water" || g === "off the Field") problems.push(`${entry.id} stands on ${g}`)
    if (g === "marsh" && entry.arm === "artillery")
      problems.push(`${entry.id} is a battery in a marsh`)
    if (entry.position && zone) {
      const [zx, zy, zw, zh] = zone
      const inside = point.x >= zx && point.x <= zx + zw && point.y >= zy && point.y <= zy + zh
      if (!inside) problems.push(`${entry.id} is deployed outside ${army.id}'s own zone`)
    }
    const arrival = entry.arrival?.order
    if (arrival?.kind === "move") canReach(entry.id, arrival.destination, "its own arrival Order")
  }
  const hq = army.headquarters
  rows.push(
    `  ${(army.id + " headquarters").padEnd(22)} ${"stands".padEnd(9)} ${groundAt(hq).padEnd(8)} ${metresAtPoint(hq).toFixed(0).padStart(3)}m`,
  )
  if (groundAt(hq) === "water") problems.push(`${army.id}'s Headquarters is in the river`)
}

// Key Ground both armies can get onto. One that only one of them can reach is
// not contested ground, it is a gift, and F11 counts it at the end all the same.
const fromHeadquarters = file.armies.map((army) => ({
  army,
  reach: reachableFrom(cellOf(army.headquarters)),
}))
for (const piece of file.keyGround) {
  rows.push(
    `  ${piece.name.padEnd(22)} ${"key".padEnd(9)} ${groundAt(piece.position).padEnd(8)} ${metresAtPoint(piece.position).toFixed(0).padStart(3)}m`,
  )
  for (const { army, reach: r } of fromHeadquarters) {
    if (r[cellOf(piece.position)] !== 1) {
      problems.push(`no ${army.id} can walk to ${piece.name}, which the day is counted on`)
    }
  }
}

// The Formation names each Arm has, mirroring SPECS in src/sim/formation.ts.
const FORMATIONS = {
  infantry: ["line", "attack-column", "march-column", "square", "open-order"],
  cavalry: ["line", "march-column"],
  artillery: ["in-battery", "limbered"],
}
const check = (entry, formation, what) => {
  if (!FORMATIONS[entry.arm].includes(formation)) {
    problems.push(`${what} asks ${entry.id} for ${formation}, which ${entry.arm} has not got`)
  }
}
for (const [id, entry] of known) {
  check(entry, entry.formation, `${id}'s Roster`)
  const arrival = entry.arrival?.order
  if (arrival?.kind === "move") check(entry, arrival.arrivalFormation, `${id}'s arrival Order`)
}

const planned = {}
for (const army of file.armies) planned[army.id] = 0
for (const line of file.plan) {
  const entry = known.get(line.unitId)
  if (!entry) {
    problems.push(`the Plan names "${line.unitId}" at ${line.at}s, and no Roster has it`)
    continue
  }
  planned[rosterOf.get(line.unitId).id] += 1
  if (line.body.kind === "move") {
    check(entry, line.body.arrivalFormation, `the Plan at ${line.at}s`)
    canReach(line.unitId, line.body.destination, `the Plan at ${line.at}s`)
  }
  if (line.at > file.clock) {
    problems.push(`the Plan fires for ${line.unitId} at ${line.at}s, past a ${file.clock}s clock`)
  }
  // A Unit still on the road cannot be given an Order by anybody.
  if (entry.arrival && line.at < entry.arrival.at) {
    problems.push(
      `the Plan orders ${line.unitId} at ${line.at}s, before it walks on at ${entry.arrival.at}s`,
    )
  }
}

console.log(`\nwhat the Scenario put on it:\n${rows.join("\n")}`)
console.log(
  `\nPlan: ${Object.entries(planned)
    .map(([id, n]) => `${n} Orders for the ${id}`)
    .join(", ")} — each half fires only when the player has taken the other`,
)
for (const c of file.crossings) {
  const [, , w, h] = c.cells
  const along = Math.max(w, h) * CELL
  const across = Math.min(w, h) * CELL
  console.log(`Crossing "${c.name}": ${across}m of gap, ${along}m of it to walk`)
}
if (problems.length > 0) throw new Error(`\n  ${problems.join("\n  ")}`)
console.log(
  "\nnothing is standing anywhere it cannot stand, and nothing is sent anywhere it cannot go",
)
