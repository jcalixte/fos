/**
 * Paints the Austerlitz Field — and the first Scenario that is openly a *named
 * sub-action* rather than a battle. DESIGN T8 caps a Field at about 1920m and
 * says in as many words that Austerlitz and Leipzig therefore need naming a
 * piece of themselves or a different game. This is that piece named: the
 * Pratzen, from the Goldbach to the far side of the plateau, which is the
 * ground the whole day turned on and about a third of the ground the day was
 * fought over. Bagration and the Santon in the north, and Telnitz and the
 * frozen ponds in the south, are off the edges on purpose. They are somebody
 * else's afternoon.
 *
 * The tactical problem is the height, and it is the one thing none of the other
 * four Fields is about. Castiglione rolls, Rivoli is a mountain nobody may walk
 * off, Arcole and the fixture are both funnels, and Quatre Bras is deliberately
 * gentle. Here the ground is a bare plateau eighty metres over a stream, held
 * at dawn by an army that is walking off it: the allied left is marching south
 * across the French front to turn the French right at Sokolnitz, and every
 * battalion that leaves the crest leaves the crest emptier. Everything the
 * French do is uphill, and it works anyway, because by the time they start
 * there is almost nobody up there to do it to.
 *
 * So the Field is authored to make the crest worth walking off and expensive to
 * come back to. The plateau is bare — no wood anywhere on it, which is
 * historically right for winter fields and is also the point: what conceals a
 * Unit here is the reverse slope and nothing else. The two summits are Key
 * Ground. The Goldbach is marsh and not water, and there is no Crossing on this
 * Field at all: Arcole and the bridge fixture both measure funnelling, Quatre
 * Bras already declined to be a third reading of it, and this one has a
 * different rule to state. The one impassable thing is the head of the Satschan
 * ponds on the bottom edge, and the flood fill below proves it walls nothing in.
 *
 * Half scale, roughly: 1920x1200m of Field for about 3.8 by 2.4 kilometres of
 * Moravia. Distances are compressed and the relationships are not — the stream
 * and its three villages run down the west, the plateau fills the east, the
 * climb between them is the afternoon, and the ground falls away south toward
 * the ponds the allied left will be pushed onto off the bottom of the screen.
 * A battalion is proportionally larger here than at Quatre Bras, which is what
 * compressing a bigger battle into the same frame costs.
 *
 * ADR-0005 wants a Field traced by hand over a period map, and that is still
 * the better way to get one. Repaint ground.png over a traced map and delete
 * this file: nothing else in the Scenario moves.
 *
 *   node scripts/make-austerlitz-field.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { encodePng } from "../src/scenario/png.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const out = join(root, "public", "scenarios", "austerlitz")

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

/**
 * The Goldbach, running the length of the west. It is a brook in a shallow
 * bottom and it stopped nobody all day, so it is painted marsh: a battalion
 * crossing it loses time and no battalion is funnelled. What held the west was
 * never the water, it was the three villages standing in it.
 */
const goldbach = (cy) => 52 + Math.round(cy * 0.09) + Math.round(2.5 * Math.sin(cy / 11))

// Woods first, roads last, for the reason Castiglione's painter gives: a road
// is a road because it was cut through the wood.

/**
 * The Sokolnitz pheasantry — a walled game preserve south-east of the village,
 * and the one piece of close country on the Field. Both armies fed troops into
 * it all morning for the same reason they fed them into the Bois de Bossu:
 * because it was there and because it covered a flank.
 */
blob(88, 140, 10, 6, "wood")

// The west bank, where the French formed up before it was light: a copse above
// Girzikowitz and another down toward the Raigern road, which is the ground
// Davout's men walk on to after marching all night.
blob(16, 14, 7, 5, "wood")
blob(14, 124, 8, 5, "wood")

// The east, behind the plateau, toward Menitz and the Littawa. It keeps the
// crest bare by putting the nearest cover a long way behind it.
blob(230, 116, 9, 8, "wood")
blob(214, 142, 13, 8, "wood")

/**
 * The head of the Satschan ponds, reaching onto the bottom edge. The only
 * impassable Ground on the Field, and it is here for what it does to a retreat
 * rather than for what it does to an attack: the rest of that water is off the
 * south edge, and so is what happened on it. Everything driven down there is
 * driven into it.
 */
blob(46, 148, 13, 5, "water")
blob(46, 148, 17, 7, "marsh", ["open"])

// The brook itself, two cells of marsh wide.
for (let cy = 0; cy < CELLS_Y; cy++) {
  set(goldbach(cy), cy, "marsh")
  set(goldbach(cy) + 1, cy, "marsh")
}

// The villages. The three on the brook are the French right and centre and are
// what the allied left is marching four kilometres to take; Girzikowitz is
// behind the French line, Pratzen stands on the eastern shoulder of the plateau
// and gives it its name, and Krzenowitz is the allied rear, where the Guard
// comes on from.
blob(57, 26, 4, 3, "village", ["open", "marsh"])
blob(58, 74, 4, 3, "village", ["open", "marsh"])
blob(62, 124, 5, 4, "village", ["open", "marsh"])
blob(74, 132, 3, 2, "village", ["open", "marsh", "wood"])
blob(24, 30, 4, 3, "village", ["open"])
blob(176, 86, 5, 4, "village", ["open"])
blob(228, 52, 4, 3, "village", ["open"])

/**
 * The roads, last and over everything. Four of them, and each is somebody's
 * axis: the Brünn–Olmütz highway across the north, which is the road both
 * armies came in on; the lane down the west bank through the three villages,
 * which is the French lateral and the road Davout arrives up; and the two
 * tracks onto the plateau, from Puntowitz and from Sokolnitz, which meet at
 * Pratzen village and are the only made ground on the climb.
 *
 * Two cells wide like every other Field's, because a one-cell road that steps
 * diagonally is not connected to itself: the routing walks the four neighbours
 * and the audit floods the same four, so a diagonal chain is a lane with a gap
 * at every corner.
 */
for (let cx = 0; cx < CELLS_X; cx++) {
  const cy = 6 + Math.round(cx * 0.02)
  set(cx, cy, "road")
  set(cx, cy + 1, "road")
}
for (let cy = 0; cy < CELLS_Y; cy++) {
  const cx = goldbach(cy) - 3
  set(cx, cy, "road")
  set(cx + 1, cy, "road")
}
for (let cx = 60; cx <= 176; cx++) {
  const cy = 26 + Math.round((cx - 60) * 0.52)
  set(cx, cy, "road")
  set(cx, cy + 1, "road")
}
for (let cx = 66; cx <= 176; cx++) {
  const cy = 124 - Math.round((cx - 66) * 0.345)
  set(cx, cy, "road")
  set(cx, cy + 1, "road")
}
for (let cx = 176; cx < CELLS_X; cx++) {
  const cy = 86 - Math.round((cx - 176) * 0.5)
  set(cx, cy, "road")
  set(cx, cy + 1, "road")
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
const ELEVATION_MAX = 120

const bell = (t) => Math.exp(-(t ** 2))

function metresAt(u, v) {
  // The plateau. Everything else on this Field is a consequence of it: eighty
  // metres of bare ground filling the eastern two-thirds, falling away west to
  // the brook and east toward Austerlitz. The whole battle is the question of
  // who is standing on it at ten in the morning.
  const plateau = 86 * bell((u - 0.68) / 0.28) * bell((v - 0.52) / 0.44)
  // Stary Vinohrady, the Old Vineyards: the northern summit, and the one
  // Vandamme's division climbs.
  const vinohrady = 19 * bell((u - 0.62) / 0.1) * bell((v - 0.26) / 0.12)
  // The Pratzeberg, the southern summit, which is St-Hilaire's and which looks
  // straight down the road the allied left has just marched away along.
  const pratzeberg = 15 * bell((u - 0.66) / 0.1) * bell((v - 0.62) / 0.13)
  // The Zurlan knoll behind the French left — low, but high enough to see the
  // crest from, which is the only reason it matters and the reason the staff
  // stands on it.
  const zurlan = 24 * bell((u - 0.09) / 0.1) * bell((v - 0.17) / 0.22)
  // The bottom the brook lies in.
  const trough = -5 * bell((u - 0.25) / 0.09)
  // The ground falling away south toward Telnitz and the ponds, which are off
  // the edge and are where this ends for whoever is caught down there.
  const basin = -7 * bell((v - 1.04) / 0.17)
  const roll = 2.5 * Math.sin(u * 5.1 + 0.7) + 2 * Math.sin(v * 4.3 + 0.4)
  return Math.max(0, 8 + plateau + vinohrady + pratzeberg + zurlan + trough + basin + roll)
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
 * The climb, measured rather than asserted, because it is the only reason this
 * Field exists and a bell curve is easy to flatten by accident. Read west to
 * east along the line St-Hilaire's division actually goes up, and again along
 * Vandamme's.
 */
function profile(cy) {
  const read = []
  for (let cx = 0; cx <= 200; cx += 25) {
    read.push(`${(cx * CELL).toString().padStart(4)}m:${elevation[cy * CELLS_X + cx].toFixed(0)}`)
  }
  return read.join("  ")
}

/**
 * Nothing is walled in. The pond is the only impassable Ground on the Field and
 * there is no Crossing anywhere, so every cell a Unit could be sent to must be
 * reachable from every other by walking. Flood-fill from the Pratzeberg and
 * count what it does not reach: anything but the pond itself is a Field with a
 * pocket in it, and a pocket is an Order that silently never completes.
 */
const START = 94 * CELLS_X + 160
const walkable = ground.map((g) => g !== "water")
const seen = new Uint8Array(CELLS_X * CELLS_Y)
const queue = [START]
seen[START] = 1
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
console.log(`the climb to Stary Vinohrady   ${profile(40)}`)
console.log(`the climb to the Pratzeberg    ${profile(94)}`)
console.log(`steepest gradient ${steepest.toFixed(3)} (impassable above ${IMPASSABLE_SLOPE})`)
console.log(`walkable cells reached from the Pratzeberg: ${queue.length}, marooned: ${marooned}`)
if (cliffs > 0) {
  throw new Error(
    `${cliffs} cell steps are impassable by gradient. The Pratzen is a slope a division walked up in column; soften the relief.`,
  )
}
if (marooned > 0) {
  throw new Error(
    `${marooned} walkable cells cannot be reached from the Pratzeberg. This Field has no Crossing, so every pocket is an Order that never completes.`,
  )
}

/**
 * What the Scenario put on this Field, audited the way Quatre Bras's painter
 * audits its own: every point anything is authored at, and not only the ground
 * a Unit starts on. A Unit deployed in the pond is visible the moment the
 * battle opens; a Move whose destination is in it fires twenty minutes in, and
 * the Unit walks to the water's edge and stands there for the rest of the
 * morning looking like a Plan that changed its mind.
 *
 * The two checks this Field adds are about the height and about the Book. The
 * first is the one the Scenario needed before it was written down: **an army
 * that is not on the plateau at the start.** The whole argument here is that
 * the crest is being vacated, so a Roster authored with the French already
 * standing on it is a Field that says nothing at all. Counted rather than
 * eyeballed, and printed either way. The second is below, over the Chapters.
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

  /** The crest, in metres: high enough that standing on it is holding it. */
  const CREST = 70

  const known = new Map()
  const onTheCrest = {}
  for (const army of file.armies) {
    const roster = rosters.get(army.id)
    const zone = army.deploymentZone
    for (const entry of roster.entries) {
      known.set(entry.id, { entry, army: army.id })
      const point = entry.position ?? entry.arrival?.entry
      const where = entry.position ? "deployed" : "walks on"
      const g = groundAt(point)
      const metres = metresAtPoint(point)
      rows.push(
        `  ${entry.id.padEnd(24)} ${where.padEnd(9)} ${g.padEnd(8)} ${metres.toFixed(0).padStart(3)}m`,
      )
      if (entry.position && metres >= CREST) {
        onTheCrest[army.id] = (onTheCrest[army.id] ?? 0) + 1
      }
      if (g === "water" || g === "off the Field") problems.push(`${entry.id} stands on ${g}`)
      if (g === "marsh" && entry.arm === "artillery") {
        problems.push(`${entry.id} is a battery in the Goldbach`)
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
      const sent = entry.arrival?.order?.destination
      if (sent && groundAt(sent) === "water") {
        problems.push(`${entry.id} walks on and is sent straight into the pond`)
      }
    }
    const hq = army.headquarters
    rows.push(
      `  ${(army.id + " headquarters").padEnd(24)} ${"stands".padEnd(9)} ${groundAt(hq).padEnd(8)} ${metresAtPoint(hq).toFixed(0).padStart(3)}m`,
    )
    if (groundAt(hq) === "water") problems.push(`${army.id}'s Headquarters is in the pond`)
  }
  for (const piece of file.keyGround) {
    rows.push(
      `  ${piece.name.padEnd(24)} ${"key".padEnd(9)} ${groundAt(piece.position).padEnd(8)} ${metresAtPoint(piece.position).toFixed(0).padStart(3)}m`,
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

  /**
   * The Book's own references. A Chapter names a Unit so the reader can be
   * shown who it is about, and there are exactly two ways for that to be
   * wrong and neither of them says anything at the time: a name no Roster
   * has, and a Chapter that opens before its Unit has walked on. Both come
   * out as a Chapter about nobody, which reads as a Chapter about the wrong
   * thing.
   */
  for (const chapter of file.chapters ?? []) {
    if (chapter.at > file.clock) {
      problems.push(
        `the Book opens "${chapter.title}" at ${chapter.at}s, past a ${file.clock}s clock`,
      )
    }
    if (!chapter.unitId) continue
    const hit = known.get(chapter.unitId)
    if (!hit) {
      problems.push(
        `the Book's "${chapter.title}" is about "${chapter.unitId}", and no Roster has it`,
      )
      continue
    }
    const walksOn = hit.entry.arrival?.at
    if (walksOn !== undefined && chapter.at < walksOn) {
      problems.push(
        `the Book's "${chapter.title}" opens at ${chapter.at}s about ${chapter.unitId}, which walks on at ${walksOn}s`,
      )
    }
  }

  console.log(`\nwhat the Scenario put on it:\n${rows.join("\n")}`)
  console.log(
    `\nPlan: ${Object.entries(planned)
      .map(([id, n]) => `${n} Orders for the ${id}`)
      .join(", ")} — each half fires only when the player has taken the other`,
  )
  console.log(
    `on the crest above ${CREST}m when the clock starts: ${
      Object.entries(onTheCrest)
        .map(([id, n]) => `${n} ${id}`)
        .join(", ") || "nobody"
    }`,
  )
  if ((onTheCrest.french ?? 0) > 0) {
    problems.push(
      "the French are authored on the plateau. They spend the morning climbing it; if they start on it there is no battle here.",
    )
  }
  if (problems.length > 0) throw new Error(`\n  ${problems.join("\n  ")}`)
  console.log("\nnothing is standing, or sent, anywhere it cannot go")
}
