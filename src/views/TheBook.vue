<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, reactive, ref, useTemplateRef } from "vue"
import { useRoute } from "vue-router"
import ChapterPanel from "@/components/ChapterPanel.vue"
import ReturnPanel from "@/components/ReturnPanel.vue"
import TopBar from "@/components/TopBar.vue"
import UnitCard from "@/components/UnitCard.vue"
import { scenarioPath } from "@/scenario/catalogue"
import { loadScenario } from "@/scenario/loader"
import { armyColours, BattleView, type ViewState } from "@/render/BattleView"
import { STAFF_MAP_DEFAULTS } from "@/render/staffmap"
import { BookSession } from "@/session/book"
import { keepTheRecord, type RecordKept } from "@/session/record"
import type { ArmyReturn } from "@/sim/return"
import type { Chapter } from "@/sim/scenario"
import type { UnitSnapshot } from "@/sim/snapshot"
import type { Grade, Outcome } from "@/sim/types"
import { loadSettings } from "@/settings"
import { type Loudness, LOUDNESS_CHOICES, Noises } from "@/sound"

/**
 * The Book: one battle, read rather than fought.
 *
 * A page of its own and not a mode of `TheBattle`, because almost everything
 * that view carries is machinery for *saying something* — the offer, the
 * arranging, the Order grammar, the staff being ridden, the Charge being aimed.
 * A reader says nothing. What is left is the Field, the clock, and the account,
 * and building that on top of the command screen would have meant hiding four
 * fifths of it and then explaining why.
 *
 * What it does share is the parts that matter: the same `BattleView` drawing
 * the same Field, and a `BookSession` behind the same seam the other two
 * implementations sit behind, so nothing here knows a rule (ADR-0013).
 */
const route = useRoute()
const id = String(route.params.battle)
const host = useTemplateRef<HTMLElement>("host")

const view = ref<BattleView | null>(null)
const session = ref<BookSession | null>(null)
/**
 * The Field, heard (C13). It holds the audio device and no rule, and it is
 * handed the same snapshots the renderer is.
 *
 * A reader has no Headquarters, so he hears the afternoon from the middle of
 * the Field rather than from anybody's staff — which `Noises` decides for
 * itself off the snapshot, because a cut made for nobody leaves both staffs
 * reported and neither of them anybody's.
 */
const noises = new Noises()

const ui = reactive({
  loading: true,
  error: null as string | null,
  name: "",
  summary: "",
  chapters: [] as Chapter[],
  clock: 0,
  time: 0,
  running: false,
  tempo: 1,
  units: [] as UnitSnapshot[],
  selected: null as string | null,
  outcome: null as Outcome | null,
  returns: [] as ArmyReturn[],
  sound: "off" as Loudness,
  music: false,
  bandAvailable: false,
  /** True until the first gesture on the page, which is what buys the device. */
  silent: true,
  gradeNames: {} as Record<string, Record<Grade, string>>,
})

const viewState = reactive<ViewState>({
  selected: null,
  // Nobody's army, so nothing is drawn as *yours*. Both are simply on the Field
  // in their own colours, which is what a reader is here to see.
  playerArmy: "",
  headquarters: [],
  keyGround: [],
  deploymentZone: null,
  drag: null,
  placing: null,
  armyColours: {},
  fireZones: false,
  arming: false,
})

const TEMPOS = [0.5, 1, 4, 8]

const selectedUnit = computed(() => ui.units.find((u) => u.id === ui.selected) ?? null)

/** How far through the afternoon, for the bar under the clock. */
const through = computed(() => (ui.clock > 0 ? Math.min(1, ui.time / ui.clock) : 0))

function stamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

const headline = computed(() => {
  const o = ui.outcome
  if (!o) return ""
  const winner = ui.returns.find((r) => r.id === o.winner)
  return winner ? `The ${winner.name} hold the Field` : "Neither army holds the Field"
})

/**
 * How the day ended, said the way the Return wants it. Read off `by` rather
 * than off the clock, because two of the four endings happen at the clock's
 * full length and mean different things (ADR-0006).
 */
const detail = computed(() => {
  const o = ui.outcome
  if (!o) return ""
  switch (o.by) {
    case "key-ground":
      return `The clock ran out at ${stamp(o.at)}, and the Key Ground was counted.`
    case "condition":
      return `The clock ran out at ${stamp(o.at)} with the Key Ground even, so what each army had left decided it.`
    case "army-break":
      return `At ${stamp(o.at)} an army had nothing left in hand and quit the Field.`
    case "conceded":
      return `At ${stamp(o.at)} a commander broke off the action.`
  }
})

/** A Unit's Grade in its own army's words — Grenadier, conscrit, Linie. */
function gradeName(unit: UnitSnapshot): string {
  return ui.gradeNames[unit.army]?.[unit.grade] ?? unit.grade
}

let frame = 0
let last = 0
let uiClock = 0
let closed = false

function tick(now: number): void {
  frame = requestAnimationFrame(tick)
  const s = session.value
  const v = view.value
  if (!s || !v) return
  s.advance((now - last) / 1000)
  last = now
  viewState.selected = ui.selected
  // Both Headquarters, both drawn as somebody's own: there is no enemy staff
  // here, because there is nobody for either of them to be the enemy of.
  viewState.headquarters = s.current.headquarters.map((hq) => ({
    army: hq.army,
    position: hq.position,
    mine: true,
    destination: hq.report?.destination ?? null,
    harried: hq.report?.harried ?? false,
  }))
  v.draw(s.previous, s.current, s.alpha, viewState)
  // With the flash and not after it: a Volley is one event, and the report
  // going with the smoke is what makes a discharge at the far end of the line
  // readable rather than confusing.
  noises.hear(s.current)

  if (now - uiClock < 100) return
  uiClock = now
  ui.time = s.current.time
  ui.units = s.current.units
  ui.running = s.running
  ui.tempo = s.tempo
  viewState.keyGround = s.current.keyGround
  if (s.outcome && !ui.outcome) {
    ui.outcome = s.outcome
    ui.returns = s.returns()
  }
}

function setTempo(tempo: number): void {
  session.value?.send({ kind: "tempo", tempo })
}

/**
 * The afternoon on paper: the Return, every Unit as it stands, both staffs and
 * the whole feed, written out to a file (`session/record.ts`).
 *
 * A Book's record is the useful one. It is cut for nobody, so both armies'
 * Dispatches and both armies' Reports are in it — a battle taken by a Commander
 * can only ever write down half a day, and half a day is thin evidence that the
 * afternoon went right.
 */
async function takeRecord(): Promise<void> {
  const s = session.value
  if (!s) return
  kept.value = await keepTheRecord(
    { battle: id, name: ui.name, clock: ui.clock, army: null, outcome: s.outcome },
    s.current,
    s.returns(),
  )
  clearTimeout(keptFor)
  keptFor = setTimeout(() => (kept.value = null), 2000) as unknown as number
}

/**
 * Where the last record went, shown on the button for a moment. Copying is
 * silent and a download is not, so the press has to say which it was.
 */
const kept = ref<RecordKept | null>(null)
let keptFor = 0

/**
 * A browser hands over the audio device inside a gesture and nowhere else, and
 * a Book has neither of the two presses a battle is woken by: nobody takes an
 * Army here and nobody Stands To, because the clock is already running when the
 * page opens. So the device is taken on the first thing the reader does at all
 * — pausing, changing the Tempo, or picking a battalion off the Field.
 *
 * Until then the afternoon is silent, and the bar says so rather than leaving
 * him to wonder whether the sound is broken.
 */
function wake(): void {
  // Never turns the Noise on. A reader who has silenced it, here or in
  // Settings, has said something, and pausing the clock is not him taking it
  // back — so an incidental gesture only takes the device when the sound was
  // already wanted, and is otherwise nothing at all.
  if (!ui.silent || ui.sound === "off") return
  ui.silent = false
  noises.setLoudness(ui.sound)
  noises.wake()
}

/**
 * The press that asks for it outright, which is the only thing here allowed to
 * overrule a silent setting: a button marked *hear it* is not ambiguous. The
 * Noise ships off (`DEFAULT_SETTINGS`), so for most readers this is the way in
 * rather than an edge of one.
 */
function hearIt(): void {
  ui.silent = false
  if (ui.sound === "off") ui.sound = "quiet"
  noises.setLoudness(ui.sound)
  noises.wake()
}

/**
 * How loud, from inside the Book. Not written back to Settings, for the same
 * reason the battle screen does not: quiet for this reading says nothing about
 * the next one.
 */
function setSound(level: Loudness): void {
  ui.silent = false
  ui.sound = level
  noises.setLoudness(level)
  noises.wake()
}

function toggleMusic(): void {
  ui.music = !ui.music
  noises.setMusic(ui.music)
}

function togglePause(): void {
  wake()
  session.value?.send({ kind: "pause", on: ui.running })
}

/** Pick a Unit off the Field to read it. Nothing here can order it about. */
function onCanvasClick(event: MouseEvent): void {
  const v = view.value
  if (!v) return
  wake()
  const hit = v.unitAt(ui.units, v.toField(event.clientX, event.clientY))
  ui.selected = hit && hit.id !== ui.selected ? hit.id : null
}

onMounted(async () => {
  try {
    const loaded = await loadScenario(scenarioPath(id))
    if (closed) return
    ui.name = loaded.file.name
    ui.summary = loaded.file.summary
    ui.chapters = [...(loaded.file.chapters ?? [])].sort((a, b) => a.at - b.at)
    ui.clock = loaded.battle.clock
    for (const army of loaded.file.armies) {
      ui.gradeNames[army.id] = loaded.rosters[army.roster].grades
    }

    const element = host.value
    if (!element) return
    const v = markRaw(new BattleView())
    await v.mount(element)
    if (closed) {
      v.destroy()
      return
    }
    const look = loadSettings()
    v.setField(loaded.battle.field, "staff", { ...STAFF_MAP_DEFAULTS, ...look })
    view.value = v

    // Metres and not cells: what the Noise pans across is the ground, the same
    // width the reader is looking at.
    const across = loaded.battle.field.width * loaded.battle.field.cellSize
    noises.open(across, look.sound, look.music)
    ui.sound = look.sound
    ui.music = look.music
    void noises.learn().then((has) => {
      if (!closed) ui.bandAvailable = has
    })

    const s = markRaw(new BookSession(loaded))
    session.value = s
    viewState.armyColours = armyColours(loaded.battle)
    ui.units = s.current.units
    viewState.keyGround = s.current.keyGround
    ui.loading = false
    last = performance.now()
    frame = requestAnimationFrame(tick)
  } catch (error) {
    ui.error = error instanceof Error ? error.message : String(error)
    ui.loading = false
  }
})

onBeforeUnmount(() => {
  closed = true
  cancelAnimationFrame(frame)
  view.value?.destroy()
  view.value = null
  noises.close()
  session.value?.close()
  session.value = null
})
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-base-300 text-base-content">
    <TopBar>
      <span class="text-sm font-semibold">{{ ui.name }}</span>
      <span
        class="rounded-badge bg-base-content/10 px-2 py-0.5 text-[0.65rem] tracking-wide uppercase"
      >
        the book
      </span>
      <div class="ml-auto flex flex-wrap items-center gap-5">
        <span class="font-mono text-sm tabular-nums">
          {{ stamp(ui.time) }}<span class="text-base-content/40"> / {{ stamp(ui.clock) }}</span>
        </span>
        <!-- Grouped tight and spaced apart from the clock and the way out, the
             same shape the battle screen's bar has: these are strips of related
             switches and not eight unrelated buttons in a row. -->
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="btn btn-ghost btn-xs"
            :disabled="!!ui.outcome"
            @click="togglePause"
          >
            {{ ui.running ? "pause" : "read on" }}
          </button>
          <button
            v-for="t in TEMPOS"
            :key="t"
            type="button"
            class="btn btn-xs"
            :class="ui.tempo === t ? 'btn-primary' : 'btn-ghost'"
            :title="`how fast the afternoon is read: ×${t}`"
            @click="setTempo(t)"
          >
            ×{{ t }}
          </button>
          <!-- Silent until the reader has touched the page at all, because the
             audio device is only handed over inside a gesture and a Book has
             no press of its own to take it in. -->
          <button
            v-if="ui.silent"
            type="button"
            class="btn btn-xs"
            title="a browser gives up its speakers only when you ask it to"
            @click="hearIt"
          >
            hear it
          </button>
          <template v-if="!ui.silent">
            <button
              v-for="level in LOUDNESS_CHOICES"
              :key="level"
              type="button"
              class="btn btn-xs"
              :class="ui.sound === level ? 'btn-primary' : 'btn-ghost'"
              :title="`the Field, heard from above the middle of it: ${level}`"
              @click="setSound(level)"
            >
              {{ level }}
            </button>
          </template>
          <button
            v-if="!ui.silent"
            type="button"
            class="btn btn-xs"
            :class="ui.music && ui.sound !== 'off' ? 'btn-primary' : 'btn-ghost'"
            :disabled="ui.sound === 'off' || !ui.bandAvailable"
            :title="
              ui.bandAvailable
                ? 'the band, held under the battle and pulled down by the fighting'
                : 'no tracks are installed — see public/music/README.md'
            "
            @click="toggleMusic"
          >
            band
          </button>
        </div>
        <button
          type="button"
          class="btn btn-ghost btn-xs"
          title="copy the afternoon as it stands: the Return, every Unit, and every Dispatch, both armies'"
          @click="takeRecord"
        >
          {{ kept === "copied" ? "copied" : kept === "saved" ? "saved to a file" : "record" }}
        </button>
        <RouterLink class="btn btn-ghost btn-xs" :to="{ name: 'battle', params: { battle: id } }">
          fight it
        </RouterLink>
      </div>
    </TopBar>

    <div class="h-0.5 shrink-0 bg-base-content/10">
      <div class="h-full bg-primary transition-[width]" :style="{ width: `${through * 100}%` }" />
    </div>

    <main class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_22rem]">
      <section class="relative min-h-0">
        <div ref="host" class="absolute inset-0" @click="onCanvasClick" />

        <p
          v-if="ui.loading"
          class="absolute inset-0 grid place-items-center text-sm text-base-content/60"
        >
          Opening the Field…
        </p>
        <div
          v-if="ui.error"
          class="absolute inset-4 rounded-box border border-error/40 bg-error/10 p-4"
        >
          <p class="text-sm font-semibold text-error">This battle would not open</p>
          <p class="mt-1 font-mono text-xs text-base-content/70">{{ ui.error }}</p>
        </div>

        <!-- A Unit read off the Field. Every Report is here, both armies', which
             is the one thing this page has that a Commander's never will. -->
        <div v-if="selectedUnit" class="absolute right-3 bottom-3 w-72">
          <UnitCard
            :unit="selectedUnit"
            :grade-name="gradeName(selectedUnit)"
            :ordered-formation="selectedUnit.formation"
            :charging-name="null"
            :arming="false"
            :pointing="false"
            :deploying="false"
            :disabled="true"
          />
        </div>

        <div v-if="ui.outcome" class="absolute inset-x-3 bottom-3">
          <ReturnPanel
            :headline="headline"
            :detail="detail"
            :returns="ui.returns"
            :player-army="''"
            :key-ground="ui.outcome.keyGround"
            :decided-by="ui.outcome.by"
          />
        </div>
      </section>

      <ChapterPanel
        :chapters="ui.chapters"
        :summary="ui.summary"
        :time="ui.time"
        @select="ui.selected = $event"
      />
    </main>
  </div>
</template>
