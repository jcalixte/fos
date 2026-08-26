<script setup lang="ts">
import { computed } from "vue"
import { baseSpeed, drillSeconds, formationsFor, frontage } from "@/sim/formation"
import { describeFormation, type FormationName, type Grade } from "@/sim/types"
import type { UnitSnapshot } from "@/sim/snapshot"

const props = defineProps<{
  unit: UnitSnapshot
  gradeName: string
  arrivalFormation: FormationName | null
  disabled: boolean
}>()

const emit = defineEmits<{
  form: [formation: FormationName]
  arrivalFormation: [formation: FormationName]
  halt: []
}>()

const options = computed(() => formationsFor(props.unit.arm))
const width = computed(() =>
  Math.round(frontage(props.unit.arm, props.unit.formation, props.unit.strength)),
)
const busy = computed(() => props.unit.changingTo !== null)

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
          </p>
        </div>

        <p class="min-w-52 text-xs">
          <span v-if="busy" class="text-warning">
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
            :disabled="disabled"
            @click="emit('form', option)"
          >
            {{ label(option) }}
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-xs"
            :disabled="disabled"
            @click="emit('halt')"
          >
            halt
          </button>
        </div>

        <div class="flex items-center gap-2">
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
