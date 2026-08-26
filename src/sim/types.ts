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
}

export type OrderKind = "move" | "form" | "halt"

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

export interface HaltOrder {
  kind: "halt"
}

export type OrderBody = MoveOrder | FormOrder | HaltOrder

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
}

/** The player's own position on the Field: courier origin, eye, and a target. */
export interface Headquarters {
  army: ArmyId
  position: Vec2
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
}

export interface Battle {
  /** Seconds since the clock started. */
  time: number
  field: Field
  armies: Army[]
  units: Unit[]
  couriers: Courier[]
  dispatches: Dispatch[]
  crossings: Crossing[]
  keyGround: KeyGround[]
  arrivals: Arrival[]
  /** Enemy Orders fired by clock time; no planning intelligence behind them. */
  plan: PlannedOrder[]
  /** Seconds on the Scenario clock; the battle ends when it runs out. */
  clock: number
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
