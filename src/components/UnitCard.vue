<script setup lang="ts">
import { computed } from "vue"
import HelpTip from "@/components/HelpTip.vue"
import { canCharge } from "@/sim/charge"
import { baseSpeed, drillSeconds, explainFormation, formationsFor, frontage } from "@/sim/formation"
import { describeLatitude, explainLatitude, LATITUDES } from "@/sim/standing"
import { describeFormation, type FormationName, type Grade, type Latitude } from "@/sim/types"
import type { UnitSnapshot } from "@/sim/snapshot"

const props = defineProps<{
  unit: UnitSnapshot
  gradeName: string
  /**
   * The Formation the player has asked this Unit for, which is what a Move
   * given now would arrive in. Usually the one it is standing in; different
   * while it is drilling towards it, and while Initiative has it in column.
   */
  orderedFormation: FormationName
  /** What it is committed to a Charge on, by name. Null when it is not. */
  chargingName: string | null
  /** A Charge is armed on this Unit and waiting to be aimed. */
  arming: boolean
  /** The Unit is waiting for a direction to come round onto. */
  pointing: boolean
  /** Deployment: the army is being arranged, so nothing here is an Order yet. */
  deploying: boolean
  disabled: boolean
}>()

const emit = defineEmits<{
  form: [formation: FormationName]
  latitude: [latitude: Latitude]
  charge: []
  point: []
  halt: []
}>()

const options = computed(() => formationsFor(props.unit.arm))
const width = computed(() =>
  Math.round(frontage(props.unit.arm, props.unit.formation, props.unit.strength)),
)
const busy = computed(() => props.unit.changingTo !== null)
/** A Routing Unit is deaf, so offering it buttons would be a lie. */
const deaf = computed(() => props.unit.routing || props.disabled)
/** Guns do not charge, and neither does a Unit already committed to one. */
const mounted = computed(() => canCharge(props.unit.arm) && !props.unit.charging)
/**
 * Blown: it will not be let go at anybody until it has its wind back. Offered
 * and disabled rather than hidden, because the reason is the point — a charge
 * button that quietly vanished would read as the app losing the Unit.
 */
const blown = computed(() => props.unit.fatigue === "blown")

/**
 * Halting, pointing and charging are all Orders, and there are no Orders at
 * Deployment — nothing is marching to be halted and no rider will carry
 * anything until the clock runs. Hidden rather than disabled: a greyed row the
 * player can never reach in this phase reads as something broken.
 */
const orderable = computed(() => !props.deploying)

/**
 * Metres a minute over the ground it is on. Shown because the ground can halve
 * it and nothing else on screen says so — a battalion crawling through a village
 * looks exactly like a battalion dawdling.
 */
const pace = computed(() => Math.round(props.unit.speed * 60))
const hobbled = computed(
  () => props.unit.speed < baseSpeed(props.unit.arm, props.unit.formation) - 0.001,
)

/** Seconds this Unit would still need to be in the Formation it is taking up. */
const remaining = computed(() => {
  if (!props.unit.changingTo) return 0
  const total = drillSeconds(
    props.unit.arm,
    props.unit.grade as Grade,
    props.unit.formation,
    props.unit.changingTo,
  )
  return Math.max(0, Math.round(total * (1 - props.unit.changeProgress)))
})

/**
 * The Standing Order is offered at Deployment as well as in the battle, unlike
 * everything else on this row. It is the brief a subordinate is given before he
 * marches, so the hour of arranging the army is exactly when it is given — and
 * given there it costs nothing, where in the battle it costs a Courier like any
 * other Order.
 */
const rungs = LATITUDES

const label = describeFormation
const rung = describeLatitude
const explain = explainLatitude

/**
 * Filled for the Formation the Unit is in, outlined for the one it is under
 * orders to hold when that is a different thing. Both at once when they agree,
 * which is the common case and reads as a single lit button.
 */
function formClass(option: FormationName): string {
  const standing = props.unit.formation === option
  const ordered = props.orderedFormation === option
  if (standing && ordered) return "btn-primary"
  if (standing) return "btn-primary btn-dash"
  if (ordered) return "btn-primary btn-outline"
  return "btn-ghost"
}

/**
 * What the Formation is, and then what pressing the button does with it. Two
 * lines and not one sentence: the first is the same however the Unit is
 * standing, and a player learning what a square costs should not have to find
 * it again inside a different clause each time.
 */
function formTip(option: FormationName): string {
  const what = explainFormation(props.unit.arm, option)
  if (props.deploying) return `${what}\n\npress to stand in it`
  if (props.orderedFormation === option && props.unit.formation !== option) {
    return `${what}\n\nalready asked for — a Move given now arrives in it`
  }
  return `${what}\n\npress to form it, and to arrive in it wherever it is sent next`
}

/**
 * Read exactly as the Formation buttons are, and for the same reason: filled is
 * the brief the Unit is carrying, outlined the brief a rider is carrying to it.
 * A Standing Order changes nothing on the Field when it is given and nothing on
 * the Field when it arrives, so without this the player presses a button and
 * the screen answers him a minute later — or, if the rider never gets there,
 * never. The dash on the filled rung says the brief he can see is on its way out.
 */
function rungClass(option: Latitude): string {
  const carried = props.unit.standing === option
  const asked = props.unit.briefedTo === option
  if (carried && (asked || props.unit.briefedTo === null)) return "btn-primary"
  if (carried) return "btn-primary btn-dash"
  if (asked) return "btn-primary btn-outline"
  return "btn-ghost"
}

/** What the rung permits, and then what it is doing on the road, if it is. */
function rungTip(option: Latitude): string {
  const what = explain(option)
  if (props.unit.briefedTo !== option || props.unit.standing === option) return what
  return `${what}\n\nalready asked for — it holds this the moment the Order reaches it`
}
</script>

<template>
  <!-- Deliberately does not wrap. Wrapping changed the bar's height when a Unit
       was selected and again with the window width, and every change moved the
       Field under the cursor. Two fixed rows that scroll sideways instead keep
       the map where the player last saw it. -->
  <div class="fade-x-end w-full min-w-0 overflow-x-auto">
    <div class="flex min-w-max flex-col gap-2">
      <div class="flex items-center gap-x-6">
        <div class="min-w-56">
          <p class="text-sm font-semibold">{{ unit.name }}</p>
          <p class="text-xs text-base-content/60">
            {{ unit.arm }} · {{ gradeName }} · {{ unit.strength }} men ·
            <!-- A mob has no front to measure. It is held in its travelling
                 Formation underneath so that a Rally has something to come back
                 to, and reading that Formation's Frontage out loud told the
                 player a running crowd was 3m wide. -->
            <span v-if="unit.routing">no front, a mob</span>
            <span v-else>{{ width }}m frontage</span>
            ·
            <span v-if="pace === 0">does not move</span>
            <span v-else :class="hobbled ? 'text-warning' : ''">{{ pace }}m a minute</span>
            ·
            <!-- Morale in words. T11 gave up the bar the player could count
                 down on purpose; how a battalion is holding up is the reading. -->
            <span :class="unit.morale === 'steady' ? '' : 'text-warning'">{{ unit.morale }}</span>
            <!-- Fatigue in words beside Morale, and silent while the Unit is
                 fresh: the two are spent apart and read apart, and a battalion
                 with its wind still in it has nothing to say here. -->
            <template v-if="unit.fatigue !== 'fresh'">
              ·
              <span :class="blown ? 'text-error' : 'text-warning'">{{ unit.fatigue }}</span>
            </template>
          </p>
        </div>

        <p class="min-w-52 text-xs">
          <span v-if="unit.routing" class="text-error">routing — out of command</span>
          <span v-else-if="unit.recoiling" class="text-warning">
            thrown back from {{ chargingName ?? "it" }}, and running clear
          </span>
          <span v-else-if="unit.charging" class="text-error">
            gone at {{ chargingName ?? "the enemy" }}
          </span>
          <span v-else-if="busy" class="text-warning">
            taking up {{ label(unit.changingTo!) }} — {{ remaining }}s
          </span>
          <span v-else-if="unit.suspendedBy" class="text-warning">
            {{ unit.suspendedBy }}
          </span>
          <span v-else class="text-base-content/60">
            in {{ label(unit.formation) }}{{ unit.hasOrder ? ", under orders" : "" }}
          </span>
        </p>
      </div>

      <div class="flex items-center gap-x-6">
        <div class="flex items-center gap-2">
          <span class="text-xs tracking-wide text-base-content/50 uppercase">Form</span>
          <!-- Two states and not one, because a Unit is not always standing
               in what it was told to stand in: filled is the Formation it is in
               now, outlined the one it is under orders to hold — what it is
               drilling towards, or what it will re-form into at the end of a
               march Initiative has put it in column for. The outline is also
               the answer to "what will it arrive in", which is why there is no
               longer a second row asking. -->
          <HelpTip v-for="option in options" :key="`form-${option}`" :tip="formTip(option)">
            <button
              type="button"
              class="btn btn-xs"
              :class="formClass(option)"
              :disabled="deaf"
              @click="emit('form', option)"
            >
              {{ label(option) }}
            </button>
          </HelpTip>
        </div>

        <!-- Halt, point and charge are not Formations, and stood inside the
             Form group they read as though they were — as though a battalion
             could be in attack column or charging but not both. They are Orders
             about what the Unit is doing; the Formation is the shape it does it
             in, and a column charges in column. Their own group, and no label:
             the verbs say it, and calling the group "Order" would be a second
             lie, since forming is an Order too. -->
        <div v-if="orderable" class="flex items-center gap-2">
          <button type="button" class="btn btn-ghost btn-xs" :disabled="deaf" @click="emit('halt')">
            halt
          </button>
          <!-- Offered to every Arm and not only to guns. Any Unit can be told
               to come round where it stands; it is only for artillery that it is
               the sole way to do it, since a battery ordered anywhere at all
               hitches up to get there. -->
          <HelpTip
            :tip="
              pointing
                ? 'now press where you want it looking'
                : 'come round on the spot, without moving — or drag off its body'
            "
          >
            <button
              type="button"
              class="btn btn-xs"
              :class="pointing ? 'btn-primary' : 'btn-ghost'"
              :disabled="deaf"
              @click="emit('point')"
            >
              {{ pointing ? "press a direction" : "point" }}
            </button>
          </HelpTip>
          <HelpTip
            v-if="mounted"
            :tip="
              blown
                ? 'blown — it will not go at anybody until it has its wind back'
                : arming
                  ? 'now press the Unit to go at'
                  : 'aim a Charge at a Unit'
            "
          >
            <button
              type="button"
              class="btn btn-xs"
              :class="arming ? 'btn-error' : 'btn-ghost'"
              :disabled="deaf || blown"
              @click="emit('charge')"
            >
              {{ arming ? "pick a target" : "charge" }}
            </button>
          </HelpTip>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-xs tracking-wide text-base-content/50 uppercase">Standing</span>
          <HelpTip v-for="option in rungs" :key="`rung-${option}`" :tip="rungTip(option)">
            <button
              type="button"
              class="btn btn-xs"
              :class="rungClass(option)"
              :disabled="deaf"
              @click="emit('latitude', option)"
            >
              {{ rung(option) }}
            </button>
          </HelpTip>
        </div>
      </div>
    </div>
  </div>
</template>
