import { readFileSync } from "node:fs"
import { join } from "node:path"
import { buildScenario, type LoadedScenario } from "./build"
import type { Roster, ScenarioFile } from "@/sim/scenario"
import { decodePng } from "./png.mjs"

/**
 * C14 Scenario Loader, the half of it that needs a filesystem.
 *
 * Beside `build.ts`, which is the arithmetic both ways round, and `loader.ts`,
 * which is the same job with `fetch` and a canvas. Not in `scripts/`, which is
 * for things that are run and not for things that are imported: the server and
 * the tests both load Scenarios this way, and neither is a script.
 *
 * Load an authored Scenario off the disk, with no browser anywhere.
 *
 * The measurements DESIGN section 8 asks for are watched on Castiglione and
 * Rivoli, and until this existed there was no way to run either outside a tab:
 * every number in the design taken from a real Scenario was read off the screen
 * once and written down as prose. This is the same Field the game loads —
 * `buildScenario` is shared, so a divergence would have to be in decoding a
 * PNG rather than in reading one.
 */
export function loadScenarioFromDisk(id: string, root = "public"): LoadedScenario {
  const base = join(root, "scenarios", id)
  const file = JSON.parse(readFileSync(join(base, "scenario.json"), "utf8")) as ScenarioFile
  const ground = decodePng(readFileSync(join(base, file.field.ground)))
  const height = decodePng(readFileSync(join(base, file.field.heightmap)))
  const rosters = file.armies.map(
    (army) => JSON.parse(readFileSync(join(root, army.roster), "utf8")) as Roster,
  )
  return buildScenario(file, ground, height, rosters)
}
