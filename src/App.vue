<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from "vue"
import ReturnPanel from "@/components/ReturnPanel.vue"
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
const chargingName = computed(() => battle.unitById(selected.value?.charging ?? null)?.name ?? null)

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
          <button
            type="button"
            class="btn btn-xs"
            :class="ui.fireZones ? 'btn-primary' : 'btn-ghost'"
            :title="
              ui.fireZones
                ? 'showing beaten ground for every Unit'
                : 'showing beaten ground for the selected Unit only'
            "
            @click="battle.toggleFireZones()"
          >
            range
          </button>

          <!-- Breaking off ends the battle and cannot be taken back, so the
               offer is made before it is taken — the same two gestures a Charge
               costs, and for the same reason. -->
          <template v-if="ui.phase === 'battle'">
            <span v-if="ui.conceding" class="ml-1 flex items-center gap-1">
              <span class="text-xs text-base-content/60">Take the army off the Field?</span>
              <button type="button" class="btn btn-error btn-xs" @click="battle.breakOff()">
                break off
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-xs"
                @click="battle.offerToConcede(false)"
              >
                fight on
              </button>
            </span>
            <button
              v-else
              type="button"
              class="btn btn-ghost btn-xs ml-1"
              title="quit the Field and leave the day to the enemy"
              @click="battle.offerToConcede(true)"
            >
              break off
            </button>
          </template>
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
            stand — every Order you give will be ridden from there. Select a Unit to form it up, and
            drag from open ground to point it: before the clock runs, both are free.
          </p>
        </div>

        <div
          v-else-if="ui.phase === 'over'"
          class="absolute inset-0 grid place-items-center overflow-auto bg-base-300/80 p-6 backdrop-blur-sm"
        >
          <ReturnPanel
            :headline="ui.verdict?.headline ?? ''"
            :detail="ui.verdict?.detail ?? ''"
            :returns="ui.returns"
            :player-army="ui.playerArmy"
            :key-ground="ui.keyGround"
            :decided-by="ui.decidedBy"
          />
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
        :charging-name="chargingName"
        :arming="ui.arming"
        :deploying="ui.phase === 'deployment'"
        :disabled="
          selected.army !== ui.playerArmy || (ui.phase !== 'battle' && ui.phase !== 'deployment')
        "
        @form="battle.form($event as FormationName)"
        @arrival-formation="ui.arrivalFormation = $event"
        @charge="battle.armCharge()"
        @halt="battle.order({ kind: 'halt' })"
      />
      <p v-if="ui.arming" class="ml-4 shrink-0 text-xs whitespace-nowrap text-error">
        Press the Unit to go at.<br />
        Escape, or open ground, calls it off.
      </p>
      <p
        v-else-if="ui.phase === 'deployment' && selected"
        class="ml-4 shrink-0 text-xs whitespace-nowrap text-base-content/55"
      >
        Drag its body to move it.<br />
        Drag from open ground to face it.
      </p>
      <p v-else-if="ui.phase === 'deployment'" class="text-xs text-base-content/55">
        {{ ui.scenarioSummary }}
      </p>
      <p v-else-if="ui.phase === 'battle'" class="text-xs text-base-content/55">
        Click a Unit to read it. To order one of yours: select it, then press where you want it and
        drag to set the facing it arrives on. A click that does not drag never sends anything.
      </p>
    </footer>
  </div>
</template>
