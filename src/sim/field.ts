import { GROUND_COST, GROUND_OPAQUE, GROUNDS, movementCost } from "./ground"
import type { Field, Ground, Vec2 } from "./types"
import { rotate } from "./vec"

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

/**
 * How wide the way through is, in metres, measured across the direction of
 * travel rather than along it. A Crossing is a gap in something impassable and
 * the gap has a width: a bridge deck is one cell, the Osteria gorge several.
 *
 * Read off the mask rather than authored, so it holds however the Crossing was
 * painted (ADR-0005) and whichever way a Unit comes at it.
 */
export function crossingWidth(field: Field, cx: number, cy: number, heading: number): number {
  const alongX = Math.abs(Math.cos(heading)) >= Math.abs(Math.sin(heading))
  const dx = alongX ? 0 : 1
  const dy = alongX ? 1 : 0
  let cells = 1
  for (const sign of [1, -1]) {
    for (let i = 1; ; i++) {
      const nx = cx + dx * sign * i
      const ny = cy + dy * sign * i
      if (!inBounds(field, nx, ny)) break
      if (!isCrossing(field, cellIndex(field, nx, ny))) break
      cells++
    }
  }
  return cells * field.cellSize
}

export function opaqueAt(field: Field, index: number): boolean {
  const ground = GROUNDS[field.ground[index]] ?? "open"
  return GROUND_OPAQUE[ground]
}

/**
 * What one cell costs a Unit standing on it: Ground alone, no gradient, and the
 * movement share of it rather than the routing weight.
 *
 * Impassable Ground under a Unit is read as marsh rather than as Infinity — a
 * Unit that has somehow ended up in the river still has to be given a speed.
 */
function cellCost(field: Field, index: number): number {
  if (isCrossing(field, index)) return movementCost(GROUND_COST.road)
  const ground = GROUNDS[field.ground[index]] ?? "open"
  const cost = GROUND_COST[ground]
  return movementCost(Number.isFinite(cost) ? cost : GROUND_COST.marsh)
}

/**
 * Terrain reaches a Unit by averaging the cells under its Footprint — a Unit is
 * never partly in two places, it is "60% in wood".
 *
 * Sampled along the Unit's own axes, the way its slots are laid out, because a
 * battalion in line is 144m across and 4m deep. An axis-aligned box round it
 * would be 144m square and have the battalion wading through a wood seventy
 * metres off its flank.
 */
export function averageCostUnder(
  field: Field,
  centre: Vec2,
  width: number,
  depth: number,
  facing: number,
): number {
  const across = Math.max(1, Math.round(width / field.cellSize))
  const deep = Math.max(1, Math.round(depth / field.cellSize))
  let total = 0
  let n = 0
  for (let j = 0; j < deep; j++) {
    for (let i = 0; i < across; i++) {
      // Unit-local metres: +x across the Face, +y toward the rear, as slots are.
      const offset = rotate(
        {
          x: ((i + 0.5) / across - 0.5) * width,
          y: ((j + 0.5) / deep - 0.5) * depth,
        },
        facing + Math.PI / 2,
      )
      const { cx, cy } = cellAt(field, { x: centre.x + offset.x, y: centre.y + offset.y })
      if (!inBounds(field, cx, cy)) continue
      total += cellCost(field, cellIndex(field, cx, cy))
      n++
    }
  }
  return n === 0 ? 1 : total / n
}
