import { makeField } from "@/sim/field"
import { GROUND_COLOURS, GROUNDS } from "@/sim/ground"
import { assemble, type Roster, type ScenarioFile } from "@/sim/scenario"
import type { Battle, Field } from "@/sim/types"

/**
 * C14 Scenario Loader.
 *
 * A Field's two continuous layers are PNGs painted in any image editor and
 * decoded here (ADR-0005). Everything discrete lives in `scenario.json` beside
 * them, and the Rosters are standalone files the Scenario names — so adding a
 * battle is data and never code.
 */

async function decodeImage(url: string): Promise<{
  width: number
  height: number
  data: Uint8ClampedArray
}> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`)
  const bitmap = await createImageBitmap(await response.blob())
  // close() zeroes the bitmap's own width and height, so take them first.
  const width = bitmap.width
  const height = bitmap.height
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext("2d")
  if (!context) throw new Error("no 2d context to decode a Field with")
  context.drawImage(bitmap, 0, 0)
  const { data } = context.getImageData(0, 0, width, height)
  bitmap.close()
  return { width, height, data }
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
function upsampleElevation(
  source: { width: number; height: number; data: Uint8ClampedArray },
  field: Field,
  range: [number, number],
): void {
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

export async function loadScenario(directory: string): Promise<LoadedScenario> {
  const base = directory.replace(/\/$/, "")
  const response = await fetch(`${base}/scenario.json`)
  if (!response.ok) throw new Error(`${base}/scenario.json: ${response.status}`)
  const file = (await response.json()) as ScenarioFile

  const [cellsX, cellsY] = file.field.cells
  const field = makeField(cellsX, cellsY, file.field.cellSize)

  const [groundImage, heightImage, ...rosterFiles] = await Promise.all([
    decodeImage(`${base}/${file.field.ground}`),
    decodeImage(`${base}/${file.field.heightmap}`),
    ...file.armies.map(async (army) => {
      const r = await fetch(army.roster)
      if (!r.ok) throw new Error(`${army.roster}: ${r.status}`)
      return (await r.json()) as Roster
    }),
  ])

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
