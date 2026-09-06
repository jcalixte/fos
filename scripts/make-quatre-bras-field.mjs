/**
 * Paints the Quatre Bras Field — the first battle outside the Italian campaign,
 * and the one the design added to stop testing cavalry-against-unformed-infantry
 * by coincidence. DESIGN §0 records that mechanic as the one the campaign
 * under-exercises; Quatre Bras is where it is the whole afternoon's argument.
 *
 * The tactical problem is the crossroads and the rye. Two roads cross north of
 * everything: the Brussels–Charleroi chaussée running the length of the Field,
 * and the Nivelles–Namur road running across it. Whoever holds the junction can
 * march to the other battle being fought thirteen kilometres east at Ligny, and
 * whoever does not, cannot. Ney comes up the chaussée from the south with more
 * men than Wellington has on the ground and fewer than Wellington will have by
 * evening, and the Field is authored so that the argument is about arriving:
 * both armies walk on up the same two roads all afternoon.
 *
 * What the ground does, it does gently. Nothing here is impassable except one
 * pond — the audit below throws on any gradient a battalion cannot walk up, and
 * on anything that has walled a village in. There is no Crossing on this Field
 * at all, which is deliberate: Arcole and the bridge fixture both measure
 * funnelling, and a third would be a third reading of the same rule. What this
 * ground has instead is the Bois de Bossu, a wood running the length of the
 * west of the chaussée that a Formation pays to be in and horse cannot work in,
 * and open rye everywhere else — which is to say, everywhere else is somewhere
 * a battalion caught in march column has nothing whatever to hide behind.
 *
 * The Field is a reading of the ground between the crossroads and Frasnes and
 * not a survey of it: about three kilometres of it by two, painted at roughly
 * two-thirds scale so that the whole afternoon fits the one screen F6 asks for.
 * Distances are compressed; the relationships are not. The crossroads is north
 * of everything, the Bossu wood covers the west of the chaussée the whole way
 * down, Gémioncourt sits in the middle of the open ground commanding the road,
 * and the pond and the hamlet at Piraumont anchor the east.
 *
 * ADR-0005 wants a Field traced by hand over a period map, and that is still
 * the better way to get one. Repaint ground.png over a traced map and delete
 * this file: nothing else in the Scenario moves.
 *
 *   node scripts/make-quatre-bras-field.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { encodePng } from "../src/scenario/png.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const out = join(root, "public", "scenarios", "quatre-bras")

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

const blob = (ox, oy, rx, ry, g, over = ["open"]) => {
  for (let cy = oy - ry; cy <= oy + ry; cy++) {
    for (let cx = ox - rx; cx <= ox + rx; cx++) {
      if (cx < 0 || cy < 0 || cx >= CELLS_X || cy >= CELLS_Y) continue
      const d = ((cx - ox) / rx) ** 2 + ((cy - oy) / ry) ** 2
      if (d <= 1 && over.includes(at(cx, cy))) set(cx, cy, g)
    }
  }
}

/** The crossroads itself, in cells. Everything on this Field is placed off it. */
const CROSS_X = 100
const CROSS_Y = 18

/**
 * The Brussels–Charleroi chaussée, running the whole length of the Field. Both
 * armies walk on up it — Wellington's from the top edge, Ney's from the bottom
 * — so it is the one piece of ground that decides how fast the afternoon
 * escalates for either of them.
 */
const chaussee = (cy) => CROSS_X + Math.round(Math.max(0, cy - CROSS_Y) * 0.09)

/** Nivelles to the west, Namur to the east: the road that makes it a crossroads. */
const lateral = (cx) =>
  cx >= CROSS_X
    ? CROSS_Y + Math.round((cx - CROSS_X) * 0.13)
    : CROSS_Y - Math.round((CROSS_X - cx) * 0.05)

// Woods first, roads last, for the reason Castiglione's painter gives: a road
// is a road because it was cut through the wood.

/**
 * The Bois de Bossu. Long, narrow, and on the west of the chaussée the whole
 * way down — which is what makes it the flank Wellington cannot ignore and Ney
 * spends the afternoon feeding battalions into. Painted as overlapping blobs
 * rather than a rectangle because a wood that ends in a straight line reads as
 * a wall, and because its southern end genuinely tapered.
 */
for (const [ox, oy, rx, ry] of [
  [80, 30, 15, 9],
  [78, 46, 16, 11],
  [76, 62, 15, 11],
  [74, 78, 13, 10],
  [72, 92, 10, 8],
]) {
  blob(ox, oy, rx, ry, "wood")
}

// The eastern woods: the Bois des Censes above Piraumont, and the Bois Delhutte
// below it, which together are why the French right has no open approach and
// why the hamlet between them is worth a Unit.
blob(214, 92, 16, 11, "wood")
blob(210, 136, 20, 13, "wood")
blob(232, 116, 10, 9, "wood")

// A copse each side of the chaussée well south, where the French form up: cover
// for a deployment and nothing else.
blob(62, 128, 11, 7, "wood")
blob(150, 142, 13, 7, "wood")

/**
 * The Étang Materne, and the stream that feeds it running west to the chaussée.
 * The pond is the only impassable thing on the Field and a march goes round it.
 * The stream is marsh and not water on purpose: it slows a battalion crossing
 * and funnels nobody, so the Field states what it is for — open ground and the
 * rye — instead of re-stating Arcole.
 */
blob(168, 112, 12, 6, "water")
blob(168, 112, 15, 8, "marsh", ["open"])
for (let cx = 104; cx < 156; cx++) {
  const cy = 104 + Math.round((cx - 104) * 0.15) + Math.round(1.5 * Math.sin(cx / 7))
  set(cx, cy, "marsh")
  set(cx, cy + 1, "marsh")
}

// The farms and hamlets. Each is somewhere: the crossroads has its own farm,
// Gémioncourt stands in the middle of the open ground east of the chaussée and
// is the reason the centre is worth anything, Piraumont holds the east between
// two woods, and the two Pierreponts anchor the west beyond the Bossu.
blob(104, 21, 4, 3, "village", ["open", "wood"])
blob(113, 96, 5, 4, "village", ["open", "wood", "marsh"])
blob(196, 126, 4, 3, "village", ["open", "wood"])
blob(46, 86, 4, 3, "village", ["open", "wood"])
blob(37, 62, 3, 2, "village", ["open", "wood"])
blob(74, 110, 3, 2, "village", ["open", "wood"])

// The roads go on last and over everything, including the pond: a chaussée that
// stopped at the water would put a bottleneck on the one Field authored to have
// none, and the road is nowhere near the pond in any case.
for (let cy = 0; cy < CELLS_Y; cy++) {
  set(chaussee(cy), cy, "road")
  set(chaussee(cy) + 1, cy, "road")
}
for (let cx = 0; cx < CELLS_X; cx++) {
  set(cx, lateral(cx), "road")
  set(cx, lateral(cx) + 1, "road")
}
// The lane from Gémioncourt east and then down to Piraumont: the only made
// ground across the middle of the Field, and the axis the French right works
// along. It passes north of the pond, which is both where it ran and the only
// place it can run — a road through the water would be a road nothing could
// walk, and the audit below says so in as many words. Two cells wide like the
// others, because a one-cell road that steps diagonally is not connected to
// itself: the routing walks the four neighbours and the audit floods the same
// four, so a diagonal chain is a lane with a gap at every corner.
for (let cx = 112; cx <= 186; cx++) {
  const cy = 96 + Math.round((cx - 112) * 0.04)
  set(cx, cy, "road")
  set(cx, cy + 1, "road")
}
for (let cy = 99; cy <= 126; cy++) {
  const cx = 186 + Math.round((cy - 99) * 0.37)
  set(cx, cy, "road")
  set(cx + 1, cy, "road")
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
const ELEVATION_MAX = 50

const bell = (t) => Math.exp(-(t ** 2))

function metresAt(u, v) {
  // The one relationship this ground exists to state: the crossroads stands on
  // the high ground, and everything the French have to do is uphill out of the
  // dip the stream lies in. Forty metres over two kilometres — this is gentle
  // country, and the audit below insists on it.
  const plateau = 30 * bell((v - 0.02) / 0.34)
  // The ground rises again toward Frasnes, so the French form up on a shelf and
  // come down off it. It is what lets Ney see the crossroads and misjudge it.
  const frasnes = 21 * bell((v - 1.02) / 0.3)
  // The trough the Gémioncourt stream and the pond sit in, running east–west.
  const trough = -9 * bell((v - 0.71) / 0.06)
  // Slightly higher ground west beyond the Bossu, toward the Pierreponts.
  const pierrepont = 9 * bell((u - 0.17) / 0.14) * bell((v - 0.5) / 0.26)
  // A swell east of Gémioncourt: somewhere for guns, and the reason the centre
  // of this Field is a decision rather than a walk.
  const swell = 8 * bell((u - 0.62) / 0.1) * bell((v - 0.6) / 0.13)
  const roll = 3 * Math.sin(v * 5.6 + 0.5) + 2 * Math.sin(u * 4.4 + 1.1)
  return Math.max(0, 8 + plateau + frasnes + trough + pierrepont + swell + roll)
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
 * smooth function above.
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
    const hereM = elevation[cy * CELLS_X + cx]
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
      const slope = Math.abs(elevation[ny * CELLS_X + nx] - hereM) / run
      if (slope > steepest) steepest = slope
      if (slope > IMPASSABLE_SLOPE) cliffs++
    }
  }
}

/**
 * Nothing is walled in. The pond is the only impassable Ground on the Field and
 * there is no Crossing anywhere, so every cell a Unit could be sent to must be
 * reachable from every other by walking. Flood-fill from the crossroads and
 * count what it does not reach: anything but the pond itself is a Field with a
 * pocket in it, and a pocket is an Order that silently never completes.
 */
const walkable = ground.map((g) => g !== "water")
const seen = new Uint8Array(CELLS_X * CELLS_Y)
const queue = [CROSS_Y * CELLS_X + CROSS_X]
seen[queue[0]] = 1
for (let head = 0; head < queue.length; head++) {
  const i = queue[head]
  const cx = i % CELLS_X
  const cy = (i - cx) / CELLS_X
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = cx + dx
    const ny = cy + dy
    if (nx < 0 || ny < 0 || nx >= CELLS_X || ny >= CELLS_Y) continue
    const j = ny * CELLS_X + nx
    if (seen[j] || !walkable[j]) continue
    seen[j] = 1
    queue.push(j)
  }
}
let marooned = 0
for (let i = 0; i < ground.length; i++) if (walkable[i] && !seen[i]) marooned++

const counts = {}
for (const g of ground) counts[g] = (counts[g] ?? 0) + 1
console.log(`ground.png ${CELLS_X}x${CELLS_Y} cells at ${CELL}m — ${METRES_X}x${METRES_Y}m`, counts)
console.log(`height.png ${HX}x${HY}, 0-${ELEVATION_MAX}m`)
console.log(`steepest gradient ${steepest.toFixed(3)} (impassable above ${IMPASSABLE_SLOPE})`)
console.log(`walkable cells reached from the crossroads: ${queue.length}, marooned: ${marooned}`)
if (cliffs > 0) {
  throw new Error(
    `${cliffs} cell steps are impassable by gradient. Quatre Bras is authored as gentle country; soften the relief.`,
  )
}
if (marooned > 0) {
  throw new Error(
    `${marooned} walkable cells cannot be reached from the crossroads. This Field has no Crossing, so every pocket is an Order that never completes.`,
  )
}

/**
 * What the Scenario put on this Field, audited the way Castiglione's painter
 * audits its own — plus the one check that painter has not got, and which this
 * Field needed twice before it was written down: **every point a Plan names,
 * and not only the ground a Unit starts on.**
 *
 * A Unit deployed in the pond is visible the moment the battle opens. A Move
 * whose destination is in the pond fires twenty minutes in, and the Unit walks
 * to the water's edge and stands there for the rest of the afternoon looking
 * like a Plan that changed its mind. There is no Crossing on this Field, so the
 * only unreachable ground on it is the water, and that makes the check cheap
 * and total: nothing authored anywhere may be standing in the Étang Materne.
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
  const rosters = new Map(
    file.armies.map((army) => [
      army.id,
      JSON.parse(readFileSync(join(root, "public", army.roster), "utf8")),
    ]),
  )

  // The Formation names each Arm has, mirroring SPECS in src/sim/formation.ts.
  // Only the names: the geometry stays C3's, and a second copy of it here would
  // go stale.
  const FORMATIONS = {
    infantry: ["line", "attack-column", "march-column", "square", "open-order"],
    cavalry: ["line", "march-column"],
    artillery: ["in-battery", "limbered"],
  }

  const known = new Map()
  for (const army of file.armies) {
    const roster = rosters.get(army.id)
    const zone = army.deploymentZone
    for (const entry of roster.entries) {
      known.set(entry.id, { entry, army: army.id })
      const point = entry.position ?? entry.arrival?.entry
      const where = entry.position ? "deployed" : "walks on"
      const g = groundAt(point)
      rows.push(
        `  ${entry.id.padEnd(22)} ${where.padEnd(9)} ${g.padEnd(8)} ${metresAtPoint(point).toFixed(0).padStart(3)}m`,
      )
      if (g === "water" || g === "off the Field") problems.push(`${entry.id} stands on ${g}`)
      if (g === "marsh" && entry.arm === "artillery") {
        problems.push(`${entry.id} is a battery in a marsh`)
      }
      if (!FORMATIONS[entry.arm].includes(entry.formation)) {
        problems.push(
          `${entry.id} is authored in ${entry.formation}, which ${entry.arm} has not got`,
        )
      }
      // A Unit authored outside its own zone is one the player cannot put back
      // where the Scenario had it: Deployment is clamped to the rectangle, so
      // the author's own position would be unreachable.
      if (entry.position && zone) {
        const [zx, zy, zw, zh] = zone
        const inside = point.x >= zx && point.x <= zx + zw && point.y >= zy && point.y <= zy + zh
        if (!inside) problems.push(`${entry.id} is deployed outside ${army.id}'s own zone`)
      }
      // The ground an Arrival is *sent* to, which is authored beside the entry
      // and is a different point from it.
      const sent = entry.arrival?.order?.destination
      if (sent && groundAt(sent) === "water") {
        problems.push(`${entry.id} walks on and is sent straight into the pond`)
      }
    }
    const hq = army.headquarters
    rows.push(
      `  ${(army.id + " headquarters").padEnd(22)} ${"stands".padEnd(9)} ${groundAt(hq).padEnd(8)} ${metresAtPoint(hq).toFixed(0).padStart(3)}m`,
    )
    if (groundAt(hq) === "water") problems.push(`${army.id}'s Headquarters is in the pond`)
  }
  for (const piece of file.keyGround) {
    rows.push(
      `  ${piece.name.padEnd(22)} ${"key".padEnd(9)} ${groundAt(piece.position).padEnd(8)} ${metresAtPoint(piece.position).toFixed(0).padStart(3)}m`,
    )
    if (groundAt(piece.position) === "water") problems.push(`${piece.name} is a piece of pond`)
  }

  const planned = {}
  for (const line of file.plan) {
    const hit = known.get(line.unitId)
    // An id that matches nothing is the one authoring mistake with no symptom:
    // the line never fires, and the army quietly does less than it was written
    // to do.
    if (!hit) {
      problems.push(`the Plan names "${line.unitId}" at ${line.at}s, and no Roster has it`)
      continue
    }
    planned[hit.army] = (planned[hit.army] ?? 0) + 1
    if (line.at > file.clock) {
      problems.push(`the Plan fires for ${line.unitId} at ${line.at}s, past a ${file.clock}s clock`)
    }
    if (line.body.kind === "move") {
      if (!FORMATIONS[hit.entry.arm].includes(line.body.arrivalFormation)) {
        problems.push(
          `the Plan at ${line.at}s asks ${line.unitId} for ${line.body.arrivalFormation}, which ${hit.entry.arm} has not got`,
        )
      }
      const g = groundAt(line.body.destination)
      if (g === "water" || g === "off the Field") {
        problems.push(`the Plan at ${line.at}s sends ${line.unitId} to ${g}`)
      }
    }
    if (line.body.kind === "form" && !FORMATIONS[hit.entry.arm].includes(line.body.formation)) {
      problems.push(
        `the Plan at ${line.at}s asks ${line.unitId} for ${line.body.formation}, which ${hit.entry.arm} has not got`,
      )
    }
    // A Charge is aimed at a Unit and not at ground, so the only thing that can
    // be wrong with one here is the name.
    if (line.body.kind === "charge" && !known.has(line.body.targetId)) {
      problems.push(`the Plan at ${line.at}s charges "${line.body.targetId}", and no Roster has it`)
    }
  }

  console.log(`\nwhat the Scenario put on it:\n${rows.join("\n")}`)
  console.log(
    `\nPlan: ${Object.entries(planned)
      .map(([id, n]) => `${n} Orders for the ${id}`)
      .join(", ")} — each half fires only when the player has taken the other`,
  )
  if (problems.length > 0) throw new Error(`\n  ${problems.join("\n  ")}`)
  console.log("\nnothing is standing, or sent, anywhere it cannot go")
}
