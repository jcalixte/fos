# Field of Strategy III

Real-time tactical battles of the Napoleonic era, seen from above in 2D. You are the army
commander: you deploy your army, then issue Orders that take time to arrive.

## Run it

```bash
pnpm install
pnpm dev           # the battle on :5173
pnpm test          # the simulation, headless — no canvas involved
pnpm lint          # oxlint  (pnpm lint:fix to autofix)
pnpm fmt           # oxfmt   (pnpm fmt:check to verify only)
pnpm build         # type-check and build to static assets
node scripts/make-bridge-fixture.mjs   # repaint the fixture Field
```

Deployed at https://fos.apoena.dev — pushes to `main` are picked up by Coolify.

## What is built

The first milestone, which has no fighting in it on purpose: it existed to answer whether an
Order that takes a minute and a half to arrive is a game or a nuisance. It is a game
([DESIGN](./DESIGN.md) §8). Deployment, Orders couriered from a Headquarters, Couriers and
Ghosts on the Field, Formation geometry and the morph between Formations, routing that funnels
to Crossings, Initiative as an ordered rule list, Arrivals, and the Dispatch feed.

Fighting, and what ends it. A Unit standing still with an enemy in its beaten ground fires on the
period's clock, and what that costs comes out of the geometry: how many weapons bear, and how much
depth their shot has to find. Guns are laid on their target; muskets point where the rank points.
Standing still is what dresses the Face, so skirmishers in Open Order, having none, fire on the
march and reload at half the rate — over a beaten ground that is the screen's own Footprint blown
out by its reach, so its fire thins with the range like anybody else's.
Then Morale decides its fate rather than Strength — a battalion Breaks at about a fifth of its men,
Routs away from whatever broke it, is deaf to Orders while it runs, and Rallies with a lower Morale
Ceiling than it had before.

The Charge, which is the one Order aimed at a Unit and not at a piece of ground. It walks up at the
Formation's own pace and runs only the last hundred and fifty metres, and where it lands is decided
by which Face it struck: off a Face there is no fight, and a battalion in march column or halfway
into square has none. Contact takes very few men and is over inside one step, because it is nerve
that gives out. A square throws horse back on a quarter of a line's Frontage, which is the whole of
what square is for and needs no rule of its own.

How a battle ends, which is the clock. It runs its full length the way a turn-based game runs its
last turn, and then the Key Ground is counted: an army holds a piece by having the last
uncontested Unit on it, and where that is even, what each army has left decides. Underneath sits
the only other ending a rule reaches — an army with nothing left in hand, every Unit of it running
or gone, quits the Field. That is a floor and not a race: an army a third gone is hurt and not
beaten, and it has the rest of the afternoon to show it ([ADR-0006](./docs/adr/0006-a-battle-ends-on-the-clock.md)).
Neither way is annihilation.

Not built yet: Fatigue, Disorder, Pursuit, Concealment, Powder Smoke, sound.

## Layout

| Path | What lives there |
|---|---|
| `src/sim/` | the simulation: pure, no DOM, no renderer ([ADR-0003](./docs/adr/0003-typescript-with-a-pure-simulation-core.md)) |
| `src/render/` | PixiJS drawing, and the only place interpolation happens |
| `src/scenario/` | decoding a Scenario's PNGs and JSON into a Battle |
| `public/scenarios/`, `public/rosters/` | the battles themselves, as data |
| `scripts/` | the fixture Field painter |

<!-- docs:start -->
## Documentation

- [CONTEXT.md](./CONTEXT.md) — the ubiquitous language: what a Unit, Order, Formation and Grade mean here
- [DESIGN.md](./DESIGN.md) — goals, the functions that serve them, and what was traded away
- [docs/adr/](./docs/adr/) — decisions
  - [0001 — A Unit is always a battalion-sized body](./docs/adr/0001-unit-is-always-a-battalion.md)
  - [0002 — Orders are couriered from a Headquarters](./docs/adr/0002-orders-are-couriered-from-a-headquarters.md)
  - [0003 — TypeScript, with the simulation as a pure module](./docs/adr/0003-typescript-with-a-pure-simulation-core.md)
  - [0004 — Initiative is an ordered rule list](./docs/adr/0004-initiative-is-an-ordered-rule-list.md)
  - [0005 — Terrain is authored as images](./docs/adr/0005-terrain-is-authored-as-images.md)
  - [0006 — A battle ends on the clock](./docs/adr/0006-a-battle-ends-on-the-clock.md)
<!-- docs:end -->
