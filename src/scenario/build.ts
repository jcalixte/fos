import { makeField } from "../sim/field"
import { GROUND_COLOURS, GROUNDS } from "../sim/ground"
import { assemble, type Roster, type ScenarioFile } from "../sim/scenario"
import type { Battle, Field } from "../sim/types"

/**
 * C14 Scenario Loader, the half of it that is arithmetic.
 *
 * Everything here takes decoded pixels and gives back a Battle: matching paint
 * to Ground, upsampling the Height, and handing the result to `assemble`. It
 * knows nothing about where the bytes came from, which is the whole point —
 * the browser gets them with `fetch` and `createImageBitmap`, and a headless
 * run reads them off the disk (ADR-0003 wants the simulation runnable with no
 * DOM anywhere near it, and a Scenario it can only load in a tab is not).
 *
 * The rules that could quietly rot — which paint is which Ground, how a
 * low-resolution Height becomes a Field — live here and are therefore the same
 * rules both ways round. Only the decoding differs, and decoding a PNG is the
 * one part nobody has to guess at.
 */

/** Decoded pixels, RGBA, row-major — whatever produced them. */
export interface DecodedImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** Nearest palette entry, so a Field survives being saved with a stray filter. */
function groundIndexFor(r: number, g: number, b: number): number {
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < GROUNDS.length; i++) {
    const [pr, pg, pb] = GROUND_COLOURS[GROUNDS[i]]
    const distance = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  }
  return best
}

/**
 * Height is painted low and upsampled. Elevation is smooth and low-frequency;
 * hand-painting it at cell resolution gives blotchy terrain with stair-stepping
 * and phantom sight-blockers.
 */
function upsampleElevation(source: DecodedImage, field: Field, range: [number, number]): void {
  const [low, high] = range
  const sample = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(source.width - 1, x))
    const cy = Math.max(0, Math.min(source.height - 1, y))
    return source.data[(cy * source.width + cx) * 4] / 255
  }
  for (let cy = 0; cy < field.height; cy++) {
    const v = (cy / Math.max(1, field.height - 1)) * (source.height - 1)
    const y0 = Math.floor(v)
    const ty = v - y0
    for (let cx = 0; cx < field.width; cx++) {
      const u = (cx / Math.max(1, field.width - 1)) * (source.width - 1)
      const x0 = Math.floor(u)
      const tx = u - x0
      const top = sample(x0, y0) * (1 - tx) + sample(x0 + 1, y0) * tx
      const bottom = sample(x0, y0 + 1) * (1 - tx) + sample(x0 + 1, y0 + 1) * tx
      const height = top * (1 - ty) + bottom * ty
      field.elevation[cy * field.width + cx] = low + height * (high - low)
    }
  }
}

export interface LoadedScenario {
  battle: Battle
  file: ScenarioFile
  rosters: Record<string, Roster>
}

/** Turn a Scenario's decoded parts into a Battle standing at zero on the clock. */
export function buildScenario(
  file: ScenarioFile,
  groundImage: DecodedImage,
  heightImage: DecodedImage,
  rosterFiles: Roster[],
): LoadedScenario {
  const [cellsX, cellsY] = file.field.cells
  const field = makeField(cellsX, cellsY, file.field.cellSize)

  if (groundImage.width !== cellsX || groundImage.height !== cellsY) {
    throw new Error(
      `ground.png is ${groundImage.width}x${groundImage.height} but the Scenario says ${cellsX}x${cellsY}`,
    )
  }
  for (let i = 0; i < cellsX * cellsY; i++) {
    field.ground[i] = groundIndexFor(
      groundImage.data[i * 4],
      groundImage.data[i * 4 + 1],
      groundImage.data[i * 4 + 2],
    )
  }
  upsampleElevation(heightImage, field, file.field.elevation)

  const rosters: Record<string, Roster> = {}
  file.armies.forEach((army, i) => {
    rosters[army.roster] = rosterFiles[i] as Roster
  })

  return { battle: assemble({ file, field, rosters }), file, rosters }
}
