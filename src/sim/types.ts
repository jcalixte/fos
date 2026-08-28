export type { Vec2 } from "./vec"
import type { Vec2 } from "./vec"

export type Arm = "infantry" | "cavalry" | "artillery"

/** An ordered ladder of three; a Roster supplies the display names. */
export type Grade = "conscript" | "line" | "elite"

export type Ground = "open" | "road" | "wood" | "village" | "marsh" | "water"

/** How a Formation is written in a Dispatch or on a button. */
export function describeFormation(formation: FormationName): string {
  return formation.replaceAll("-", " ")
}

export type FormationName =
  | "march-column"
  | "attack-column"
  | "line"
  | "square"
  | "open-order"
  | "limbered"
  | "in-battery"

export type ArmyId = string
export type UnitId = string

/**
 * How far a Unit may act on its own account, as an ordered ladder from giving
 * ground to taking it. Every rung but `hold-ground` is bounded in metres from
 * the Post (ADR-0007).
 */
export type Latitude = "stand-off" | "hold-ground" | "close-up" | "follow-up"

/**
 * A Unit's Standing Order: the brief it consults whenever no Order covers the
 * case. Two questions and not one, because the feet and the fire are not rungs
 * of the same ladder — a Unit may be told to close up and to hold its fire.
 */
export interface Standing {
  latitude: Latitude
  /** True while the Unit is not to open fire at all. */
  holdFire: boolean
}

/** A Formation change under way. Nothing pops: C3 morphs the slots across it. */
export interface FormationChange {
  from: FormationName
  to: FormationName
  /** Seconds elapsed of `duration`. */
  elapsed: number
  duration: number
}

export interface Unit {
  id: UnitId
  army: ArmyId
  /** Historical display name — the model sees only arm, grade and strength. */
  name: string
  arm: Arm
  grade: Grade
  /** Men still with the Unit. Never Figures. */
  strength: number
  /** Centre of the Footprint, in metres. */
  position: Vec2
  /** Where the Face points, in radians. */
  facing: number
  formation: FormationName
  changing: FormationChange | null
  /** The Order the Unit is working on, once its Courier has arrived. */
  order: LiveOrder | null
  /** Remaining Route waypoints, in metres. */
  route: Vec2[]
  /** The Initiative rule currently suspending the Order, by name. */
  suspendedBy: string | null
  /** What the Unit does when no Order covers the case (ADR-0007). */
  standing: Standing
  /**
   * The ground the Unit was given: its last Move Order's destination, where it
   * was last halted, or where it was deployed. Latitude is measured from here,
   * so this is what stops a Unit acting on its own account from choosing
   * different ground rather than merely drifting off the ground it was given.
   */
  post: Vec2
  /**
   * Ground the Unit is walking to on its own account, under its Standing Order,
   * or null. Set by the Initiative rule that is holding the Order suspended —
   * so unlike every other suspension, this one is not a Unit standing still.
   */
  shift: Vec2 | null
  /** Seconds until the Unit can fire again. Counts down whatever it is doing. */
  reload: number
  /**
   * Willingness to stay and fight, 0 to 1. The real health bar: a Unit is
   * beaten when this gives out, and never when its Strength runs down.
   */
  morale: number
  /** The highest Morale it can recover to. Every Rally lowers it. */
  moraleCeiling: number
  /**
   * Accumulated exhaustion, 0 fresh to 1 blown. Counted apart from Morale
   * because it is spent apart: it is bought by the pace a Unit is asked for and
   * not by anything that has been done to it, so a battalion that marched all
   * afternoon and was never shot at is full of one and empty of the other.
   */
  fatigue: number
  /**
   * True while the Unit is blown: it will not be let go at anybody, and it does
   * not stop being blown the moment its Fatigue creeps back under the mark it
   * crossed. A state and not a threshold, for the reason a Rout is one — the way
   * out is a higher bar than the way in, or a regiment rests half a minute and
   * charges again.
   */
  blown: boolean
  /** Set once the Unit has Broken. A Routing Unit is deaf to Orders. */
  routing: Rout | null
  /** The Charge it is committed to, once an Order has let it go. */
  charging: Charge | null
}

/** What a Unit is doing after its Morale gave out. */
export interface Rout {
  /** The way it is running, in radians. Away from whatever broke it. */
  heading: number
  /** Battle time it Broke, in seconds. */
  brokeAt: number
}

/**
 * A Charge under way: a committed run at one other Unit. A state and not an
 * Order, the way a Rout is — an Order lets the Unit go, and after that the
 * geometry and the two Units' Morale decide it.
 */
export interface Charge {
  targetId: UnitId
  /** Battle time it was let go, in seconds. */
  launchedAt: number
  /** Set once the Face held: the chargers are running back out of it. */
  recoiling: boolean
}

/**
 * One Contact: two blocks touching. Like a Volley it is an event and not a
 * state, and for a stronger reason — Contact is decided in seconds and is never
 * something a Unit sits in.
 */
export interface Contact {
  id: string
  /** Battle time, in seconds. */
  at: number
  unitId: UnitId
  targetId: UnitId
  /** Where the blocks met, in metres. */
  where: Vec2
  /** Which Face was struck — 0 front, 1 right, 2 rear, 3 left — or null for none. */
  side: number | null
  /** Metres of front that met. */
  width: number
  /** Men the chargers lost to it. */
  casualties: number
  /** Men the Unit they struck lost to it. */
  targetCasualties: number
  /** How it ended. Contact ends when one Unit Breaks, or not at all. */
  outcome: "broke" | "recoiled"
}

/**
 * One discharge: every musket or gun that bore, all at once. It is an event and
 * not a state — the simulation keeps a Volley only for the step it happened in,
 * long enough for the renderer to raise a flash off it (F13).
 */
export interface Volley {
  id: string
  /** Battle time, in seconds. */
  at: number
  unitId: UnitId
  targetId: UnitId
  /** Centre of the Face that fired, in metres. */
  from: Vec2
  /** Where the fire went, in radians. */
  direction: number
  /** Metres of Face that fired, which is how wide the flash is. */
  width: number
  /** Men the target lost to it. */
  casualties: number
}

export type OrderKind = "move" | "form" | "charge" | "halt" | "standing"

export interface MoveOrder {
  kind: "move"
  destination: Vec2
  /** Facing to hold on arrival, in radians. */
  arrivalFacing: number
  arrivalFormation: FormationName
}

export interface FormOrder {
  kind: "form"
  formation: FormationName
}

/**
 * A committed run at one named Unit. It carries no destination: what the player
 * aimed at is a Unit, and the Unit moves — which is the whole difficulty, since
 * the Courier takes a minute and a half to arrive and the target has been
 * somewhere else since.
 */
export interface ChargeOrder {
  kind: "charge"
  targetId: UnitId
}

export interface HaltOrder {
  kind: "halt"
}

/**
 * A new brief, and the one Order that leaves the Unit doing what it was doing:
 * it says what the Unit may do unbidden, which is a different question from
 * what it is under orders to do now.
 */
export interface StandingOrder {
  kind: "standing"
  latitude: Latitude
  holdFire: boolean
}

export type OrderBody = MoveOrder | FormOrder | ChargeOrder | HaltOrder | StandingOrder

export interface Order {
  id: string
  unitId: UnitId
  body: OrderBody
  /** Battle time the player issued it, in seconds. */
  issuedAt: number
}

/** An Order that has reached its Unit and is being carried out. */
export interface LiveOrder {
  order: Order
  arrivedAt: number
}

/**
 * The rider carrying an Order. He is on the Field while he rides, so an Order in
 * flight is a thing the player watches rather than a hidden timer (ADR-0002).
 */
export interface Courier {
  id: string
  order: Order
  position: Vec2
  /** Where he set off from, kept for drawing the ride. */
  origin: Vec2
  /**
   * Seconds he is still held at the Headquarters before he sets off. A harried
   * staff is slow getting anything out of the door, and the wait is at the table
   * rather than on the road — so the rider sits where the player can see him
   * (ADR-0008).
   */
  hold: number
}

/** The player's own position on the Field: courier origin, eye, and a target. */
export interface Headquarters {
  army: ArmyId
  position: Vec2
  /**
   * Ground the staff is riding to, or null while it is standing. While it is
   * riding, no Courier can leave it at all: there is nobody at the last place
   * the Orders came from, and the commander is in the saddle (ADR-0008).
   */
  destination: Vec2 | null
  /**
   * Seconds every Order waits before its rider sets off, whatever the ride
   * after it. Zero at Deployment, and each Overrun adds to it for good — the
   * Morale Ceiling's shape, and for the same reason: a staff that has been
   * ridden over once commands slower for the rest of the afternoon.
   */
  surcharge: number
  /**
   * True while an enemy Unit is near enough to harry it. Not a fact about the
   * Headquarters so much as about the ground around it, so it is recomputed
   * every step rather than set and cleared.
   */
  harried: boolean
}

export interface Dispatch {
  /** Battle time, in seconds. */
  at: number
  unitId: UnitId | null
  text: string
}

/** A named piece of the Field whose possession at the end decides the battle. */
export interface KeyGround {
  name: string
  position: Vec2
  radius: number
}

/** Key Ground, with the army standing on it. Only a battle has a holder. */
export interface HeldGround extends KeyGround {
  /** The last army to have had the nearest Unit on it, or null while nobody has. */
  holder: ArmyId | null
}

/** A passable strip through otherwise impassable terrain — only a march column fits. */
export interface Crossing {
  name: string
  /** Cell indices that make up the strip. */
  cells: number[]
}

export interface Army {
  id: ArmyId
  name: string
  /** Colour the army's Units are drawn in. */
  colour: number
  headquarters: Headquarters | null
  /**
   * What the whole Roster is worth, weighted by Grade and fixed at Deployment.
   * The denominator Army Break is measured against — and, because it is fixed
   * there, the reason a Unit still on the road counts toward it.
   */
  weight: number
  /**
   * Men the whole Roster put on the Field, fixed at Deployment like `weight`
   * and for the same reason. What a battle cost is read against this, so a
   * Unit that never arrived is counted as having been the army's to lose.
   */
  strength: number
  /**
   * Units the whole Roster mustered, fixed at Deployment beside the other two.
   * Unweighted, because it is only ever counted against what is left in order
   * to say how many the army no longer has — `weight` is what decides anything.
   */
  units: number
}

/**
 * How a battle ended: an army broke, the clock ran out and what each army had
 * was counted, or the commander broke off the action himself. Never by
 * annihilation.
 */
export interface Outcome {
  /** Battle time it was decided, in seconds. */
  at: number
  /**
   * What decided it, and not merely when. The clock running out is two
   * different endings wearing one word — the Key Ground counted, or the Key
   * Ground even and condition asked instead — and a battle read off `clock`
   * alone cannot tell which, so an army that split the Key Ground one apiece
   * and won on condition would be reported as having won on ground it did not
   * take. That the clock ran out at all is still readable from `at`.
   *
   * `conceded` is its own way in rather than an Army Break wearing its coat.
   * Both end with an army off the Field, but one is a commander deciding and
   * the other is his men deciding for him, and a Return that could not tell
   * them apart would be reporting the wrong afternoon.
   */
  by: "army-break" | "key-ground" | "condition" | "conceded"
  /** The army left holding the Field, or null where nothing decided it. */
  winner: ArmyId | null
  /** Who held each piece of Key Ground when it ended. */
  keyGround: { name: string; holder: ArmyId | null }[]
}

export interface Battle {
  /** Seconds since the clock started. */
  time: number
  field: Field
  armies: Army[]
  units: Unit[]
  couriers: Courier[]
  /** Fired this step only, and cleared at the top of the next one. */
  volleys: Volley[]
  /** Struck this step only, and cleared at the top of the next one. */
  contacts: Contact[]
  dispatches: Dispatch[]
  crossings: Crossing[]
  keyGround: HeldGround[]
  arrivals: Arrival[]
  /** Enemy Orders fired by clock time; no planning intelligence behind them. */
  plan: PlannedOrder[]
  /** Seconds on the Scenario clock; the battle ends when it runs out. */
  clock: number
  /** How it ended, once it has. Null while it is still being fought. */
  outcome: Outcome | null
  seed: number
  nextId: number
}

/** A Unit entering the Field after the clock has started. */
export interface Arrival {
  /** Battle time, in seconds. */
  at: number
  unit: Unit
  /** Where it walks on from. */
  entry: Vec2
  order: OrderBody | null
}

export interface PlannedOrder {
  at: number
  unitId: UnitId
  body: OrderBody
}

export interface Field {
  /** Cells across and down. */
  width: number
  height: number
  /** Metres per cell. */
  cellSize: number
  /** One Ground index per cell, row-major. */
  ground: Uint8Array
  /** Metres of elevation per cell, row-major. */
  elevation: Float32Array
  /** True where a Crossing runs, so routing may cross impassable Ground. */
  crossing: Uint8Array
}
