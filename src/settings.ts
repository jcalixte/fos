import { PAPERS, type PaperName, STAFF_MAP_DEFAULTS, type StaffMapOptions } from "@/render/staffmap"
import { LOUDNESS_CHOICES, type Loudness } from "@/sound"

/**
 * What the player has said about how the game looks and sounds, and nothing
 * else.
 *
 * Kept apart from `useBattle` because it outlives every battle: a Scenario is
 * never saved (see the router), and this is the one thing that survives closing
 * the tab. Read the way `recallBattle` is read — a refused write in private
 * browsing costs a preference, which is not an error.
 */

const STORED = "fos:settings"

export interface Settings {
  /**
   * The tone the Field is drawn on. Safe to leave to the player because it is
   * safe *now* and was not always: on bare paper the near-white army fell to
   * 1.88 against the lightest tone, which is a battalion he has to hunt for. It
   * is the grass wash that made this a preference rather than a trap — the
   * paper is 42% of what a Unit actually stands on, so across every tone on
   * offer the white army runs 2.27 to 2.80 and the blue 2.34 to 2.90, against
   * 2.61 and 2.52 on the grass all of this replaced. There is no choice here
   * that costs him the Field.
   */
  paper: PaperName
  /**
   * How hard the relief is laid in. `off` is not offered: hachures are the only
   * thing on this map that says a ridge is a ridge, and a player who cannot see
   * why his battalion is hidden has lost something the game is about, not a
   * decoration.
   */
  hachures: Exclude<StaffMapOptions["hachures"], "off">
  /**
   * How loud the Field is. Unlike the two above it this one may be turned off
   * altogether: everything the Noise says is also on the screen, so silence
   * costs a player nothing he needs (F15, C13).
   *
   * It starts at `off`. A game that makes a noise the first time it is opened
   * is a game opened once in an office and closed again, and the Noise is not
   * what any of this is for.
   */
  sound: Loudness
  /**
   * Whether the drums beat. Their own switch and not a rung of the one above,
   * because they are the one sound in the game a player may reasonably not want
   * without wanting silence.
   *
   * On, unlike the Noise: they cost nothing when the Noise is off, and a player
   * who has turned the Noise up has said he wants to hear the battle.
   */
  drums: boolean
}

export const HACHURE_CHOICES = ["light", "full"] as const

export const DEFAULT_SETTINGS: Settings = {
  paper: STAFF_MAP_DEFAULTS.paper,
  hachures: STAFF_MAP_DEFAULTS.hachures === "off" ? "light" : STAFF_MAP_DEFAULTS.hachures,
  sound: "off",
  drums: true,
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORED)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const stored = JSON.parse(raw) as Partial<Settings>
    // Checked against the palette rather than trusted: the key is a name and
    // the file is a thing a player can edit.
    const paper = stored.paper && stored.paper in PAPERS ? stored.paper : DEFAULT_SETTINGS.paper
    const hachures =
      stored.hachures && (HACHURE_CHOICES as readonly string[]).includes(stored.hachures)
        ? stored.hachures
        : DEFAULT_SETTINGS.hachures
    const sound =
      stored.sound && (LOUDNESS_CHOICES as readonly string[]).includes(stored.sound)
        ? stored.sound
        : DEFAULT_SETTINGS.sound
    return { paper, hachures, sound, drums: stored.drums !== false }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORED, JSON.stringify(settings))
  } catch {
    // Private browsing refuses the write. Losing a preference is not an error.
  }
}
