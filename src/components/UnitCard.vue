<script setup lang="ts">
import { computed } from "vue"
import HelpTip from "@/components/HelpTip.vue"
import { canCharge } from "@/sim/charge"
import { baseSpeed, drillSeconds, formationsFor, frontage } from "@/sim/formation"
import { describeLatitude, explainLatitude, LATITUDES } from "@/sim/standing"
import { describeFormation, type FormationName, type Grade, type Latitude } from "@/sim/types"
import type { UnitSnapshot } from "@/sim/snapshot"

const props = defineProps<{
  unit: UnitSnapshot
  gradeName: string
  arrivalFormation: FormationName | null
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
  arrivalFormation: [formation: FormationName]
  latitude: [latitude: Latitude]
  holdFire: [held: boolean]
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
 * Halting, charging and choosing an arrival Formation are all Orders, and there
 * are no Orders at Deployment — nothing is marching to be halted, no rider will
 * carry anything until the clock runs, and a Unit standing in its zone has no
 * arrival to dress for. Hidden rather than disabled: a greyed row the player can
 * never reach in this phase reads as something broken.
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
          </p>
        </div>

        <p class="min-w-52 text-xs">
          <span v-if="unit.routing" class="text-error">routing — out of command</span>
          <span v-else-if="unit.recoiling" class="text-warning">
            thrown back from {{ chargingName ?? "it" }}, and blown
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
          <span v-else-if="unit.standing.holdFire" class="text-warning">
            in {{ label(unit.formation) }}, holding its fire
          </span>
          <span v-else class="text-base-content/60">
            in {{ label(unit.formation) }}{{ unit.hasOrder ? ", under orders" : "" }}
          </span>
        </p>
      </div>

      <div class="flex items-center gap-x-6">
        <div class="flex items-center gap-2">
          <span class="text-xs tracking-wide text-base-content/50 uppercase">Form</span>
          <button
            v-for="option in options"
            :key="`form-${option}`"
            type="button"
            class="btn btn-xs"
            :class="unit.formation === option ? 'btn-primary' : 'btn-ghost'"
            :disabled="deaf"
            @click="emit('form', option)"
          >
            {{ label(option) }}
          </button>
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
            :tip="arming ? 'now press the Unit to go at' : 'aim a Charge at a Unit'"
          >
            <button
              type="button"
              class="btn btn-xs"
              :class="arming ? 'btn-error' : 'btn-ghost'"
              :disabled="deaf"
              @click="emit('charge')"
            >
              {{ arming ? "pick a target" : "charge" }}
            </button>
          </HelpTip>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-xs tracking-wide text-base-content/50 uppercase">Standing</span>
          <HelpTip v-for="option in rungs" :key="`rung-${option}`" :tip="explain(option)">
            <button
              type="button"
              class="btn btn-xs"
              :class="unit.standing.latitude === option ? 'btn-primary' : 'btn-ghost'"
              :disabled="deaf"
              @click="emit('latitude', option)"
            >
              {{ rung(option) }}
            </button>
          </HelpTip>
          <!-- Its own button and not a fifth rung: what a Unit does with its
               feet and what it does with its muskets are different questions,
               and a battalion may be told to close up and to hold its fire. -->
          <HelpTip tip="it will not open fire at all, at any range, until this is lifted">
            <button
              type="button"
              class="btn btn-xs"
              :class="unit.standing.holdFire ? 'btn-warning' : 'btn-ghost'"
              :disabled="deaf"
              @click="emit('holdFire', !unit.standing.holdFire)"
            >
              hold fire
            </button>
          </HelpTip>
        </div>

        <div v-if="orderable" class="flex items-center gap-2">
          <span class="text-xs tracking-wide text-base-content/50 uppercase">Arrive in</span>
          <button
            v-for="option in options"
            :key="`arrive-${option}`"
            type="button"
            class="btn btn-xs"
            :class="arrivalFormation === option ? 'btn-primary btn-outline' : 'btn-ghost'"
            :disabled="disabled"
            @click="emit('arrivalFormation', option)"
          >
            {{ label(option) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
