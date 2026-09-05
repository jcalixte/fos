/**
 * The band, which is the one thing in `sound/` that is not the battle.
 *
 * Everything else here is derived — a Volley is heard because a Volley
 * happened, and the roar and the drums are read off the same snapshot. This is
 * not: it is recorded music, authored by somebody else, playing over the top.
 * That is a real widening of F15, which reads *sound every battle event*, and
 * it is recorded as such in DESIGN §10 rather than slipped in.
 *
 * Streamed and never bundled. The tracks live in `public/music/` and are named
 * by `index.json` there, the way `public/scenarios/index.json` names the
 * battles on offer — so an app with no tracks in it is a working app with no
 * band, the build stays 470KB, and nothing is downloaded until somebody asks
 * for it. A track that will not load is skipped rather than reported: a
 * missing file is a missing tune and not a broken battle.
 */

export interface Track {
  /** File under `public/music/`, named and not guessed at. */
  file: string
  title: string
  by: string
  /** The licence it is under, shown in Settings. Attribution is not optional. */
  licence: string
  /** Where it came from, so the credit can be followed. */
  href?: string
}

/** Seconds of overlap between one track and the next. */
const CROSSFADE = 5

/** How far under the roar the band is pulled. Fire wins; it should. */
const DUCK = 0.75

export class Music {
  private ctx: AudioContext | null = null
  private out: GainNode | null = null
  /** Two, swapped: one is playing while the next is coming up under it. */
  private decks: { audio: HTMLAudioElement; gain: GainNode }[] = []
  private live = 0
  private list: Track[] = []
  private next = 0
  private on = false
  /** True once the manifest has been asked for, however it went. */
  private asked = false
  /** Set while a crossfade is under way, so it is not started twice. */
  private handing = false

  /** Every track the band knows, for the credits. */
  tracks(): Track[] {
    return this.list
  }

  /**
   * Build the two decks on the battle's own graph, so the band is ducked and
   * silenced by the same master everything else goes through.
   */
  attach(ctx: AudioContext, to: AudioNode): void {
    if (this.ctx) return
    this.ctx = ctx
    this.out = ctx.createGain()
    this.out.gain.value = 0
    this.out.connect(to)
    for (let i = 0; i < 2; i++) {
      const audio = new Audio()
      audio.preload = "auto"
      audio.crossOrigin = "anonymous"
      const gain = ctx.createGain()
      gain.gain.value = 0
      ctx.createMediaElementSource(audio).connect(gain).connect(this.out)
      this.decks.push({ audio, gain })
    }
  }

  setOn(on: boolean): void {
    this.on = on
    if (!on) {
      for (const deck of this.decks) {
        deck.audio.pause()
        deck.gain.gain.value = 0
      }
      return
    }
    void this.begin()
  }

  /**
   * Fetch the manifest once, then start. Asked for only when the band is
   * actually wanted, so a player who never turns it on never pays for the
   * request.
   */
  private async begin(): Promise<void> {
    if (!this.asked) {
      this.asked = true
      try {
        const response = await fetch("/music/index.json")
        if (response.ok) this.list = ((await response.json()) as { tracks: Track[] }).tracks ?? []
      } catch {
        // No manifest is a battle with no band, which is the shipped state.
        this.list = []
      }
      // Not the same tune every afternoon. The simulation's own randomness is
      // seeded and is C8's; this is neither in it nor near it (ADR-0003).
      this.next = Math.floor(Math.random() * Math.max(1, this.list.length))
    }
    if (!this.on || this.list.length === 0) return
    if (this.decks.some((deck) => !deck.audio.paused)) return
    this.cue(this.live)
  }

  /** Put the next track on a deck and bring it up. */
  private cue(deck: number): void {
    const ctx = this.ctx
    const track = this.list[this.next % this.list.length]
    if (!ctx || !track) return
    this.next = (this.next + 1) % this.list.length
    const { audio, gain } = this.decks[deck]!
    audio.src = `/music/${track.file}`
    audio.currentTime = 0
    gain.gain.cancelScheduledValues(ctx.currentTime)
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + CROSSFADE)
    this.live = deck
    void audio.play().catch(() => {
      // A file named in the manifest and not on disk, or a device that will not
      // play yet. Neither is worth a battle stopping for — the next handover
      // moves on to the next track.
      this.handing = false
    })
  }

  /**
   * Called every frame. Two jobs: hand over to the next track before this one
   * runs out, and hold the band under the battle.
   *
   * `roar` is how loud the Field is, 0 to 1. The band is pulled down by it
   * rather than mixed under it — the same rule the drums obey, and for the same
   * reason: at the crisis you should be hearing the crisis.
   */
  advance(roar: number): void {
    const ctx = this.ctx
    const out = this.out
    if (!ctx || !out || !this.on) return

    const under = 1 - DUCK * Math.min(1, roar)
    out.gain.setTargetAtTime(under, ctx.currentTime, 0.4)

    const going = this.decks[this.live]!
    if (this.handing) {
      // Held until the deck that came up is properly under way. Cleared on the
      // new track's own clock and not on a timer: this runs sixty times a
      // second, and the first version of this raised the flag and dropped it in
      // the same breath — so every frame of the last five seconds of a track
      // started the next one, and the band changed tune sixty times a second.
      if (going.audio.currentTime > CROSSFADE) this.handing = false
      return
    }

    const left = going.audio.duration - going.audio.currentTime
    if (!Number.isFinite(left) || left > CROSSFADE) return

    this.handing = true
    going.gain.gain.cancelScheduledValues(ctx.currentTime)
    going.gain.gain.setValueAtTime(going.gain.gain.value, ctx.currentTime)
    going.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + CROSSFADE)
    window.setTimeout(() => going.audio.pause(), CROSSFADE * 1000)
    this.cue(this.live === 0 ? 1 : 0)
  }

  close(): void {
    for (const deck of this.decks) {
      deck.audio.pause()
      deck.audio.src = ""
    }
    this.decks = []
    this.ctx = null
    this.out = null
    this.on = false
  }
}
