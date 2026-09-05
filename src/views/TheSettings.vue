<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue"
import TopBar from "@/components/TopBar.vue"
import { swatchField } from "@/render/plate"
import { PAPERS, type PaperName, STAFF_MAP_DEFAULTS, buildStaffMapCanvas } from "@/render/staffmap"
import { HACHURE_CHOICES, loadSettings, saveSettings, type Settings } from "@/settings"
import { LOUDNESS_CHOICES } from "@/sound"

/**
 * How the Field is drawn, and how loud it is.
 *
 * A choice is shown rather than named wherever it can be. A tone offered as the
 * word "foxed" is not a choice a player can make, and the thing being chosen is
 * a picture — so each paper carries a picture of itself, drawn by the renderer
 * that will draw the battle. The Noise is the one thing here with no picture to
 * carry, and it is left named.
 */
const settings = reactive<Settings>(loadSettings())
watch(settings, () => saveSettings({ ...settings }))

const papers = Object.keys(PAPERS) as PaperName[]
const field = swatchField()

/**
 * The swatches, drawn once on mount and kept.
 *
 * Five of these is five terrain builds, which is why the Field is forty cells
 * across rather than the two hundred and forty a battle is: the whole set costs
 * about what one battle's Field costs. Redrawn only when the *other* setting
 * moves, so a paper is always shown at the weight of relief the player has
 * actually asked for.
 */
const swatches = ref<Record<string, string>>({})

function draw(): void {
  const drawn: Record<string, string> = {}
  for (const paper of papers) {
    drawn[paper] = buildStaffMapCanvas(field, {
      ...STAFF_MAP_DEFAULTS,
      paper,
      hachures: settings.hachures,
    }).toDataURL()
  }
  swatches.value = drawn
}

onMounted(draw)
watch(() => settings.hachures, draw)

const paperNote = computed(() =>
  settings.paper === "light" || settings.paper === "buff"
    ? "A lighter sheet. The white army has a little less to stand out against."
    : settings.paper === "foxed"
      ? "A darker sheet. The white army gains and the blue loses."
      : "",
)
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-base-300 text-base-content">
    <TopBar>
      <p class="text-xs text-base-content/60">Settings</p>
      <RouterLink to="/" class="btn btn-ghost btn-xs ml-auto">battles</RouterLink>
    </TopBar>

    <main class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-10">
        <section class="flex flex-col gap-4">
          <div>
            <h2 class="text-sm font-semibold">Paper</h2>
            <p class="text-xs text-base-content/60">
              The sheet the Field is drawn on. Every tone here keeps both armies readable; pick the
              one you would rather look at for forty minutes.
            </p>
          </div>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <button
              v-for="paper in papers"
              :key="paper"
              type="button"
              class="flex flex-col gap-1.5 rounded-lg border-2 p-1.5 text-left transition"
              :class="
                settings.paper === paper
                  ? 'border-primary'
                  : 'border-transparent hover:border-base-content/20'
              "
              :aria-pressed="settings.paper === paper"
              @click="settings.paper = paper"
            >
              <img
                v-if="swatches[paper]"
                :src="swatches[paper]"
                :alt="`the Field drawn on ${paper} paper`"
                class="aspect-[44/28] w-full rounded object-cover"
              />
              <span v-else class="aspect-[44/28] w-full animate-pulse rounded bg-base-content/10" />
              <span class="px-0.5 text-xs">{{ paper }}</span>
            </button>
          </div>
          <p v-if="paperNote" class="text-xs text-base-content/50">{{ paperNote }}</p>
        </section>

        <section class="flex flex-col gap-3">
          <div>
            <h2 class="text-sm font-semibold">Relief</h2>
            <p class="text-xs text-base-content/60">
              How hard the hachures are laid in. They are what says a ridge is a ridge, so they
              cannot be turned off — only quietened.
            </p>
          </div>
          <div class="flex gap-2">
            <button
              v-for="weight in HACHURE_CHOICES"
              :key="weight"
              type="button"
              class="btn btn-sm"
              :class="settings.hachures === weight ? 'btn-primary' : 'btn-ghost'"
              @click="settings.hachures = weight"
            >
              {{ weight }}
            </button>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <div>
            <h2 class="text-sm font-semibold">Noise</h2>
            <p class="text-xs text-base-content/60">
              Volleys, guns, Charges, Contacts, Routs and your own Orders arriving, heard from where
              your Headquarters is standing — so fire near the staff is loud and fire a kilometre
              off is a murmur, and both change as you ride. Nothing here is said that the Field does
              not already show, which is why it can be turned off.
            </p>
          </div>
          <div class="flex gap-2">
            <button
              v-for="level in LOUDNESS_CHOICES"
              :key="level"
              type="button"
              class="btn btn-sm"
              :class="settings.sound === level ? 'btn-primary' : 'btn-ghost'"
              @click="settings.sound = level"
            >
              {{ level }}
            </button>
          </div>
          <label class="flex w-fit items-center gap-2 text-xs">
            <input v-model="settings.drums" type="checkbox" class="checkbox checkbox-sm" />
            Beat the drums — the pas ordinaire, 76 to the minute, under the battle and drowned by it
          </label>
        </section>

        <p class="text-xs text-base-content/40">
          The Field is drawn once when a battle opens, so the paper and the relief show on the next
          battle you start rather than on one already running. The Noise is not: it can be moved
          from the battle screen, because leaving a battle to quieten it would cost you the battle.
        </p>
      </div>
    </main>
  </div>
</template>
