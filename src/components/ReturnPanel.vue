<script setup lang="ts">
import { computed } from "vue"
import type { ArmyReturn } from "@/sim/return"

const props = defineProps<{
  headline: string
  detail: string
  returns: ArmyReturn[]
  playerArmy: string
  /** Every piece on the Field, so a count of nought reads as one and not none. */
  keyGround: { name: string; holder: string | null }[]
  /** What decided the day, so the Return can point at the figure that did it. */
  decidedBy: "army-break" | "key-ground" | "condition" | "conceded" | null
}>()

/**
 * The column the day turned on, marked so the table answers "why did they win"
 * on its own. Army Break and condition are both read off the share an army
 * spent, which is the same figure asked at two different moments. Breaking off
 * marks nothing: no figure here decided it, the commander did.
 */
const deciding = computed(() =>
  props.decidedBy === "key-ground"
    ? "ground"
    : props.decidedBy === "condition" || props.decidedBy === "army-break"
      ? "spent"
      : null,
)

/** Pieces of Key Ground neither army ended on. */
const unheld = computed(() => props.keyGround.filter((g) => g.holder === null).map((g) => g.name))

/**
 * A Pixi colour as CSS, for a swatch and never for type. The Rosters' two
 * colours are near-opposite in lightness — French #2f4d8f, Austrian #e3e7ef —
 * so whichever theme one of them reads in, the other does not: as text they
 * measure 2.06:1 and 1.02:1 against DaisyUI's dark and light base-300. A
 * swatch carries the identification instead, ringed so that the pale one is
 * still a shape on a pale surface, and the name stays in base-content.
 */
function swatch(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`
}

/**
 * Men, rounded. Strength runs fractional in the simulation because casualties
 * are continuous, and a Return that reports 592.19 men lost is reporting a
 * float and not a battalion.
 */
function men(count: number): string {
  return Math.round(count).toLocaleString("en-GB")
}

/**
 * How far an army went toward Army Break, as a percentage. It is the one figure
 * here that answers whether there was still an army at the end, and it is
 * shown as a share because that is how the end condition reads it — a third of
 * what it mustered, weighted, and the rest will not stay.
 */
function spent(share: number): string {
  return `${Math.round(share * 100)}%`
}

function ground(row: ArmyReturn): string {
  return row.keyGround.length > 0 ? row.keyGround.join(", ") : "—"
}

// The player's own army first, whichever side the Scenario named first.
const ordered = computed(() =>
  [...props.returns].sort(
    (a, b) => Number(b.id === props.playerArmy) - Number(a.id === props.playerArmy),
  ),
)

function mark(column: "ground" | "spent"): string {
  return deciding.value === column ? "text-base-content" : ""
}
</script>

<template>
  <div class="w-full max-w-2xl rounded-box bg-base-300/95 p-6 shadow-xl">
    <p class="text-lg font-semibold">{{ headline }}</p>
    <p class="mt-1 text-sm text-base-content/70">{{ detail }}</p>

    <table class="mt-5 w-full text-sm">
      <thead>
        <tr class="text-xs uppercase tracking-wide text-base-content/45">
          <th class="pb-1 text-left font-medium">Return</th>
          <th class="pb-1 text-right font-medium" :class="mark('ground')">Ground</th>
          <th class="pb-1 text-right font-medium">In hand</th>
          <th class="pb-1 text-right font-medium">Running</th>
          <th class="pb-1 text-right font-medium">Gone</th>
          <th class="pb-1 text-right font-medium">Lost</th>
          <th class="pb-1 text-right font-medium" :class="mark('spent')">Spent</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in ordered" :key="row.id" class="border-t border-base-content/10">
          <td class="py-2 pr-3">
            <span class="flex items-center gap-2">
              <span
                class="size-3 shrink-0 rounded-sm ring-1 ring-base-content/25"
                :style="{ backgroundColor: swatch(row.colour) }"
              />
              <span class="font-medium">{{ row.name }}</span>
              <span v-if="row.id === playerArmy" class="text-xs text-base-content/40">yours</span>
            </span>
            <span class="mt-0.5 block pl-5 text-xs text-base-content/50">{{ ground(row) }}</span>
          </td>
          <td class="py-2 text-right tabular-nums" :class="mark('ground')">
            {{ row.keyGround.length
            }}<span class="text-xs text-base-content/40">/{{ keyGround.length }}</span>
          </td>
          <td class="py-2 text-right tabular-nums">{{ row.inHand }}</td>
          <td class="py-2 text-right tabular-nums">{{ row.running }}</td>
          <td class="py-2 text-right tabular-nums">{{ row.gone }}</td>
          <td class="py-2 text-right tabular-nums">
            {{ men(row.mustered - row.strength) }}
            <span class="text-xs text-base-content/40">/ {{ men(row.mustered) }}</span>
          </td>
          <td class="py-2 text-right tabular-nums" :class="mark('spent')">
            {{ spent(row.spent) }}
          </td>
        </tr>
      </tbody>
    </table>

    <p v-if="unheld.length > 0" class="mt-3 text-xs text-base-content/50">
      Neither army ended on {{ unheld.join(", ") }}.
    </p>

    <p class="mt-3 text-xs leading-relaxed text-base-content/45">
      Pieces of Key Ground held, Units in hand, Units running and Units gone off the Field; men lost
      of the men mustered; and the share of itself each army spent, weighted by Grade — a third is
      where an army quits the Field. The column the day turned on is the bright one.
    </p>
    <p class="mt-3 text-xs text-base-content/40">Reload to march it again from the same seed.</p>
  </div>
</template>
