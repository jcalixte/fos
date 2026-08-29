<script setup lang="ts">
/**
 * What Deployment is for, said in the side panel rather than over the Field.
 * It used to be a banner across the top of the map, which is the one place it
 * could not go: a deployment zone is drawn where the army starts, and Rivoli
 * starts the Austrians in a band along the top edge — the explanation of what
 * to drag sat on top of the ground it was telling you to drag onto.
 *
 * The Dispatch feed is the honest place for it. Nothing has been reported yet
 * and nothing can be until the clock runs, so the column is standing empty for
 * exactly as long as this has something to say.
 */
</script>

<template>
  <section class="flex min-h-0 flex-col border-l border-base-content/10 bg-base-200">
    <h2
      class="border-b border-base-content/10 px-4 py-3 text-xs font-semibold tracking-[0.14em] text-base-content/60 uppercase"
    >
      Deployment
    </h2>
    <div
      class="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm leading-relaxed text-base-content/80"
    >
      <p>
        Drag your Units inside the marked zone, and drag the Headquarters to where you mean to stand
        — every Order you give will be ridden from there.
      </p>
      <p>
        You can send it to new ground once the clock runs, but no rider leaves it while it is on the
        move — there is no table to write at, so what you order then is taken down and rides when it
        is established.
      </p>
      <p>
        Select a Unit to form it up, and drag from open ground to point it: before the clock runs,
        both are free.
      </p>
    </div>
  </section>
</template>
