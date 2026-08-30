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

## Phase 1 — the cut (C17, F22, T24) — solo only

A rule the solo game should already have obeyed. Ships on its own, no server.

- [ ] `snapshot(battle, forArmy)` in `src/sim/snapshot.ts` — pure, one signature for both games.
- [ ] Withhold the enemy's **Report**: exact Strength, Fatigue, aim. Keep what the map already
      shows — Arm, Grade, Formation, Morale, Disorder.
- [ ] Filter **Dispatches** to the Commander's own army.
- [ ] Draw the enemy **Headquarters** (`BattleView.ts:1600` currently draws only its own). This is
      what makes **Harried** and **Overrun** aimable, and closes DESIGN §9's oldest tension.
- [ ] Enemy **Couriers** behind a dial that starts at nothing — a constant, *not* in `settings.ts`,
      which is looks-only and per-Commander.
- [ ] Headless tests over `load-headless.ts` asserting the cut on a built Battle.
- **Done when:** a solo Castiglione shows no enemy Report and no enemy Dispatch, and the enemy
  Headquarters is on the Field.

## Phase 2 — the seam (C16) — still no network

Pure refactor. Behaviour identical before and after.

- [ ] `src/session/` — the interface: takes Orders, emits `BattleSnapshot`s, reports the Outcome.
- [ ] `LocalSession` wrapping `BattleRunner`.
- [ ] `useBattle` talks to the interface and never learns which it has.
- [ ] Move `scripts/load-headless.ts` + `png.mjs` to `src/scenario/disk.ts`, so `scenario/` holds
      `build.ts` (shared), `loader.ts` (canvas) and `disk.ts` (node), and `scripts/` stops being the
      home of production code.
- **Done when:** every existing battle plays exactly as before and nothing outside `session/` knows
  what a `BattleRunner` is.

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
