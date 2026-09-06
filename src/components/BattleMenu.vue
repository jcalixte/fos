<script setup lang="ts">
import { computed } from "vue"
import type { LastBattle, Shelf } from "@/scenario/catalogue"

const props = defineProps<{
  /** The battles on offer, under the Campaigns they are shelved under. */
  shelves: Shelf[]
  /** The last battle taken, if it is still on offer. */
  last: LastBattle | null
  /** Why the list of battles on offer came to nothing. */
  error: string | null
  loading: boolean
}>()

/**
 * Every battle, whatever shelf it sits on. A Campaign is how the list is read
 * and never how a battle is found: nothing else here cares which one a battle
 * came off, and a shortcut that had to know would break the day one moved.
 */
const battles = computed(() => props.shelves.flatMap((shelf) => shelf.battles))

/**
 * The shortcut back onto the Field under work: the last battle taken, with the
 * same army, straight to Deployment. It is dropped silently if that Scenario is
 * no longer offered or no longer has that army — a stale shortcut is worse than
 * none, because it lands somewhere that was not asked for.
 */
const resumable = computed(() => {
  if (!props.last) return null
  const battle = battles.value.find((b) => b.id === props.last?.battle)
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
        Every battle can be taken or read. Take an army and you arrange it and fight the Plan the
        Scenario wrote for the other; read the account and nobody commands — both Plans run, the day
        goes as it went, and what happened is said over the top of it.
      </p>

      <div v-if="error" class="mt-5 rounded-box border border-error/40 bg-error/10 p-4">
        <p class="text-sm font-semibold text-error">The battles would not load</p>
        <p class="mt-1 font-mono text-xs text-base-content/70">{{ error }}</p>
      </div>

      <!-- Straight back in, put above the list rather than in it: it is not a
           battle on offer, it is the last one, and the whole point of it is not
           having to find it again. It sits above the Campaigns for the same
           reason it sits above the battles — it is not on a shelf either. -->
      <RouterLink
        v-if="resumable"
        class="mt-5 btn btn-primary btn-block justify-start"
        :to="{
          name: 'battle',
          params: { battle: resumable.battle.id },
          query: { army: resumable.army.id },
        }"
      >
        <span class="truncate">
          Straight back in — {{ resumable.battle.name }}, as the {{ resumable.army.name }}
        </span>
      </RouterLink>
      <p v-if="resumable" class="mt-1.5 text-xs text-base-content/45">
        Skips the offer and takes the same army again, so a change can be tried on the same ground
        in one press.
      </p>

      <p v-if="loading" class="mt-6 text-xs text-base-content/50">Reading the Scenarios…</p>
      <p v-else-if="battles.length === 0" class="mt-6 text-xs text-base-content/50">
        No battles are on offer. `public/scenarios/index.json` names the ones there are, and
        `public/campaigns.json` names the Campaigns they are shelved under.
      </p>

      <!-- A Campaign is a heading and not a page. With this many battles the
           whole shelf fits on the screen it is read on, and making it a screen
           of its own would cost a press to say what a heading already says. -->
      <section v-for="shelf in shelves" :key="shelf.id" class="mt-8">
        <h3 class="flex flex-wrap items-baseline gap-x-3">
          <span class="text-base font-semibold">{{ shelf.name }}</span>
          <span v-if="shelf.years" class="font-mono text-xs text-base-content/45">
            {{ shelf.years }}
          </span>
          <span class="ml-auto text-xs text-base-content/45">
            {{ shelf.battles.length }} {{ shelf.battles.length === 1 ? "battle" : "battles" }}
          </span>
        </h3>
        <p class="mt-1 text-xs leading-relaxed text-base-content/55">{{ shelf.summary }}</p>

        <div class="mt-4 grid gap-3">
          <div
            v-for="battle in shelf.battles"
            :key="battle.id"
            class="rounded-box border border-base-content/15 bg-base-200"
          >
            <div class="p-4 text-left">
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
            </div>
            <!-- Both ways in, side by side and equally legible. The card itself
                 is no longer a link: with two things to do with a battle, one of
                 them cannot be the whole card and the other a line of small print
                 under it. -->
            <div class="flex flex-wrap gap-2 border-t border-base-content/10 px-4 py-3">
              <RouterLink
                class="btn btn-primary btn-sm"
                :to="{ name: 'battle', params: { battle: battle.id } }"
              >
                Take an army
              </RouterLink>
              <RouterLink class="btn btn-sm" :to="{ name: 'book', params: { battle: battle.id } }">
                Read the account
              </RouterLink>
              <span class="ml-auto self-center text-xs text-base-content/45">
                Read it first if the day means nothing to you yet
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
