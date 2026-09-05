import type { BattleSnapshot } from "@/sim/snapshot"
import type { Vec2 } from "@/sim/types"
import { FULL_FRONTAGE, forget, listen, listening, type Listening, type Noise } from "./listen"

export type { Noise, Sounding } from "./listen"

/**
 * C13 — the Field, made audible. One sound per event type (F15), synthesised
 * rather than sampled: black powder is a burst of broadband noise with a hard
 * attack and an exponential tail, and a gun is the same shape lower and longer,
 * so every sound here is a filter and four numbers. Nothing is downloaded, and
 * every sound is a constant somebody can move — the same bargain ADR-0005
 * struck for terrain and the renderer struck again for Powder Smoke.
 *
 * What is worth hearing is decided next door in `listen.ts`, which is pure and
 * tested. This file holds the device and no rule.
 */

/**
 * How loud, as a choice and not a slider. `off` is offered, unlike the hachures
 * beside it in Settings: relief is what says a ridge is a ridge and a player
 * who turns it off has lost part of the battle, whereas everything the Noise
 * says is also on the screen. It is the one thing in this game you can lose
 * nothing at all by silencing.
 */
export type Loudness = "off" | "quiet" | "full"

export const LOUDNESS_CHOICES = ["off", "quiet", "full"] as const

/** Master gain per choice. Well under 1, because a Castiglione fires in bursts. */
const MASTER: Record<Loudness, number> = { off: 0, quiet: 0.18, full: 0.45 }

/**
 * Metres at which a sound is half as loud as it is underfoot.
 *
 * The listener stands at his own Headquarters, which is the part of this worth
 * arguing about. There is no camera position to stand at — F6 fixes the whole
 * Field on one screen and never moves it — so the only honest place to put a
 * Commander's ears is where the game already says he is standing. Fire near the
 * staff is loud and fire a kilometre off is a murmur, and both change as he
 * rides: ADR-0008 made *where do I stand* a question asked all afternoon, and
 * this is that question given a second answer.
 */
const HALF_AT = 300

/** How far a sound is allowed off centre. Nothing sits fully in one ear. */
const PAN_WIDTH = 0.8

/** Seconds of white noise, generated once and read from at moving offsets. */
const NOISE_SECONDS = 2

interface Envelope {
  attack: number
  decay: number
}

interface Filtering {
  type: BiquadFilterType
  from: number
  /** Where the cutoff ends up. Equal to `from` for a filter that does not move. */
  to: number
  q: number
}

/**
 * The Field, heard.
 *
 * Built once with the battle and told about every snapshot as it arrives.
 * Everything here is downstream of a state that has already happened, the way
 * the renderer is, and nothing it computes goes back in (ADR-0003).
 */
export class Noises {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null

  private loudness: Loudness = "off"
  /** The Field's width in metres, for panning. Zero until a battle is opened. */
  private across = 0
  private memory: Listening = listening()
  /** Where in the noise buffer the next voice reads from. */
  private offset = 0

  /** Open the Field. `across` is its width in metres, which is what pans. */
  open(across: number, loudness: Loudness): void {
    this.across = across
    this.loudness = loudness
    forget(this.memory)
    if (this.master) this.master.gain.value = MASTER[loudness]
  }

  /**
   * Take the audio device, which a browser hands over inside a gesture and
   * nowhere else. Called from the two presses every battle passes through —
   * taking an Army, and Standing To — rather than from the frame loop, where
   * the device would be refused and the refusal would repeat sixty times a
   * second.
   */
  wake(): void {
    if (this.loudness === "off") return
    if (!this.ctx) this.build()
    void this.ctx?.resume()
  }

  setLoudness(loudness: Loudness): void {
    this.loudness = loudness
    if (loudness === "off") {
      void this.ctx?.suspend()
      return
    }
    if (!this.ctx) this.build()
    if (this.master) this.master.gain.value = MASTER[loudness]
    void this.ctx?.resume()
  }

  /**
   * Hear one snapshot.
   *
   * `listen` runs whether or not anything will be played, so that turning the
   * Noise up in the middle of a battle does not fire every Rout of the
   * afternoon at once — what was silenced is heard as silence and not as a
   * backlog.
   */
  hear(current: BattleSnapshot): void {
    const heard = listen(this.memory, current)
    if (heard.length === 0 || this.loudness === "off") return
    if (!this.ctx || !this.master || !this.noise) return
    const ears = this.ears(current)
    for (const sounding of heard) this.play(sounding.noise, sounding.at, ears, sounding.width)
  }

  /**
   * Where the Commander is standing: his own Headquarters, which is the one
   * with a Report on it (C17). The middle of the Field until he has taken an
   * Army — the moment before the offer, where nothing is his and nothing should
   * be nearer than anything else.
   */
  private ears(current: BattleSnapshot): Vec2 {
    const mine = current.headquarters.find((hq) => hq.report !== null)
    return mine ? mine.position : { x: this.across / 2, y: this.across / 2 }
  }

  private play(noise: Noise, at: Vec2, ears: Vec2, width: number): void {
    const pan = clamp(((at.x - ears.x) / (this.across / 2)) * PAN_WIDTH, -PAN_WIDTH, PAN_WIDTH)
    const far = HALF_AT / (HALF_AT + Math.hypot(at.x - ears.x, at.y - ears.y))
    // How much of a battalion fired, floored so a gun's twenty metres is still
    // a gun and not a click.
    const bulk = Math.max(0.35, Math.min(1, width / FULL_FRONTAGE))

    switch (noise) {
      case "volley":
        this.voice(
          pan,
          0.5 * bulk * far,
          { type: "lowpass", from: 1700, to: 650, q: 0.7 },
          { attack: 0.004, decay: 0.16 + 0.24 * bulk },
        )
        this.thump(pan, 0.3 * bulk * far, 70, 0.14)
        return
      case "gun":
        this.voice(
          pan,
          0.55 * far,
          { type: "lowpass", from: 520, to: 170, q: 0.9 },
          { attack: 0.003, decay: 0.55 },
        )
        this.thump(pan, 0.9 * far, 46, 0.36)
        return
      case "contact":
        // The loudest thing that happens, and the only one with steel in it:
        // the band is high and narrow where a Volley's is low and open.
        this.voice(
          pan,
          0.6 * bulk * far,
          { type: "bandpass", from: 2300, to: 850, q: 0.8 },
          { attack: 0.012, decay: 0.6 },
        )
        this.thump(pan, 0.5 * far, 95, 0.22)
        return
      case "charge":
        // Not a report but a roar: it swells over a quarter of a second and
        // climbs, which is the one sound here that arrives rather than cracks.
        this.voice(
          pan,
          0.4 * far,
          { type: "bandpass", from: 380, to: 950, q: 1.2 },
          { attack: 0.25, decay: 0.7 },
        )
        return
      case "rout":
        // The same shape falling. A Charge and a Rout are the two things a
        // Commander must never mishear for each other, so they are one sweep
        // run in opposite directions.
        this.voice(
          pan,
          0.36 * far,
          { type: "bandpass", from: 950, to: 210, q: 1.5 },
          { attack: 0.06, decay: 0.9 },
        )
        return
      case "order": {
        // A rider pulling up: two dry ticks, and the only sound here not
        // quietened by how far off it happened. It is a cue to the Commander
        // rather than a noise on the Field, and an Order landing at the far end
        // of the line is the one he most needs to be told about.
        const tick: Filtering = { type: "highpass", from: 2000, to: 2000, q: 0.7 }
        this.voice(pan, 0.22, tick, { attack: 0.001, decay: 0.03 })
        this.voice(pan, 0.16, tick, { attack: 0.001, decay: 0.03 }, 0.07)
        return
      }
    }
  }

  /** A filtered burst of noise, which is what every sound here is cut from. */
  private voice(
    pan: number,
    gain: number,
    filtering: Filtering,
    envelope: Envelope,
    delay = 0,
  ): void {
    const ctx = this.ctx
    if (!ctx || !this.master || gain < 0.001) return
    const at = ctx.currentTime + delay
    const ends = at + envelope.attack + envelope.decay

    const source = ctx.createBufferSource()
    source.buffer = this.noise
    source.loop = true
    // A different stretch of noise for every voice, without a random number:
    // two bursts read a seventh of a second apart share nothing audible, and
    // the simulation's own randomness is C8's and is not this (ADR-0003).
    this.offset = (this.offset + 0.137) % NOISE_SECONDS

    const filter = ctx.createBiquadFilter()
    filter.type = filtering.type
    filter.Q.value = filtering.q
    filter.frequency.setValueAtTime(filtering.from, at)
    if (filtering.to !== filtering.from) {
      filter.frequency.exponentialRampToValueAtTime(filtering.to, ends)
    }

    const level = ctx.createGain()
    level.gain.setValueAtTime(0.0001, at)
    level.gain.linearRampToValueAtTime(gain, at + envelope.attack)
    level.gain.exponentialRampToValueAtTime(0.0001, ends)

    const stereo = ctx.createStereoPanner()
    stereo.pan.value = pan

    source.connect(filter).connect(level).connect(stereo).connect(this.master)
    source.start(at, this.offset)
    source.stop(ends)
  }

  /** The body under a discharge: what is felt rather than heard. */
  private thump(pan: number, gain: number, hz: number, decay: number): void {
    const ctx = this.ctx
    if (!ctx || !this.master || gain < 0.001) return
    const at = ctx.currentTime
    const ends = at + decay

    const osc = ctx.createOscillator()
    osc.type = "sine"
    osc.frequency.setValueAtTime(hz, at)
    osc.frequency.exponentialRampToValueAtTime(hz * 0.5, ends)

    const level = ctx.createGain()
    level.gain.setValueAtTime(0.0001, at)
    level.gain.linearRampToValueAtTime(gain, at + 0.006)
    level.gain.exponentialRampToValueAtTime(0.0001, ends)

    const stereo = ctx.createStereoPanner()
    stereo.pan.value = pan

    osc.connect(level).connect(stereo).connect(this.master)
    osc.start(at)
    osc.stop(ends)
  }

  private build(): void {
    const ctx = new AudioContext()
    const master = ctx.createGain()
    master.gain.value = MASTER[this.loudness]
    master.connect(ctx.destination)

    const frames = Math.floor(ctx.sampleRate * NOISE_SECONDS)
    const noise = ctx.createBuffer(1, frames, ctx.sampleRate)
    const samples = noise.getChannelData(0)
    // The one place a random number is right: this is the raw material every
    // sound is cut out of, made once when the device is taken and never again.
    for (let i = 0; i < frames; i++) samples[i] = Math.random() * 2 - 1

    this.ctx = ctx
    this.master = master
    this.noise = noise
  }

  /** Put the device down with the Field. */
  close(): void {
    forget(this.memory)
    const ctx = this.ctx
    this.ctx = null
    this.master = null
    this.noise = null
    void ctx?.close()
  }
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value
}
