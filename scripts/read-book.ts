import { loadScenarioFromDisk } from "@/scenario/disk"
import { isOver, STEP, step } from "@/sim/battle"
import { armyReturns } from "@/sim/return"
import type { Battle } from "@/sim/types"

/**
 * The Book, read headless: a battle nobody commands, so both authored Plans
 * fire and the historical afternoon plays itself under the rules.
 *
 * Disposable. This is the measurement that decides where a Chapter wants to
 * stand, not a thing the game runs.
 */

const id = Bun.argv[2] ?? "castiglione"
const seed = Bun.argv[3] ? Number(Bun.argv[3]) : null

const loaded = loadScenarioFromDisk(id)
const battle: Battle = loaded.battle
if (seed !== null) battle.seed = seed

const armies = new Map(battle.armies.map((a) => [a.id, a.name]))
const units = new Map(battle.units.map((u) => [u.id, u.name]))

let steps = 0
const feed: { at: number; army: string; text: string }[] = []
let seen = 0
while (!isOver(battle) && steps < 40_000) {
  step(battle)
  steps++
  for (; seen < battle.dispatches.length; seen++) {
    const d = battle.dispatches[seen]!
    feed.push({ at: d.at, army: d.army ?? "—", text: d.text })
  }
}

const clock = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`

console.log(`# ${loaded.file.name}  (seed ${battle.seed})`)
console.log(`clock ${clock(loaded.file.clock)}, ended ${clock(battle.time)}\n`)
for (const d of feed) console.log(`${clock(d.at)}  [${d.army}]  ${d.text}`)

console.log(`\n## outcome`)
console.log(JSON.stringify(battle.outcome, null, 2))
console.log(`\n## returns`)
for (const r of armyReturns(battle)) console.log(JSON.stringify(r))

console.log(`\n## dispatches per minute`)
const perMinute = new Map<number, number>()
for (const d of feed)
  perMinute.set(Math.floor(d.at / 60), (perMinute.get(Math.floor(d.at / 60)) ?? 0) + 1)
const minutes = [...perMinute.keys()].sort((a, b) => a - b)
for (const m of minutes)
  console.log(`${String(m).padStart(3)}m ${"#".repeat(perMinute.get(m)!)} ${perMinute.get(m)}`)
console.log(`\n${feed.length} dispatches over ${steps} steps (${clock(steps * STEP)})`)
console.log(`armies: ${[...armies.values()].join(" / ")}, units: ${units.size}`)
