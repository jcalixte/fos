/**
 * Paints the Castiglione Field — the everyday nominal battle DESIGN §0 names as
 * the case the design is cross-checked against: open rolling ground, all three
 * Arms manoeuvring in Formation, one Arrival, one piece of Key Ground.
 *
 * ADR-0005 wants a real Field traced by hand over a period map, and that is
 * still the better way to get one. This is generated because the morainic
 * ground south of Lake Garda has a *shape* that can be stated — hills across
 * the north falling to the plain, an isolated knoll standing out of that plain
 * where the Austrian left rested, a stream in a shallow trough between the two
 * armies — and stating it in a script is honest about the Field being a reading
 * of the ground rather than a survey of it. Repaint ground.png over a traced map
 * and delete this file: nothing else in the Scenario moves.
 *
 *   node scripts/make-castiglione-field.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { encodePng } from "../src/scenario/png.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const out = join(root, "public", "scenarios", "castiglione")

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

const ground = Array.from({ length: CELLS_X * CELLS_Y }, () => "open")
const at = (cx, cy) => ground[cy * CELLS_X + cx]
const set = (cx, cy, g) => {
  if (cx < 0 || cy < 0 || cx >= CELLS_X || cy >= CELLS_Y) return
  ground[cy * CELLS_X + cx] = g
}

/**
 * The Redone, in cells. A minor stream and not a river: it is painted marsh
 * rather than water, so it costs a battalion time to wade without funnelling
 * anybody through a Crossing. The bridge fixture exists to measure funnelling,
 * and putting a bottleneck here would test it a second time instead of testing
 * the open ground Castiglione is for.
 */
const REDONE_HEAD = 48
const redoneCell = (cy) =>
  122 - Math.round((cy - REDONE_HEAD) * 0.22) + Math.round(3 * Math.sin(cy / 11))

/** The Castiglione–Solferino–Cavriana road, along the northern hills. */
const northRoad = (cx) =>
  cx <= 150
    ? 38 + Math.round(6 * Math.sin(cx / 40))
    : 38 + Math.round(6 * Math.sin(150 / 40)) - Math.round((cx - 150) * 0.12)

/** The Castiglione–Medole–Guidizzolo road, across the plain past the knoll. */
const southRoad = (cx) => 95 + Math.round((cx / (CELLS_X - 1)) * 22)

/** Medole to Solferino: the Austrians' own lateral road, behind their line. */
const lateralRoad = (cy) => 190 - Math.round((120 - cy) * 0.41)

const blob = (ox, oy, rx, ry, g, over = ["open"]) => {
  for (let cy = oy - ry; cy <= oy + ry; cy++) {
    for (let cx = ox - rx; cx <= ox + rx; cx++) {
      if (cx < 0 || cy < 0 || cx >= CELLS_X || cy >= CELLS_Y) continue
      const d = ((cx - ox) / rx) ** 2 + ((cy - oy) / ry) ** 2
      if (d <= 1 && over.includes(at(cx, cy))) set(cx, cy, g)
    }
  }
}

// Woods first: the morainic hills carried scrub and vineyard, and the plain did
// not. They sit where they break an approach rather than where they decorate —
// the crest between the armies, the scrub the Grenzer skirmish in above
// Solferino, and cover behind each army's outer flank.
blob(32, 13, 15, 8, "wood")
blob(104, 15, 21, 10, "wood")
blob(152, 27, 14, 9, "wood")
blob(218, 20, 17, 11, "wood")
blob(221, 119, 14, 9, "wood")
blob(22, 141, 15, 8, "wood")

// The Redone, and two soft patches the plain keeps on its own.
for (let cy = REDONE_HEAD; cy < CELLS_Y; cy++) {
  const centre = redoneCell(cy)
  set(centre, cy, "marsh")
  set(centre + 1, cy, "marsh")
}
blob(96, 132, 9, 6, "marsh")
blob(133, 60, 7, 5, "marsh")

// Villages: two, and both of them are somewhere. Solferino stands on the height
// the Austrian right rests on; Medole sits on the road junction behind their
// left, which is the ground an Arrival from the south comes up onto.
blob(152, 26, 4, 3, "village", ["open", "wood"])
blob(205, 125, 5, 4, "village", ["open", "wood"])

// The roads go on last and over everything: a road is what it is because it was
// cut through the wood and culverted over the stream, and a village that has
// paved over its own road would put a bottleneck where the Field wants none.
for (let cx = 0; cx < CELLS_X; cx++) {
  for (const cy of [northRoad(cx), northRoad(cx) + 1]) set(cx, cy, "road")
  for (const cy of [southRoad(cx), southRoad(cx) + 1]) set(cx, cy, "road")
}
for (let cy = 34; cy <= 126; cy++) {
  set(lateralRoad(cy), cy, "road")
  set(lateralRoad(cy) + 1, cy, "road")
}

const groundPixels = new Uint8Array(CELLS_X * CELLS_Y * 3)
for (let i = 0; i < ground.length; i++) {
  const [r, g, b] = COLOUR[ground[i]]
  groundPixels[i * 3] = r
  groundPixels[i * 3 + 1] = g
  groundPixels[i * 3 + 2] = b
}
writeFileSync(join(out, "ground.png"), encodePng(CELLS_X, CELLS_Y, 3, groundPixels))

// Height is painted low and upsampled, for the reason the loader gives: relief
// is smooth and low-frequency, and painting it per cell gives stair-stepping and
// phantom sight-blockers.
const HX = 60
const HY = 38
const ELEVATION_MAX = 90

const bell = (t) => Math.exp(-(t ** 2))

function metresAt(u, v) {
  // The morainic amphitheatre: high ground across the north, rising eastward
  // toward Cavriana, and falling away southward into the Po plain.
  const hills = 66 * bell((v - 0.14) / 0.3) * (0.35 + 0.65 * u)
  const solferino = 20 * bell((u - 0.6) / 0.075) * bell((v - 0.2) / 0.1)
  const cavriana = 14 * bell((u - 0.86) / 0.1) * bell((v - 0.3) / 0.13)
  // Monte Medolano: an isolated knoll standing out of the open plain, which is
  // the whole of why the Austrian left was worth resting there and the whole of
  // why taking it costs time. Height reaches the simulation as routing cost and
  // as gradient, and as nothing else — Concealment is not built, so the knoll
  // does not see further than the plain around it. It is Key Ground because the
  // Scenario says so, not because the ground does.
  const medolano = 30 * bell((u - 0.62) / 0.055) * bell((v - 0.75) / 0.075)
  // A low swell behind the French left-centre: somewhere worth standing, and
  // the reason where-do-I-put-the-Headquarters is a decision at all.
  const swell = 15 * bell((u - 0.17) / 0.1) * bell((v - 0.67) / 0.13)
  // The rolls run across the Field and not along it, because the morainic
  // ridges do. An east-west swell of the same amplitude was enough to put the
  // French left higher than the Austrian right at the same latitude, which
  // inverts the one relationship this ground exists to state: the Austrians
  // hold the heights and the French come at them from below.
  const roll = 4 * Math.sin(v * 5.2 + 0.4) + 2 * Math.sin(u * 5 + 0.7)
  // The Redone lies in a shallow trough, so the marsh above sits in ground that
  // would hold a stream.
  const cy = v * (CELLS_Y - 1)
  const troughU = cy < REDONE_HEAD ? null : (redoneCell(cy) + 0.5) / (CELLS_X - 1)
  const trough = troughU === null ? 0 : -8 * bell((u - troughU) / 0.03)
  return Math.max(0, 12 + hills + solferino + cavriana + medolano + swell + roll + trough)
}

const heightPixels = new Uint8Array(HX * HY)
for (let y = 0; y < HY; y++) {
  for (let x = 0; x < HX; x++) {
    const metres = metresAt(x / (HX - 1), y / (HY - 1))
    heightPixels[y * HX + x] = Math.round((Math.min(metres, ELEVATION_MAX) / ELEVATION_MAX) * 255)
  }
}
writeFileSync(join(out, "height.png"), encodePng(HX, HY, 1, heightPixels))

/**
 * The loader's own upsample, replicated so the gradients can be measured as the
 * simulation will see them: bilinear from the quantised bytes, not from the
 * smooth function above. An accidental cliff on a Field authored as *open
 * rolling ground* is a bug and not a feature, and it would show up as a
 * battalion that silently refuses to walk somewhere.
 */
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
      elevation[cy * CELLS_X + cx] = (top * (1 - ty) + bottom * ty) * ELEVATION_MAX
    }
  }
  return elevation
}

const elevation = upsampled()
let steepest = 0
let cliffs = 0
for (let cy = 0; cy < CELLS_Y; cy++) {
  for (let cx = 0; cx < CELLS_X; cx++) {
    const here = elevation[cy * CELLS_X + cx]
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ]) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= CELLS_X || ny >= CELLS_Y) continue
      const run = Math.hypot(dx, dy) * CELL
      const slope = Math.abs(elevation[ny * CELLS_X + nx] - here) / run
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
    `${cliffs} cell steps are impassable by gradient. This Field is authored as open rolling ground; soften the relief.`,
  )
}

/**
 * Audit what the Scenario authored against the ground just painted. Positions
 * are metres in a JSON file and the terrain under them is a PNG, so nothing
 * else in the project can tell you that a battery was deployed in a marsh or
 * that a Headquarters ended up in a wood.
 *
 * Centres only. A Unit's Footprint is C3's to compute and duplicating that
 * geometry here would be a second copy of it going stale, so this reports where
 * a Unit *stands* and leaves how much of it hangs into the next field to the
 * simulation.
 */
const scenarioPath = join(out, "scenario.json")
if (!existsSync(scenarioPath)) {
  console.log("no scenario.json beside the Field yet, so nothing to audit")
} else {
  const file = JSON.parse(readFileSync(scenarioPath, "utf8"))
  const groundAt = (p) => {
    const cx = Math.floor(p.x / CELL)
    const cy = Math.floor(p.y / CELL)
    if (cx < 0 || cy < 0 || cx >= CELLS_X || cy >= CELLS_Y) return "off the Field"
    return at(cx, cy)
  }
  const metresAtPoint = (p) => {
    const cx = Math.max(0, Math.min(CELLS_X - 1, Math.floor(p.x / CELL)))
    const cy = Math.max(0, Math.min(CELLS_Y - 1, Math.floor(p.y / CELL)))
    return elevation[cy * CELLS_X + cx]
  }
  const problems = []
  const rows = []

  for (const army of file.armies) {
    const roster = JSON.parse(readFileSync(join(root, "public", army.roster), "utf8"))
    const zone = army.deploymentZone
    for (const entry of roster.entries) {
      const point = entry.position ?? entry.arrival?.entry
      const where = entry.position ? "deployed" : "walks on"
      const g = groundAt(point)
      rows.push(
        `  ${entry.id.padEnd(24)} ${where.padEnd(9)} ${g.padEnd(8)} ${metresAtPoint(point).toFixed(0).padStart(3)}m`,
      )
      if (g === "water" || g === "off the Field") {
        problems.push(`${entry.id} stands on ${g}`)
      }
      if (g === "marsh" && entry.arm === "artillery") {
        problems.push(`${entry.id} is a battery in a marsh`)
      }
      // A Unit authored outside its own zone is one the player cannot put back
      // where the Scenario had it: clampIntoZone holds Deployment inside the
      // rectangle, so the author's own position would be unreachable.
      if (entry.position && zone) {
        const [zx, zy, zw, zh] = zone
        const inside = point.x >= zx && point.x <= zx + zw && point.y >= zy && point.y <= zy + zh
        if (!inside) problems.push(`${entry.id} is deployed outside ${army.id}'s own zone`)
      }
    }
    const hq = army.headquarters
    rows.push(
      `  ${(army.id + " headquarters").padEnd(24)} ${"stands".padEnd(9)} ${groundAt(hq).padEnd(8)} ${metresAtPoint(hq).toFixed(0).padStart(3)}m`,
    )
    if (groundAt(hq) === "water") problems.push(`${army.id}'s Headquarters is in the river`)
  }
  for (const piece of file.keyGround) {
    rows.push(
      `  ${piece.name.padEnd(24)} ${"key".padEnd(9)} ${groundAt(piece.position).padEnd(8)} ${metresAtPoint(piece.position).toFixed(0).padStart(3)}m`,
    )
  }

  // A Plan names Units by id, and an id that matches nothing is the one
  // authoring mistake with no symptom at all: the line simply never fires, and
  // the army it belonged to quietly does less than it was written to do.
  const known = new Map()
  for (const army of file.armies) {
    const roster = JSON.parse(readFileSync(join(root, "public", army.roster), "utf8"))
    for (const entry of roster.entries) known.set(entry.id, entry)
  }
  // The Formation names each Arm has, mirroring SPECS in src/sim/formation.ts.
  // Only the names: the geometry stays C3's, and a second copy of it here would
  // go stale. Ordering cavalry into a column it does not have throws the first
  // time the Unit needs its own shape, which is loud but late.
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
  const planned = { french: 0, austrian: 0 }
  for (const line of file.plan) {
    const entry = known.get(line.unitId)
    if (!entry) {
      problems.push(`the Plan names "${line.unitId}" at ${line.at}s, and no Roster has it`)
      continue
    }
    for (const army of file.armies) {
      const roster = JSON.parse(readFileSync(join(root, "public", army.roster), "utf8"))
      if (roster.entries.some((e) => e.id === line.unitId)) planned[army.id] += 1
    }
    if (line.body.kind === "move")
      check(entry, line.body.arrivalFormation, `the Plan at ${line.at}s`)
    if (line.at > file.clock) {
      problems.push(`the Plan fires for ${line.unitId} at ${line.at}s, past a ${file.clock}s clock`)
    }
  }

  console.log(`\nwhat the Scenario put on it:\n${rows.join("\n")}`)
  console.log(
    `\nPlan: ${Object.entries(planned)
      .map(([id, n]) => `${n} Orders for the ${id}`)
      .join(", ")} — each half fires only when the player has taken the other`,
  )
  if (problems.length > 0) {
    throw new Error(`\n  ${problems.join("\n  ")}`)
  }
  console.log("\nnothing is standing anywhere it cannot stand")
}
