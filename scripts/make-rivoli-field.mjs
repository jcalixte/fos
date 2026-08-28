/**
 * Paints the Rivoli Field — the second of the two nominal battles DESIGN §0
 * cross-checks against, and the ceiling: the Field at its size limit, two
 * hundred metres of relief, impassability by gradient rather than by Ground, a
 * Crossing formed by a gorge, and several Arrivals.
 *
 * Castiglione is the everyday case and this is the hard one, so the two audits
 * differ in the one way that matters. Castiglione is authored as open rolling
 * ground and throws if any step is impassable at all. Rivoli is authored around
 * its cliffs: they are checked for being where they were put, and then every
 * Unit, every Order in the Plan and every piece of Key Ground is checked for
 * standing on the same side of them as the men who have to reach it. A Field
 * with cliffs on it is the first one where a battalion can be authored into a
 * place it can never walk out of, and that failure has no symptom on screen —
 * the Unit simply never arrives.
 *
 * ADR-0005 wants a Field traced by hand over a period map, and that is still
 * the better way to get one. This is generated for the reason Castiglione's is:
 * the ground above the Adige has a shape that can be stated — a plateau with a
 * river trench cut down its east side, one road up out of that trench, and
 * torrent gullies dividing the northern slope into lanes that cannot see one
 * another — and stating it in a script is honest about the Field being a
 * reading of the ground rather than a survey of it. Repaint ground.png over a
 * traced map and delete this file: nothing else in the Scenario moves.
 *
 *   node scripts/make-rivoli-field.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { encodePng } from "./png.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const out = join(root, "public", "scenarios", "rivoli")

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
 * Metres black and white stand for in height.png, and the reason the relief is
 * kept off the gradient limit. 250m over 256 levels is a metre a level, so two
 * neighbouring cells can differ by a metre for no reason but rounding — an
 * eighth of a slope on an 8m cell. Everything meant to be walkable is authored
 * below 0.35 so that rounding cannot push it over 0.45 and quietly wall off a
 * lane nobody painted a wall across.
 */
const ELEVATION_MAX = 250

/* ── The ground, in cells ──────────────────────────────────────────────────
 *
 * North is up. The French hold the plateau across the south; the Austrians come
 * down the slope from Monte Baldo across the north, up the Adige road along the
 * east edge, and — late, and behind — round the bottom left corner.
 */

/** The Adige itself, in its trench along the east edge. */
const RIVER_X = 232
/** The road terrace between the water and the foot of the cliff. */
const TERRACE_X = 222
/** The plateau's east face: five cells and a hundred metres of fall. */
const WALL_X = 217

/** The Osteria defile: the one road up off the terrace onto the plateau. */
const DEFILE_Y0 = 84
const DEFILE_Y1 = 87
/** Where it opens onto the plateau, and where the chapel of San Marco stands. */
const DEFILE_X = 168

/** Where the northern slope levels out into the plateau. */
const PLATEAU_Y = 62
/** Plateau height at that shoulder, and at the southern edge of the Field. */
const PLATEAU = 168
const PLATEAU_SOUTH = 140
/** The terrace, and the water. */
const TERRACE = 60
const RIVER = 18

/**
 * The two torrent gullies. They run down the slope from the top of the Field
 * and die out on the plateau's shoulder, which is what a bed incised in a steep
 * face does when the face flattens: the water spreads and stops cutting. They
 * are what divides the Austrian approach into three lanes that cannot support
 * one another until they are down on the plateau — which is Rivoli, and the
 * whole of why an army beaten in detail was beaten at all.
 */
const GULLIES = [78, 152]
const GULLY_END = 66
const GULLY_DEPTH = 54
/** The ford on the west gully, and the one place a lane can reach its neighbour. */
const FORD_Y = 36

const ground = Array.from({ length: CELLS_X * CELLS_Y }, () => "open")
const at = (cx, cy) => ground[cy * CELLS_X + cx]
const set = (cx, cy, g) => {
  if (cx < 0 || cy < 0 || cx >= CELLS_X || cy >= CELLS_Y) return
  ground[cy * CELLS_X + cx] = g
}

const smooth = (t) => {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}
const bell = (t) => Math.exp(-(t ** 2))

/** How deep the gully is cut at this row: nothing below the shoulder, and next
 * to nothing at the ford, where the bed rises and the road goes over it. */
function gullyDepth(cy) {
  if (cy > GULLY_END) return 0
  const dying = smooth((GULLY_END - cy) / 7)
  const ford = 1 - 0.9 * bell((cy - FORD_Y) / 2.6)
  return GULLY_DEPTH * dying * ford
}

/** The slope and the plateau, before the trench and the defile are cut in it. */
function slopeAt(cx, cy) {
  const northward = smooth((PLATEAU_Y - cy) / PLATEAU_Y)
  const base =
    cy <= PLATEAU_Y
      ? PLATEAU + 68 * northward
      : PLATEAU - (PLATEAU - PLATEAU_SOUTH) * ((cy - PLATEAU_Y) / (CELLS_Y - 1 - PLATEAU_Y))
  // Monte Baldo stands away to the north-west, so the high ground is higher on
  // that side. It fades out with the slope: the plateau itself is level.
  const baldo = 14 * northward * (1 - cx / (CELLS_X - 1))
  const rolls = 3 * Math.sin(cx / 17) + 2.5 * Math.sin(cy / 13 + 1.1)
  let cut = 0
  for (const axis of GULLIES) cut += gullyDepth(cy) * bell((cx - axis) / 3.1)
  return base + baldo + rolls - cut
}

/** The floor of the Osteria defile: the terrace at one end, the plateau at the
 * other, and a climb of a hundred metres in four hundred between them. */
function defileFloor(cx, cy) {
  const top = slopeAt(DEFILE_X - 1, cy)
  const t = (cx - DEFILE_X) / (TERRACE_X - 1 - DEFILE_X)
  return top + (TERRACE - top) * Math.max(0, Math.min(1, t))
}

function metresAt(cx, cy) {
  // The defile is cut through everything, the plateau's east face included: it
  // is the only ground in it, and its walls are the drop to either side.
  if (cy >= DEFILE_Y0 && cy <= DEFILE_Y1 && cx >= DEFILE_X) return defileFloor(cx, cy)
  const base = slopeAt(cx, cy)
  if (cx < WALL_X) return base
  // The Adige trench: the face falls to the terrace, the terrace runs level,
  // and the bank drops again to the water.
  if (cx < TERRACE_X) {
    const t = (cx - (WALL_X - 1)) / (TERRACE_X - (WALL_X - 1))
    return base + (TERRACE - base) * smooth(t)
  }
  if (cx < RIVER_X) return TERRACE
  return RIVER
}

const elevation = new Float64Array(CELLS_X * CELLS_Y)
for (let cy = 0; cy < CELLS_Y; cy++) {
  for (let cx = 0; cx < CELLS_X; cx++) {
    elevation[cy * CELLS_X + cx] = Math.max(0, metresAt(cx, cy))
  }
}

/* ── The Ground on top of it ─────────────────────────────────────────────── */

const blob = (ox, oy, rx, ry, g, over = ["open"]) => {
  for (let cy = oy - ry; cy <= oy + ry; cy++) {
    for (let cx = ox - rx; cx <= ox + rx; cx++) {
      if (cx < 0 || cy < 0 || cx >= CELLS_X || cy >= CELLS_Y) continue
      const d = ((cx - ox) / rx) ** 2 + ((cy - oy) / ry) ** 2
      if (d <= 1 && over.includes(at(cx, cy))) set(cx, cy, g)
    }
  }
}

/** A road, as a run of straight legs a cell or two wide. */
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

// Woods first, and then the water: the slopes above Rivoli carried scrub and
// chestnut, the plateau was under vines and mulberry, and the gully sides were
// too steep for either. They sit where they break an approach — the shoulders
// between the lanes, and the cover Lusignan's column comes round the southern
// corner under.
blob(30, 18, 16, 11, "wood")
blob(112, 20, 18, 12, "wood")
blob(196, 22, 15, 10, "wood")
blob(60, 52, 12, 8, "wood")
blob(134, 50, 11, 7, "wood")
blob(190, 55, 13, 8, "wood")
blob(18, 92, 12, 9, "wood")
blob(34, 132, 16, 11, "wood")
blob(196, 120, 13, 9, "wood")

// The Adige, and the two torrents in their gullies. The gully beds are water
// rather than a Ground that merely costs: a torrent bed under a hundred foot of
// wall is not slow going, it is the far side of the lane.
for (let cy = 0; cy < CELLS_Y; cy++) {
  for (let cx = RIVER_X; cx < CELLS_X; cx++) set(cx, cy, "water")
  if (cy <= GULLY_END) {
    // Narrowing to a single thread over the last few rows, because that is what
    // a torrent bed does as its walls fall away: the water spreads out and stops
    // being anything a battalion has to walk round.
    const half = cy > GULLY_END - 6 ? 0 : 1
    for (const axis of GULLIES) {
      for (let cx = axis - half; cx <= axis + half; cx++) set(cx, cy, "water")
    }
  }
}

// Villages: two, and both of them are somewhere. Rivoli stands in the middle of
// its own plateau, which is the ground the day is counted on; the chapel of San
// Marco sits at the head of the defile, where the road up out of the gorge comes
// out into the open — so whoever holds the chapel holds the gate.
blob(122, 102, 6, 4, "village", ["open", "wood"])
blob(165, 86, 3, 2, "village", ["open", "wood"])

// The roads go on last and over everything, for the reason a road is a road: it
// was cut through the wood, culverted over the torrent and paved through the
// village, and none of those are supposed to slow a column down again.
//
// The Adige road along the terrace, and the road up the defile off it.
roadLine([
  [225, 0],
  [225, 149],
])
roadLine([
  [221, 85],
  [DEFILE_X, 85],
])
// The chapel to Rivoli, and Rivoli south to Affi and Castelnuovo.
roadLine([
  [DEFILE_X, 86],
  [140, 96],
  [124, 102],
])
roadLine([
  [124, 104],
  [128, 149],
])
// Rivoli north to Caprino, up the centre lane — the road the Austrian centre
// comes down.
roadLine([
  [120, 100],
  [112, 66],
  [108, 0],
])
// The west lane's road, and the lateral over the ford that is the one place the
// Austrian left can reach the centre without first coming down onto the plateau.
roadLine([
  [34, 0],
  [40, 30],
  [34, FORD_Y],
])
roadLine([
  [34, FORD_Y],
  [96, FORD_Y],
  [110, 44],
])

const groundPixels = new Uint8Array(CELLS_X * CELLS_Y * 3)
for (let i = 0; i < ground.length; i++) {
  const [r, g, b] = COLOUR[ground[i]]
  groundPixels[i * 3] = r
  groundPixels[i * 3 + 1] = g
  groundPixels[i * 3 + 2] = b
}
writeFileSync(join(out, "ground.png"), encodePng(CELLS_X, CELLS_Y, 3, groundPixels))

/**
 * Height is painted at the Field's own resolution, where Castiglione's is
 * painted low and upsampled. The loader smooths a low heightmap because relief
 * is smooth and low-frequency and a hand-painted one is not — but this Field's
 * whole subject is where the ground stops being walkable, and a bilinear ramp
 * four cells wide turns a cliff into a slope a battalion strolls up. The
 * function above is smooth everywhere it is meant to be; it is sharp only at
 * the trench, the gullies and the walls of the defile, which is exactly where
 * sharpness is the point.
 */
const heightPixels = new Uint8Array(CELLS_X * CELLS_Y)
for (let i = 0; i < elevation.length; i++) {
  heightPixels[i] = Math.round((Math.min(elevation[i], ELEVATION_MAX) / ELEVATION_MAX) * 255)
}
writeFileSync(join(out, "height.png"), encodePng(CELLS_X, CELLS_Y, 1, heightPixels))

/** What the simulation will read back, rounding and all. */
const seen = new Float64Array(CELLS_X * CELLS_Y)
for (let i = 0; i < seen.length; i++) seen[i] = (heightPixels[i] / 255) * ELEVATION_MAX

const counts = {}
for (const g of ground) counts[g] = (counts[g] ?? 0) + 1
console.log(`ground.png ${CELLS_X}x${CELLS_Y} cells at ${CELL}m — ${METRES_X}x${METRES_Y}m`, counts)
console.log(`height.png ${CELLS_X}x${CELLS_Y}, 0-${ELEVATION_MAX}m`)

/* ── What the ground does, measured as the simulation will measure it ─────── */

const index = (cx, cy) => cy * CELLS_X + cx
const inField = (cx, cy) => cx >= 0 && cy >= 0 && cx < CELLS_X && cy < CELLS_Y

/**
 * Where a cliff is allowed to be. Castiglione's audit throws on any impassable
 * step because that Field is authored as open rolling ground; this one is
 * authored around three walls and has to say which three, or an accidental
 * cliff across a lane would read as terrain doing its job.
 */
const cliffBands = [
  { name: "the Adige trench", holds: (cx) => cx >= WALL_X - 1 },
  {
    name: "the walls of the Osteria defile",
    holds: (cx, cy) => cx >= DEFILE_X - 1 && cy >= DEFILE_Y0 - 1 && cy <= DEFILE_Y1 + 1,
  },
  {
    name: "the torrent gullies",
    holds: (cx, cy) => cy <= GULLY_END + 8 && GULLIES.some((axis) => Math.abs(cx - axis) <= 5),
  },
]
const authorisedCliff = (cx, cy) => cliffBands.some((band) => band.holds(cx, cy))

const slopeBetween = (a, b, run) => Math.abs(seen[b] - seen[a]) / run

let steepest = 0
let cliffs = 0
const strays = []
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
      const run = Math.hypot(dx, dy) * CELL
      const slope = slopeBetween(index(cx, cy), index(nx, ny), run)
      if (slope > steepest) steepest = slope
      if (slope <= IMPASSABLE_SLOPE) continue
      cliffs++
      if (!authorisedCliff(cx, cy) && !authorisedCliff(nx, ny)) {
        strays.push(`(${cx},${cy})-(${nx},${ny}) at ${slope.toFixed(2)}`)
      }
    }
  }
}
console.log(`steepest gradient ${steepest.toFixed(2)} — ${cliffs} steps above ${IMPASSABLE_SLOPE}`)
if (strays.length > 0) {
  throw new Error(
    `${strays.length} cell steps are impassable outside the three walls this Field authors:\n  ${strays.slice(0, 12).join("\n  ")}`,
  )
}

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
 * This is the check the cliffs make necessary. A Field with walls on it can
 * strand a battalion — authored on the wrong side of the trench, or ordered
 * to ground it cannot reach — and nothing else in the project would say so:
 * the Route comes back empty, the Unit stands still, and the army it belongs
 * to quietly does less than it was written to do.
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
const metresAtPoint = (p) => seen[cellOf(p)]

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
