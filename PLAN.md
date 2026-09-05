# Multiplayer — implementation plan

What ADR-0013, ADR-0014 and DESIGN §§4–8 decided, in the order it should be built. Every phase ends
somewhere shippable. **Phases 0–2 involve no network at all** — they are an engine move, a rule the
solo game should already have obeyed, and a pure refactor — so the server work starts from a
codebase already shaped for it rather than from one being reshaped around it.

Delete this file when it is done. It is scaffolding, not documentation.

## What is left

Phases 0 to 6 are done and verified. Everything below is the whole of what is not.

1. **Fight one across two machines**, which is the other half of Phase 6's F21 row and the only way
   to get a round-trip figure that means anything. The loopback number is 1.9ms median against a
   100ms budget; what a real connection costs is unmeasured.
2. **Time a person arranging Rivoli.** F23's three minutes is asserted as a clock and unmeasured as
   a human act. Thirteen Units is the largest army anybody has to arrange, and if three minutes
   binds, DESIGN §8 says the arranging *grammar* is what is slow and the clock is not the thing to
   change.
3. **Watch what the wire costs.** 15KB a state, ten a second, ~148KB/s per Commander. Recorded in
   DESIGN §8 with its trigger; rounding coordinates buys 2%, so the answer when it bites is a
   shorter encoding.

Then delete this file, and sweep `DESIGN.md` and `README.md` for "player" → "Commander" — the last
item under *Not in this plan* and the only one of them that is bookkeeping rather than design.

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

## Phase 3 — the server (C16 remote, C18) — done

- [x] `server/main.ts` on `Bun.serve`. WebSocket only, no HTTP API, no framework, no dependency:
      opening a battle, joining one and giving an Order are all messages on the socket. A GET that
      lands on it says so rather than answering blank.
- [x] `src/session/wire.ts` — the protocol, imported by both ends, so it has one meaning. The feed
      goes as a tail with an index; the seam's `dispatches` contract is unchanged either side.
- [x] `RemoteSession`, same interface as `LocalSession`. Its only arithmetic is `alpha`, measured
      from when the state arrived instead of from a step it took.
- [x] **Battle Register** (C18): battles, two seats, tokens in `localStorage`, expiry for one nobody
      joined and for one that has been decided.
- [x] Route `/battles/:battle/:id`. `?army=` is not honoured there. A bad id comes back *gone* and
      the page offers the same Scenario alone.
- [x] A third browser is told both armies are taken, and the offer is withdrawn rather than left
      pressable.
- [x] Two browsers on one machine fight a Castiglione end to end.

## Phase 4 — the two-Commander rules (F21, F23, F24) — done

Built with Phase 3 rather than after it, because the barrier is what makes "fight a Castiglione end
to end" mean anything: without it either Commander starts the clock on the other.

- [x] Blind Deployment: `snapshot(battle, forArmy, deploying)` sends each Commander his own army and
      his own staff, and nothing else. Solo does not pass the flag — there is no second army being
      arranged there, and hiding a Roster standing where it was authored would take six existing
      battles away for a rule with nobody on the other side of it.
- [x] **Stand To**, and Deployment ending on both or on a 3-minute clock started when the *second*
      Commander takes an army.
- [x] The waiting Commander is told *that* the other is still arranging, and nothing else.
- [x] Tempo: each asks, the battle runs at the slower. The screen reads back what it got.
- [x] **Out of Contact**: the clock never pauses, the seat is reclaimed by token at the same
      address, and the feed is replayed from the top for a Commander who missed some of it.
- [x] Orders accepted only from the Commander whose Army they name — and the other army's Units are
      not in his snapshot to name.
- [x] The deployment arithmetic went to `src/sim/deployment.ts` rather than into both sessions. That
      was the seam's guard being spent for the first time, and it is recorded in DESIGN §9.

## Phase 5 — deployment — built and running

- [x] `Dockerfile.server` on `oven/bun`, with no build step and no `node_modules`. Verified by
      running the server from a tree holding only the files the image copies — which caught that
      `public/rosters/` has to come too, a Scenario naming its Rosters by the path the browser
      fetches them at.
- [x] `docker-compose.yml` — `web` (nginx) + `api` (bun). `docker compose config` parses.
- [x] `nginx.conf` proxies `/ws` with the upgrade headers and a long read timeout, because a
      Commander Out of Contact still holds a seat. The SPA fallback is untouched.
- [x] **Both images built and running on fos.apoena.dev.** Coolify builds from `docker-compose.yml`
      now rather than from `Dockerfile` alone. `web` is exposed and not published: port 80 on that
      host belongs to the proxy terminating the domain, so publishing it is a collision with the
      thing routing to the site. `wss://fos.apoena.dev/ws` answers 101, opens a Castiglione and
      streams state — which is also how the `api` image was shown to read its own Scenarios and
      Rosters off the disk it was built with.
- [ ] **Two people on two machines.** Still open, and it is item 1 above.

## Phase 6 — measure what was promised — done, with one honest gap

Recorded in DESIGN §8.

- [x] F21 round trip: median 1.9ms, p90 3.5ms, worst 4.5ms over 30 Orders. **On one machine only** —
      the two-machine figure is the gap, and it is the same gap as Phase 5's last box.
- [x] F22 the cut, as ten headless assertions on a five-minute Castiglione with both Plans firing.
- [x] F23 the clock and the blindness, as assertions. Whether a *person* can arrange Rivoli's
      thirteen Units in three minutes is unmeasured and needs a second player.
- [x] F24 plug pulled mid-Castiglione at 0:15, rejoined at 0:52, same seat and same army.
- [x] Unpromised and now recorded: a state message is 15KB and there are ten a second, so ~148KB/s
      per Commander. Rounding coordinates buys 2% — the payload is field names — so the trigger's
      answer is a shorter encoding and not a slower tick.

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
