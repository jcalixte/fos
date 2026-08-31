<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import DeploymentPanel from "@/components/DeploymentPanel.vue"
import DispatchPanel from "@/components/DispatchPanel.vue"
import ReturnPanel from "@/components/ReturnPanel.vue"
import TopBar from "@/components/TopBar.vue"
import UnitCard from "@/components/UnitCard.vue"
import { useBattle } from "@/composables/useBattle"
import type { FormationName, Grade } from "@/sim/types"

const route = useRoute()
const router = useRouter()
const battle = useBattle()
const { ui } = battle
const host = useTemplateRef<HTMLElement>("host")

/**
 * The battle this page is, taken from the URL once. The path is the page's
 * identity — App keys on it — so it cannot change under a mounted Field, and
 * there is nothing here to watch.
 */
const id = String(route.params.battle)

/**
 * The battle's address on a server, when the URL carries one. That is what
 * makes this a two-Commander battle: the page is otherwise identical, which is
 * the seam doing its job (ADR-0013).
 */
const address = typeof route.params.id === "string" ? route.params.id : undefined

/**
 * The army, if the URL already names one. It is a query and not a path so that
 * taking one does not remount the Field, and so that the one press back from
 * Deployment is the menu rather than the offer that was just answered.
 *
 * Not honoured on a join link. Which army a Commander gets there is the
 * server's answer and not the address bar's.
 */
const army = !address && typeof route.query.army === "string" ? route.query.army : undefined

/**
 * Take an Army, and say so in the URL. Replacing rather than pushing keeps the
 * army-less address out of the history: going Back from Deployment would
 * otherwise land on a URL that names no army while the Field is already
 * arranged under it, which is a promise the page could not keep.
 */
function take(armyId: string): void {
  battle.commandArmy(armyId)
  if (!address && ui.playerArmy === armyId) {
    void router.replace({ name: "battle", params: { battle: id }, query: { army: armyId } })
  }
}

/**
 * The address the server gave this battle, put in the URL as soon as it has
 * one. The path changing remounts the Field, which is what makes the second
 * mount a *join* — by the token this browser has just been given — and is
 * therefore the same path a Commander coming back Out of Contact takes.
 */
watch(
  () => ui.address,
  (at) => {
    if (at && !address) void router.replace({ name: "seat", params: { battle: id, id: at } })
  },
)

/** The link to hand the other Commander, once there is one. */
const link = computed(() => (ui.address ? `${location.origin}/battles/${id}/${ui.address}` : null))
const copied = ref(false)

async function copyLink(): Promise<void> {
  if (!link.value) return
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // No clipboard permission. The link is on screen to be read either way.
  }
}

/**
 * The Headquarters in one line, or nothing while it is standing clear. Riding
 * outranks harried: a staff in the saddle is not sending riders at all, so what
 * the wait at the table would have cost is beside the point. What it says while
 * riding has to carry three things — why nothing is leaving, that nothing is,
 * and that what he says now is written down — because *riding* on its own is
 * only where the staff is, and the player is left to guess what that has to do
 * with the rider who never set off.
 */
const headquartersNote = computed(() => {
  if (ui.phase !== "battle") return null
  const hq = ui.headquarters
  if (hq.riding) {
    const held = hq.dictated
      ? `${hq.dictated} Order${hq.dictated === 1 ? " is" : "s are"} written down, waiting on the staff`
      : "what you order now is written down instead"
    return {
      text: `The Headquarters is riding; ${held}`,
      tone: "text-error",
    }
  }
  if (hq.harried) {
    return { text: "The Headquarters is harried — Orders are slow to leave", tone: "text-warning" }
  }
  if (hq.surcharge > 0) {
    return {
      text: `The Headquarters has been ridden over — Orders leave ${Math.round(hq.surcharge)}s late`,
      tone: "text-base-content/60",
    }
  }
  return null
})

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
  if (event.key === " " && ui.phase === "battle" && !ui.address) {
    event.preventDefault()
    battle.togglePause()
  }
}

onMounted(() => {
  globalThis.addEventListener("keydown", onKey)
  if (host.value) void battle.start(host.value, id, { army, address })
})
onBeforeUnmount(() => {
  globalThis.removeEventListener("keydown", onKey)
})
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-base-300 text-base-content">
    <TopBar>
      <p class="text-xs text-base-content/60">{{ ui.scenarioName }}</p>

      <div class="ml-auto flex items-center gap-5">
        <p class="font-mono text-sm tabular-nums">
          {{ clock(ui.time) }}
          <span class="text-base-content/40">/ {{ clock(ui.clock) }}</span>
        </p>
        <p class="text-xs text-base-content/60">
          {{ ui.ordersInFlight }} order{{ ui.ordersInFlight === 1 ? "" : "s" }} in flight
        </p>

        <!-- What the Headquarters is costing right now. A press whose rider
             does not set off has to be explained by something already on
             screen, and this is it: riding holds what is said until the staff
             is established, harried is a wait at the table. -->
        <p v-if="headquartersNote" class="text-xs" :class="headquartersNote.tone">
          {{ headquartersNote.text }}
        </p>

        <!-- The line, when it goes. Not an ending: the battle has not stopped
             and the seat is still ours (F24). -->
        <p v-if="ui.trouble && ui.phase !== 'command'" class="text-xs text-warning">
          {{ ui.trouble }}
        </p>

        <div v-if="ui.phase === 'battle' || ui.phase === 'over'" class="flex items-center gap-1">
          <!-- One clock runs for both, so there is nothing here to stop: a
               Commander who wants to stop watching stops watching, and the
               afternoon does not wait for him (F24). -->
          <button
            v-if="!ui.address"
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
                ? 'showing beaten ground and what every Unit has in its sights'
                : 'showing beaten ground and its target for the selected Unit only'
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

        <template v-else-if="ui.phase === 'deployment'">
          <!-- *That* he is still arranging, and nothing about what he is doing:
               the whole of blind Deployment is that there is nothing to say
               here beyond the waiting (F23). -->
          <p v-if="ui.stoodTo && ui.waiting" class="text-xs text-warning">
            Stood to — the other Commander is still arranging his army
          </p>
          <button v-else type="button" class="btn btn-primary btn-sm" @click="battle.beginBattle()">
            {{ ui.address ? "Stand to" : "Begin the battle" }}
          </button>
        </template>

        <!-- Leaving is not breaking off: nothing is decided and nothing is
             saved, the Field is simply put away. -->
        <RouterLink
          class="btn btn-ghost btn-xs"
          title="put this Field away and choose another battle"
          :to="{ name: 'battles' }"
        >
          battles
        </RouterLink>
      </div>
    </TopBar>

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

        <!-- A Scenario that would not load is reported where it was asked for,
             and not carried back to the menu: the URL that failed is still in
             the address bar, so it can be corrected or simply retried. -->
        <div
          v-if="ui.error"
          class="absolute inset-0 grid place-items-center overflow-auto bg-base-300 p-6"
        >
          <div class="max-w-lg rounded-box border border-error/40 bg-error/10 p-4">
            <p class="text-sm font-semibold text-error">The Scenario would not load</p>
            <p class="mt-1 font-mono text-xs text-base-content/70">{{ ui.error }}</p>
            <RouterLink class="mt-4 btn btn-ghost btn-xs" :to="{ name: 'battles' }">
              choose another battle
            </RouterLink>
          </div>
        </div>

        <p
          v-else-if="ui.phase === 'loading'"
          class="absolute inset-0 grid place-items-center text-xs text-base-content/50"
        >
          Reading the Field…
        </p>

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
            <!-- Both armies are taken, or there is no battle at that address.
                 Said where it was asked for, with the offer still under it: the
                 same Scenario can always be fought alone. -->
            <p
              v-if="ui.trouble"
              class="mt-4 rounded-box border border-error/40 bg-error/10 p-3 text-xs text-error"
            >
              {{ ui.trouble }}
            </p>

            <!-- Turned away outright, so the offer is withdrawn: pressing an
                 army would ask a battle that has stopped listening. The same
                 Scenario can always be fought alone, and that is the door out. -->
            <div v-if="ui.turnedAway" class="mt-5">
              <RouterLink
                class="btn btn-primary btn-sm"
                :to="{ name: 'battle', params: { battle: id } }"
              >
                Fight it alone
              </RouterLink>
              <RouterLink class="ml-2 btn btn-ghost btn-sm" :to="{ name: 'battles' }">
                choose another battle
              </RouterLink>
            </div>

            <p v-else class="mt-5 text-xs font-semibold tracking-wide text-base-content/80">
              Which army do you take?
            </p>
            <div v-if="!ui.turnedAway" class="mt-3 grid gap-3 sm:grid-cols-2">
              <button
                v-for="option in ui.armies"
                :key="option.id"
                type="button"
                class="rounded-box border border-base-content/15 bg-base-200 p-4 text-left transition hover:border-primary hover:bg-base-100"
                :data-army="option.id"
                @click="take(option.id)"
              >
                <span class="flex items-center gap-2">
                  <span
                    class="size-3 shrink-0 rounded-full border border-base-content/25"
                    :style="{ background: option.colour }"
                  />
                  <span class="text-sm font-semibold">{{ option.name }}</span>
                </span>
                <span class="mt-2 block text-xs leading-relaxed text-base-content/70">
                  {{ option.brief }}
                </span>
              </button>
            </div>

            <!-- The other way to fight this afternoon. One press, and the
                 battle moves off this tab and onto a server; the Field, the
                 armies and every button below are unchanged, which is the whole
                 of what the session seam was for (ADR-0013). -->
            <div
              v-if="!ui.address && !ui.turnedAway"
              class="mt-6 border-t border-base-content/10 pt-4"
            >
              <button type="button" class="btn btn-ghost btn-sm" @click="battle.fightAnother()">
                Fight another Commander
              </button>
              <p class="mt-2 text-xs text-base-content/50">
                Opens the battle on a server and gives you a link to hand over. The other Commander
                takes the army you leave.
              </p>
            </div>

            <div v-else-if="ui.address" class="mt-6 border-t border-base-content/10 pt-4">
              <p class="text-xs font-semibold tracking-wide text-base-content/80">
                Hand this to the other Commander
              </p>
              <div class="mt-2 flex items-center gap-2">
                <code class="min-w-0 flex-1 truncate rounded bg-base-100 px-2 py-1 text-xs">
                  {{ link }}
                </code>
                <button type="button" class="btn btn-ghost btn-xs" @click="void copyLink()">
                  {{ copied ? "copied" : "copy" }}
                </button>
              </div>
              <p class="mt-2 text-xs text-base-content/50">
                He gets whichever army you leave. Neither of you sees the other's until you have
                both Stood To.
              </p>
            </div>
          </div>
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

      <!-- One column, whichever of the two has something in it. Nothing is
           reported before the clock runs, so Deployment says what to do with
           the Field in the space the feed is not using yet. -->
      <DeploymentPanel v-if="ui.phase === 'deployment'" class="w-80 shrink-0 max-lg:hidden" />
      <DispatchPanel
        v-else-if="ui.phase !== 'loading' && !ui.error"
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
        :ordered-formation="battle.arrivalFormation(selected)"
        :charging-name="chargingName"
        :arming="ui.arming"
        :pointing="ui.pointing"
        :deploying="ui.phase === 'deployment'"
        :disabled="
          selected.army !== ui.playerArmy || (ui.phase !== 'battle' && ui.phase !== 'deployment')
        "
        @form="battle.form($event as FormationName)"
        @latitude="battle.brief($event)"
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
