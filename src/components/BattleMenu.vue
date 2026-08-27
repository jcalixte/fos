<script setup lang="ts">
import { computed } from "vue"
import type { CatalogueEntry, LastBattle } from "@/scenario/catalogue"

const props = defineProps<{
  battles: CatalogueEntry[]
  /** The last battle taken, if it is still on offer. */
  last: LastBattle | null
  /** Why the last attempt to put a Scenario on the Field came to nothing. */
  error: string | null
  loading: boolean
}>()

const emit = defineEmits<{
  take: [path: string]
  resume: [last: LastBattle]
}>()

/**
 * The shortcut back onto the Field under work: the last battle taken, with the
 * same army, straight to Deployment. It is dropped silently if that Scenario is
 * no longer offered or no longer has that army — a stale shortcut is worse than
 * none, because it lands somewhere that was not asked for.
 */
const resumable = computed(() => {
  if (!props.last) return null
  const battle = props.battles.find((b) => b.path === props.last?.path)
  const army = battle?.armies.find((a) => a.id === props.last?.army)
  return battle && army ? { battle, army } : null
})

/** Minutes on the Scenario clock — the length of the day, not a running time. */
function day(seconds: number): string {
  return `${Math.round(seconds / 60)} min`
}
</script>

<template>
  <div class="absolute inset-0 grid place-items-center overflow-auto bg-base-300 p-6">
    <div class="w-full max-w-3xl">
      <h2 class="text-lg font-semibold">Choose a battle</h2>
      <p class="mt-1 text-xs text-base-content/60">
        Every battle offers both its armies. You take one of them, arrange it, and fight the Plan
        the Scenario wrote for the other.
      </p>

      <div v-if="error" class="mt-5 rounded-box border border-error/40 bg-error/10 p-4">
        <p class="text-sm font-semibold text-error">The Scenario would not load</p>
        <p class="mt-1 font-mono text-xs text-base-content/70">{{ error }}</p>
      </div>

      <!-- Straight back in, put above the list rather than in it: it is not a
           battle on offer, it is the last one, and the whole point of it is not
           having to find it again. -->
      <button
        v-if="resumable"
        type="button"
        class="mt-5 btn btn-primary btn-block justify-start"
        @click="emit('resume', { path: resumable.battle.path, army: resumable.army.id })"
      >
        <span class="truncate">
          Straight back in — {{ resumable.battle.name }}, as the {{ resumable.army.name }}
        </span>
      </button>
      <p v-if="resumable" class="mt-1.5 text-xs text-base-content/45">
        Skips the offer and takes the same army again, so a change can be tried on the same ground
        in one press.
      </p>

      <p v-if="loading" class="mt-6 text-xs text-base-content/50">Reading the Scenarios…</p>
      <p v-else-if="battles.length === 0" class="mt-6 text-xs text-base-content/50">
        No battles are on offer. `public/scenarios/index.json` names the ones there are.
      </p>

      <div class="mt-6 grid gap-3">
        <button
          v-for="battle in battles"
          :key="battle.path"
          type="button"
          class="rounded-box border border-base-content/15 bg-base-200 p-4 text-left transition hover:border-primary hover:bg-base-100"
          @click="emit('take', battle.path)"
        >
          <span class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span class="text-sm font-semibold">{{ battle.name }}</span>
            <span class="font-mono text-xs text-base-content/45">{{ day(battle.clock) }}</span>
            <span class="ml-auto flex items-center gap-2">
              <span
                v-for="army in battle.armies"
                :key="army.id"
                class="flex items-center gap-1.5 text-xs text-base-content/60"
              >
                <span
                  class="size-3 shrink-0 rounded-full border border-base-content/25"
                  :style="{ background: army.colour }"
                />
                {{ army.name }}
              </span>
            </span>
          </span>
          <span class="mt-2 block text-xs leading-relaxed text-base-content/70">
            {{ battle.summary }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
