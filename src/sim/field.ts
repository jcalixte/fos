import { GROUND_COST, GROUND_OPAQUE, GROUNDS } from "./ground"
import type { Field, Ground, Vec2 } from "./types"

/**
 * C4 Field. A grid of cells, each carrying a Ground and a Height.
 *
 * Impassability comes from Ground *or* from gradient, so a cliff is a Height
 * rather than a Ground and the Osteria gorge is a Crossing for exactly the
 * reason a bridge is (ADR-0005).
 */

/** Rise over run above which no Unit will go: about 24 degrees. */
export const IMPASSABLE_SLOPE = 0.45

export function makeField(width: number, height: number, cellSize: number): Field {
  return {
    width,
    height,
    cellSize,
    ground: new Uint8Array(width * height),
    elevation: new Float32Array(width * height),
    crossing: new Uint8Array(width * height),
  }
}

export function cellIndex(field: Field, cx: number, cy: number): number {
  return cy * field.width + cx
}

export function inBounds(field: Field, cx: number, cy: number): boolean {
  return cx >= 0 && cy >= 0 && cx < field.width && cy < field.height
}

export function cellAt(field: Field, p: Vec2): { cx: number; cy: number } {
  return {
    cx: Math.floor(p.x / field.cellSize),
    cy: Math.floor(p.y / field.cellSize),
  }
}

export function cellCentre(field: Field, index: number): Vec2 {
  const cx = index % field.width
  const cy = Math.floor(index / field.width)
  return { x: (cx + 0.5) * field.cellSize, y: (cy + 0.5) * field.cellSize }
}

export function groundAt(field: Field, p: Vec2): Ground {
  const { cx, cy } = cellAt(field, p)
  if (!inBounds(field, cx, cy)) return "open"
  return GROUNDS[field.ground[cellIndex(field, cx, cy)]] ?? "open"
}

export function elevationAt(field: Field, p: Vec2): number {
  const { cx, cy } = cellAt(field, p)
  if (!inBounds(field, cx, cy)) return 0
  return field.elevation[cellIndex(field, cx, cy)]
}

export function isCrossing(field: Field, index: number): boolean {
  return field.crossing[index] === 1
}

/** Rise over run between two neighbouring cells. */
export function slopeBetween(field: Field, from: number, to: number): number {
  const ax = from % field.width
  const ay = Math.floor(from / field.width)
  const bx = to % field.width
  const by = Math.floor(to / field.width)
  const run = Math.hypot(bx - ax, by - ay) * field.cellSize
  if (run === 0) return 0
  return Math.abs(field.elevation[to] - field.elevation[from]) / run
}

/**
 * Time multiplier for entering `to` from `from`, or Infinity where no Unit can
 * go. A Crossing is passable whatever the Ground or the gradient says.
 */
export function stepCost(field: Field, from: number, to: number): number {
  if (isCrossing(field, to)) return GROUND_COST.road
  const ground = GROUNDS[field.ground[to]] ?? "open"
  const base = GROUND_COST[ground]
  if (!Number.isFinite(base)) return Number.POSITIVE_INFINITY
  const slope = slopeBetween(field, from, to)
  if (slope > IMPASSABLE_SLOPE) return Number.POSITIVE_INFINITY
  // A gentle rise costs time long before it stops anyone.
  return base * (1 + slope * 2)
}

export function passable(field: Field, index: number): boolean {
  if (isCrossing(field, index)) return true
  const ground = GROUNDS[field.ground[index]] ?? "open"
  return Number.isFinite(GROUND_COST[ground])
}

export function opaqueAt(field: Field, index: number): boolean {
  const ground = GROUNDS[field.ground[index]] ?? "open"
  return GROUND_OPAQUE[ground]
}

/**
 * Terrain reaches a Unit by averaging the cells under its Footprint — a Unit is
 * never partly in two places, it is "60% in wood".
 */
export function averageCostUnder(field: Field, centre: Vec2, width: number, depth: number): number {
  const half = Math.max(width, depth) / 2
  const min = cellAt(field, { x: centre.x - half, y: centre.y - half })
  const max = cellAt(field, { x: centre.x + half, y: centre.y + half })
  let total = 0
  let n = 0
  for (let cy = min.cy; cy <= max.cy; cy++) {
    for (let cx = min.cx; cx <= max.cx; cx++) {
      if (!inBounds(field, cx, cy)) continue
      const i = cellIndex(field, cx, cy)
      const ground = GROUNDS[field.ground[i]] ?? "open"
      const cost = isCrossing(field, i)
        ? GROUND_COST.road
        : Number.isFinite(GROUND_COST[ground])
          ? GROUND_COST[ground]
          : GROUND_COST.marsh
      total += cost
      n++
    }
  }
  return n === 0 ? 1 : total / n
}
