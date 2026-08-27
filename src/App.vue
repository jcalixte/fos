<script setup lang="ts">
/**
 * The whole app is one page at a time, and which one is the URL's business: the
 * battles on offer, or one battle. Keying on the path remounts the Field when
 * the player goes from one battle to another — including by the browser's own
 * Back — so a Scenario never lands on a renderer still holding the last one.
 * The army is a query and not a path, so taking one leaves the Field standing.
 */
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <component :is="Component" :key="route.path" />
  </RouterView>
</template>
