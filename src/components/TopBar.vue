<script setup lang="ts">
/**
 * The bar across the top of every page. It carries the name of the game and
 * whatever the page has to put beside it — the menu has nothing, a battle has
 * its clock and its controls.
 */
</script>

<template>
  <header
    class="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-base-content/10 bg-base-200 px-5 py-2.5"
  >
    <h1 class="text-sm font-semibold tracking-wide">
      Field of Strategy
      <span class="text-primary">III</span>
    </h1>
    <slot />
  </header>
</template>
