import { buildScenario, type DecodedImage, type LoadedScenario } from "./build"
import type { Roster, ScenarioFile } from "@/sim/scenario"

/**
 * C14 Scenario Loader, the half of it that needs a browser.
 *
 * A Field's two continuous layers are PNGs painted in any image editor
 * (ADR-0005); here they are fetched and handed to the canvas to decode.
 * Everything the pixels then *mean* is [build.ts](./build.ts)'s, so a headless
 * run reading the same files off the disk gets the same Field rather than a
 * second reading of it.
 */

export type { LoadedScenario }

async function decodeImage(url: string): Promise<DecodedImage> {
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

export async function loadScenario(directory: string): Promise<LoadedScenario> {
  const base = directory.replace(/\/$/, "")
  const response = await fetch(`${base}/scenario.json`)
  if (!response.ok) throw new Error(`${base}/scenario.json: ${response.status}`)
  const file = (await response.json()) as ScenarioFile

  const [groundImage, heightImage, ...rosterFiles] = await Promise.all([
    decodeImage(`${base}/${file.field.ground}`),
    decodeImage(`${base}/${file.field.heightmap}`),
    ...file.armies.map(async (army) => {
      const r = await fetch(army.roster)
      if (!r.ok) throw new Error(`${army.roster}: ${r.status}`)
      return (await r.json()) as Roster
    }),
  ])

  return buildScenario(file, groundImage, heightImage, rosterFiles as Roster[])
}
