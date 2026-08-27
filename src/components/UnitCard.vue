<script setup lang="ts">
import { computed } from "vue"
import { canCharge } from "@/sim/charge"
import { baseSpeed, drillSeconds, formationsFor, frontage } from "@/sim/formation"
import { describeFormation, type FormationName, type Grade } from "@/sim/types"
import type { UnitSnapshot } from "@/sim/snapshot"

const props = defineProps<{
  unit: UnitSnapshot
  gradeName: string
  arrivalFormation: FormationName | null
  /** What it is committed to a Charge on, by name. Null when it is not. */
  chargingName: string | null
  /** A Charge is armed on this Unit and waiting to be aimed. */
  arming: boolean
  /** Deployment: the army is being arranged, so nothing here is an Order yet. */
  deploying: boolean
  disabled: boolean
}>()

const emit = defineEmits<{
  form: [formation: FormationName]
  arrivalFormation: [formation: FormationName]
  charge: []
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

const label = describeFormation
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
            {{ unit.arm }} · {{ gradeName }} · {{ unit.strength }} men · {{ width }}m frontage ·
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
          <button
            v-if="orderable"
            type="button"
            class="btn btn-ghost btn-xs"
            :disabled="deaf"
            @click="emit('halt')"
          >
            halt
          </button>
          <button
            v-if="mounted && orderable"
            type="button"
            class="btn btn-xs"
            :class="arming ? 'btn-error' : 'btn-ghost'"
            :disabled="deaf"
            :title="arming ? 'now press the Unit to go at' : 'aim a Charge at a Unit'"
            @click="emit('charge')"
          >
            {{ arming ? "pick a target" : "charge" }}
          </button>
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
