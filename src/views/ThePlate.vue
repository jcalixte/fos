<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, shallowRef, useTemplateRef, watch } from "vue"
import type { Field } from "@/sim/types"
import TopBar from "@/components/TopBar.vue"
import { loadCatalogue, scenarioPath } from "@/scenario/catalogue"
import { loadScenario } from "@/scenario/loader"
import { BattleView, type FieldStyle } from "@/render/BattleView"
import {
  ALARMS,
  type PlateOptions,
  plateField,
  plateSnapshot,
  plateView,
  plateVolleys,
} from "@/render/plate"
import { PAPERS, STAFF_MAP_DEFAULTS, type StaffMapOptions } from "@/render/staffmap"

/**
 * The plate. Not a battle and not reachable from one — a page that draws every
 * combination at once so it can be looked at.
 *
 * It exists because the states worth checking are the ones a battle reaches
 * late, rarely, and never together: a harried Headquarters, a battalion halfway
 * into square, a conscript battery on the point of breaking. Playing until they
 * come up is not testing, it is waiting.
 */
const host = useTemplateRef<HTMLElement>("host")
const view = ref<BattleView | null>(null)
const style = ref<FieldStyle>("staff")

/**
 * The Field's own dials. Every one of them is a judgement that ought to be
 * settled by looking rather than by argument, so they are turned here and the
 * defaults live with the renderer.
 */
const map = reactive<StaffMapOptions>({ ...STAFF_MAP_DEFAULTS })
const papers = Object.keys(PAPERS) as (keyof typeof PAPERS)[]
const alarms = Object.keys(ALARMS) as (keyof typeof ALARMS)[]
/**
 * Rebuilding the texture costs a third of a second on the largest Field, so it
 * happens on a change and never on a frame.
 *
 * Switching between the two renderers builds the whole view again rather than
 * setting a second Field on the standing one. Setting a Field twice on one
 * BattleView leaves the second terrain sampled over a fraction of its own
 * sprite — the sprite measures right and draws small — and a battle only ever
 * sets one, so the bug lives here and is worth an extra second on a dev page
 * rather than an afternoon in Pixi's texture cache. Noted rather than hidden:
 * anything that ever wants to change a Field under a running battle will meet
 * it again.
 */
async function rebuild(): Promise<void> {
  if (!host.value) return
  view.value?.destroy()
  view.value = null
  const v = new BattleView()
  await v.mount(host.value)
  v.setField(field.value, style.value, { ...map })
  view.value = v
}

const options = reactive<PlateOptions>({
  headquarters: "steady",
  alarm: "orange",
  fireZones: false,
  smoke: true,
  arming: false,
  selected: true,
  deployment: false,
})

/**
 * Which ground the dials are turned on.
 *
 * The plate's own Field carries one of everything and is the right place to
 * judge a rule; a real battle is the right place to judge a *look*, because it
 * is the only ground with the real proportion of open to wood to water on it.
 * Castiglione is the case in point — nobody would have guessed from the plate
 * that its Redone is 456 cells of marsh and not a drop of water.
 */
const ground = ref("plate")
const battles = ref<string[]>([])
const field = shallowRef<Field>(plateField())
const snapshot = plateSnapshot()
let frame = 0

async function loadGround(id: string): Promise<void> {
  field.value = id === "plate" ? plateField() : (await loadScenario(scenarioPath(id))).battle.field
  await rebuild()
}

/**
 * The plate's own battle clock, in seconds, at Tempo 1.
 *
 * It exists for Powder Smoke and nothing else. A cloud ages and drifts on
 * battle time rather than on the wall clock, so a plate frozen at one instant
 * would show a bank that never thins and never moves — which is the one thing
 * about smoke that cannot be judged from a still.
 */
let clock = 0
let clockLast = 0

function paint(): void {
  const v = view.value
  if (!v) return
  const now = performance.now()
  const elapsed = clockLast === 0 ? 0 : Math.min(0.5, (now - clockLast) / 1000)
  clockLast = now
  const was = clock
  clock += elapsed
  const step = { ...snapshot, time: clock, volleys: plateVolleys(was, clock) }
  v.draw(step, step, 1, plateView(snapshot, options))
}

onMounted(async () => {
  await rebuild()
  loadCatalogue()
    .then((list) => (battles.value = list.map((b) => b.id)))
    // The dials work on the plate's own Field whether or not a Scenario will
    // load, so a failed catalogue costs the offer and not the page.
    .catch(() => (battles.value = []))
  // Redrawn every frame rather than on change, because the effects layer
  // animates: a flash and a clash fade on the clock, and a still frame of the
  // plate would show them at whatever moment the last change happened to fall.
  const tick = () => {
    frame = requestAnimationFrame(tick)
    paint()
  }
  tick()
})

// The terrain is baked into a texture once, so any change to it is a rebuild —
// which is also the honest measure of what one costs.
watch(ground, (id) => void loadGround(id))
watch([style, map], () => void rebuild())

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  view.value?.destroy()
})
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-base-300 text-base-content">
    <TopBar>
      <p class="text-xs text-base-content/60">Plate — every combination, at Rivoli's scale</p>
      <div class="ml-auto flex flex-wrap items-center gap-4 text-xs">
        <label class="flex items-center gap-2">
          <span class="text-base-content/60">Ground</span>
          <select v-model="ground" class="select select-xs">
            <option value="plate">the plate</option>
            <option v-for="id in battles" :key="id" :value="id">{{ id }}</option>
          </select>
        </label>
        <label class="flex items-center gap-2">
          <span class="text-base-content/60">Field</span>
          <select v-model="style" class="select select-xs">
            <option value="staff">staff map</option>
            <option value="shaded">shaded relief</option>
          </select>
        </label>
        <label v-if="style === 'staff'" class="flex items-center gap-2">
          <span class="text-base-content/60">Paper</span>
          <select v-model="map.paper" class="select select-xs">
            <option v-for="name in papers" :key="name" :value="name">{{ name }}</option>
          </select>
        </label>
        <label v-if="style === 'staff'" class="flex items-center gap-2">
          <span class="text-base-content/60">Grass</span>
          <select v-model="map.grass" class="select select-xs">
            <option value="none">none</option>
            <option value="wash">wash</option>
            <option value="full">full</option>
          </select>
        </label>
        <label v-if="style === 'staff'" class="flex items-center gap-2">
          <span class="text-base-content/60">Enclosure</span>
          <select v-model="map.enclosure" class="select select-xs">
            <option value="off">off</option>
            <option value="faint">faint</option>
            <option value="firm">firm</option>
          </select>
        </label>
        <label v-if="style === 'staff'" class="flex items-center gap-2">
          <span class="text-base-content/60">Hachures</span>
          <select v-model="map.hachures" class="select select-xs">
            <option value="off">off</option>
            <option value="light">light</option>
            <option value="full">full</option>
          </select>
        </label>
        <label class="flex items-center gap-2">
          <span class="text-base-content/60">HQ</span>
          <select v-model="options.headquarters" class="select select-xs">
            <option value="steady">steady</option>
            <option value="harried">harried</option>
            <option value="riding">riding</option>
          </select>
        </label>
        <label v-if="options.headquarters === 'harried'" class="flex items-center gap-2">
          <span class="text-base-content/60">Alarm</span>
          <select v-model="options.alarm" class="select select-xs">
            <option v-for="name in alarms" :key="name" :value="name">{{ name }}</option>
          </select>
        </label>
        <label class="flex items-center gap-1.5">
          <input v-model="options.selected" type="checkbox" class="checkbox checkbox-xs" />
          selected
        </label>
        <label class="flex items-center gap-1.5">
          <input v-model="options.fireZones" type="checkbox" class="checkbox checkbox-xs" />
          beaten ground
        </label>
        <label class="flex items-center gap-1.5">
          <input v-model="options.smoke" type="checkbox" class="checkbox checkbox-xs" />
          smoke
        </label>
        <label class="flex items-center gap-1.5">
          <input v-model="options.arming" type="checkbox" class="checkbox checkbox-xs" />
          arming
        </label>
        <label class="flex items-center gap-1.5">
          <input v-model="options.deployment" type="checkbox" class="checkbox checkbox-xs" />
          zone
        </label>
        <RouterLink to="/" class="btn btn-ghost btn-xs">battles</RouterLink>
      </div>
    </TopBar>
    <main ref="host" class="relative min-h-0 flex-1" />
    <footer class="border-t border-base-content/10 px-4 py-2 text-xs text-base-content/60">
      Top band: Formation by Arm, both armies. Middle band: the states a Unit passes through —
      ordered, dictated, shifting, forming square, routing, charging, recoiling, pursuing, aiming,
      cut to pieces. Lower band: Arm by Grade across, Morale by army down, laid across the ridge so
      half of every row stands on hachures. The plate's own Field carries each Ground, a slope
      running the whole hachure ladder, a bridge, a road and a river that leave the Field, and a
      road that stops inside it; the battles carry what they carry, which is the point of being able
      to turn the dials on them.
    </footer>
  </div>
</template>
