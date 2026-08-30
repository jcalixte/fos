# One JavaScript engine for the simulation, and it is the server's

The server runs on **Bun**, and `pnpm test` and `pnpm measure` move to `bun test` with it. The SPA
still builds with Vite; that is a bundler and does not evaluate a battle. Deno was rejected outright.

## Why

**Bun deletes the two pieces of scaffolding the server would otherwise need.** Its resolver is
bundler-like, so `src/sim/`'s extensionless imports — `from "./battle"` — load directly, and there
is no `vite build --ssr` step between the source and the process. `Bun.serve` carries a WebSocket
server, so there is no `ws` dependency. For a project whose entire runtime dependency list is pixi,
vue, vue-router and daisyui, a backend that adds nothing to it is worth something on its own.

**But the reason the tests move with it is the whole decision.** Bun runs on JavaScriptCore and Node
runs on V8, and [ADR-0013](./0013-a-battle-with-two-commanders-lives-on-a-server.md) is already an
ADR about exactly four functions those two do not agree on: ECMA-262 leaves `sin`, `cos`, `hypot`
and `atan2` implementation-approximated, and this simulation calls them 42 times. Under
server-authoritative that can no longer desync two Commanders — only one machine simulates. What it
can do is split the engine that *plays* the game from the engine that *measures* it. Every number in
DESIGN §8 was taken under vitest on Node. A server on JSC would be running the same code against a
different implementation of the same four functions, in a design tuned to thresholds — Break at
15–30% of casualties, the Fatigue marks, the Morale ladder — where a difference in the last place
near a threshold is a battalion that breaks or doesn't. The design conclusions would survive that.
Reproducing a reported battle from its seed would not.

So the rule is not *use Bun*. The rule is **the tests run on whatever engine the authority runs on**,
and moving one without the other is the mistake this ADR exists to prevent.

**Deno was rejected on one concrete thing.** It requires explicit extensions — `./battle.ts` — and
`src/sim/` is extensionless throughout. The ways round it are adding `.ts` to every import across the
simulation, or running production on `--unstable-sloppy-imports`. Everything else about Deno here is
fine; that is not.

## Considered

**Node, with `vite build --ssr` and `ws`.** The conservative answer, and it aligns the tests with a
*browser* player instead of with the server, since most solo play is on V8. Rejected because the
server is the authority for the battles this milestone exists to make possible, and because it keeps
two pieces of scaffolding — a build step and a dependency — that Bun removes.

**Bun for the server, Node for the tests.** The cheap version, and the one to refuse: it buys the
conveniences and pays the whole price, leaving the authority and the baseline on different engines
with nothing written down to say so.

## Consequence

**The simulation runs in three places and only two of them can agree.** Tests, server and browser.
This aligns tests with the server; a solo battle in Chrome is now the one running on an engine no
test covers. That trade is deliberate and is the thing to revisit if solo play is where the bugs
actually come from.

**DESIGN §8's measured numbers become Bun's numbers.** They should be re-measured under `bun test`
rather than assumed to carry over, and the ones that move are evidence about how much any of this
matters — if nothing moves, the whole concern was theoretical and this ADR can be relaxed.

**F18's target was never true without an engine named.** *"Bit-identical outcome"* has always meant
bit-identical *per engine*; it went unnoticed because one person on one browser was both the player
and the test harness. The target now says so.

**Two runtimes in one repo.** Vite and `vue-tsc` build the SPA; Bun runs the server and the tests.
The compose file carries two images. That is the honest cost, and it is smaller than the cost of a
build step in front of the simulation.
