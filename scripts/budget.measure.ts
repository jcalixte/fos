import { execFileSync } from "node:child_process"
import { describe, expect, it } from "bun:test"
import { isOver, STEP, step } from "../src/sim/battle"
import { isDisordered } from "../src/sim/disorder"
import { beatsPoint } from "../src/sim/fighting"
import { RULES } from "../src/sim/initiative"
import { hasBroken, isRouting, shareGone } from "../src/sim/morale"
import { COURIER_SPEED } from "../src/sim/orders"
import { route } from "../src/sim/routing"
import { takeCommand } from "../src/sim/scenario"
import type { Arm, Battle, Unit, Vec2 } from "../src/sim/types"
import { bearing, distance } from "../src/sim/vec"
import { loadScenarioFromDisk } from "./load-headless"

/**
 * DESIGN section 8's budget, measured on the battles section 8 says to measure
 * it on, with the player silent.
 *
 * A silent run is the honest baseline and not a lazy one: `takeCommand` drops
 * the Plan of the army being taken, so what is watched here is one authored
 * Plan against an army that does nothing. It is the run section 9's first
 * trigger is phrased against — *does the battle resolve much the same whether
 * the player issues Orders or not* — and it is the only run that is the same
 * every time, which is what a budget has to be measured against.
 *
 * Two of section 8's ten rows are not here and cannot be: F6's 60fps and F5's
 * silhouettes are drawn, not simulated. They are read in a browser and written
 * down by whoever looked.
 */

const CLOCK_LIMIT_STEPS = 40_000

interface BreakRecord {
  id: string
  name: string
  arm: Arm
  grade: string
  /** Men it had when it came onto the Field, which lostShare is a share of. */
  of: number
  at: number
  lostShare: number
  /** Morale it got back before it Broke, which is what buys a Unit past F10's band. */
  regained: number
  /** The largest share of itself one Volley ever took, which is the other thing that does. */
  worstVolley: number
  /**
   * Where the fire that killed its men came from, weighted by the men, on the
   * scale `flanking` prices shock on: 0 is straight into the Face, 1 is square
   * on the flank, 2 is from behind. The third thing that buys a Unit past
   * F10's band, and the only one that is not about how much it was shot.
   */
  shotFromOff: number
}

interface ArrivalRecord {
  id: string
  scheduledAt: number
  enteredAt: number | null
  entry: Vec2
  walkedInFirstMinute: number | null
}

interface RunReport {
  scenario: string
  taken: string
  endedAt: number
  endedBy: string
  winner: string | null
  keyGround: { name: string; holder: string | null }[]
  clock: number
  firstVolleyAt: number | null
  firstBreakAt: number | null
  lastBloodAt: number | null
  deadClock: number
  breaks: BreakRecord[]
  lowestStrength: number
  rallies: number
  arrivals: ArrivalRecord[]
  ruleSeconds: Map<string, number>
  idleUnderThreat: number
  /**
   * Disorder, measured as the thing it claims to be: how often a Unit's ranks
   * were taken off it, how long they stayed off, and by which of the two causes.
   * Told apart by the Dispatch, which is where the cause is written down —
   * the state itself is one number and does not remember what set it.
   */
  disorder: { spells: number; seconds: number; longest: number; byPursuit: number }
  drift: Map<string, number>
  shareGone: { army: string; share: number }[]
  digest: string
}

/** Everything that decides a battle, in one string, for comparing two runs. */
function digest(battle: Battle): string {
  const units = battle.units
    .map(
      (u) =>
        `${u.id}:${u.strength}:${u.position.x.toFixed(3)},${u.position.y.toFixed(3)}:${u.morale.toFixed(6)}:${u.fatigue.toFixed(6)}:${u.formation}:${u.routing ? "r" : "-"}`,
    )
    .sort()
    .join("|")
  return `${battle.time.toFixed(1)}#${battle.outcome?.by ?? "none"}#${battle.outcome?.winner ?? "none"}#${units}`
}

/** Whether any enemy's beaten ground falls on `unit`. */
function underThreat(battle: Battle, unit: Unit): boolean {
  for (const other of battle.units) {
    if (other.army === unit.army || isRouting(other)) continue
    if (beatsPoint(other, unit.position)) return true
  }
  return false
}

/**
 * A Unit under an enemy's beaten ground that is doing nothing whatever about
 * it: no Order it is working on, no rule holding that Order suspended, no
 * ground it is walking to of its own accord, not moving, not forming up, and
 * not shooting back.
 *
 * Standing still and firing is emphatically *not* idle — it is the commonest
 * right answer on this Field, and counting it was the first way this measure
 * was written and wrong. What F3 promises is that nothing stands under fire
 * with no answer to it, and an answer includes the Volley.
 */
function idleUnder(battle: Battle, unit: Unit, firedAt: Map<string, number>): boolean {
  if (isRouting(unit) || unit.order || unit.shift || unit.suspendedBy || unit.charging) return false
  if (unit.route.length > 0 || unit.changing) return false
  const fired = firedAt.get(unit.id)
  if (fired !== undefined && battle.time - fired <= 30) return false
  return underThreat(battle, unit)
}

function run(scenario: string, taken: string): RunReport {
  const { battle } = loadScenarioFromDisk(scenario)
  takeCommand(battle, taken)

  const deployed = new Map(battle.units.map((u) => [u.id, u.strength]))
  const authoredArrivals: ArrivalRecord[] = battle.arrivals.map((a) => ({
    id: a.unit.id,
    scheduledAt: a.at,
    enteredAt: null,
    entry: { ...a.entry },
    walkedInFirstMinute: null,
  }))
  const arrivalById = new Map(authoredArrivals.map((a) => [a.id, a]))
  const enteredAtPosition = new Map<string, Vec2>()

  const breaks: BreakRecord[] = []
  const broken = new Set<string>()
  // The two things that put a Break outside F10's band, tracked so the report
  // says which one did it: Morale handed back between Volleys, and a single
  // Volley too big for any Morale rule to be what decided the Unit.
  const regained = new Map<string, number>()
  const worstVolley = new Map<string, number>()
  // Men lost to fire, and the same men weighted by how far off the Face it
  // came from — the two halves of the casualty-weighted bearing reported at a
  // Break. Cheap to keep for every Unit and only read for the ones that miss.
  const shotMen = new Map<string, number>()
  const shotOff = new Map<string, number>()
  const moraleWas = new Map<string, number>()
  const ruleSeconds = new Map<string, number>()
  const drift = new Map<string, number>()
  let firstVolleyAt: number | null = null
  let firstBreakAt: number | null = null
  let lastBloodAt: number | null = null
  let lowestStrength = Number.POSITIVE_INFINITY
  let rallies = 0
  let idleUnderThreat = 0
  const routingLast = new Set<string>()
  const firedAt = new Map<string, number>()
  const raggedSince = new Map<string, number>()
  let disorderSpells = 0
  let disorderSeconds = 0
  let disorderLongest = 0
  let disorderByPursuit = 0
  let dispatchesRead = 0

  for (let n = 0; n < CLOCK_LIMIT_STEPS && !isOver(battle); n++) {
    const strengthWas = new Map(battle.units.map((u) => [u.id, u.strength]))
    step(battle)

    for (const unit of battle.units) {
      const rise = unit.morale - (moraleWas.get(unit.id) ?? unit.morale)
      if (rise > 0) regained.set(unit.id, (regained.get(unit.id) ?? 0) + rise)
      moraleWas.set(unit.id, unit.morale)
    }
    for (const volley of battle.volleys) {
      const share = volley.casualties / Math.max(1, strengthWas.get(volley.targetId) ?? 1)
      if (share > (worstVolley.get(volley.targetId) ?? 0)) worstVolley.set(volley.targetId, share)
      const target = battle.units.find((u) => u.id === volley.targetId)
      const shooter = battle.units.find((u) => u.id === volley.unitId)
      if (target && shooter) {
        // The same `1 - cos` off the Face that `flanking` charges on, read
        // here rather than imported: what is wanted is the bearing, and the
        // multiplier that C7 makes of it is C7's business.
        const off = 1 - Math.cos(bearing(target.position, shooter.position) - target.facing)
        shotMen.set(volley.targetId, (shotMen.get(volley.targetId) ?? 0) + volley.casualties)
        shotOff.set(volley.targetId, (shotOff.get(volley.targetId) ?? 0) + volley.casualties * off)
      }
    }

    if (firstVolleyAt === null && battle.volleys.length > 0) firstVolleyAt = battle.time
    if (battle.volleys.length > 0 || battle.contacts.length > 0) lastBloodAt = battle.time
    for (const volley of battle.volleys) firedAt.set(volley.unitId, battle.time)

    for (const unit of battle.units) {
      deployed.set(unit.id, deployed.get(unit.id) ?? unit.strength)
      if (unit.strength < lowestStrength) lowestStrength = unit.strength

      // Arrivals: the step a Unit first stands on the Field.
      const arrival = arrivalById.get(unit.id)
      if (arrival && arrival.enteredAt === null) {
        arrival.enteredAt = battle.time
        enteredAtPosition.set(unit.id, { ...unit.position })
      }
      const from = enteredAtPosition.get(unit.id)
      if (arrival?.enteredAt != null && from && arrival.walkedInFirstMinute === null) {
        if (battle.time >= arrival.enteredAt + 60) {
          arrival.walkedInFirstMinute = distance(from, unit.position)
        }
      }

      if (hasBroken(unit) && !broken.has(unit.id)) {
        broken.add(unit.id)
        const started = deployed.get(unit.id) ?? unit.strength
        breaks.push({
          id: unit.id,
          name: unit.name,
          arm: unit.arm,
          grade: unit.grade,
          of: started,
          at: battle.time,
          lostShare: (started - unit.strength) / started,
          regained: regained.get(unit.id) ?? 0,
          worstVolley: worstVolley.get(unit.id) ?? 0,
          shotFromOff: (shotOff.get(unit.id) ?? 0) / Math.max(1, shotMen.get(unit.id) ?? 0),
        })
        if (firstBreakAt === null) firstBreakAt = battle.time
        lastBloodAt = battle.time
      }
      // A Unit that was running and is not is one that Rallied.
      if (isRouting(unit)) routingLast.add(unit.id)
      else if (routingLast.delete(unit.id)) rallies++

      if (unit.suspendedBy) {
        ruleSeconds.set(unit.suspendedBy, (ruleSeconds.get(unit.suspendedBy) ?? 0) + STEP)
      }
      // The leash ADR-0007 puts on Initiative, measured as the thing the ADR
      // actually claims: how far the ground a Unit picked *for itself* lies
      // from the ground it was given. That is the Shift, and only the Shift —
      // a Unit walking to a Plan's destination is far from its Post by the
      // Plan's choice, and one that Rallied is far from it by having run.
      // Both were measured here first and both were wrong.
      if (unit.shift) {
        const off = distance(unit.shift, unit.post)
        if (off > (drift.get(unit.standing) ?? 0)) drift.set(unit.standing, off)
      }
    }

    for (const unit of battle.units) {
      if (isDisordered(unit)) {
        disorderSeconds += STEP
        if (!raggedSince.has(unit.id)) {
          raggedSince.set(unit.id, battle.time)
          disorderSpells++
        }
      } else {
        const from = raggedSince.get(unit.id)
        if (from !== undefined) {
          disorderLongest = Math.max(disorderLongest, battle.time - from)
          raggedSince.delete(unit.id)
        }
      }
    }
    // Which cause, read off the Dispatch the state does not keep. Only the new
    // ones each step, so the feed is walked once over the battle and not once
    // a step.
    for (; dispatchesRead < battle.dispatches.length; dispatchesRead++) {
      if (battle.dispatches[dispatchesRead].text.includes("in disorder, loose among")) {
        disorderByPursuit++
      }
    }

    // Idle under threat, sampled once a second: F3's target stated as its
    // failure. Sampled because the faithful test is every enemy against every
    // Unit, and at 10Hz over forty minutes that is the run's whole cost.
    if (Math.round(battle.time * 10) % 10 === 0) {
      for (const unit of battle.units) if (idleUnder(battle, unit, firedAt)) idleUnderThreat++
    }
  }

  const outcome = battle.outcome
  return {
    scenario,
    taken,
    endedAt: outcome?.at ?? battle.time,
    endedBy: outcome?.by ?? "still standing",
    winner: outcome?.winner ?? null,
    keyGround: (outcome?.keyGround ?? battle.keyGround).map((k) => ({
      name: k.name,
      holder: k.holder ?? null,
    })),
    clock: battle.clock,
    firstVolleyAt,
    firstBreakAt,
    lastBloodAt,
    deadClock: lastBloodAt === null ? battle.clock : battle.clock - lastBloodAt,
    breaks,
    lowestStrength: Number.isFinite(lowestStrength) ? lowestStrength : 0,
    rallies,
    arrivals: authoredArrivals,
    ruleSeconds,
    idleUnderThreat,
    disorder: {
      spells: disorderSpells,
      seconds: disorderSeconds,
      longest: Math.max(
        disorderLongest,
        ...[...raggedSince.values()].map((t) => battle.time - t),
        0,
      ),
      byPursuit: disorderByPursuit,
    },
    drift,
    shareGone: battle.armies.map((a) => ({ army: a.id, share: shareGone(battle, a) })),
    digest: digest(battle),
  }
}

function clock(seconds: number | null): string {
  if (seconds === null) return "never"
  const m = Math.floor(seconds / 60)
  return `${m}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`
}

function report(r: RunReport): void {
  const lines: string[] = []
  lines.push(`\n── ${r.scenario}, ${r.taken} taken and silent ─────────────────────`)
  lines.push(
    `F11 ended ${clock(r.endedAt)} of ${clock(r.clock)} by ${r.endedBy}` +
      `, winner ${r.winner ?? "nobody"}`,
  )
  lines.push(
    `    Key Ground: ${r.keyGround.map((k) => `${k.name} → ${k.holder ?? "nobody"}`).join("; ")}`,
  )
  lines.push(
    `    shape: first Volley ${clock(r.firstVolleyAt)}, first Break ${clock(r.firstBreakAt)}` +
      `, last blood ${clock(r.lastBloodAt)}, dead clock ${clock(r.deadClock)}`,
  )
  lines.push(
    `    left standing: ${r.shareGone.map((s) => `${s.army} ${(s.share * 100).toFixed(1)}% gone`).join(", ")}`,
  )

  const shares = r.breaks.map((b) => b.lostShare).sort((a, b) => a - b)
  lines.push(
    `F10 ${r.breaks.length} Breaks, ${r.rallies} Rallies, lowest Strength ${r.lowestStrength}` +
      (shares.length
        ? `; casualties at Break ${(shares[0] * 100).toFixed(1)}–${(shares[shares.length - 1] * 100).toFixed(1)}%` +
          ` (median ${(shares[Math.floor(shares.length / 2)] * 100).toFixed(1)}%)`
        : ""),
  )
  for (const b of r.breaks) {
    const pct = Math.round(b.lostShare * 1000) / 10
    // Only the misses are explained. Inside the band there is nothing to say
    // beyond the number, and a cause printed against every line would bury the
    // two that have one.
    const why =
      pct < 15 || pct > 30
        ? `   ← one Volley took ${(b.worstVolley * 100).toFixed(0)}% of it, ` +
          `it had ${b.regained.toFixed(2)} Morale back before it went, ` +
          `and it was shot ${b.shotFromOff.toFixed(2)} off its Face`
        : ""
    lines.push(
      `      ${clock(b.at)}  ${(b.lostShare * 100).toFixed(1)}%  ${b.grade.padEnd(9)} ${b.name}${why}`,
    )
  }

  if (r.arrivals.length) {
    lines.push(`F20 ${r.arrivals.length} Arrivals`)
    for (const a of r.arrivals) {
      const late =
        a.enteredAt === null ? "NEVER ENTERED" : `${(a.enteredAt - a.scheduledAt).toFixed(1)}s late`
      const walked =
        a.walkedInFirstMinute === null
          ? "—"
          : `${a.walkedInFirstMinute.toFixed(0)}m in its first minute`
      lines.push(`      ${clock(a.scheduledAt)}  ${a.id.padEnd(22)} ${late.padEnd(16)} ${walked}`)
    }
  }

  const fired = [...r.ruleSeconds.entries()].sort((a, b) => b[1] - a[1])
  lines.push(
    `F3  under fire with no answer: ${r.idleUnderThreat} Unit-seconds` +
      ` (standing is the brief at hold-ground, so this is not a fault on its own — ADR-0007)`,
  )
  for (const [name, seconds] of fired) lines.push(`      ${seconds.toFixed(0)}s  ${name}`)
  const silent = RULES.map((rule) => rule.name).filter((name) => !r.ruleSeconds.has(name))
  if (silent.length) lines.push(`      never fired: ${silent.join(" · ")}`)
  lines.push(
    `C7  Disorder: ${r.disorder.spells} spells` +
      (r.disorder.spells === 0
        ? " — no Unit ever lost its ranks"
        : `, ${r.disorder.byPursuit} of them a Pursuit and the rest a mob coming back through` +
          `; ${r.disorder.seconds.toFixed(0)} Unit-seconds, longest ${r.disorder.longest.toFixed(0)}s`),
  )
  lines.push(
    `    ground taken unbidden, from the Post: ${
      r.drift.size === 0
        ? "none — no Unit ever chose its own ground"
        : [...r.drift.entries()].map(([l, d]) => `${l} ${d.toFixed(0)}m`).join(", ")
    }`,
  )
  console.log(lines.join("\n"))
}

const HEAD = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim()
  } catch {
    return "unknown"
  }
})()

describe(`DESIGN section 8, measured at ${HEAD}`, () => {
  const runs = new Map<string, RunReport>()
  const of = (scenario: string, taken: string) => {
    const key = `${scenario}/${taken}`
    let r = runs.get(key)
    if (!r) {
      r = run(scenario, taken)
      runs.set(key, r)
      report(r)
    }
    return r
  }

  for (const [scenario, armies] of [
    ["castiglione", ["french", "austrian"]],
    ["rivoli", ["french", "austrian"]],
  ] as const) {
    describe(scenario, () => {
      for (const taken of armies) {
        describe(`${taken} taken and silent`, () => {
          it("rank 5 — F11: the battle lands inside 20–40 minutes", () => {
            const r = of(scenario, taken)
            // A battle ending *on* the clock is decided in the step that
            // carries the time past it, so the last one lands a tenth over.
            expect(r.endedAt).toBeGreaterThanOrEqual(20 * 60)
            expect(r.endedAt).toBeLessThanOrEqual(40 * 60 + STEP)
          })

          it("rank 4 — F10: no Unit is ground down to nothing", () => {
            const r = of(scenario, taken)
            expect(r.lowestStrength).toBeGreaterThan(0)
          })

          /**
           * Section 8's own words. The band is asserted where it is met and
           * recorded where it is not, rather than widened until everything
           * fits: a budget that moves to meet the measurement has stopped
           * being one.
           *
           * What is left outside it is one of three shapes, and each is
           * asserted by its shape rather than by name, so a miss of any other
           * kind fails here instead of joining a list.
           *
           * **One Volley took a fifth of it.** A small mounted Unit taking a
           * whole battalion's Volley at once. ADR-0011 records that as the
           * fire model's residual and not Morale's — `shots` scales with the
           * Unit firing while the overlap reads the target's width and never
           * its size, so a quarter of a two-hundred-and-eighty-man regiment
           * goes at a stroke however well the depth is priced.
           *
           * **It steadied in the gaps.** A Unit shot at once every two minutes
           * is mostly out of the fight and mends between Volleys, which is
           * ADR-0011 working rather than failing, and costs the band a Unit
           * that fought all afternoon.
           *
           * **It was shot off its Face.** Fire from the flank costs more nerve
           * than the men in it, on purpose: `flanking` exists because Units
           * broke from being flanked long before the casualties justified it.
           * A Unit shot square on the flank all afternoon Breaks below a band
           * that counts casualties, and that is the rule doing its job. This
           * shape appeared only once Rosters carried a Standing Order — the
           * three Latitude rules are what put a Unit somewhere other than
           * where it was posted, and a flank is something somebody has to
           * manoeuvre to find.
           *
           * The three are not interchangeable, and the assertion does not treat
           * them as such. A big Volley and a Unit that steadied both explain a
           * Break that came *late*; being shot off the Face explains one that
           * came *early*, and only that. Twelve of the thirty-one Breaks inside
           * the band were also flanked past the bound, so read as a blanket
           * excuse this clause would forgive nearly anything — read against the
           * direction of the miss it forgives exactly the two Units whose nerve
           * went for fewer men than the band counts.
           */
          it("rank 4 — F10: Breaks cost 15–30% of a Unit, or the miss is on the record", () => {
            const r = of(scenario, taken)
            // Judged at the precision the report prints, so a Break at 30.014%
            // is the 30.0% a reader sees rather than a miss by a rounding error.
            const outside = r.breaks.filter((b) => {
              const pct = Math.round(b.lostShare * 1000) / 10
              return pct < 15 || pct > 30
            })
            for (const b of outside) {
              // The bound is 0.5 on the same `1 - cos` scale `flanking` prices
              // shock on, which is sixty degrees off the Face and a quarter of
              // the full flank penalty. Below that a Unit is being shot at
              // roughly where it is standing to be shot at, and its nerve going
              // early wants some other explanation than the direction.
              const early = b.lostShare * 100 < 15
              expect(early ? b.shotFromOff > 0.5 : b.worstVolley > 0.2 || b.regained > 0.5).toBe(
                true,
              )
            }
          })

          it("rank 2 — F3: every autonomous act names the rule that caused it", () => {
            const r = of(scenario, taken)
            const known = new Set(RULES.map((rule) => rule.name))
            for (const name of r.ruleSeconds.keys()) expect(known).toContain(name)
          })

          it("rank 2 — F3: the rule list is shorter than the ~20 it may not pass", () => {
            expect(RULES.length).toBeLessThan(20)
          })

          it("F18: the same Scenario and seed give the same battle twice", () => {
            const r = of(scenario, taken)
            expect(run(scenario, taken).digest).toBe(r.digest)
          })
        })
      }

      it("rank 3 — F20: every authored Arrival walks on when it was told to", () => {
        const r = of(scenario, "french")
        for (const a of r.arrivals) {
          expect(a.enteredAt, `${a.id} never entered`).not.toBeNull()
          expect(Math.abs((a.enteredAt ?? 0) - a.scheduledAt)).toBeLessThanOrEqual(STEP)
        }
      })

      it("rank 3 — F20: no Arrival walks on into ground it cannot leave", () => {
        const r = of(scenario, "french")
        for (const a of r.arrivals) {
          if (a.walkedInFirstMinute === null) continue
          expect(a.walkedInFirstMinute, `${a.id} stood still where it entered`).toBeGreaterThan(1)
        }
      })
    })
  }

  it("rank 8 — F4: a Route across the worst of Rivoli stays under 10ms", () => {
    const { battle } = loadScenarioFromDisk("rivoli")
    const field = battle.field
    const wide = field.width * field.cellSize
    const tall = field.height * field.cellSize
    const pairs: [string, Vec2, Vec2][] = [
      ["Quasdanovich down the gorge", { x: 1808, y: 8 }, { x: 1240, y: 720 }],
      ["his battery after him", { x: 1808, y: 8 }, { x: 1380, y: 660 }],
      ["Lusignan round the back", { x: 8, y: 1040 }, { x: 560, y: 980 }],
      ["corner to corner", { x: 20, y: 20 }, { x: wide - 20, y: tall - 20 }],
    ]
    const worst: string[] = []
    for (const [name, from, to] of pairs) {
      const started = performance.now()
      const path = route(field, from, to)
      const ms = performance.now() - started
      worst.push(`      ${ms.toFixed(2)}ms  ${path.length} waypoints  ${name}`)
      expect(path.length, `${name} found no way through`).toBeGreaterThan(0)
      expect(ms).toBeLessThan(10)
    }
    console.log(`\nF4 routing on Rivoli, ${field.width}×${field.height} cells\n${worst.join("\n")}`)
  })

  it("section 9 — a 40-minute battle allows more than three order-cycles to the far flank", () => {
    const lines: string[] = []
    for (const scenario of ["castiglione", "rivoli"]) {
      const { battle } = loadScenarioFromDisk(scenario)
      for (const army of battle.armies) {
        const hq = army.headquarters
        if (!hq) continue
        const mine = battle.units.filter((u) => u.army === army.id)
        const farthest = Math.max(...mine.map((u) => distance(hq.position, u.position)))
        const ride = farthest / COURIER_SPEED
        const cycles = battle.clock / ride
        lines.push(
          `      ${scenario} ${army.id}: farthest Unit ${farthest.toFixed(0)}m, ride ${ride.toFixed(0)}s, ${cycles.toFixed(1)} cycles`,
        )
        expect(cycles).toBeGreaterThan(3)
      }
    }
    console.log(`\nSection 9 order-cycles to the far flank\n${lines.join("\n")}`)
  })
})
