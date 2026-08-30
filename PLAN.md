# Multiplayer — implementation plan

What ADR-0013, ADR-0014 and DESIGN §§4–8 decided, in the order it should be built. Every phase ends
somewhere shippable. **Phases 0–2 involve no network at all** — they are an engine move, a rule the
solo game should already have obeyed, and a pure refactor — so the server work starts from a
codebase already shaped for it rather than from one being reshaped around it.

Delete this file when it is done. It is scaffolding, not documentation.

## Phase 0 — one engine (ADR-0014) — done

- [x] `from "vitest"` → `from "bun:test"` in the six `*.test.ts` files and in `budget.measure.ts`.
- [x] `vitest.measure.config.ts` deleted; `pnpm measure` is `bun test ./scripts/budget.measure.ts
      --timeout 300000`. The leading `./` is load-bearing — without it Bun reads the argument as a
      name filter, finds nothing matching `.test`/`.spec`, and exits 1.
- [x] `vitest` dropped, `@types/bun` added, and `bun:test` put in `types` for the app and scripts
      projects so `vue-tsc -b` still sees the whole tree. One assertion needed a real annotation:
      Bun's `expect` is typed against the actual, and `crossing.test.ts` had a Unit whose
      `formation` was the literal `"march-column"`.
- [x] `src/sim/` is alias-free and stays that way.
- [x] Budget re-run both ways. **Nothing about a battle moved** — only stopwatches. Recorded in
      DESIGN §8 and in ADR-0014, which now says its own concern is a precaution and not a fix.

## Phase 1 — the cut (C17, F22, T24) — solo only, done

- [x] `snapshot(battle, forArmy)` — one signature for both games, `forArmy` required and nullable so
      that naming an army is a decision somebody took rather than a default nobody noticed.
- [x] The **Report** is a nested `report`, null on the other army's Units, rather than a handful of
      blanked fields — a leak is then a type error instead of a missed line. It is wider than the
      plan said: Fatigue, aim and pace, and also `standing`, `briefedTo`, `hasOrder`, `dictated`,
      `shifting` and `suspendedBy`, all of which say what a Unit has been *told*.
- [x] **Strength is rounded, not withheld** — a Footprint is built out of it. Sent at the Field's own
      resolution, ten men, which is one Figure. Recorded in DESIGN §10 with the reasoning.
- [x] Per-Volley and per-Contact casualties are off the wire: a stream of them adds back up to the
      exact Strength the rounding takes out.
- [x] `Dispatch` carries an `army`, so the feed is a filter and not a lookup. Null on the one
      Dispatch both Commanders get: how the battle ended.
- [x] Both **Headquarters** on the Field — filled for your own, hollow for his, because one army is
      white and hue alone will not tell two marks apart.
- [x] Enemy **Couriers** and Ghosts filtered, the Couriers behind `ENEMY_COURIERS`, a constant that
      starts at `false`.
- [x] `src/sim/cut.test.ts` — ten assertions over a five-minute headless Castiglione with both
      Plans firing. Tests moved out of `tsconfig.app.json` and into the scripts project, which is
      where the things Bun runs are type-checked.

## Phase 2 — the seam (C16) — still no network, done

- [x] `src/session/index.ts` — `BattleSession`: emits `previous`/`current`/`alpha`, reports
      `running`, `tempo`, `outcome` and `returns()`, and takes one closed `Command` union. A union
      and not a method per verb, because on the far side of the wire it *is* a message.
- [x] `LocalSession` wraps `BattleRunner` and holds no rule — every Command turns into a call on
      `src/sim/`. The one exception is holding a Unit inside its Deployment zone, which is the
      Scenario's rectangle against the Unit's own Footprint and is documented as such.
- [x] `useBattle` never names a `BattleRunner` or touches a `Battle`. Verified by grep across
      `composables/`, `views/`, `components/` and `render/`.
- [x] Key Ground holders and the staff's own state (surcharge, dictated) moved into the snapshot —
      they were read off the live Battle and there is no live Battle on the client any more.
- [x] `scripts/load-headless.ts` → `src/scenario/disk.ts`, `png.mjs` beside it. `scripts/` is for
      things that are run; the server and the tests both *import* the disk loader.
- [x] Played end to end in a browser: arrange, form up, brief, Stand To, Order, Tempo, pause.

## Phase 3 — the server (C16 remote, C18)

- [ ] `server/main.ts` on `Bun.serve` — WebSocket only, no HTTP API, no framework. Creating a battle
      is a message on the socket already open.
- [ ] `RemoteSession` client, same interface as `LocalSession`.
- [ ] **Battle Register** (C18): battles in progress, two seats, tokens in `localStorage`, expiry for
      one nobody joined.
- [ ] Route `/battles/:battle/:id`. Server is authoritative on the id; a hand-edited slug redirects
      rather than being trusted. `?army=` is not honoured on a join link.
- [ ] A third browser is turned away with a line saying both armies are taken.
- **Done when:** two browsers on one machine fight a Castiglione end to end.

## Phase 4 — the two-Commander rules (F21, F23, F24)

- [ ] Blind Deployment: each Commander sent his own army only.
- [ ] **Stand To**, and Deployment ending on both or on a 3-minute clock — started when the *second*
      Commander arrives, not at creation.
- [ ] The waiting Commander is told *that* the other is still arranging, never what he is doing.
- [ ] Tempo: each asks, the battle runs at the slower of the two. Default ×4.
- [ ] **Out of Contact**: clock never pauses, army fights on its Standing Orders, seat reclaimed by
      token, and the Scenario clock is the only timeout.
- [ ] Orders accepted only from the Commander whose Army they name.
- **Done when:** pulling the plug mid-battle and rejoining recovers the seat, and the battle did not
  stop while you were gone.

## Phase 5 — deployment

- [ ] `Dockerfile.server` on `oven/bun`; the SPA image unchanged.
- [ ] `docker-compose.yml` — `web` (nginx) + `api` (bun).
- [ ] `nginx.conf` proxies `/ws` with the upgrade headers. The SPA fallback stays as it is.
- **Done when:** two people on two machines fight a battle on fos.apoena.dev.

## Phase 6 — measure what was promised

DESIGN §8 rows 7–10, each of which named where it is watched.

- [ ] F21 round trip under one 100ms step, on two machines.
- [ ] F22 the cut, as a headless assertion — the one row whose fallback is *fix it*.
- [ ] F23 Deployment inside 3 minutes on Rivoli, the largest army to arrange.
- [ ] F24 plug pulled mid-Castiglione.

## Not in this plan, deliberately

- **G9** has a Goal and no Function. Before designing a tutorial, measure what the Dispatch feed and
  the Scenario `summary` already teach — DESIGN §5 argues most of it may be built.
- **A causeless enemy Dispatch** (the *what* without the *why*) is watched in §9, not built.
- **A spectator seat.** Needs locking out until both have Stood To, or blind Deployment leaks
  through it.
- **Full offline play.** Solo already needs no network *to play* — the app loads over HTTP and the
  battle then runs entirely in the tab. Loading offline as well is a service worker and a manifest,
  and this codebase suits it (static files, a pure simulation, no state to persist). Wanted, later.
  Note that no Goal covers it: G6 is *a link you can hand someone*, which offline serves not at all.
  If it is to outlive this file, it needs a WHAT of its own in DESIGN §1.
- **The "player" → "Commander" sweep** across `DESIGN.md` and `README.md`. Recorded in §10; a
  blanket rename over 118KB is its own change, read afterwards.
