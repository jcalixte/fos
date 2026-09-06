import type { ScenarioFile } from "@/sim/scenario"

/**
 * The battles on offer, and the Campaigns they are shelved under.
 *
 * `index.json` lists directories and nothing else. A Scenario's name, its
 * summary, its armies and the Campaign it belongs to are read out of its own
 * `scenario.json`, so a battle is described in exactly one place and adding one
 * stays data: drop a folder beside the others and name it here (F16).
 *
 * `campaigns.json` is the other half of the shelf, and it holds only what a
 * Campaign *is* — a name, its years, a line on the war. It never lists its
 * battles, because which shelf a battle belongs on is the battle's own answer
 * to give, and a membership written down in two places is a membership that can
 * disagree with itself.
 */

export interface CatalogueEntry {
  /** The directory under `public/scenarios`, and the name a URL knows it by. */
  id: string
  name: string
  /** The Campaign it is shelved under — a Campaign's `id`. */
  campaign: string
  summary: string
  /** Seconds on the Scenario clock, so the menu can say how long a day is. */
  clock: number
  armies: { id: string; name: string; colour: string }[]
}

/** A Campaign as `campaigns.json` authors it: the shelf, and not what is on it. */
export interface Campaign {
  id: string
  name: string
  /** "1796–97". Absent where a Campaign is not a piece of history. */
  years?: string
  summary: string
}

/** A Campaign with the battles that named it, in the order `index.json` gives. */
export interface Shelf extends Campaign {
  battles: CatalogueEntry[]
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
        campaign: file.campaign,
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

async function readCampaigns(): Promise<Campaign[]> {
  const response = await fetch("/campaigns.json")
  if (!response.ok) throw new Error(`/campaigns.json: ${response.status}`)
  return (await response.json()) as Campaign[]
}

/**
 * Put each battle on the shelf it named. Campaigns come out in the order
 * `campaigns.json` authors them and their battles in the order `index.json`
 * does, so both orderings are somebody's decision rather than a sort.
 */
export function shelve(campaigns: Campaign[], battles: CatalogueEntry[]): Shelf[] {
  const known = new Set(campaigns.map((campaign) => campaign.id))
  for (const battle of battles) {
    // Thrown rather than quietly dropped. A battle whose Campaign does not
    // exist would otherwise vanish from the list it is named in, and the two
    // files where the mistake lives are the only place it can be seen at all.
    if (!known.has(battle.campaign)) {
      throw new Error(
        `${battle.id} is shelved under "${battle.campaign}", which campaigns.json does not name`,
      )
    }
  }
  return (
    campaigns
      .map((campaign) => ({
        ...campaign,
        battles: battles.filter((battle) => battle.campaign === campaign.id),
      }))
      // A Campaign nothing was shelved under is a heading over blank space.
      .filter((shelf) => shelf.battles.length > 0)
  )
}

async function readShelves(): Promise<Shelf[]> {
  const [campaigns, battles] = await Promise.all([readCampaigns(), loadCatalogue()])
  return shelve(campaigns, battles)
}

/**
 * Read once, and never remembered as a failure: a read that failed must not be
 * remembered as an empty shelf.
 */
function once<T>(read: () => Promise<T>): () => Promise<T> {
  let reading: Promise<T> | null = null
  return () => {
    reading ??= read().catch((error: unknown) => {
      reading = null
      throw error
    })
    return reading
  }
}

/**
 * The battles on offer, read once. `index.json` is authored and not generated,
 * so it cannot change under a tab that is already open; re-reading it every
 * time the menu is opened, or every time a URL has to be checked against it,
 * would cost a round trip per Scenario and buy nothing.
 *
 * Flat, because that is what a router checking a slug and a dial listing Fields
 * both want. The menu wants them shelved, and asks `loadShelves` for that.
 */
export const loadCatalogue = once(readCatalogue)

/** The same battles, under the Campaigns they belong to. */
export const loadShelves = once(readShelves)

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
