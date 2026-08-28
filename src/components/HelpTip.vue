<script setup lang="ts">
import { nextTick, ref, useId } from "vue"

/**
 * What a button means, shown by it on hover or focus. For the buttons whose
 * label is a term rather than a verb: "halt" says what it does and "stand off"
 * does not, and a player cannot be asked to read an ADR to use the bar.
 *
 * Teleported to the body and placed in viewport coordinates rather than drawn
 * where it belongs in the markup. The Unit card scrolls sideways under a mask,
 * so anything positioned inside it is clipped to a bar four rems tall — and a
 * tooltip clipped to the bar it explains is no tooltip. The cost is that it has
 * to be measured before it can be kept on screen, which is the second pass and
 * the reason for `placed`.
 */
const props = defineProps<{ tip: string }>()

const id = useId()
const tip = ref<HTMLElement>()
const at = ref<{ left: number; top: number } | null>(null)
/** False for the one frame between being rendered and being measured. */
const placed = ref(false)

/** Margin kept between the tooltip and the edge of the window. */
const MARGIN = 8

async function show(event: Event): Promise<void> {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const anchor = { left: box.left + box.width / 2, top: box.top - MARGIN }
  at.value = anchor
  placed.value = false
  await nextTick()
  // The pointer can have swept off the button and taken the tooltip with it
  // while this was waiting for the first pass to render — a run along the row
  // does exactly that, several times a second.
  if (at.value !== anchor) return
  const half = (tip.value?.offsetWidth ?? 0) / 2
  // Clamped rather than flipped: these sit in a row along the foot of the
  // window, so one running off the side is the only way it can be lost.
  at.value = {
    ...anchor,
    left: Math.min(Math.max(anchor.left, half + MARGIN), window.innerWidth - half - MARGIN),
  }
  placed.value = true
}

function hide(): void {
  at.value = null
}
</script>

<template>
  <span
    class="inline-flex"
    :aria-describedby="at ? id : undefined"
    @pointerenter="show"
    @pointerleave="hide"
    @focusin="show"
    @focusout="hide"
  >
    <slot />
  </span>
  <Teleport v-if="at" to="body">
    <span
      :id="id"
      ref="tip"
      role="tooltip"
      class="pointer-events-none fixed z-50 max-w-80 -translate-x-1/2 -translate-y-full rounded-sm bg-neutral px-2 py-1 text-xs leading-snug whitespace-pre-line text-neutral-content shadow-lg"
      :class="placed ? 'opacity-100' : 'opacity-0'"
      :style="{ left: `${at.left}px`, top: `${at.top}px` }"
    >
      {{ props.tip }}
    </span>
  </Teleport>
</template>
