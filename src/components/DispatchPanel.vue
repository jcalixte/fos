<script setup lang="ts">
import { computed } from "vue"
import type { Dispatch } from "@/sim/types"

const props = defineProps<{ dispatches: Dispatch[]; selected: string | null }>()
const emit = defineEmits<{ select: [unitId: string] }>()

/** Newest first: the last thing that happened is the thing being reacted to. */
const recent = computed(() => props.dispatches.slice(-120).reverse())

function stamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}
</script>

<template>
  <section class="flex min-h-0 flex-col border-l border-base-content/10 bg-base-200">
    <h2
      class="border-b border-base-content/10 px-4 py-3 text-xs font-semibold tracking-[0.14em] text-base-content/60 uppercase"
    >
      Dispatches
    </h2>
    <ol class="min-h-0 flex-1 overflow-y-auto">
      <li v-if="recent.length === 0" class="px-4 py-6 text-sm text-base-content/50">
        Nothing has been reported yet.
      </li>
      <li
        v-for="(dispatch, index) in recent"
        :key="`${dispatch.at}-${index}`"
        class="flex gap-3 border-b border-base-content/5 px-4 py-2 text-sm"
        :class="{ 'bg-primary/10': dispatch.unitId && dispatch.unitId === selected }"
      >
        <span class="shrink-0 font-mono text-xs text-base-content/45 tabular-nums">
          {{ stamp(dispatch.at) }}
        </span>
        <button
          type="button"
          class="text-left leading-snug"
          :class="dispatch.unitId ? 'hover:text-primary' : 'cursor-default'"
          @click="dispatch.unitId && emit('select', dispatch.unitId)"
        >
          {{ dispatch.text }}
        </button>
      </li>
    </ol>
  </section>
</template>
