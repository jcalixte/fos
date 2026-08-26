import type { Arm, FormationName, Grade, Unit, Vec2 } from "./types"
import { rotate } from "./vec"

/**
 * C3 Formation Geometry.
 *
 * Every combat effect in the game is meant to fall out of these numbers rather
 * than out of a per-Formation constant (F8): a column is ploughed through
 * because it *is* deep, and a square has no flank because it *has* four Faces.
 * So this module owns the only place where a Formation's shape is stated.
 *
 * The metres here are tuning data and stay changeable (ADR-0001).
 */

/**
 * A Formation fixes either its number of ranks (and grows sideways with
 * Strength) or its number of files (and grows backwards).
 */
type Spread = { ranks: number } | { files: number }

interface FormationSpec {
  spread: Spread
  /** Metres of frontage each file occupies. */
  spacing: number
  /** Metres between one rank and the next. */
  rankDepth: number
  /** Sides prepared to fight. A march column and Open Order have none. */
  faces: 0 | 1 | 4
  /** Metres per second on open, level Ground. */
  speed: number
  /**
   * Metres the Unit's fire carries. 0 is "cannot fire at all" — a Unit on the
   * march has its muskets slung and a battery limbered has its guns hitched.
   * Volley itself is C6; these are the ranges it will resolve against, kept
   * here beside Frontage because the beaten ground is Frontage times this.
   */
  range: number
}

const INFANTRY: Record<string, FormationSpec> = {
  line: { spread: { ranks: 3 }, spacing: 0.6, rankDepth: 1.2, faces: 1, speed: 0.8, range: 100 },
  "attack-column": {
    spread: { ranks: 9 },
    spacing: 0.6,
    rankDepth: 2.2,
    faces: 1,
    speed: 1.2,
    range: 100,
  },
  "march-column": {
    spread: { files: 4 },
    spacing: 0.7,
    rankDepth: 0.9,
    faces: 0,
    speed: 1.4,
    range: 0,
  },
  square: {
    spread: { ranks: 16 },
    spacing: 0.6,
    rankDepth: 1.2,
    faces: 4,
    speed: 0.25,
    range: 100,
  },
  "open-order": {
    spread: { ranks: 6 },
    spacing: 1.6,
    rankDepth: 3,
    faces: 0,
    speed: 1.2,
    range: 150,
  },
}

const CAVALRY: Record<string, FormationSpec> = {
  line: { spread: { ranks: 2 }, spacing: 1, rankDepth: 3, faces: 1, speed: 2.5, range: 0 },
  "march-column": {
    spread: { files: 4 },
    spacing: 1,
    rankDepth: 3,
    faces: 0,
    speed: 3.2,
    range: 0,
  },
}

/** Gunners per gun. Artillery's Frontage is set by its guns, not by its men. */
const GUNNERS_PER_GUN = 15

const ARTILLERY: Record<string, FormationSpec> = {
  "in-battery": {
    spread: { ranks: 1 },
    spacing: 18,
    rankDepth: 8,
    faces: 1,
    speed: 0.2,
    range: 900,
  },
  limbered: { spread: { files: 1 }, spacing: 6, rankDepth: 14, faces: 0, speed: 2.2, range: 0 },
}

const SPECS: Record<Arm, Record<string, FormationSpec>> = {
  infantry: INFANTRY,
  cavalry: CAVALRY,
  artillery: ARTILLERY,
}

export function formationsFor(arm: Arm): FormationName[] {
  return Object.keys(SPECS[arm]) as FormationName[]
}

export function allows(arm: Arm, formation: FormationName): boolean {
  return formation in SPECS[arm]
}

function spec(arm: Arm, formation: FormationName): FormationSpec {
  const s = SPECS[arm][formation]
  if (!s) throw new Error(`${arm} has no Formation "${formation}"`)
  return s
}

/** Bodies to arrange: men for infantry and cavalry, guns for artillery. */
function bodies(arm: Arm, strength: number): number {
  return arm === "artillery"
    ? Math.max(1, Math.round(strength / GUNNERS_PER_GUN))
    : Math.max(1, Math.round(strength))
}

export interface Grid {
  files: number
  ranks: number
}

/** How the bodies of a Unit divide into files and ranks. */
export function grid(arm: Arm, formation: FormationName, strength: number): Grid {
  const s = spec(arm, formation)
  const n = bodies(arm, strength)
  if (formation === "square") {
    // Four Faces of equal length, hollow. `ranks` here is the ranks per Face.
    const ranksPerFace = 4
    const perFace = Math.max(1, Math.ceil(n / 4))
    return { files: Math.max(1, Math.ceil(perFace / ranksPerFace)), ranks: ranksPerFace }
  }
  if ("ranks" in s.spread) {
    return { files: Math.max(1, Math.ceil(n / s.spread.ranks)), ranks: s.spread.ranks }
  }
  return { files: s.spread.files, ranks: Math.max(1, Math.ceil(n / s.spread.files)) }
}

/**
 * Frontage: the ground a Unit covers across its face. Derived, never authored —
 * casualties shrink it.
 */
export function frontage(arm: Arm, formation: FormationName, strength: number): number {
  const s = spec(arm, formation)
  const g = grid(arm, formation, strength)
  if (formation === "square") return g.files * s.spacing + g.ranks * s.rankDepth * 2
  return g.files * s.spacing
}

/** How deep the Unit stands, front rank to rear. */
export function depth(arm: Arm, formation: FormationName, strength: number): number {
  const s = spec(arm, formation)
  const g = grid(arm, formation, strength)
  if (formation === "square") return frontage(arm, formation, strength)
  return Math.max(s.rankDepth, g.ranks * s.rankDepth)
}

export interface Footprint {
  /** Across the Face. */
  width: number
  /** Front to rear. */
  depth: number
}

/** The rectangle of Field the Unit's Formation covers. */
export function footprint(arm: Arm, formation: FormationName, strength: number): Footprint {
  return {
    width: frontage(arm, formation, strength),
    depth: depth(arm, formation, strength),
  }
}

export function faces(arm: Arm, formation: FormationName): 0 | 1 | 4 {
  return spec(arm, formation).faces
}

/**
 * The ground a Unit can beat with fire, in Unit-local metres. Derived from
 * Frontage and the Formation's range, never authored.
 *
 * A battalion in line is 144m across and reaches about 100m, so its beaten
 * ground is wider than it is deep — a slab, not a cone. Square puts one of
 * those on each side and leaves the corners bare. Skirmishers in Open Order
 * have no Face to speak of and shoot every way at once, so theirs is a circle.
 * A Unit on the march has no zone at all, which is the whole argument against
 * being caught in column.
 */
export interface FireZone {
  /** Metres the fire carries beyond the Unit's own edge. */
  range: number
  /** 1 a single band off the Face, 4 a band per side, 0 all round. */
  faces: 0 | 1 | 4
  /** The Unit's own Footprint, which the bands stand off from. */
  width: number
  depth: number
}

/** Null when the Unit cannot fire at all. */
export function fireZone(arm: Arm, formation: FormationName, strength: number): FireZone | null {
  const range = spec(arm, formation).range
  if (range <= 0) return null
  const shape = footprint(arm, formation, strength)
  return { range, faces: spec(arm, formation).faces, width: shape.width, depth: shape.depth }
}

/** Metres per second on open, level Ground. */
export function baseSpeed(arm: Arm, formation: FormationName): number {
  return spec(arm, formation).speed
}

/**
 * Slot layout: where a body stands, in Unit-local metres with +x across the
 * Face and +y toward the rear. Figures are rigid *in* these slots; it is the
 * layout itself that morphs through a Formation change (F12).
 *
 * `slotAt` is the whole geometry, addressable one body at a time. A Figure
 * stands for several men, so the renderer samples this rather than walking
 * seven hundred slots a frame — and the geometry it samples is the real one.
 */
export function slotAt(arm: Arm, formation: FormationName, strength: number, index: number): Vec2 {
  const s = spec(arm, formation)
  const g = grid(arm, formation, strength)
  const n = bodies(arm, strength)
  const i = Math.max(0, Math.min(n - 1, Math.round(index)))
  if (formation === "square") {
    const half = (g.files * s.spacing) / 2
    const perFace = Math.ceil(n / 4)
    const perRank = Math.max(1, Math.ceil(perFace / g.ranks))
    const face = Math.min(3, Math.floor(i / perFace))
    const withinFace = i - face * perFace
    const rank = Math.floor(withinFace / perRank)
    const file = withinFace % perRank
    const along = (file + 0.5) * s.spacing - half
    const out = half + (rank + 0.5) * s.rankDepth
    // Face 0 front, 1 right, 2 rear, 3 left — four Faces, and therefore no flank.
    if (face === 0) return { x: along, y: -out }
    if (face === 1) return { x: out, y: along }
    if (face === 2) return { x: -along, y: out }
    return { x: -out, y: -along }
  }
  const rank = Math.floor(i / g.files)
  const file = i % g.files
  // A short last rank is centred, the way a battalion dresses on its centre.
  const filesInRank = Math.min(g.files, n - rank * g.files)
  const rowHalf = (filesInRank * s.spacing) / 2
  return {
    x: (file + 0.5) * s.spacing - rowHalf,
    y: (rank + 0.5) * s.rankDepth - (g.ranks * s.rankDepth) / 2,
  }
}

/** Every slot, front rank first. */
export function slots(arm: Arm, formation: FormationName, strength: number): Vec2[] {
  const n = bodies(arm, strength)
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) out.push(slotAt(arm, formation, strength, i))
  return out
}

/** How many bodies a Unit arranges — men, or guns for artillery. */
export function bodyCount(arm: Arm, strength: number): number {
  return bodies(arm, strength)
}

/** Slots in Field metres, for a Unit at a position and facing. */
export function worldSlots(
  arm: Arm,
  formation: FormationName,
  strength: number,
  position: Vec2,
  facing: number,
): Vec2[] {
  return slots(arm, formation, strength).map((s) => {
    const r = rotate(s, facing)
    return { x: position.x + r.x, y: position.y + r.y }
  })
}

/**
 * Seconds a Formation change takes. A battalion visibly takes about half a
 * minute to go from column to square, and whether it got there in time is the
 * drama (ADR-0001).
 */
const DRILL_SECONDS: Record<string, number> = {
  "line>square": 30,
  "square>line": 25,
  "line>attack-column": 20,
  "attack-column>line": 25,
  "line>march-column": 25,
  "march-column>line": 40,
  "attack-column>march-column": 18,
  "march-column>attack-column": 25,
  "attack-column>square": 25,
  "square>attack-column": 25,
  "march-column>square": 45,
  "square>march-column": 35,
  "line>open-order": 20,
  "open-order>line": 35,
  "attack-column>open-order": 25,
  "open-order>attack-column": 35,
  "march-column>open-order": 25,
  "open-order>march-column": 25,
  "open-order>square": 45,
  "square>open-order": 30,
  "limbered>in-battery": 60,
  "in-battery>limbered": 45,
}

/** Elite battalions drill faster; conscripts fumble it. */
const DRILL_BY_GRADE: Record<Grade, number> = {
  conscript: 1.4,
  line: 1,
  elite: 0.75,
}

export function drillSeconds(
  arm: Arm,
  grade: Grade,
  from: FormationName,
  to: FormationName,
): number {
  if (from === to) return 0
  const base = DRILL_SECONDS[`${from}>${to}`] ?? 25
  const cavalryEase = arm === "cavalry" ? 0.7 : 1
  return base * DRILL_BY_GRADE[grade] * cavalryEase
}

/**
 * Enough of a Unit to draw it: the Formation it holds, and the one it is on its
 * way to. The renderer's interpolated snapshot satisfies this without being a
 * Unit, which is what keeps interpolated values out of the simulation for good.
 */
export interface FormationPose {
  arm: Arm
  strength: number
  formation: FormationName
  /**
   * Required, not optional: a Unit would otherwise satisfy this interface
   * structurally while meaning something else by it, and the mistake shows up
   * as a Formation that silently never morphs rather than as a type error.
   */
  changingTo: FormationName | null
  /** 0 to 1 through the change. */
  changeProgress: number
}

export function poseOf(unit: Unit): FormationPose {
  return {
    arm: unit.arm,
    strength: unit.strength,
    formation: unit.changing?.from ?? unit.formation,
    changingTo: unit.changing?.to ?? null,
    changeProgress: unit.changing ? Math.min(1, unit.changing.elapsed / unit.changing.duration) : 0,
  }
}

/**
 * Where a Unit's Figures stand right now, mid-change included. Both layouts are
 * sampled at the same fractional index and interpolated, so a line visibly
 * folds into a square across the change's full duration rather than popping.
 */
export function figureSlots(pose: FormationPose, figures: number): Vec2[] {
  const n = bodies(pose.arm, pose.strength)
  const count = Math.max(1, Math.min(figures, n))
  const t = pose.changingTo ? Math.min(1, pose.changeProgress) : 0
  const out: Vec2[] = []
  for (let f = 0; f < count; f++) {
    const index = count === 1 ? 0 : (f * (n - 1)) / (count - 1)
    const a = slotAt(pose.arm, pose.formation, pose.strength, index)
    if (!pose.changingTo) {
      out.push(a)
      continue
    }
    const b = slotAt(pose.arm, pose.changingTo, pose.strength, index)
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }
  return out
}

/** The Footprint a pose covers right now, mid-change included. */
export function poseFootprint(pose: FormationPose): Footprint {
  const now = footprint(pose.arm, pose.formation, pose.strength)
  if (!pose.changingTo) return now
  const to = footprint(pose.arm, pose.changingTo, pose.strength)
  const t = Math.min(1, pose.changeProgress)
  return {
    width: now.width + (to.width - now.width) * t,
    depth: now.depth + (to.depth - now.depth) * t,
  }
}

/** The Footprint a Unit covers right now, mid-change included. */
export function unitFootprint(unit: Unit): Footprint {
  return poseFootprint(poseOf(unit))
}

/**
 * Start a Formation change. A Unit halts to re-form — a battalion cannot file
 * off into column and keep marching at the same time — so this is also what
 * makes a change cost ground as well as time.
 */
export function beginChange(unit: Unit, to: FormationName): boolean {
  if (!allows(unit.arm, to)) return false
  const current = unit.changing?.to ?? unit.formation
  if (current === to) return false
  unit.changing = {
    from: unit.formation,
    to,
    elapsed: 0,
    duration: drillSeconds(unit.arm, unit.grade, unit.formation, to),
  }
  return true
}

/** The Formation a Unit is on its way to, or the one it holds. */
export function intendedFormation(unit: Unit): FormationName {
  return unit.changing?.to ?? unit.formation
}

/** What each Arm marches in when it has ground to cover and nothing pins it. */
export const TRAVELLING_FORMATION: Record<Arm, FormationName> = {
  infantry: "march-column",
  cavalry: "march-column",
  artillery: "limbered",
}
