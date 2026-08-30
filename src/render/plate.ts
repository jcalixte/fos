import { formationsFor } from "@/sim/formation"
import { GROUNDS } from "@/sim/ground"
import { HARRIED_RANGE } from "@/sim/headquarters"
import { MORALE_WORDS } from "@/sim/morale"
import { makeField } from "@/sim/field"
import type { Arm, Field, Grade, Ground, Vec2 } from "@/sim/types"
import type { BattleSnapshot, UnitReport, UnitSnapshot } from "@/sim/snapshot"
import type { HeadquartersView, ViewState } from "./BattleView"

/**
 * The plate: every combination the Field and the Units have between them, on
 * one Field, at the one scale that matters.
 *
 * DESIGN.md §10 records how the last renderer bug was actually caught — "by
 * drawing the whole matrix and looking at it, which is the only way any of this
 * can be checked". This is that sentence made runnable. Playing a battle shows
 * the combinations the battle happens to reach; the states that matter most are
 * the ones a battle reaches rarely and late, and a harried Headquarters that
 * vanishes into the paper is not something anyone finds by playing well.
 *
 * It draws no conclusions. It is a page you look at.
 */

/** Metres to a cell, and cells to a side. Rivoli's, so the plate is at Rivoli's
 * scale: a battalion in line is the same 102px here that it is in a battle. */
const CELL = 8
const WIDE = 240
const HIGH = 150

const metres = (cells: number) => cells * CELL

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

/**
 * A Field carrying one of everything: each Ground, a slope that runs the whole
 * hachure ladder from below its floor to past its ceiling, a road and a river
 * that leave the Field on both sides, a road that stops inside it, a bridge, a
 * wood cut by the frame, a village big enough to have a street, and a
 * watercourse one cell wide.
 */
export function plateField(): Field {
  const field = makeField(WIDE, HIGH, CELL)
  const index = (cx: number, cy: number) => cy * WIDE + cx
  const paint = (cx: number, cy: number, ground: Ground) => {
    if (cx < 0 || cy < 0 || cx >= WIDE || cy >= HIGH) return
    field.ground[index(cx, cy)] = GROUNDS.indexOf(ground)
  }

  // Relief. Three rises, each chosen against a threshold in the hachure ladder:
  // one under its floor and so drawn blank, one running the whole of its range,
  // and one past its ceiling.
  for (let cy = 0; cy < HIGH; cy++) {
    const gentle = 10 * smoothstep((cy - 8) / 32)
    const ridge = 80 * smoothstep((cy - 88) / 30)
    const scarp = 40 * smoothstep((cy - 130) / 8)
    for (let cx = 0; cx < WIDE; cx++) field.elevation[index(cx, cy)] = gentle + ridge + scarp
  }

  // A wood cut by the left frame, and one standing on the ridge.
  const ellipse = (ox: number, oy: number, rx: number, ry: number, ground: Ground) => {
    for (let cy = Math.floor(oy - ry); cy <= oy + ry; cy++) {
      for (let cx = Math.floor(ox - rx); cx <= ox + rx; cx++) {
        if (((cx - ox) / rx) ** 2 + ((cy - oy) / ry) ** 2 <= 1) paint(cx, cy, ground)
      }
    }
  }
  ellipse(18, 16, 28, 14, "wood")
  ellipse(150, 102, 18, 12, "wood")

  // A village with room for a street in it.
  for (let cy = 14; cy < 31; cy++) for (let cx = 168; cx < 189; cx++) paint(cx, cy, "village")

  // A river that leaves the Field top and bottom, and a watercourse one cell
  // wide — the Redone at Castiglione, which the first cut of the staff map drew
  // as a scratch.
  const riverAt = (cy: number) => Math.round(78 + 6 * Math.sin(cy / 18))
  for (let cy = 0; cy < HIGH; cy++) {
    for (let d = 0; d < 3; d++) paint(riverAt(cy) + d, cy, "water")
  }
  for (let cy = 55; cy < HIGH; cy++) paint(214, cy, "water")

  // Marsh on the near bank.
  for (let cy = 62; cy < 81; cy++) for (let cx = 88; cx < 105; cx++) paint(cx, cy, "marsh")

  // A road across the whole Field, leaving it both sides, and a bridge where it
  // meets the river.
  const roadAt = (cx: number) => 44 + Math.round(3 * Math.sin(cx / 40))
  for (let cx = 0; cx < WIDE; cx++) paint(cx, roadAt(cx), "road")
  const mouth = riverAt(roadAt(80))
  for (let cx = mouth - 2; cx < mouth + 5; cx++) {
    const cy = roadAt(cx)
    paint(cx, cy, "road")
    field.crossing[index(cx, cy)] = 1
  }

  // A road off the bottom frame, and one that genuinely stops inside the Field:
  // that one *should* keep its end, and is here to prove the other two lost
  // theirs for the right reason.
  for (let t = 0; t <= 1; t += 0.002) {
    paint(Math.round(30 + t * 140), Math.round(HIGH - 1 - t * 92), "road")
  }
  for (let cx = 196; cx < 226; cx++) paint(cx, 96, "road")

  return field
}

/**
 * A Field small enough to be a thumbnail, carrying the four things a paper tone
 * has to hold up against: grass, a wood, a road and water. Used by Settings to
 * show a tone rather than name it — a colour offered without a picture of it is
 * not a choice, it is a guess.
 */
export function swatchField(): Field {
  const wide = 44
  const high = 28
  const field = makeField(wide, high, CELL)
  const paint = (cx: number, cy: number, ground: Ground) => {
    if (cx < 0 || cy < 0 || cx >= wide || cy >= high) return
    field.ground[cy * wide + cx] = GROUNDS.indexOf(ground)
  }
  for (let cy = 0; cy < high; cy++) {
    for (let cx = 0; cx < wide; cx++)
      field.elevation[cy * wide + cx] = 30 * smoothstep((cy - 14) / 12)
  }
  for (let cy = 3; cy < 14; cy++) {
    for (let cx = 4; cx < 19; cx++) {
      if (((cx - 11) / 7.5) ** 2 + ((cy - 8) / 5.5) ** 2 <= 1) paint(cx, cy, "wood")
    }
  }
  for (let cy = 0; cy < high; cy++) {
    for (let d = 0; d < 2; d++) paint(30 + Math.round(2 * Math.sin(cy / 6)) + d, cy, "water")
  }
  for (let cx = 0; cx < wide; cx++) paint(cx, 19 + Math.round(1.5 * Math.sin(cx / 12)), "road")
  return field
}

// ---------------------------------------------------------------------------

const ARMS: Arm[] = ["infantry", "cavalry", "artillery"]
const GRADES: Grade[] = ["conscript", "line", "elite"]
export const PLATE_ARMIES = ["blue", "white"] as const

const STRENGTH: Record<Arm, number> = { infantry: 700, cavalry: 260, artillery: 110 }

/** Facing south, so a Frontage runs across the page and a row of Units reads as
 * a row rather than as a comb. */
const SOUTH = Math.PI / 2

let serial = 0

/**
 * A Unit for the plate. The Report is spelled separately from the rest, because
 * on a real Field it arrives separately: every plate Unit carries one, since the
 * plate is a drawing of everything the renderer can be asked to draw and half of
 * that is only ever drawn about a Commander's own army (C17).
 */
type PlateUnit = Partial<Omit<UnitSnapshot, "report">> & {
  army: string
  position: Vec2
  report?: Partial<UnitReport>
}

function unit(over: PlateUnit): UnitSnapshot {
  const arm = over.arm ?? "infantry"
  const { report, ...rest } = over
  return {
    id: `plate-${serial++}`,
    name: "plate",
    arm,
    grade: "line",
    strength: STRENGTH[arm],
    facing: SOUTH,
    formation: arm === "artillery" ? "in-battery" : "line",
    changingTo: null,
    changeProgress: 0,
    morale: "steady",
    disordered: false,
    routing: false,
    charging: null,
    recoiling: false,
    pursuing: false,
    ...rest,
    report: {
      suspendedBy: null,
      hasOrder: false,
      standing: "hold-ground",
      briefedTo: null,
      dictated: false,
      shifting: false,
      fatigue: "fresh",
      aiming: null,
      speed: 0,
      ...report,
    },
  }
}

/**
 * The three matrices, laid in bands down the Field.
 *
 * Every row and column is one axis and one only, so a difference on the page is
 * a difference in exactly one thing — which is what makes a channel bleeding
 * into another one visible instead of merely present.
 */
export function plateSnapshot(): BattleSnapshot {
  serial = 0
  const units: UnitSnapshot[] = []

  // Band 1 — Formation by Arm, both armies. What F5 asks for: four infantry
  // silhouettes that can be told apart at this scale.
  // Asked of C3 rather than listed here. A plate with its own copy of the list
  // is a plate that stops covering everything the day a Formation is added, and
  // says nothing when it does.
  const shapes = ARMS.flatMap((arm) => formationsFor(arm).map((formation) => ({ arm, formation })))
  PLATE_ARMIES.forEach((army, row) => {
    shapes.forEach(({ arm, formation }, column) => {
      units.push(
        unit({
          army,
          arm,
          formation,
          position: { x: 130 + column * 172, y: 250 + row * 130 },
        }),
      )
    })
  })

  // Band 2 — the states a Unit passes through, which a battle reaches late and
  // rarely and never all at once.
  const states: Omit<PlateUnit, "army" | "position">[] = [
    { report: { hasOrder: true } },
    { report: { dictated: true } },
    { report: { shifting: true } },
    { formation: "line", changingTo: "square", changeProgress: 0.5 },
    { routing: true, morale: "on the point of breaking" },
    { charging: "plate-0", arm: "cavalry" },
    { charging: "plate-0", recoiling: true, arm: "cavalry" },
    { charging: "plate-0", pursuing: true, arm: "cavalry" },
    { report: { aiming: "plate-0" } },
    { strength: 90, report: { fatigue: "blown" } },
    // In line, which is the hardest case for the glyph: a battalion in line is
    // the thinnest thing on the Field, so a mark that reads across this one
    // reads across everything.
    { disordered: true },
  ]
  states.forEach((state, column) => {
    units.push(unit({ army: "blue", position: { x: 130 + column * 172, y: 560 }, ...state }))
  })

  // Band 3 — Arm by Grade across, Morale by army down. The one §7 calls for,
  // and the one that has to be looked at on ground as well as on paper: it sits
  // across the ridge on purpose, so half of every row is on hachures.
  PLATE_ARMIES.forEach((army, side) => {
    MORALE_WORDS.forEach((morale, rung) => {
      const row = side * MORALE_WORDS.length + rung
      ARMS.forEach((arm, a) => {
        GRADES.forEach((grade, g) => {
          units.push(
            unit({
              army,
              arm,
              grade,
              morale,
              routing: morale === "on the point of breaking" && rung === 0 && side === 1,
              position: { x: 130 + (a * GRADES.length + g) * 190, y: 700 + row * 56 },
            }),
          )
        })
      })
    })
  })

  return {
    time: 600,
    units,
    // Empty, both of them. The staffs the plate draws are built by hand in
    // `plateView`, because the page wants all three of a Headquarters' states
    // at once and a snapshot only ever carries the one it is in; and the feed
    // is a panel and not something the Field draws.
    headquarters: [],
    dispatches: [],
    // A rider on the road, and one still held at the tables.
    couriers: [
      {
        id: "plate-courier",
        unitId: units[0].id,
        position: { x: 1400, y: 300 },
        origin: { x: 1650, y: 200 },
        held: false,
      },
      {
        id: "plate-held",
        unitId: units[1].id,
        position: { x: 1650, y: 200 },
        origin: { x: 1650, y: 200 },
        held: true,
      },
    ],
    ghosts: [
      { unitId: units[0].id, position: { x: 130, y: 430 }, facing: SOUTH, formation: "line" },
    ],
    // Empty, and filled by `plateVolleys` on the plate's own clock: a Volley
    // is an event and a fixed one would flash for ever and smoke exactly once.
    volleys: [],
    contacts: [
      {
        id: "plate-contact",
        at: 600,
        unitId: units[22].id,
        targetId: units[23].id,
        where: { x: 1050, y: 600 },
        side: 0,
        width: 60,
        outcome: "broke",
      },
    ],
  }
}

/**
 * Where the plate keeps firing, so what a reader looks at is a *bank* of Powder
 * Smoke and not one cloud.
 *
 * One cloud says nothing about the thing that has to be judged. The roof's
 * warning (F13 x F5) is about smoke where the fighting is thickest, and the
 * only honest picture of that is several battalions on their own reload clocks
 * laying it over the same ground for minutes — which no still frame and no
 * single Volley can show.
 *
 * The line stands upwind of Band 3 on purpose. That band is Arm by Grade by
 * Morale for both armies, so the drift carries the smoke across the exact Unit
 * SMOKE_CAP is a note about: a white conscript, which under a bank has only its
 * body left to be found by.
 */
const PLATE_FIRE = [
  // Four battalions abreast, each on the period's own musket clock, staggered
  // so they are never all firing in the same second.
  // Offsets are small so the first clouds are up within seconds; the reloads
  // are the period's own, so the bank reaches its steady thickness on the same
  // clock a firefight does and no faster.
  { at: { x: 300, y: 650 }, width: 140, reload: 22, offset: 0.5 },
  { at: { x: 620, y: 650 }, width: 140, reload: 24, offset: 3 },
  { at: { x: 940, y: 650 }, width: 140, reload: 21, offset: 6 },
  { at: { x: 1260, y: 650 }, width: 140, reload: 23, offset: 9 },
  // A battery: narrow, and half as often, which is what a gun's clock is.
  { at: { x: 1620, y: 650 }, width: 26, reload: 45, offset: 4 },
  // And one on its own, well clear of the rest, because a lone cloud at the
  // bottom of the cap is a different judgement from a bank at the top of it.
  { at: { x: 1450, y: 1090 }, width: 140, reload: 34, offset: 12 },
]

/**
 * The Volleys due between two battle times, which is what a snapshot's
 * `volleys` means: fired in this step and nowhere else.
 *
 * Ids carry the discharge number so every cloud is a new one — a repeated id is
 * a Volley the renderer has already smoked and will not smoke again.
 */
export function plateVolleys(from: number, to: number): BattleSnapshot["volleys"] {
  const due: BattleSnapshot["volleys"] = []
  for (const [source, fire] of PLATE_FIRE.entries()) {
    // Discharges land at `offset + n * reload`; emit the ones falling in
    // (from, to]. Floored at zero so a source's first Volley is its offset and
    // not a discharge from before the plate was opened.
    const first = Math.max(0, Math.floor((from - fire.offset) / fire.reload) + 1)
    const last = Math.floor((to - fire.offset) / fire.reload)
    for (let n = first; n <= last; n++) {
      due.push({
        id: `plate-volley-${source}-${n}`,
        at: fire.offset + n * fire.reload,
        unitId: "plate-firing",
        targetId: "plate-target",
        from: { ...fire.at },
        direction: SOUTH,
        width: fire.width,
      })
    }
  }
  return due
}

/**
 * What a harried Headquarters may be drawn in, and what each costs against the
 * grass the staff map lays down. The orange is the incumbent and the default:
 * it is the mob's own, which is the whole of its argument, and it reads at
 * 1.16 — which on green was carried by hue and on this ground is carried by
 * nothing. Red ink is what a survey of the period would have raised an alarm
 * in anyway.
 */
export const ALARMS = {
  /** 1.16 vs grass. The mob's orange, and the colour to beat. */
  orange: 0xd8632f,
  /** 1.73 */
  vermilion: 0xc0392b,
  /** 2.45 */
  carmine: 0xa01f2d,
  /** 2.82 */
  madder: 0x8f1d24,
  /** 3.28 */
  sanguine: 0x7d1a20,
} as const

export type AlarmName = keyof typeof ALARMS

export interface PlateOptions {
  headquarters: "steady" | "harried" | "riding"
  alarm: AlarmName
  fireZones: boolean
  smoke: boolean
  arming: boolean
  selected: boolean
  deployment: boolean
}

export function plateView(snapshot: BattleSnapshot, options: PlateOptions): ViewState {
  const hq: HeadquartersView = {
    army: "blue",
    // Open ground, and deliberately not the village: the first draft put the
    // tables inside it, where a mark that vanishes cannot be told from a mark
    // standing on a hundred roofs.
    position: { x: 1650, y: 200 },
    mine: true,
    destination: options.headquarters === "riding" ? { x: 1280, y: 440 } : null,
    harried: options.headquarters === "harried",
  }
  /** The other Commander's staff: a mark to ride at, in his own colour. */
  const theirs: HeadquartersView = {
    army: "white",
    position: { x: 260, y: 1180 },
    mine: false,
    destination: null,
    harried: false,
  }
  return {
    selected: options.selected ? (snapshot.units[12]?.id ?? null) : null,
    playerArmy: "blue",
    headquarters: [hq, theirs],
    keyGround: [
      { name: "held", position: { x: 1700, y: 900 }, radius: 72, holder: "blue" },
      { name: "open", position: { x: 1700, y: 1080 }, radius: 72, holder: null },
    ],
    deploymentZone: options.deployment ? [40, 180, 1840, 460] : null,
    drag: null,
    placing: null,
    armyColours: { blue: 0x2f4d8f, white: 0xe3e7ef },
    fireZones: options.fireZones,
    smoke: options.smoke,
    alarm: ALARMS[options.alarm] ?? ALARMS.orange,
    arming: options.arming,
  }
}

/** The ring the Headquarters is judged against, exported so the page can say
 * what the reader is looking at. */
export const PLATE_HARRIED_RANGE = HARRIED_RANGE
export const PLATE_EXTENT = { x: metres(WIDE), y: metres(HIGH) }
