import type { ScenarioFile } from "@/sim/scenario"

/**
 * The battles on offer.
 *
 * `index.json` lists directories and nothing else. A Scenario's name, its
 * summary and its armies are read out of its own `scenario.json`, so a battle
 * is described in exactly one place and adding one stays data: drop a folder
 * beside the others and name it here (F16).
 */

export interface CatalogueEntry {
  /** The directory under `public/scenarios`, and the name a URL knows it by. */
  id: string
  name: string
  summary: string
  /** Seconds on the Scenario clock, so the menu can say how long a day is. */
  clock: number
  armies: { id: string; name: string; colour: string }[]
}

/** Where a battle's Scenario is read from, given the name a URL knows it by. */
export function scenarioPath(id: string): string {
  return `/scenarios/${id}`
}

async function readCatalogue(): Promise<CatalogueEntry[]> {
  const response = await fetch("/scenarios/index.json")
  if (!response.ok) throw new Error(`/scenarios/index.json: ${response.status}`)
  const directories = (await response.json()) as string[]
  return await Promise.all(
    directories.map(async (id) => {
      const path = scenarioPath(id)
      const r = await fetch(`${path}/scenario.json`)
      if (!r.ok) throw new Error(`${path}/scenario.json: ${r.status}`)
      const file = (await r.json()) as ScenarioFile
      return {
        id,
        name: file.name,
        summary: file.summary,
        clock: file.clock,
        armies: file.armies.map((army) => ({
          id: army.id,
          name: army.name,
          colour: army.colour,
        })),
      }
    }),
  )
}

let reading: Promise<CatalogueEntry[]> | null = null

/**
 * The battles on offer, read once. `index.json` is authored and not generated,
 * so it cannot change under a tab that is already open; re-reading it every
 * time the menu is opened, or every time a URL has to be checked against it,
 * would cost a round trip per Scenario and buy nothing.
 */
export function loadCatalogue(): Promise<CatalogueEntry[]> {
  reading ??= readCatalogue().catch((error: unknown) => {
    // A read that failed must not be remembered as an empty shelf.
    reading = null
    throw error
  })
  return reading
}

/**
 * The last battle taken, remembered so getting back onto a Field under work is
 * one press. It is a convenience and never state the simulation reads: a
 * Scenario that has since been renamed or removed simply stops being offered.
 */
export interface LastBattle {
  /** The name a URL knows the battle by — a CatalogueEntry's `id`. */
  battle: string
  army: string
}

const REMEMBERED = "fos.last-battle"

export function rememberBattle(last: LastBattle): void {
  try {
    localStorage.setItem(REMEMBERED, JSON.stringify(last))
  } catch {
    // Private browsing refuses the write. Losing the shortcut is not an error.
  }
}

export function recallBattle(): LastBattle | null {
  try {
    const raw = localStorage.getItem(REMEMBERED)
    if (!raw) return null
    const last = JSON.parse(raw) as LastBattle
    return typeof last?.battle === "string" && typeof last?.army === "string" ? last : null
  } catch {
    return null
  }
}
