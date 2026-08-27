<script setup lang="ts">
import { onMounted, ref } from "vue"
import BattleMenu from "@/components/BattleMenu.vue"
import TopBar from "@/components/TopBar.vue"
import {
  type CatalogueEntry,
  type LastBattle,
  loadCatalogue,
  recallBattle,
} from "@/scenario/catalogue"

/**
 * The battles on offer. This is the one page that survives a reload with
 * everything it had, because everything it has is a list of files.
 */
const battles = ref<CatalogueEntry[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

/**
 * Read as the page is built rather than once for the life of the app: coming
 * back from a Field mounts this afresh, and the shortcut it offers may well be
 * the battle just left.
 */
const last = ref<LastBattle | null>(recallBattle())

onMounted(async () => {
  try {
    battles.value = await loadCatalogue()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-base-300 text-base-content">
    <TopBar />
    <main class="relative min-h-0 flex-1">
      <BattleMenu :battles="battles" :last="last" :error="error" :loading="loading" />
    </main>
  </div>
</template>
