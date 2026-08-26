import type { Ground } from "./types"

/** Index order is the palette order in a Field's `ground.png` (ADR-0005). */
export const GROUNDS: readonly Ground[] = ["open", "road", "wood", "village", "marsh", "water"]

/** RGB a Ground is painted as, so a Field can be drawn in any image editor. */
export const GROUND_COLOURS: Record<Ground, [number, number, number]> = {
  open: [124, 152, 92],
  road: [186, 160, 116],
  wood: [46, 82, 52],
  village: [150, 118, 96],
  marsh: [104, 126, 118],
  water: [70, 104, 148],
}

/**
 * What a Ground does to a Unit crossing it, as a multiplier on time. Infinity is
 * impassable — the only way past is a Crossing.
 */
export const GROUND_COST: Record<Ground, number> = {
  open: 1,
  road: 0.7,
  wood: 2.2,
  village: 2.5,
  marsh: 3.5,
  water: Number.POSITIVE_INFINITY,
}

/** Ground that blocks sight through it, and so grants Concealment behind it. */
export const GROUND_OPAQUE: Record<Ground, boolean> = {
  open: false,
  road: false,
  wood: true,
  village: true,
  marsh: false,
  water: false,
}
