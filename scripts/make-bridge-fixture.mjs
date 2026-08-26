/**
 * Paints the bridge-march fixture — the Field DESIGN section 8 names as where
 * the courier-delay target is watched.
 *
 * A real Field is painted in Aseprite or GIMP over a traced historical map
 * (ADR-0005). This one is generated because it is a *fixture*: it exists to
 * exercise one mechanic, and a script says what it is testing in a way a PNG
 * cannot. Castiglione and Rivoli get painted by hand.
 *
 *   node scripts/make-bridge-fixture.mjs
 */
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { encodePng } from "./png.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, "..", "public", "scenarios", "bridge-march")

const CELLS_X = 200
const CELLS_Y = 120
const CELL = 8

// Must match GROUND_COLOURS in src/sim/ground.ts.
const COLOUR = {
  open: [124, 152, 92],
  road: [186, 160, 116],
  wood: [46, 82, 52],
  village: [150, 118, 96],
  marsh: [104, 126, 118],
  water: [70, 104, 148],
}

const ground = Array.from({ length: CELLS_X * CELLS_Y }, () => "open")
const set = (cx, cy, g) => {
  if (cx < 0 || cy < 0 || cx >= CELLS_X || cy >= CELLS_Y) return
  ground[cy * CELLS_X + cx] = g
}

/** The river meanders, so the bridge is not simply the shortest way across. */
const riverCentre = (cy) => 100 + Math.round(7 * Math.sin(cy / 17) + 3 * Math.sin(cy / 6))

const BRIDGE_ROW = 74

for (let cy = 0; cy < CELLS_Y; cy++) {
  const centre = riverCentre(cy)
  for (let d = -2; d <= 2; d++) set(centre + d, cy, "water")
  set(centre - 3, cy, "marsh")
  set(centre + 3, cy, "marsh")
}

// The road: west edge to the bridge, over it, then on east past the hamlet.
const roadRow = (cx) => {
  if (cx <= riverCentre(BRIDGE_ROW)) {
    const t = cx / Math.max(1, riverCentre(BRIDGE_ROW))
    return Math.round(28 + (BRIDGE_ROW - 28) * t * t)
  }
  const t = (cx - riverCentre(BRIDGE_ROW)) / (CELLS_X - riverCentre(BRIDGE_ROW))
  return Math.round(BRIDGE_ROW - 26 * t)
}
for (let cx = 0; cx < CELLS_X; cx++) {
  const cy = roadRow(cx)
  set(cx, cy, "road")
  set(cx, cy + 1, "road")
}

// The bridge itself: one cell tall, so only a march column fits on it.
const bridgeCentre = riverCentre(BRIDGE_ROW)
for (let d = -4; d <= 4; d++) set(bridgeCentre + d, BRIDGE_ROW, "road")

// A hamlet on the far bank, and woods to break up the approaches.
for (let cy = BRIDGE_ROW - 4; cy <= BRIDGE_ROW + 3; cy++) {
  for (let cx = bridgeCentre + 6; cx <= bridgeCentre + 14; cx++) {
    if ((cx + cy) % 5 !== 0) set(cx, cy, "village")
  }
}
const blob = (ox, oy, rx, ry, g) => {
  for (let cy = oy - ry; cy <= oy + ry; cy++) {
    for (let cx = ox - rx; cx <= ox + rx; cx++) {
      const d = ((cx - ox) / rx) ** 2 + ((cy - oy) / ry) ** 2
      if (d <= 1 && ground[cy * CELLS_X + cx] === "open") set(cx, cy, g)
    }
  }
}
blob(46, 34, 16, 11, "wood")
blob(30, 96, 13, 9, "wood")
blob(150, 30, 18, 12, "wood")
blob(160, 100, 14, 10, "wood")
blob(70, 100, 10, 7, "marsh")

const groundPixels = new Uint8Array(CELLS_X * CELLS_Y * 3)
for (let i = 0; i < ground.length; i++) {
  const [r, g, b] = COLOUR[ground[i]]
  groundPixels[i * 3] = r
  groundPixels[i * 3 + 1] = g
  groundPixels[i * 3 + 2] = b
}
writeFileSync(join(out, "ground.png"), encodePng(CELLS_X, CELLS_Y, 3, groundPixels))

// Height is painted low and upsampled: elevation is smooth and low-frequency,
// and hand-painting it at cell resolution gives blotchy, stair-stepped terrain.
const HX = 50
const HY = 30
const ELEVATION_MAX = 80
const heightPixels = new Uint8Array(HX * HY)
for (let y = 0; y < HY; y++) {
  for (let x = 0; x < HX; x++) {
    const u = x / (HX - 1)
    const v = y / (HY - 1)
    // A ridge along the eastern quarter, a shallow valley holding the river,
    // and a long roll across the western plain.
    const ridge = Math.max(0, (u - 0.62) / 0.38) ** 1.6 * 62
    const valley = -18 * Math.exp(-(((u - 0.5) / 0.06) ** 2))
    const roll = 9 * Math.sin(v * 3.1 + 0.6) * (1 - u)
    // A knoll behind the western approach: somewhere worth siting the
    // Headquarters, and the reason where-do-I-stand is a decision at all.
    const knoll = 26 * Math.exp(-(((u - 0.22) / 0.09) ** 2 + ((v - 0.58) / 0.16) ** 2))
    const metres = Math.max(0, 14 + ridge + valley + roll + knoll)
    heightPixels[y * HX + x] = Math.round((Math.min(metres, ELEVATION_MAX) / ELEVATION_MAX) * 255)
  }
}
writeFileSync(join(out, "height.png"), encodePng(HX, HY, 1, heightPixels))

const counts = {}
for (const g of ground) counts[g] = (counts[g] ?? 0) + 1
console.log(`ground.png ${CELLS_X}x${CELLS_Y} cells at ${CELL}m`, counts)
console.log(`height.png ${HX}x${HY}, 0-${ELEVATION_MAX}m`)
console.log(`bridge at cells ${bridgeCentre - 4}..${bridgeCentre + 4}, row ${BRIDGE_ROW}`)
