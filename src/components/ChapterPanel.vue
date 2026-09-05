<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import type { Chapter } from "@/sim/scenario"

/**
 * The Book's account, where a Commander's Dispatch feed would be.
 *
 * The two are not shown together on purpose. A feed is a working document —
 * three hundred lines an afternoon, most of them a battalion reporting that it
 * is now in line — and it is written for somebody who has to decide something.
 * A reader has nothing to decide, and what he wants is the dozen moments the
 * day turned on, in order, with what they cost.
 *
 * Chronological and not newest-first, which is the other half of the same
 * difference: a feed is read from the top because the last line is the one
 * being reacted to, and an account is read from the top because it is an
 * account.
 */
const props = defineProps<{
  chapters: Chapter[]
  /** The Scenario's own opening, which is the Chapter before the first one. */
  summary: string
  /** Battle time, in seconds. */
  time: number
}>()

const emit = defineEmits<{ select: [unitId: string] }>()

const scroller = ref<HTMLElement | null>(null)

/** Everything the clock has reached. The rest has not happened yet. */
const opened = computed(() => props.chapters.filter((c) => c.at <= props.time))

/** The one being lived through, which is the last one opened. */
const current = computed(() => opened.value.at(-1) ?? null)

function stamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

// Follow the account down as it is written. Watched on the count and not on the
// clock, so this fires once a Chapter opens rather than ten times a second.
watch(
  () => opened.value.length,
  async () => {
    await nextTick()
    const el = scroller.value
    if (el) el.scrollTop = el.scrollHeight
  },
)
</script>

<template>
  <section class="flex min-h-0 flex-col border-l border-base-content/10 bg-base-200">
    <h2
      class="border-b border-base-content/10 px-4 py-3 text-xs font-semibold tracking-[0.14em] text-base-content/60 uppercase"
    >
      The account
    </h2>
    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto">
      <p
        class="border-b border-base-content/10 px-4 py-3 text-sm leading-relaxed text-base-content/70"
      >
        {{ summary }}
      </p>

      <p v-if="chapters.length === 0" class="px-4 py-6 text-sm text-base-content/50">
        This battle has no account written for it yet. It is still fought in front of you — the
        Field is the same Field, and both armies are following the Plans the Scenario authored.
      </p>

      <ol>
        <li
          v-for="chapter in opened"
          :key="chapter.at"
          class="border-b border-base-content/5 px-4 py-3 transition-colors"
          :class="chapter === current ? 'bg-primary/10' : 'opacity-60'"
        >
          <p class="flex items-baseline gap-3">
            <span class="shrink-0 font-mono text-xs text-base-content/45 tabular-nums">
              {{ stamp(chapter.at) }}
            </span>
            <button
              v-if="chapter.unitId"
              type="button"
              class="text-left text-sm font-semibold hover:text-primary"
              @click="emit('select', chapter.unitId)"
            >
              {{ chapter.title }}
            </button>
            <span v-else class="text-sm font-semibold">{{ chapter.title }}</span>
          </p>
          <p class="mt-1.5 text-sm leading-relaxed text-base-content/75">{{ chapter.text }}</p>
        </li>
      </ol>
    </div>
  </section>
</template>
