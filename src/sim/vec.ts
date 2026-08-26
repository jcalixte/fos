/** A point or offset on the Field, in metres. */
export interface Vec2 {
  x: number
  y: number
}

export function vec(x: number, y: number): Vec2 {
  return { x, y }
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function scale(a: Vec2, k: number): Vec2 {
  return { x: a.x * k, y: a.y * k }
}

export function length(a: Vec2): number {
  return Math.hypot(a.x, a.y)
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function normalise(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y)
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** Direction of `b` seen from `a`, in radians, 0 = +x, growing clockwise on screen. */
export function bearing(a: Vec2, b: Vec2): number {
  return Math.atan2(b.y - a.y, b.x - a.x)
}

/** The signed shortest way round from angle `a` to angle `b`, in radians. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDelta(a, b) * t
}

export function rotate(a: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c }
}
