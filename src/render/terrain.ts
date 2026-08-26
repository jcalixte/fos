import { GROUND_COLOURS, GROUNDS } from "@/sim/ground"
import type { Field } from "@/sim/types"

/**
 * C9 Field Renderer.
 *
 * The Field is drawn once into a canvas and never again: Ground gives it its
 * colour, Height gives it its relief. Relief is not decoration — a ridge that
 * conceals its own reverse slope has to be visible as a ridge, or the player
 * cannot see why the battalion behind it cannot be seen.
 */

/** Pixels per cell in the terrain texture. Above the Field's own resolution so
 * the hillshade has somewhere to live, below 1px/m so it costs nothing. */
const OVERSAMPLE = 3

function shade(field: Field, cx: number, cy: number): number {
  const at = (x: number, y: number) => {
    const ix = Math.max(0, Math.min(field.width - 1, x))
    const iy = Math.max(0, Math.min(field.height - 1, y))
    return field.elevation[iy * field.width + ix]
  }
  // Lit from the north-west, the convention every map reader already knows.
  const dx = (at(cx + 1, cy) - at(cx - 1, cy)) / (2 * field.cellSize)
  const dy = (at(cx, cy + 1) - at(cx, cy - 1)) / (2 * field.cellSize)
  return Math.max(-1, Math.min(1, (dx + dy) * 2.6))
}

export function buildTerrainCanvas(field: Field): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = field.width * OVERSAMPLE
  canvas.height = field.height * OVERSAMPLE
  const context = canvas.getContext("2d")
  if (!context) throw new Error("no 2d context to draw the Field on")
  const image = context.createImageData(canvas.width, canvas.height)

  for (let cy = 0; cy < field.height; cy++) {
    for (let cx = 0; cx < field.width; cx++) {
      const index = cy * field.width + cx
      const ground = GROUNDS[field.ground[index]] ?? "open"
      const [r, g, b] = GROUND_COLOURS[ground]
      // Slope darkens the far side of a rise and lightens the near one.
      const lit = 1 - shade(field, cx, cy) * 0.42
      // Height alone lifts the high ground a little, so a ridge reads as high
      // even where it is flat on top.
      const lift = 1 + (field.elevation[index] / 90) * 0.16
      const crossing = field.crossing[index] === 1
      for (let sy = 0; sy < OVERSAMPLE; sy++) {
        for (let sx = 0; sx < OVERSAMPLE; sx++) {
          const px = (cy * OVERSAMPLE + sy) * canvas.width + cx * OVERSAMPLE + sx
          const k = lit * lift * (crossing ? 1.15 : 1)
          image.data[px * 4] = Math.max(0, Math.min(255, r * k))
          image.data[px * 4 + 1] = Math.max(0, Math.min(255, g * k))
          image.data[px * 4 + 2] = Math.max(0, Math.min(255, b * k))
          image.data[px * 4 + 3] = 255
        }
      }
    }
  }
  context.putImageData(image, 0, 0)
  return canvas
}

/** Contour lines, drawn over the terrain so relief is readable and not guessed. */
export function buildContourCanvas(field: Field, interval = 20): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = field.width * OVERSAMPLE
  canvas.height = field.height * OVERSAMPLE
  const context = canvas.getContext("2d")
  if (!context) throw new Error("no 2d context to draw contours on")
  const image = context.createImageData(canvas.width, canvas.height)
  const band = (metres: number) => Math.floor(metres / interval)
  for (let cy = 0; cy < field.height; cy++) {
    for (let cx = 0; cx < field.width; cx++) {
      const here = band(field.elevation[cy * field.width + cx])
      const right = band(field.elevation[cy * field.width + Math.min(field.width - 1, cx + 1)])
      const below = band(field.elevation[Math.min(field.height - 1, cy + 1) * field.width + cx])
      if (here === right && here === below) continue
      for (let sy = 0; sy < OVERSAMPLE; sy++) {
        for (let sx = 0; sx < OVERSAMPLE; sx++) {
          const px = (cy * OVERSAMPLE + sy) * canvas.width + cx * OVERSAMPLE + sx
          image.data[px * 4 + 3] = 34
        }
      }
    }
  }
  context.putImageData(image, 0, 0)
  return canvas
}
