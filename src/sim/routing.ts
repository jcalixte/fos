import { cellAt, cellCentre, cellIndex, IMPASSABLE_SLOPE, inBounds, passable } from "./field"
import { GROUND_COST, GROUNDS } from "./ground"
import type { Field, Vec2 } from "./types"

/**
 * C5 Routing. A* over cells, string-pulled down to a few waypoints.
 *
 * Units funnel to Crossings for free rather than by a rule: water costs
 * Infinity and a bridge cell does not, so the only route over a river runs
 * across the bridge. DESIGN ranks this fourteenth of fifteen components —
 * string-pull an A* and move on.
 */

const SQRT2 = Math.SQRT2

/**
 * Heuristic weight. Above 1 the Route is no longer guaranteed shortest, and A*
 * stops fanning out across half the Field to prove it was. A Unit that walks a
 * few metres further than it strictly had to is not a bug anyone can see; a
 * Route that blows the 5ms budget is one everybody feels.
 */
const HEURISTIC_WEIGHT = 1.35

/** Nearest passable cell to `p`, searched outward. Units get shoved off cliffs. */
function nearestPassable(field: Field, p: Vec2): number | null {
  const { cx, cy } = cellAt(field, p)
  const start = inBounds(field, cx, cy) ? cellIndex(field, cx, cy) : null
  if (start !== null && passable(field, start)) return start
  for (let r = 1; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const x = cx + dx
        const y = cy + dy
        if (!inBounds(field, x, y)) continue
        const i = cellIndex(field, x, y)
        if (passable(field, i)) return i
      }
    }
  }
  return null
}

/**
 * Scratch buffers, reused across calls and stamped with a generation counter so
 * a 250x250 Field costs no clearing between Routes. Nothing here is state: two
 * identical calls give identical answers, which F18 depends on.
 */
interface Scratch {
  size: number
  generation: number
  seen: Int32Array
  g: Float64Array
  f: Float64Array
  cameFrom: Int32Array
  closed: Int32Array
  enterCost: Float64Array
  cheapest: number
  costField: Field | null
  heap: Int32Array
  heapSize: number
}

let scratch: Scratch | null = null

function scratchFor(size: number): Scratch {
  if (!scratch || scratch.size !== size) {
    scratch = {
      size,
      generation: 0,
      seen: new Int32Array(size),
      g: new Float64Array(size),
      f: new Float64Array(size),
      cameFrom: new Int32Array(size),
      closed: new Int32Array(size),
      enterCost: new Float64Array(size),
      cheapest: 1,
      costField: null,
      heap: new Int32Array(size * 2),
      heapSize: 0,
    }
  }
  return scratch
}

/**
 * Cost of entering each cell, with the string lookups done once instead of
 * twenty times per expansion. Also returns the cheapest Ground on the Field,
 * which is the floor the heuristic has to respect to stay useful.
 *
 * Crossings are excluded from that floor deliberately: a Field with one bridge
 * on it would otherwise take its heuristic floor from that single road cell and
 * halve it everywhere, which costs far more than the bridge is worth.
 */
function enterCosts(field: Field, s: Scratch): number {
  if (s.costField === field) return s.cheapest
  const size = field.width * field.height
  let cheapest = Number.POSITIVE_INFINITY
  for (let i = 0; i < size; i++) {
    const ground = GROUND_COST[GROUNDS[field.ground[i]] ?? "open"]
    s.enterCost[i] = field.crossing[i] === 1 ? GROUND_COST.road : ground
    if (ground < cheapest) cheapest = ground
  }
  s.costField = field
  s.cheapest = Number.isFinite(cheapest) ? cheapest : 1
  return s.cheapest
}

/** A* from cell to cell. Returns cell indices, start first, or null. */
export function findCellPath(field: Field, from: Vec2, to: Vec2): number[] | null {
  const start = nearestPassable(field, from)
  const goal = nearestPassable(field, to)
  if (start === null || goal === null) return null
  if (start === goal) return [start]

  const width = field.width
  const size = width * field.height
  const s = scratchFor(size)
  s.generation++
  const gen = s.generation
  const cheapest = enterCosts(field, s)
  const { seen, g, f, cameFrom, closed, enterCost, heap } = s
  const elevation = field.elevation
  const orthogonal = field.cellSize
  const diagonal = field.cellSize * SQRT2

  const gx = goal % width
  const gy = (goal / width) | 0

  s.heapSize = 0
  const push = (i: number) => {
    let c = s.heapSize++
    heap[c] = i
    while (c > 0) {
      const p = (c - 1) >> 1
      if (f[heap[p]] <= f[heap[c]]) break
      const swap = heap[p]
      heap[p] = heap[c]
      heap[c] = swap
      c = p
    }
  }
  const pop = (): number => {
    const top = heap[0]
    const last = heap[--s.heapSize]
    if (s.heapSize > 0) {
      heap[0] = last
      let p = 0
      for (;;) {
        const l = p * 2 + 1
        const r = l + 1
        let m = p
        if (l < s.heapSize && f[heap[l]] < f[heap[m]]) m = l
        if (r < s.heapSize && f[heap[r]] < f[heap[m]]) m = r
        if (m === p) break
        const swap = heap[p]
        heap[p] = heap[m]
        heap[m] = swap
        p = m
      }
    }
    return top
  }

  seen[start] = gen
  closed[start] = 0
  g[start] = 0
  const sx = start % width
  const sy = (start / width) | 0
  const dx0 = Math.abs(sx - gx)
  const dy0 = Math.abs(sy - gy)
  const weight = cheapest * HEURISTIC_WEIGHT
  f[start] = (Math.max(dx0, dy0) + (SQRT2 - 1) * Math.min(dx0, dy0)) * weight
  push(start)

  let reached = false
  while (s.heapSize > 0) {
    const current = pop()
    if (current === goal) {
      reached = true
      break
    }
    if (closed[current] === gen) continue
    closed[current] = gen
    const cx = current % width
    const cy = (current / width) | 0
    const here = elevation[current]
    const gHere = g[current]
    for (let dy = -1; dy <= 1; dy++) {
      const ny = cy + dy
      if (ny < 0 || ny >= field.height) continue
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = cx + dx
        if (nx < 0 || nx >= width) continue
        const n = ny * width + nx
        if (closed[n] === gen) continue
        const base = enterCost[n]
        if (base === Number.POSITIVE_INFINITY) continue
        const isDiagonal = dx !== 0 && dy !== 0
        const run = isDiagonal ? diagonal : orthogonal
        // Impassability comes from gradient as much as from Ground: an 8m cell
        // dropping 50m to its neighbour is a cliff nobody painted (ADR-0005).
        const slope = Math.abs(elevation[n] - here) / run
        if (slope > IMPASSABLE_SLOPE && field.crossing[n] !== 1) continue
        if (isDiagonal) {
          // No cutting the corner past an impassable cell.
          if (enterCost[cy * width + nx] === Number.POSITIVE_INFINITY) continue
          if (enterCost[ny * width + cx] === Number.POSITIVE_INFINITY) continue
        }
        const tentative = gHere + base * (1 + slope * 2) * (isDiagonal ? SQRT2 : 1)
        if (seen[n] === gen && tentative >= g[n]) continue
        seen[n] = gen
        g[n] = tentative
        cameFrom[n] = current
        const hx = Math.abs(nx - gx)
        const hy = Math.abs(ny - gy)
        f[n] = tentative + (Math.max(hx, hy) + (SQRT2 - 1) * Math.min(hx, hy)) * weight
        push(n)
      }
    }
  }

  if (!reached) return null
  const path: number[] = []
  for (let i = goal; ; i = cameFrom[i]) {
    path.push(i)
    if (i === start) break
  }
  return path.reverse()
}

/**
 * True if a straight march from a to b stays passable throughout — Ground and
 * gradient both. Sampling at half a cell can miss a one-cell obstacle clipped
 * on the diagonal; at these speeds the Unit walks round it on the next tick.
 */
function lineClear(field: Field, s: Scratch, a: Vec2, b: Vec2): boolean {
  const span = Math.hypot(b.x - a.x, b.y - a.y)
  const steps = Math.ceil(span / (field.cellSize / 2))
  const width = field.width
  const height = field.height
  let previous = -1
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps
    const cx = ((a.x + (b.x - a.x) * t) / field.cellSize) | 0
    const cy = ((a.y + (b.y - a.y) * t) / field.cellSize) | 0
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) return false
    const index = cy * width + cx
    if (index === previous) continue
    if (s.enterCost[index] === Number.POSITIVE_INFINITY) return false
    if (previous !== -1 && field.crossing[index] !== 1) {
      const run =
        previous % width !== cx && ((previous / width) | 0) !== cy
          ? field.cellSize * SQRT2
          : field.cellSize
      const slope = Math.abs(field.elevation[index] - field.elevation[previous]) / run
      if (slope > IMPASSABLE_SLOPE) return false
    }
    previous = index
  }
  return true
}

/** As `lineClear`, for callers outside a Route. */
export function clearLine(field: Field, a: Vec2, b: Vec2): boolean {
  const s = scratchFor(field.width * field.height)
  enterCosts(field, s)
  return lineClear(field, s, a, b)
}

/**
 * The Route a Unit works out for itself: A*, then string-pulled so it is a few
 * waypoints rather than a cell-by-cell staircase.
 */
export function route(field: Field, from: Vec2, to: Vec2): Vec2[] {
  const cells = findCellPath(field, from, to)
  if (!cells || cells.length === 0) return []
  const points = cells.map((c) => cellCentre(field, c))
  points[points.length - 1] = to
  const s = scratchFor(field.width * field.height)
  enterCosts(field, s)

  // Find the furthest point still in a straight march from the anchor by
  // doubling out and then bisecting, rather than testing every point in turn.
  // A staircase of three hundred cells costs a handful of line tests per corner
  // instead of three hundred, and that is the difference between hitting F4's
  // 5ms and missing it.
  const pulled: Vec2[] = []
  let anchor = from
  let i = 0
  while (i < points.length) {
    let furthest = i
    let stride = 1
    while (i + stride < points.length && lineClear(field, s, anchor, points[i + stride])) {
      furthest = i + stride
      stride *= 2
    }
    let low = furthest
    let high = Math.min(i + stride, points.length - 1)
    while (low + 1 < high) {
      const mid = (low + high) >> 1
      if (lineClear(field, s, anchor, points[mid])) low = mid
      else high = mid - 1
    }
    if (high > low && lineClear(field, s, anchor, points[high])) low = high
    furthest = Math.max(furthest, low)
    pulled.push(points[furthest])
    anchor = points[furthest]
    if (furthest === points.length - 1) break
    i = furthest + 1
  }
  return pulled
}
