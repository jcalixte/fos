<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from "vue"
import DispatchPanel from "@/components/DispatchPanel.vue"
import UnitCard from "@/components/UnitCard.vue"
import { useBattle } from "@/composables/useBattle"
import type { FormationName, Grade } from "@/sim/types"

const battle = useBattle("/scenarios/bridge-march")
const { ui } = battle
const host = useTemplateRef<HTMLElement>("host")

const selected = computed(() => battle.unitById(ui.selected))
const gradeName = computed(() => {
  const unit = selected.value
  if (!unit) return ""
  return ui.gradeNames[unit.army]?.[unit.grade as Grade] ?? unit.grade
})

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape") battle.deselect()
  if (event.key === " " && ui.phase === "battle") {
    event.preventDefault()
    battle.togglePause()
  }
}

onMounted(() => {
  if (host.value) battle.start(host.value)
  globalThis.addEventListener("keydown", onKey)
})
onBeforeUnmount(() => {
  globalThis.removeEventListener("keydown", onKey)
})
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-base-300 text-base-content">
    <header
      class="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-base-content/10 bg-base-200 px-5 py-2.5"
    >
      <h1 class="text-sm font-semibold tracking-wide">
        Field of Strategy
        <span class="text-primary">III</span>
      </h1>
      <p class="text-xs text-base-content/60">{{ ui.scenarioName }}</p>

      <div class="ml-auto flex items-center gap-5">
        <p class="font-mono text-sm tabular-nums">
          {{ clock(ui.time) }}
          <span class="text-base-content/40">/ {{ clock(ui.clock) }}</span>
        </p>
        <p class="text-xs text-base-content/60">
          {{ ui.ordersInFlight }} order{{ ui.ordersInFlight === 1 ? "" : "s" }} in flight
        </p>

        <div v-if="ui.phase === 'battle' || ui.phase === 'over'" class="flex items-center gap-1">
          <button
            type="button"
            class="btn btn-ghost btn-xs"
            :disabled="ui.phase === 'over'"
            @click="battle.togglePause()"
          >
            {{ ui.running ? "pause" : "resume" }}
          </button>
          <button
            v-for="tempo in [1, 2, 4, 8]"
            :key="tempo"
            type="button"
            class="btn btn-xs"
            :class="ui.tempo === tempo ? 'btn-primary' : 'btn-ghost'"
            @click="battle.setTempo(tempo)"
          >
            ×{{ tempo }}
          </button>
        </div>

        <button
          v-else-if="ui.phase === 'deployment'"
          type="button"
          class="btn btn-primary btn-sm"
          @click="battle.beginBattle()"
        >
          Begin the battle
        </button>
      </div>
    </header>

    <main class="flex min-h-0 flex-1">
      <div class="relative min-w-0 flex-1 overflow-hidden">
        <div
          ref="host"
          class="absolute inset-0 touch-none select-none"
          @pointerdown="battle.onPointerDown"
          @pointermove="battle.onPointerMove"
          @pointerup="battle.onPointerUp"
          @contextmenu.prevent="battle.deselect()"
        />

        <div v-if="ui.error" class="absolute inset-0 grid place-items-center bg-base-300/90 p-8">
          <div class="max-w-md text-center">
            <p class="text-sm font-semibold text-error">The Scenario would not load</p>
            <p class="mt-2 font-mono text-xs text-base-content/70">{{ ui.error }}</p>
          </div>
        </div>

        <div
          v-else-if="ui.phase === 'deployment'"
          class="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4"
        >
          <p
            class="max-w-2xl rounded-box bg-base-300/85 px-4 py-3 text-center text-xs leading-relaxed text-base-content/80 backdrop-blur"
          >
            <span class="font-semibold text-base-content">Deployment.</span>
            Drag your Units inside the marked zone, and drag the Headquarters to where you mean to
            stand — every Order you give will be ridden from there.
          </p>
        </div>

        <div
          v-else-if="ui.phase === 'over'"
          class="absolute inset-0 grid place-items-center bg-base-300/80 backdrop-blur-sm"
        >
          <div class="text-center">
            <p class="text-lg font-semibold">The Scenario clock has run out.</p>
            <p class="mt-1 text-sm text-base-content/60">
              Reload to march it again from the same seed.
            </p>
          </div>
        </div>
      </div>

      <DispatchPanel
        class="w-80 shrink-0 max-lg:hidden"
        :dispatches="ui.dispatches"
        :selected="ui.selected"
        @select="ui.selected = $event"
      />
    </main>

    <!-- A fixed height, not a minimum: the Field is laid out to fit whatever is
         left over, so a bar that grows or shrinks slides the whole map. -->
    <footer
      class="flex h-24 shrink-0 items-center border-t border-base-content/10 bg-base-200 px-5"
    >
      <UnitCard
        v-if="selected"
        :unit="selected"
        :grade-name="gradeName"
        :arrival-formation="ui.arrivalFormation"
        :disabled="ui.phase !== 'battle'"
        @form="battle.order({ kind: 'form', formation: $event as FormationName })"
        @arrival-formation="ui.arrivalFormation = $event"
        @halt="battle.order({ kind: 'halt' })"
      />
      <p v-else-if="ui.phase === 'deployment'" class="text-xs text-base-content/55">
        {{ ui.scenarioSummary }}
      </p>
      <p v-else-if="ui.phase === 'battle'" class="text-xs text-base-content/55">
        Click one of your Units, then press where you want it and drag to set the facing it should
        arrive on.
      </p>
    </footer>
  </div>
</template>
