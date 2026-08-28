<script setup lang="ts">
/**
 * The bar across the top of every page. It carries the name of the game and
 * whatever the page has to put beside it — the menu has nothing, a battle has
 * its clock and its controls.
 */
import { RouterLink } from "vue-router"
</script>

<template>
  <header
    class="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-base-content/10 bg-base-200 px-5 py-2.5"
  >
    <h1 class="text-sm font-semibold tracking-wide">
      <!-- The name of the game is the way back to the list of battles, as a
           masthead is. It leaves a Field the same way the `battles` link beside
           the clock does: nothing is saved, so nothing is lost that was kept. -->
      <RouterLink
        class="rounded-sm hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        title="back to the battles on offer"
        :to="{ name: 'battles' }"
      >
        Field of Strategy
        <span class="text-primary">III</span>
      </RouterLink>
    </h1>
    <slot />
  </header>
</template>
