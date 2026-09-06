import type { ArmyReturn } from "@/sim/return"
import type { BattleSnapshot, UnitSnapshot } from "@/sim/snapshot"
import type { ArmyId, Outcome } from "@/sim/types"

/**
 * The record: one afternoon written out, so it can be read away from the
 * screen.
 *
 * It is a workbench tool and not a thing a Commander does — the Field says all
 * of this while a battle runs, and says it a line at a time. What it is for is
 * the question the screen cannot answer: *did the whole day go right?* A
 * battery that never fired, a column that walked off the Field, a brigade that
 * stood where it was posted for forty minutes and was never told anything, are
 * all invisible in a feed of things that happened.
 *
 * So it is not the Dispatch feed on its own. It is the feed, the Units as they
 * stand, both staffs, and the Return — the feed says what happened, the roll
 * says what it left, and an afternoon that reads wrong almost always reads
 * wrong in the gap between the two.
 *
 * **It knows nothing the screen was not sent.** A record is written off a
 * `BattleSnapshot`, which is already cut for whoever is looking (F22): from a
 * taken battle it is one Commander's papers, and from a Book it is the whole
 * day, because a Book is cut for nobody. Reaching past the seam to the Battle
 * itself would write a fuller record and break the one rule the seam has
 * (ADR-0013) — and the record would then be evidence about a battle nobody can
 * play. The head says which seat it was written from instead.
 */

export interface RecordHead {
  /** The battle's slug — what the URL names it and what the file is named for. */
  battle: string
  /** The Scenario's name, as it reads on the offer. */
  name: string
  /** The length of the day, for the stamp at the top. */
  clock: number
  /** The seat it is written from: an army, or null for a Book. */
  army: ArmyId | null
  /** How it ended, where it has. */
  outcome: Outcome | null
}

/** Battle time as the screen says it: minutes and seconds on the Scenario clock. */
function stamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

/** Ground, to the metre. A record is read, not measured off. */
function where(position: { x: number; y: number }): string {
  return `${Math.round(position.x)}, ${Math.round(position.y)}`
}

/**
 * A block of columns, padded to whatever the widest cell in each turned out to
 * be. The first row is the heading.
 *
 * Columns and not labelled fields, because the whole use of this is scanning a
 * column for the one row that does not belong — the battery still at full
 * strength at 30:00, the battalion whose Morale word is the only broken one.
 */
function table(rows: string[][]): string[] {
  const widths: number[] = []
  for (const row of rows) {
    row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, cell.length)))
  }
  return rows.map((row) =>
    row
      .map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i] ?? 0)))
      .join("  ")
      .trimEnd(),
  )
}

/**
 * What a Unit is doing, in the order it would be said out loud: what has hold
 * of it first, then what it is about, then what it was told.
 *
 * Empty is a real answer and reads as one — a Unit standing formed with nothing
 * to do and no Order on it is exactly the row worth finding.
 */
function doing(unit: UnitSnapshot, name: (id: string) => string): string {
  const said: string[] = []
  if (unit.routing) said.push("routing")
  if (unit.disordered) said.push("disordered")
  if (unit.changingTo) said.push(`forming ${unit.changingTo}`)
  if (unit.charging) said.push(`charging ${name(unit.charging)}`)
  if (unit.recoiling) said.push("recoiling")
  if (unit.pursuing) said.push("pursuing")
  const report = unit.report
  if (report) {
    if (report.shifting) said.push("shifting")
    if (report.suspendedBy) said.push(`suspended by ${report.suspendedBy}`)
    if (report.aiming) said.push(`aiming at ${name(report.aiming)}`)
  }
  return said.join(", ")
}

/** The Order a Unit is under, as far as the seat is told about it at all. */
function orders(unit: UnitSnapshot): string {
  const report = unit.report
  // Not this Commander's Unit: he is told nothing about what it was ordered,
  // and a dash here says that rather than pretending it has no Orders.
  if (!report) return "—"
  const said = [report.hasOrder ? "under orders" : "no order", report.standing]
  if (report.briefedTo) said.push(`briefed to ${report.briefedTo}`)
  if (report.dictated) said.push("dictated")
  return said.join(", ")
}

/** How the day ended, or that it has not. */
function ending(outcome: Outcome | null, army: (id: ArmyId) => string): string {
  if (!outcome) return "still being fought"
  const winner = outcome.winner
    ? `${army(outcome.winner)} hold the Field`
    : "nobody holds the Field"
  return `${winner} — ${outcome.by} at ${stamp(outcome.at)}`
}

/**
 * One battle, written out at the moment it is asked for. Mid-afternoon is a
 * legitimate moment: the Return is derived and reads as a tally of where things
 * stand, and most of what is worth catching is worth catching before the end.
 */
export function battleRecord(head: RecordHead, at: BattleSnapshot, returns: ArmyReturn[]): string {
  const armyName = (id: ArmyId | null): string =>
    (id && returns.find((r) => r.id === id)?.name) || String(id ?? "—")
  const unitName = (id: string): string => at.units.find((u) => u.id === id)?.name ?? id

  const lines: string[] = []
  lines.push(`${head.name} — ${stamp(at.time)} of ${stamp(head.clock)}`)
  lines.push(`battle: ${head.battle}`)
  lines.push(
    head.army
      ? `written from: the ${armyName(head.army)} seat — one Commander's papers. The other army's Dispatches were never sent to it and its Units carry no Report, so nothing missing here is evidence that nothing happened.`
      : "written from: the Book — nobody's seat, so nothing is withheld: both feeds, both staffs, every Unit reported.",
  )
  lines.push(`the day: ${ending(head.outcome, armyName)}`)

  lines.push("", `THE RETURN`)
  lines.push(
    ...table([
      ["army", "in hand", "running", "gone", "men", "toward break", "key ground"],
      ...returns.map((r) => [
        r.name,
        String(r.inHand),
        String(r.running),
        String(r.gone),
        `${Math.round(r.strength)} of ${Math.round(r.mustered)}`,
        `${Math.round(r.towardBreak * 100)}%`,
        r.keyGround.join(", ") || "—",
      ]),
    ]),
  )

  lines.push("", "THE KEY GROUND")
  lines.push(
    ...table([
      ["ground", "held by"],
      ...at.keyGround.map((g) => [g.name, g.holder ? armyName(g.holder) : "—"]),
    ]),
  )

  lines.push("", "THE STAFF")
  lines.push(
    ...table([
      ["army", "standing at", "riding to", "harried", "late by", "dictated"],
      ...at.headquarters.map((hq) => [
        armyName(hq.army),
        where(hq.position),
        hq.report ? (hq.report.destination ? where(hq.report.destination) : "—") : "—",
        hq.report ? (hq.report.harried ? "harried" : "—") : "—",
        hq.report ? `${Math.round(hq.report.surcharge)}s` : "—",
        hq.report ? String(hq.report.dictated) : "—",
      ]),
    ]),
  )

  lines.push("", `THE UNITS — ${at.units.length} standing, ${at.couriers.length} riders out`)
  lines.push(
    ...table([
      [
        "army",
        "unit",
        "arm",
        "grade",
        "men",
        "morale",
        "fatigue",
        "formation",
        "at",
        "doing",
        "orders",
      ],
      ...at.units.map((u) => [
        armyName(u.army),
        u.name,
        u.arm,
        u.grade,
        String(Math.round(u.strength)),
        u.morale,
        u.report?.fatigue ?? "—",
        u.formation,
        where(u.position),
        doing(u, unitName) || "—",
        orders(u),
      ]),
    ]),
  )

  lines.push("", `THE DISPATCHES — ${at.dispatches.length}`)
  if (at.dispatches.length === 0) lines.push("Nothing has been reported.")
  lines.push(
    ...table(
      at.dispatches.map((d) => [
        stamp(d.at),
        d.army ? armyName(d.army) : "both",
        d.unitId ? unitName(d.unitId) : "—",
        d.text,
      ]),
    ),
  )

  return `${lines.join("\n")}\n`
}

/** What the file is called: the battle, and the moment it was taken. */
export function recordName(head: RecordHead, time: number): string {
  const m = Math.floor(time / 60)
  const s = Math.floor(time % 60)
  const seat = head.army ?? "book"
  return `${head.battle}-${seat}-${m}m${s.toString().padStart(2, "0")}s.txt`
}

/** Where a record ended up, so the button can say which of the two happened. */
export type RecordKept = "copied" | "saved"

/**
 * Take the record: onto the clipboard, or into a file when the clipboard is
 * refused.
 *
 * The clipboard is the press, because what a record is *for* is being read
 * somewhere else — pasted into a message, a diff, a note — and a file on disk
 * is one more step between the battle and the reading. The file is the fallback
 * and not a second button: a browser withholds the clipboard on an insecure
 * origin and whenever it decides the press was not a gesture, and a button that
 * silently did nothing there would be worse than no button.
 *
 * The one part of this that touches the page, kept beside what it writes rather
 * than repeated in both views: what a record *is* is worth having in one place,
 * and how a browser is made to take text is not worth having in two.
 */
export async function keepTheRecord(
  head: RecordHead,
  at: BattleSnapshot,
  returns: ArmyReturn[],
): Promise<RecordKept> {
  const written = battleRecord(head, at, returns)
  try {
    await navigator.clipboard.writeText(written)
    return "copied"
  } catch {
    saveTheRecord(recordName(head, at.time), written)
    return "saved"
  }
}

/** The fallback: hand the record over as a file the browser downloads. */
function saveTheRecord(name: string, written: string): void {
  const url = URL.createObjectURL(new Blob([written], { type: "text/plain;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
