import { loadScenarioFromDisk } from "@/scenario/disk"
import { isOver, step } from "@/sim/battle"
import { hasBroken, isRouting } from "@/sim/morale"
import { armyReturns } from "@/sim/return"

/** Disposable: one line per Unit, so a Plan can be tuned against the ending. */
const id = Bun.argv[2] ?? "castiglione"
const loaded = loadScenarioFromDisk(id)
const battle = loaded.battle

const started = new Map(battle.units.map((u) => [u.id, u.strength]))
const arrived = new Map<string, number>()
const brokeAt = new Map<string, number>()
const changes: string[] = []
const held = new Map<string, string | null>()

let steps = 0
while (!isOver(battle) && steps < 40_000) {
  step(battle)
  steps++
  for (const u of battle.units) {
    if (hasBroken(u) && !brokeAt.has(u.id)) brokeAt.set(u.id, battle.time)
    // A Unit that walked on mid-battle is not in the Roster's opening state,
    // and it is exactly the one a Plan is usually getting wrong.
    if (!started.has(u.id) && !arrived.has(u.id)) {
      started.set(u.id, u.strength)
      arrived.set(u.id, battle.time)
    }
  }
  for (const g of battle.keyGround) {
    if (held.get(g.name) === g.holder) continue
    held.set(g.name, g.holder)
    const near = battle.units
      .filter(
        (u) => Math.hypot(u.position.x - g.position.x, u.position.y - g.position.y) < g.radius + 60,
      )
      .map((u) => `${u.id}${isRouting(u) ? "(routing)" : ""}`)
      .join(" ")
    changes.push(`${clock(battle.time)} ${g.name} -> ${g.holder ?? "nobody"}   [${near}]`)
  }
}

function clock(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`
}

console.log(
  `ended ${clock(battle.time)} by ${battle.outcome?.by} — winner ${battle.outcome?.winner ?? "none"}`,
)
for (const line of changes) console.log(`  ${line}`)
console.log()
for (const [uid, was] of started) {
  const u = battle.units.find((x) => x.id === uid)
  const broke = brokeAt.has(uid) ? `broke ${clock(brokeAt.get(uid)!)}` : ""
  const came = arrived.has(uid) ? `came on ${clock(arrived.get(uid)!)}` : ""
  const state = !u ? "QUIT THE FIELD" : isRouting(u) ? "routing" : "in hand"
  const left = u ? `${Math.round((u.strength / was) * 100)}%` : "  0%"
  console.log(
    `  ${uid.padEnd(20)} ${left.padStart(4)} of ${String(Math.round(was)).padStart(4)}  ${state.padEnd(15)} ${came.padEnd(14)} ${broke}`,
  )
}
console.log()
for (const r of armyReturns(battle))
  console.log(
    `  ${r.id.padEnd(9)} inHand ${r.inHand}  gone ${r.gone}  toward break ${(r.towardBreak * 100).toFixed(0)}%  keyGround ${r.keyGround.join(",") || "-"}`,
  )
