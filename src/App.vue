<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue"
import BattleMenu from "@/components/BattleMenu.vue"
import ReturnPanel from "@/components/ReturnPanel.vue"
import DispatchPanel from "@/components/DispatchPanel.vue"
import UnitCard from "@/components/UnitCard.vue"
import { useBattle } from "@/composables/useBattle"
import {
  type CatalogueEntry,
  type LastBattle,
  loadCatalogue,
  recallBattle,
} from "@/scenario/catalogue"
import type { FormationName, Grade } from "@/sim/types"

const battle = useBattle()
const { ui } = battle
const host = useTemplateRef<HTMLElement>("host")

const battles = ref<CatalogueEntry[]>([])
const catalogueLoading = ref(true)
const last = ref<LastBattle | null>(recallBattle())

/**
 * Put a battle on the Field. The host is always mounted — the menu is drawn over
 * it, so there is a box to hand the moment one is chosen.
 */
function take(path: string, army?: string): void {
  if (host.value) void battle.start(host.value, path, army)
}

/** Put the Field away. The shortcut is re-read here: it may be this battle now. */
function toMenu(): void {
  battle.leave()
  last.value = recallBattle()
}

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

onMounted(async () => {
  globalThis.addEventListener("keydown", onKey)
  try {
    battles.value = await loadCatalogue()
  } catch (error) {
    ui.error = error instanceof Error ? error.message : String(error)
  } finally {
    catalogueLoading.value = false
  }
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
      <p v-if="ui.phase !== 'menu'" class="text-xs text-base-content/60">
        {{ ui.scenarioName }}
      </p>

      <div v-if="ui.phase !== 'menu'" class="ml-auto flex items-center gap-5">
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

        <!-- Leaving is not breaking off: nothing is decided and nothing is
             saved, the Field is simply put away. -->
        <button
          type="button"
          class="btn btn-ghost btn-xs"
          title="put this Field away and choose another battle"
          @click="toMenu()"
        >
          battles
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

        <p
          v-if="ui.phase === 'loading'"
          class="absolute inset-0 grid place-items-center text-xs text-base-content/50"
        >
          Reading the Field…
        </p>

        <BattleMenu
          v-else-if="ui.phase === 'menu'"
          :battles="battles"
          :last="last"
          :error="ui.error"
          :loading="catalogueLoading"
          @take="take($event)"
          @resume="take($event.path, $event.army)"
        />

        <!-- Which army you take, asked before the Field is arranged: an army is
             deployed by the hand that will command it, and the Plan the other
             one fights to is the Scenario's and not yours. -->
        <div
          v-else-if="ui.phase === 'command'"
          class="absolute inset-0 grid place-items-center overflow-auto bg-base-300/80 p-6 backdrop-blur-sm"
        >
          <div class="max-w-2xl">
            <h2 class="text-lg font-semibold">{{ ui.scenarioName }}</h2>
            <p class="mt-2 text-xs leading-relaxed text-base-content/70">
              {{ ui.scenarioSummary }}
            </p>
            <p class="mt-5 text-xs font-semibold tracking-wide text-base-content/80">
              Which army do you take?
            </p>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <button
                v-for="army in ui.armies"
                :key="army.id"
                type="button"
                class="rounded-box border border-base-content/15 bg-base-200 p-4 text-left transition hover:border-primary hover:bg-base-100"
                @click="battle.commandArmy(army.id)"
              >
                <span class="flex items-center gap-2">
                  <span
                    class="size-3 shrink-0 rounded-full border border-base-content/25"
                    :style="{ background: army.colour }"
                  />
                  <span class="text-sm font-semibold">{{ army.name }}</span>
                </span>
                <span class="mt-2 block text-xs leading-relaxed text-base-content/70">
                  {{ army.brief }}
                </span>
              </button>
            </div>
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
        v-if="ui.phase !== 'menu' && ui.phase !== 'loading'"
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
        :pointing="ui.pointing"
        :deploying="ui.phase === 'deployment'"
        :disabled="
          selected.army !== ui.playerArmy || (ui.phase !== 'battle' && ui.phase !== 'deployment')
        "
        @form="battle.form($event as FormationName)"
        @latitude="battle.brief({ latitude: $event })"
        @hold-fire="battle.brief({ holdFire: $event })"
        @arrival-formation="ui.arrivalFormation = $event"
        @charge="battle.armCharge()"
        @point="battle.armPoint()"
        @halt="battle.order({ kind: 'halt' })"
      />
      <p v-if="ui.arming" class="ml-4 shrink-0 text-xs whitespace-nowrap text-error">
        Press the Unit to go at.<br />
        Escape, or open ground, calls it off.
      </p>
      <p v-else-if="ui.pointing" class="ml-4 shrink-0 text-xs whitespace-nowrap text-primary">
        Press where you want it looking.<br />
        It comes round where it stands, and does not move.
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
    </footer>
  </div>
</template>
