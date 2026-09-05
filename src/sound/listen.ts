import type { BattleSnapshot } from "@/sim/snapshot"
import type { Vec2 } from "@/sim/types"

/**
 * What the Field is doing, and what that is worth hearing (F15).
 *
 * The half of C13 with rules in it, and kept away from the half that makes a
 * noise: an `AudioContext` is a device and cannot be asserted about, whereas
 * *a Rout sounds once and a rider who found nobody sounds not at all* is
 * exactly the sort of thing that goes wrong quietly. This module is pure, DOM
 * -free and tested, in the same spirit `sim/` is.
 *
 * It reads the snapshot and no other stream. DESIGN section 4 says the sound
 * comes off *"the same event stream that feeds Dispatches"*, and that stream
 * does not exist: a `Dispatch` is a line of prose with no `kind` on it, pushed
 * from twenty-one places across seven modules, and giving it one to hang sound
 * off would widen the wire and touch the whole simulation for a decoration.
 * What the snapshot already carries suits it better — `volleys` and `contacts`
 * are events for exactly the step they happened in, which is what a sound is.
 *
 * The cut comes free (F22). Volleys, Contacts, Charges and Routs are on the
 * Field for both armies, so they sound for both. An Order arriving is read off
 * a Courier, who is only ever on his own Commander's wire, so the enemy's
 * Orders are silent without a rule here saying so.
 */

/** What the Field can be heard doing. */
export type Noise = "volley" | "gun" | "charge" | "contact" | "rout" | "order"

/** One thing heard, where it happened. */
export interface Sounding {
  noise: Noise
  at: Vec2
  /**
   * Metres of front that made it — how much of a battalion fired, or how much
   * of one met another. A full frontage for the sounds that have no width,
   * which are the ones a single Unit makes rather than a line of men.
   */
  width: number
}

/** A battalion in line, in metres: the width everything else is read against. */
export const FULL_FRONTAGE = 144

/**
 * Soundings one step may produce. Twenty-two battalions firing inside the same
 * 100ms is not a chord, it is a wall — and past this the wall gets no wider.
 */
export const SOUNDINGS_PER_STEP = 10

interface Was {
  routing: boolean
  charging: boolean
}

/** What the last snapshot left behind, so this one can be compared to it. */
export interface Listening {
  /**
   * Battle time of the last snapshot heard, or -1 for none.
   *
   * The same snapshot is handed over for several frames — the screen runs at
   * 60fps and the simulation at 10Hz — and a Volley heard once per frame is a
   * Volley heard six times.
   */
  heardAt: number
  was: Map<string, Was>
  /** Couriers on the road last step, by id, and the Unit each is riding at. */
  riding: Map<string, string>
}

export function listening(): Listening {
  return { heardAt: -1, was: new Map(), riding: new Map() }
}

/** Forget the battle without forgetting how to listen. */
export function forget(memory: Listening): void {
  memory.heardAt = -1
  memory.was.clear()
  memory.riding.clear()
}

/**
 * Hear one snapshot, and remember it.
 *
 * Returns nothing at all for a snapshot already heard, which is most of them:
 * the caller is a frame loop and the simulation is six times slower than it.
 */
export function listen(memory: Listening, current: BattleSnapshot): Sounding[] {
  // A snapshot older than the last one heard is a new battle under a view that
  // outlived the old one: the ids start again and every memory here is about
  // Units that are not these.
  if (current.time < memory.heardAt) forget(memory)
  if (current.time === memory.heardAt) return []
  memory.heardAt = current.time

  const heard: Sounding[] = []
  const arm = new Map(current.units.map((unit) => [unit.id, unit.arm]))
  for (const volley of current.volleys) {
    const gun = arm.get(volley.unitId) === "artillery"
    heard.push({ noise: gun ? "gun" : "volley", at: volley.from, width: volley.width })
  }
  for (const contact of current.contacts) {
    heard.push({ noise: "contact", at: contact.where, width: contact.width })
  }

  const was = new Map<string, Was>()
  for (const unit of current.units) {
    const before = memory.was.get(unit.id)
    const now = { routing: unit.routing, charging: unit.charging !== null }
    was.set(unit.id, now)
    // A Unit with nothing before it has just walked onto the Field, or its army
    // has just appeared at the end of Deployment (F23). Neither is a Rout, and
    // neither may sound like one.
    if (!before) continue
    if (!before.routing && now.routing) {
      heard.push({ noise: "rout", at: unit.position, width: FULL_FRONTAGE })
    }
    if (!before.charging && now.charging) {
      heard.push({ noise: "charge", at: unit.position, width: FULL_FRONTAGE })
    }
  }
  memory.was = was

  heard.push(...orders(memory, current))
  return heard.length > SOUNDINGS_PER_STEP ? heard.slice(0, SOUNDINGS_PER_STEP) : heard
}

/**
 * How loud the Field is as a whole, this step.
 *
 * The Soundings above are events; this is the bed under them — the roar a
 * battle makes, which is not any one of the things happening on it and is all
 * of them at once. Read as a rate rather than a level, because that is what a
 * snapshot can honestly report: one step holds the discharges of one step, and
 * how loud the afternoon *is* comes of integrating them, which is the device's
 * business and not this one's.
 *
 * Uncut on purpose, and it costs nothing: `volleys`, `contacts`, `routing` and
 * `charging` are on the Field for both armies (F22), so the roar a Commander
 * hears is the whole battle's and not his own half of it. It would be a strange
 * thing to hear only your own men fighting.
 */
export function clamour(current: BattleSnapshot): Clamour {
  let bodies = 0
  for (const unit of current.units) {
    if (unit.charging !== null) bodies += 1
    else if (unit.routing) bodies += 0.6
  }
  // A Contact is worth several Volleys: it is the loudest thing that happens,
  // and unlike a Volley it does not stop after one report.
  return { fire: current.volleys.length + current.contacts.length * 3, bodies }
}

/** What the Field is doing taken all together, rather than event by event. */
export interface Clamour {
  /** Discharges in this step. A rate: the device integrates it. */
  fire: number
  /** Units going at somebody or running from him. A count, already a level. */
  bodies: number
}

/**
 * An Order arriving: a Courier who was on the road last step and is not on it
 * now.
 *
 * Read off the rider rather than off the Unit, which is the fiddlier of the two
 * and the right one. `report.hasOrder` going false to true misses the commonest
 * arrival there is — a rider reaching a Unit already under Orders, where the
 * flag was true before he set off and is true after he hands over. A Courier is
 * removed at exactly one moment, and it is the moment he arrives.
 *
 * What he arrived at is checked, because a rider is also removed when there is
 * nobody to take the Order: a Unit gone off the Field, or one Routing, which is
 * deaf. Nothing was handed over, so nothing is heard.
 */
function orders(memory: Listening, current: BattleSnapshot): Sounding[] {
  const units = new Map(current.units.map((unit) => [unit.id, unit]))
  const riding = new Map<string, string>()
  for (const courier of current.couriers) riding.set(courier.id, courier.unitId)

  const heard: Sounding[] = []
  for (const [id, unitId] of memory.riding) {
    if (riding.has(id)) continue
    const unit = units.get(unitId)
    if (unit && !unit.routing) {
      heard.push({ noise: "order", at: unit.position, width: FULL_FRONTAGE })
    }
  }
  memory.riding = riding
  return heard
}
