import type { BattleSnapshot } from "@/sim/snapshot"
import type { Vec2 } from "@/sim/types"
import {
  clamour,
  FULL_FRONTAGE,
  forget,
  listen,
  listening,
  type Listening,
  type Noise,
} from "./listen"

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

/**
 * Voices one step may start.
 *
 * A discharge is a dozen of them and twenty-two battalions can fire in the same
 * 100ms, so this is a real ceiling and not a formality. Past it the wall of
 * sound does not get any wider, it only gets more expensive.
 */
const VOICES_PER_STEP = 56

/**
 * Golden ratio, used to scatter the cracks of one discharge.
 *
 * Successive multiples of it never clump and never fall into step, which a
 * random number would do about as often as not — and a volley whose cracks
 * happen to land evenly is a drum roll, not musketry.
 */
const GOLD = 0.618033988749895

/**
 * How much of the sound's top end survives the far side of the Field.
 *
 * High frequencies go first over distance, so fire a kilometre off is not the
 * near sound turned down — it is duller, and its cracks have smeared into each
 * other. That is most of what makes a distant battle read as distant rather
 * than as quiet.
 */
const CARRIES = 0.35

/**
 * The bed: how fast the roar rises and falls, per step.
 *
 * A battle does not get loud in one discharge and does not fall silent in one
 * either. About seven seconds to settle, which is roughly the interval between
 * one battalion's Volleys — so the bed reads as *fire is being kept up* rather
 * than following any particular round of it.
 */
const ROAR_SETTLES = 0.014

/**
 * Discharges in one step at which the Field is two-thirds of the way to a full
 * roar — about one and a half a second.
 *
 * Calibrated against what a Castiglione actually does rather than guessed:
 * twenty-two battalions on a twenty-second reload clock is roughly one Volley a
 * second, which is 0.1 here, and that afternoon should read as a battle going
 * on and not as a full-dress general action.
 */
const AT_FULL_CRY = 0.15

/**
 * The pas ordinaire: 76 to the minute, which is the pace a French battalion
 * actually marched at. Beaten in real time and not in battle time — at Tempo 4
 * the afternoon goes four times as fast and the drummer does not.
 */
const PAS_ORDINAIRE = 76

/** How far ahead beats are scheduled. Comfortably past one 10Hz snapshot. */
const BEAT_LOOKAHEAD = 0.6

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
  /** Voices started in the step being heard, against `VOICES_PER_STEP`. */
  private spent = 0

  /** Whether the drums beat. Their own switch, because they are their own thing. */
  private drumming = false
  /** The bed: a rumble, a crackle over it, and how loud each currently is. */
  private bed: { rumble: GainNode; crackle: GainNode } | null = null
  /** Discharges a step, smoothed. The roar is a curve laid over this. */
  private rate = 0
  private roar = 0
  private crowd = 0
  /** Context time the next beat falls on, or 0 for a drummer not yet started. */
  private beat = 0

  /** Open the Field. `across` is its width in metres, which is what pans. */
  open(across: number, loudness: Loudness, drums: boolean): void {
    this.across = across
    this.loudness = loudness
    this.drumming = drums
    this.rate = 0
    this.roar = 0
    this.crowd = 0
    this.beat = 0
    forget(this.memory)
    if (this.master) this.master.gain.value = MASTER[loudness]
  }

  /**
   * The drums, which are a separate switch from the Noise.
   *
   * They are not a soundtrack — a battalion's drummer is on the Field and is
   * how the pace is passed down it — but they are the one sound here a player
   * may reasonably not want without wanting silence, so they get their own.
   */
  setDrums(on: boolean): void {
    this.drumming = on
    if (!on) this.beat = 0
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
    // Whether the afternoon actually moved. A paused battle and a snapshot
    // handed over for the sixth time look the same from here, and neither is a
    // step the drums should march through.
    const advanced = current.time !== this.memory.heardAt && current.time >= this.memory.heardAt
    const heard = listen(this.memory, current)
    if (this.loudness === "off") return
    if (!this.ctx || !this.master || !this.noise) return

    this.spent = 0
    const ears = this.ears(current)
    for (const sounding of heard) this.play(sounding.noise, sounding.at, ears, sounding.width)
    if (advanced) {
      this.swell(clamour(current))
      this.march()
    }
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
        // Six hundred muskets, not one. See `rolling`.
        this.rolling(pan, far, {
          cracks: 5 + Math.round(11 * bulk),
          window: 0.3 + 0.3 * bulk,
          gain: 0.34 * bulk,
          cut: 2400,
          to: 900,
          q: 0.8,
          // Twenty milliseconds, against a gap of about twenty between cracks.
          // A musket's report is a very short thing, and the first version of
          // this gave it seventy — so five cracks sounded at once and a Volley
          // came out as a wash of filtered noise rather than as musketry.
          decay: 0.02,
        })
        this.thump(pan, 0.32 * bulk * far, 68, 0.14)
        this.tail(pan, 0.11 * bulk * far, 300, 0.3)
        return
      case "gun":
        // A battery is several pieces on their own reload clocks, so it rolls
        // too — fewer, slower and vastly bigger than musketry.
        this.rolling(pan, far, {
          cracks: 2 + Math.round(4 * bulk),
          window: 0.55,
          gain: 0.5,
          cut: 760,
          to: 190,
          q: 0.9,
          // Longer than a musket and still short. A gun is a crack and a
          // pressure wave; the length people remember is the echo, and that is
          // the tail below rather than the report.
          decay: 0.09,
          thump: { hz: 46, decay: 0.34, gain: 0.7 },
        })
        this.tail(pan, 0.2 * far, 200, 0.6)
        return
      case "contact":
        // The loudest thing that happens, and the only one with steel in it:
        // the band is high and narrow where fire is low and open, and it does
        // not stop after one report — it clatters.
        this.rolling(pan, far, {
          cracks: 10 + Math.round(10 * bulk),
          window: 1.0,
          gain: 0.3 * bulk,
          cut: 2800,
          to: 1100,
          q: 1.1,
          // Denser than fire and still made of separate blows, because that is
          // what it is. Steel is short.
          decay: 0.035,
        })
        this.thump(pan, 0.5 * far, 95, 0.28)
        return
      case "charge":
        // Not a report but a roar: it swells over a quarter of a second and
        // climbs, which is the one sound here that arrives rather than cracks.
        this.voice(
          pan,
          0.42 * far,
          { type: "bandpass", from: 380, to: 950, q: 1.2 },
          { attack: 0.25, decay: 0.8 },
        )
        return
      case "rout":
        // The same shape falling. A Charge and a Rout are the two things a
        // Commander must never mishear for each other, so they are one sweep
        // run in opposite directions.
        this.voice(
          pan,
          0.38 * far,
          { type: "bandpass", from: 950, to: 210, q: 1.5 },
          { attack: 0.06, decay: 1.0 },
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

  /**
   * A discharge, which is not one crack.
   *
   * This is the whole of what a battalion sounds like and the first version of
   * this file got it wrong: a Volley was a single burst of noise, which is one
   * musket however loud you make it. Six hundred men do not fire together — the
   * word of command reaches them at slightly different moments, and the sound
   * rolls down the line and trails off in stragglers. So a discharge is a dozen
   * short cracks scattered across half a second, weighted to the front, and it
   * is the scattering rather than the volume that makes it a battalion.
   *
   * Distance does two things to it, and only one of them is volume. High
   * frequencies go first, so far fire is duller; and the cracks smear into each
   * other, so far fire is longer and less articulate. Both are why a battery a
   * kilometre off reads as a rolling boom rather than as a quiet bang.
   */
  private rolling(
    pan: number,
    far: number,
    spec: {
      cracks: number
      window: number
      gain: number
      cut: number
      to: number
      q: number
      decay: number
      /** A body under every crack, for the sounds that have one. */
      thump?: { hz: number; decay: number; gain: number }
    },
  ): void {
    // Far cracks have smeared together, so there is nothing to be had from
    // spending voices resolving them individually.
    const cracks = Math.max(2, Math.round(spec.cracks * (0.45 + 0.55 * far)))
    const window = spec.window * (1 + (1 - far) * 0.7)
    const carries = CARRIES + (1 - CARRIES) * far
    // A different start per discharge, so two battalions firing in the same
    // step do not fire the same ragged pattern.
    let u = (this.offset * 7) % 1

    for (let i = 0; i < cracks; i++) {
      u = (u + GOLD) % 1
      // Squared, so the mass of the fire is at the front and the tail of it is
      // stragglers — which is the shape of the thing rather than an effect.
      const when = window * u * u
      // Each crack its own pitch. A dozen identical ones is a machine.
      const pitch = 0.8 + 0.45 * ((u * 3) % 1)
      this.voice(
        pan,
        spec.gain * far * (0.6 + 0.4 * u),
        { type: "lowpass", from: spec.cut * carries * pitch, to: spec.to * carries, q: spec.q },
        { attack: 0.002, decay: spec.decay * (0.7 + 0.6 * u) },
        when,
      )
      if (spec.thump) {
        this.thump(pan, spec.thump.gain * far, spec.thump.hz * pitch, spec.thump.decay, when)
      }
    }
  }

  /**
   * The report going away: what is left of a discharge after the cracks, rolling
   * off the ground and the woods. Low, long and soft, and the reason a battery
   * sounds like a battery rather than like a slammed door.
   */
  private tail(pan: number, gain: number, cut: number, decay: number): void {
    this.voice(
      pan,
      gain,
      { type: "lowpass", from: cut, to: cut * 0.4, q: 0.6 },
      { attack: 0.05, decay },
      0.03,
    )
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
    if (this.spent++ >= VOICES_PER_STEP) return
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
  private thump(pan: number, gain: number, hz: number, decay: number, delay = 0): void {
    const ctx = this.ctx
    if (!ctx || !this.master || gain < 0.001) return
    if (this.spent++ >= VOICES_PER_STEP) return
    const at = ctx.currentTime + delay
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

  /**
   * The bed: the roar of the whole Field, under everything else.
   *
   * Not one of the things happening on the battle and all of them at once — the
   * sound a battle makes from a distance, which no single event can carry
   * because it is what the events add up to. Integrated from `clamour`'s rate
   * rather than set from any one step, so it swells through the crisis and
   * falls away when the firing stops rather than flickering with each Volley.
   *
   * Two layers, because a battle does not merely get louder as it gets worse.
   * The rumble is always there once anything is happening; the crackle comes in
   * over it only at real intensity, which is what makes a general action sound
   * different from a skirmish rather than just bigger.
   */
  private swell(heat: { fire: number; bodies: number }): void {
    const ctx = this.ctx
    const bed = this.bed
    if (!ctx || !bed) return
    // The rate first, and the curve after it. Clipping each step to 0 or 1
    // before smoothing was the first version of this and it was wrong: a step
    // holds one discharge or none, so the average of the clipped thing is the
    // duty cycle, and the roar could never rise above the fraction of steps
    // somebody fired in. Measured at 0.005 on a Castiglione, which is silence.
    this.rate += (heat.fire - this.rate) * ROAR_SETTLES
    this.crowd += (Math.min(1, heat.bodies / 8) - this.crowd) * ROAR_SETTLES * 2
    // Compressive, so a few guns are already a murmur and a general action
    // still has somewhere left to go.
    this.roar = 1 - Math.exp(-this.rate / AT_FULL_CRY)

    const body = Math.min(1, this.roar + this.crowd * 0.3)
    // Squared, so the crackle is genuinely a second stage and not the first one
    // in different clothes.
    this.ramp(bed.rumble, 0.42 * body)
    this.ramp(bed.crackle, 0.14 * body * body)
  }

  /** Move one bed layer to a new gain. Set and never jumped: a jump clicks. */
  private ramp(gain: GainNode, to: number): void {
    const at = this.ctx!.currentTime
    gain.gain.cancelScheduledValues(at)
    gain.gain.setValueAtTime(gain.gain.value, at)
    gain.gain.linearRampToValueAtTime(to, at + 0.15)
  }

  /**
   * The drums, beaten at the pas ordinaire.
   *
   * Diegetic and not a score: a battalion's drummer is on the Field and beating
   * the pace is his job. They are quietened by the roar rather than mixed under
   * it — you cannot hear a drum over musketry, which is both true and the thing
   * that gives an afternoon its shape: drums through the approach, drowned at
   * the crisis, and back again when the firing dies.
   *
   * Beaten in real time. At Tempo 4 the afternoon goes four times as fast and
   * the drummer does not, because he is a sound in the room and not an event in
   * the battle.
   */
  private march(): void {
    const ctx = this.ctx
    if (!ctx || !this.drumming) return
    const interval = 60 / PAS_ORDINAIRE
    // A battle that was stopped, or a tab that was in the background: the
    // clock kept running and nothing was scheduled against it. Without this the
    // drummer makes up every beat he missed, all in the same instant.
    if (this.beat === 0 || this.beat < ctx.currentTime) this.beat = ctx.currentTime + interval
    const under = Math.max(0, 1 - this.roar * 1.6)
    while (this.beat < ctx.currentTime + BEAT_LOOKAHEAD) {
      const when = Math.max(this.beat, ctx.currentTime) - ctx.currentTime
      // Every fourth beat is the one the foot comes down on.
      const accent = Math.round(this.beat / interval) % 4 === 0
      const gain = (accent ? 0.3 : 0.16) * under
      if (gain > 0.004) {
        this.thump(0, gain, accent ? 96 : 84, 0.24, when)
        // The stick, not the skin: muffled right down, because a drum a
        // quarter of a mile off is almost entirely its low end.
        this.voice(
          0,
          gain * 0.5,
          { type: "lowpass", from: 900, to: 300, q: 0.7 },
          { attack: 0.002, decay: 0.09 },
          when,
        )
      }
      this.beat += interval
    }
  }

  private build(): void {
    const ctx = new AudioContext()
    // Twenty-two battalions can fire inside the same 100ms and each is a dozen
    // cracks, so the bus can be asked for more than one, and anything over one
    // is not loudness — it is fuzz, and fuzz is heard as *the sound is broken*
    // rather than as *the battle is loud*. A limiter is the cheapest honest
    // answer and it never acts on anything smaller.
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -8
    limiter.knee.value = 6
    limiter.ratio.value = 12
    limiter.attack.value = 0.002
    limiter.release.value = 0.2
    limiter.connect(ctx.destination)
    const master = ctx.createGain()
    master.gain.value = MASTER[this.loudness]
    master.connect(limiter)

    const frames = Math.floor(ctx.sampleRate * NOISE_SECONDS)
    const noise = ctx.createBuffer(1, frames, ctx.sampleRate)
    const samples = noise.getChannelData(0)
    // The one place a random number is right: this is the raw material every
    // sound is cut out of, made once when the device is taken and never again.
    for (let i = 0; i < frames; i++) samples[i] = Math.random() * 2 - 1

    this.ctx = ctx
    this.master = master
    this.noise = noise
    this.bed = {
      rumble: this.layer(ctx, master, noise, "lowpass", 220, 0.7),
      crackle: this.layer(ctx, master, noise, "bandpass", 700, 1.2),
    }
  }

  /** One continuous layer of the bed: noise, filtered, at a gain that is ramped. */
  private layer(
    ctx: AudioContext,
    master: GainNode,
    noise: AudioBuffer,
    type: BiquadFilterType,
    frequency: number,
    q: number,
  ): GainNode {
    const source = ctx.createBufferSource()
    source.buffer = noise
    source.loop = true
    // Two in series, not one. A single biquad rolls off at 12dB an octave,
    // which over a bed that never stops leaves audible hiss on top of the
    // rumble — and a permanent hiss is the one thing a bed must not be.
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = q
    const again = ctx.createBiquadFilter()
    again.type = type
    again.frequency.value = frequency
    again.Q.value = q
    const gain = ctx.createGain()
    gain.gain.value = 0
    source.connect(filter).connect(again).connect(gain).connect(master)
    source.start()
    return gain
  }

  /** Put the device down with the Field. */
  close(): void {
    forget(this.memory)
    const ctx = this.ctx
    this.ctx = null
    this.master = null
    this.noise = null
    this.bed = null
    this.beat = 0
    this.rate = 0
    this.roar = 0
    this.crowd = 0
    void ctx?.close()
  }
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value
}
