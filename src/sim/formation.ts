import type { Arm, FormationName, Grade, Unit, Vec2 } from "./types"
import { axes, dot, rotate } from "./vec"

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
    // The same musket the same man carried in the line. Reach is a fact about
    // the weapon, so every infantry Formation that can fire reaches the same
    // hundred metres, and the only infantry number that ever differed was this
    // one — which is the per-Formation constant F8 exists to forbid.
    //
    // It was 150, and the fifty metres were the Formation's survivability
    // charged a second time. Density already prices dispersal: most of what is
    // sent at a screen finds the ground between the men, and that is what keeps
    // it alive. The extra reach bought it a band from 111m to 161m where it
    // fired and no line could answer — and against a line, which cannot fire
    // while it marches and walks at 0.8 against the screen's 1.2, that band
    // could be held open for as long as the leash allowed. Twenty minutes of it
    // routed a battalion for the loss of nobody at all.
    //
    // At a hundred, any shot the screen takes is a shot a halted line can take
    // back, and the price of a line's fire stays what it should be: you must
    // stop. What Open Order is for is intact — it survives round shot, it fires
    // on the march, it outwalks foot, and horse eats it.
    range: 100,
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

/**
 * Metres of ground one body stands in, across and front to rear alike. A man is
 * about two feet across in the ranks; a horse and rider a yard; a gun with its
 * crew round the trail rather more.
 *
 * A fact about what is standing there and not about the Formation it stands in,
 * which is why it is per Arm and authored once (F8) — the same discipline
 * PENETRATION is held to on the weapon's side.
 */
const BODY_METRES: Record<Arm, number> = { infantry: 0.6, cavalry: 1, artillery: 2.5 }

const ARTILLERY: Record<string, FormationSpec> = {
  "in-battery": {
    // Zero, not slow. The guns are off their limbers and standing on their
    // trails: a battery in battery does not go anywhere at all, it traverses.
    // Moving it means hitching up, which is the 45 seconds in DRILL_SECONDS
    // and the Initiative rule that spends them.
    spread: { ranks: 1 },
    spacing: 18,
    rankDepth: 8,
    faces: 1,
    speed: 0,
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

/**
 * What a Formation is, in the words the button says it in on hover — the
 * counterpart of `explainLatitude` on the Standing Order's side, and held to
 * the same discipline: every number is read off the spec rather than written
 * into the prose, so tuning a dial cannot leave the definition lying about what
 * the Unit will do.
 *
 * What each one says is what the geometry above actually buys, since that is
 * the whole of C3: a column is few muskets and much depth because it *is* deep,
 * and a square turns horse away because it *has* four Faces.
 */
export function explainFormation(arm: Arm, formation: FormationName): string {
  const s = spec(arm, formation)
  const pace = Math.round(s.speed * 60)
  const ranks = "ranks" in s.spread ? s.spread.ranks : 0
  const files = "files" in s.spread ? s.spread.files : 0
  switch (formation) {
    case "line":
      // Cavalry has no reach to quote: it carries its fight to the enemy.
      return arm === "cavalry"
        ? `${ranks} ranks knee to knee at ${pace}m a minute in the open — the shape it goes at anybody in`
        : `${ranks} ranks and the widest front it can make, so the most muskets bearing: ${s.range}m of reach at ${pace}m a minute in the open, and bare flanks`
    case "attack-column":
      return `${ranks} ranks on a narrow front at ${pace}m a minute in the open — few muskets bearing, and round shot ploughs the whole depth of it, but it goes in without coming apart`
    case "march-column":
      return `${files} abreast for the road at ${pace}m a minute in the open — its fastest pace, and no Face to fight with at all`
    case "square":
      return `four Faces and therefore no flank, which is what turns horse away — but ${pace}m a minute in the open is barely moving, and guns ask for nothing better`
    case "open-order":
      return `a screen at ${s.spacing}m intervals: ${s.range}m of reach, fired on the move, and most shot sent at it finds the ground between the men — but it holds no ground itself`
    case "in-battery":
      return `guns off their limbers and reaching ${s.range}m — and going nowhere at all until they are hitched up again`
    case "limbered":
      return `hitched to the teams at ${pace}m a minute in the open, and not a gun of it can fire`
  }
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

/**
 * The share of the bodies in a shot's way that it actually finds — one figure
 * for a shot running through the ranks, one for a shot running down them.
 *
 * A shot crossing the ranks travels in the lane of one file, so what decides
 * whether that lane holds anybody is the file spacing: a line at 0.6m intervals
 * is a wall, and a ball inside its Frontage is in somebody's lane. Open Order at
 * 1.6m is mostly air, and the ball has a bit better than one chance in three of
 * being in a lane at all. A shot running down a rank is the same argument turned
 * sideways, so it reads rank depth instead.
 *
 * This is the other half of what C3's geometry buys. Depth is what round shot
 * ploughs and the Volley has always charged a column for it; this is what a shot
 * does *not* find in open ground. Without it, dispersal was priced as depth —
 * a screen took two and a half times what the line it screened took, and stood
 * worse under guns than a square, which is the opposite of what the Formation
 * is for.
 */
export function density(arm: Arm, formation: FormationName): Grid {
  const s = spec(arm, formation)
  const body = BODY_METRES[arm]
  return { files: Math.min(1, body / s.rankDepth), ranks: Math.min(1, body / s.spacing) }
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

/**
 * How far a Footprint reaches along `axis`, standing on `facing`. The measure
 * behind every question of the form "how much of this Unit does that one meet" —
 * how much of a Face bears on a target, and how many metres of front two blocks
 * touch over.
 */
export function spanAlong(shape: Footprint, facing: number, axis: Vec2): number {
  const { along, across } = axes(facing)
  return Math.abs(shape.depth * dot(along, axis)) + Math.abs(shape.width * dot(across, axis))
}

export function faces(arm: Arm, formation: FormationName): 0 | 1 | 4 {
  return spec(arm, formation).faces
}

/**
 * Ranks that are in the fight itself. A bayonet reaches the rank in front of it
 * and no further, so the third rank of anything is behind the fighting whatever
 * the Formation — which is why C8 counts these into a Contact, and why what is
 * left over is `backing` below. One fact, read from both ends.
 */
export const ENGAGED_RANKS = 2

/**
 * The share of a Unit standing behind the ranks that are in the fight — the men
 * who cannot reach the enemy and are therefore not fighting him but holding the
 * Unit together. C7 reads it as steadiness, which is the only thing depth has
 * ever been worth.
 *
 * This is the other half of what C3 owes the attack column. Depth was priced
 * only as a liability: round shot ploughs it, few muskets bear out of it, and a
 * narrow front meets a narrow slice of what it charges. Every one of those is
 * right, and together they made the Formation strictly worse than line at
 * everything — which is not what a column is. What the ranks behind actually
 * bought was that the battalion did not come apart: the men in them cannot see
 * what is happening, cannot fire, cannot run without going through the men
 * behind *them*, and are pushing. A line is one rank deep behind its fight and
 * a column is seven.
 *
 * A share and not a count, so it saturates: no amount of depth makes a Unit
 * unbreakable, it only ever approaches every man but the front two.
 *
 * Nothing for a Formation with no Face, and that is the whole of the guard a
 * march column needs — 175 ranks of battalion on a road is the deepest thing on
 * the Field and the least able to stand, because it is not formed to fight at
 * all. It takes Open Order out with it, which is right for the same reason from
 * the other end: a screen is men who are not holding onto each other.
 */
export function backing(arm: Arm, formation: FormationName, strength: number): number {
  if (spec(arm, formation).faces === 0) return 0
  const { ranks } = grid(arm, formation, strength)
  return Math.max(0, (ranks - ENGAGED_RANKS) / ranks)
}

/**
 * The ground a Unit can beat with fire, in Unit-local metres. Derived from
 * Frontage and the Formation's range, never authored.
 *
 * A battalion in line is 144m across and reaches about 100m, so its beaten
 * ground is wider than it is deep — a slab, not a cone — and bare to either
 * side of it, which is what a flank is. Skirmishers in Open Order have no Face
 * to speak of and shoot every way at once, so theirs is the Footprint blown out
 * by the range all round. A square is the second of those and not four of the
 * first: four Faces is no direction it is not fighting in, and tiling a circle
 * with four rectangles left corners it could be charged home on. A Unit on the
 * march has no zone at all, which is the whole argument against being caught in
 * column.
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

/** A Footprint on the Field: what it covers, where it stands, and its facing. */
export interface Standing {
  shape: Footprint
  at: Vec2
  facing: number
}

/** The four corners of a Standing, in Field metres. */
function cornersOf(s: Standing): Vec2[] {
  const { along, across } = axes(s.facing)
  const d = s.shape.depth / 2
  const w = s.shape.width / 2
  return [
    [d, w],
    [d, -w],
    [-d, w],
    [-d, -w],
  ].map(([front, side]) => ({
    x: s.at.x + along.x * front + across.x * side,
    y: s.at.y + along.y * front + across.y * side,
  }))
}

/**
 * Metres of open ground between a Footprint and a point: the ground a ball has
 * to cross from the nearest man standing in it, and zero for a point inside the
 * Formation. The Faceless counterpart of a Face's standoff.
 *
 * What it must not be is the shadow the Footprint casts across the bearing, and
 * that is what it was. 700 men in Open Order are 187m across and 18m deep, and
 * measured that way the swarm was credited with 60m of standoff at 30° off its
 * own front where it had nobody standing past 10m — so its beaten ground bulged
 * into a peanut on the diagonals, up to 19m of reach it had no men to fire it,
 * and pinched to a notch dead ahead where the two lobes met. A screen therefore
 * out-reached the line it screened on every bearing except the one the tests
 * were asking about.
 *
 * This is the Footprint blown out by the range on every side and nothing more:
 * 9m of standoff to the front, 93m along the screen, and a corner rounded off
 * at the range in between. Which is what the measure it replaces always claimed
 * in prose to be.
 */
export function gapToPoint(shape: Footprint, at: Vec2, facing: number, point: Vec2): number {
  const offset = { x: point.x - at.x, y: point.y - at.y }
  const { along, across } = axes(facing)
  const front = Math.abs(dot(offset, along)) - shape.depth / 2
  const side = Math.abs(dot(offset, across)) - shape.width / 2
  return Math.hypot(Math.max(0, front), Math.max(0, side))
}

/**
 * Metres of open ground between two Footprints — the gap a ball actually
 * crosses, rather than the gap between their two centres less what each of them
 * casts across the line. Taken corner by corner because the nearest two
 * rectangles come is a corner of one against an edge of the other.
 */
export function gapBetween(a: Standing, b: Standing): number {
  let gap = Infinity
  for (const c of cornersOf(b)) gap = Math.min(gap, gapToPoint(a.shape, a.at, a.facing, c))
  for (const c of cornersOf(a)) gap = Math.min(gap, gapToPoint(b.shape, b.at, b.facing, c))
  return gap
}

/**
 * How far the beaten ground reaches from the Unit's centre on `bearing` — the
 * same shape `gapToPoint` measures against, solved the other way round so the
 * renderer can trace its edge. Out through a flat side where the ray leaves
 * within the Footprint's own extent, and round the corner's quarter-circle of
 * the range where it does not.
 */
export function reachOnBearing(zone: FireZone, facing: number, bearing: number): number {
  const dir = axes(bearing).along
  const { along, across } = axes(facing)
  const front = Math.abs(dot(dir, along))
  const side = Math.abs(dot(dir, across))
  const w = zone.width / 2
  const d = zone.depth / 2
  if (side > 0) {
    const out = (w + zone.range) / side
    if (out * front <= d) return out
  }
  if (front > 0) {
    const out = (d + zone.range) / front
    if (out * side <= w) return out
  }
  const corner = side * w + front * d
  return corner + Math.sqrt(Math.max(0, corner * corner - (w * w + d * d) + zone.range ** 2))
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

/**
 * The room a body in a mob takes, as a multiple of the room it takes on the
 * march. A Rout is not dressed and not covering its file: the men are running,
 * and they are running in each other's way.
 */
const MOB_SPREAD = 4

/** Golden angle: the one that fills a disc without ever laying down a rank. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/**
 * Unevenness, and deliberately not randomness. A mob has to look like a crowd
 * and be the same crowd on every replay of the same seed (F18), so each body is
 * shoved off its place by a hash of its own index and nothing else.
 */
function stray(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

/**
 * How far a mob spreads: the disc that holds what the Unit has left at mob
 * spacing. Derived from Strength, so a Rout shedding men visibly thins as it
 * runs rather than carrying a fixed blob to the edge of the Field.
 */
export function mobRadius(arm: Arm, strength: number): number {
  const travelling = spec(arm, TRAVELLING_FORMATION[arm])
  const perBody = travelling.spacing * travelling.rankDepth * MOB_SPREAD
  return Math.sqrt((bodies(arm, strength) * perBody) / Math.PI)
}

/**
 * Where a mob's Figures stand: a ragged disc with no ranks, no files and no
 * Face. The Formation grammar cannot say this — every Formation in it is a grid
 * of ranks and files, which is the point of a Formation — so a Rout is drawn
 * from here instead, and a battalion that broke stops looking like a battalion.
 *
 * Drawn from the Figure count rather than sampled out of the body slots the way
 * `figureSlots` does it. There is no layout underneath to sample: what the
 * Figures stand for is a crowd, and a crowd is however many of them there are.
 */
export function mobSlots(arm: Arm, strength: number, figures: number): Vec2[] {
  const count = Math.max(1, Math.min(figures, bodies(arm, strength)))
  const radius = mobRadius(arm, strength)
  const out: Vec2[] = []
  for (let f = 0; f < count; f++) {
    // Square root, so the crowd fills the disc evenly instead of ringing it,
    // and the shove is inward only — a mob spreads as far as it spreads, and
    // the disc it is said to cover is the disc it stands in.
    const reach = radius * Math.sqrt((f + 0.5) / count) * (0.55 + stray(f) * 0.45)
    const angle = f * GOLDEN_ANGLE + stray(f + 977) * 0.8
    out.push({ x: Math.cos(angle) * reach, y: Math.sin(angle) * reach })
  }
  return out
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

/**
 * Radians a second a Formation with no speed comes round at. A quarter turn in
 * about a minute.
 *
 * A rate, and deliberately not a wheel. A wheel is paid for in ground: the
 * outer flank of a long line walks the arc, so the wider the Unit the longer it
 * takes, which is why C8 derives that one from Frontage. A traverse is paid for
 * in men: the guns are off their limbers and each crew handspikes its own piece
 * on its trail, all of them at once. Twelve guns therefore come round in the
 * time six do, and reading the traverse off Frontage had a twelve-gun battery
 * spending seven minutes of a thirty-minute battle changing front.
 *
 * Scaled by Grade because it is drill and not marching — the same ladder that
 * sets how fast a battalion files into square.
 */
const TRAVERSE_RATE = Math.PI / 2 / 60

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
 * Radians a second the Unit traverses at, or null if this Formation wheels
 * instead. Derived from having no speed at all rather than authored per
 * Formation: a body of troops that cannot walk has no outer flank to walk the
 * arc, so it must be turning some other way, and for guns that way is the
 * trail. Nothing needs to declare it twice.
 */
export function traverseRate(arm: Arm, grade: Grade, formation: FormationName): number | null {
  if (spec(arm, formation).speed > 0) return null
  return TRAVERSE_RATE / DRILL_BY_GRADE[grade]
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
  /**
   * A Rout holds no Formation at all. It is here rather than in the Formation
   * itself because a mob is not a drill: nothing can be ordered into it, and a
   * Formation the Roster offers is a thing the player may ask for.
   */
  routing: boolean
}

export function poseOf(unit: Unit): FormationPose {
  return {
    arm: unit.arm,
    strength: unit.strength,
    formation: unit.changing?.from ?? unit.formation,
    changingTo: unit.changing?.to ?? null,
    changeProgress: unit.changing ? Math.min(1, unit.changing.elapsed / unit.changing.duration) : 0,
    routing: unit.routing !== null,
  }
}

/**
 * Where a Unit's Figures stand right now, mid-change included. Both layouts are
 * sampled at the same fractional index and interpolated, so a line visibly
 * folds into a square across the change's full duration rather than popping.
 */
export function figureSlots(pose: FormationPose, figures: number): Vec2[] {
  if (pose.routing) return mobSlots(pose.arm, pose.strength, figures)
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
  // Turned back to the Formation it was coming out of: the same change run
  // backwards from wherever it had got to, and not a fresh drill. A battalion
  // three seconds into filing off is three seconds from being a column again,
  // and it is standing in something that is neither Formation — so the pose
  // walks back the way it came instead of popping to a shape the men are not in.
  //
  // What this buys the player is the arrival Formation. Naming one costs a Form
  // Order, the march files the Unit back into column, and the full drill for
  // that meant half a minute of standing still bought by a change the Unit
  // never made. Now the bill is what it actually did, which for two Orders said
  // in the same breath is a second or two.
  //
  // Priced at the return drill and scaled by how far it got, not at the seconds
  // it spent: the two drills are not the same length, and coming out of column
  // is the dearer of them. So changing its mind is never cheaper than the
  // ground it covered, which is still the right way round to be wrong.
  if (unit.changing && unit.changing.from === to) {
    const progress = Math.min(1, unit.changing.elapsed / unit.changing.duration)
    const duration = drillSeconds(unit.arm, unit.grade, unit.changing.to, to)
    unit.changing = { from: unit.changing.to, to, elapsed: duration * (1 - progress), duration }
    return true
  }
  unit.changing = {
    from: unit.formation,
    to,
    elapsed: 0,
    // Timed from the Formation the Unit was on its way to, not the one it still
    // stands in. Reading the held Formation charged nothing at all to abandon a
    // change and go back to it — from and to were the same Formation, so the
    // drill was free and instant, and two rules that disagreed could trade a
    // battalion back and forth every tick for the whole battle.
    //
    // Known simplification: the full drill for a third Formation, whatever the
    // Unit had already spent going to the second one. Only the way back is
    // priced by how far it got, because only the way back is a road the Unit is
    // already standing on.
    duration: drillSeconds(unit.arm, unit.grade, current, to),
  }
  return true
}

/** The Formation a Unit is on its way to, or the one it holds. */
export function intendedFormation(unit: Unit): FormationName {
  return unit.changing?.to ?? unit.formation
}

/** What each Arm falls back to when it must be able to fight and nothing says how. */
export const FIGHTING_FORMATION: Record<Arm, FormationName> = {
  infantry: "line",
  cavalry: "line",
  artillery: "in-battery",
}

/** True if the Formation can beat any ground at all. */
export function canFire(arm: Arm, formation: FormationName): boolean {
  return spec(arm, formation).range > 0
}

/**
 * True if the Formation's fire does not need the Unit standing still. Derived
 * and not authored: a Formation with no Face has no line to dress, so there is
 * nothing that halting would put in order — every man loads and levels on his
 * own account and walks on. A Face is exactly the thing that has to be halted
 * to be presented.
 *
 * Only Open Order comes out of this. March column and limbered guns have no
 * reach to fire with, cavalry none at all, and line, square and a battery in
 * battery all present a Face.
 */
export function firesOnTheMove(arm: Arm, formation: FormationName): boolean {
  const s = spec(arm, formation)
  return s.range > 0 && s.faces === 0
}

/** What each Arm marches in when it has ground to cover and nothing pins it. */
export const TRAVELLING_FORMATION: Record<Arm, FormationName> = {
  infantry: "march-column",
  cavalry: "march-column",
  artillery: "limbered",
}
