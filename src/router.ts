import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router"
import { loadCatalogue } from "@/scenario/catalogue"
import TheBattle from "@/views/TheBattle.vue"
import TheMenu from "@/views/TheMenu.vue"
import ThePlate from "@/views/ThePlate.vue"

/**
 * The two things a cold URL can honestly name: the battles on offer, and one
 * battle taken with one army.
 *
 * Nothing past that is routed, on purpose. Deployment, the battle itself and
 * the Return are states of a running simulation that is never saved, so a URL
 * naming one could not restore what it named — it would land the player at the
 * army offer while the address bar claimed otherwise. `useBattle` owns those
 * phases; the router owns only what a bookmark can keep its promise about.
 *
 * A battle is named in the URL by its directory under `public/scenarios`, which
 * is already the one name `index.json` gives it — so adding a battle stays data
 * and gains a URL for nothing (F16).
 */
const routes: RouteRecordRaw[] = [
  { path: "/", name: "battles", component: TheMenu },
  /**
   * The renderer's plate. A URL keeps its promise here for the same reason the
   * battle list's does: what it names is a drawing of fixed data, so it comes
   * back exactly as it went. Nothing links to it — it is for whoever is working
   * on C9, C10 or C11 and needs to see all of it at once.
   */
  { path: "/plate", name: "plate", component: ThePlate },
  {
    path: "/battles/:battle",
    name: "battle",
    component: TheBattle,
    /**
     * A slug naming no battle is turned back at the door rather than allowed to
     * fail as a bad fetch: `try_files` hands any unknown path back as the app's
     * own index.html, so an unchecked Scenario load would come back as a JSON
     * parse error where the player asked a plain question and deserves the list
     * as an answer.
     */
    async beforeEnter(to) {
      try {
        const battles = await loadCatalogue()
        if (battles.some((battle) => battle.id === to.params.battle)) return true
      } catch {
        // The list itself would not load. That is not evidence this battle does
        // not exist, so let it through and let the Field report what it finds.
        return true
      }
      return { name: "battles" }
    },
  },
  { path: "/:rest(.*)", redirect: { name: "battles" } },
]

export const router = createRouter({ history: createWebHistory(), routes })
