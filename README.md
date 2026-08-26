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

The first milestone, which has no fighting in it on purpose: it exists to answer whether an
Order that takes a minute and a half to arrive is a game or a nuisance
([DESIGN](./DESIGN.md) §8). Deployment, Orders couriered from a Headquarters, Couriers and
Ghosts on the Field, Formation geometry and the morph between Formations, routing that funnels
to Crossings, Initiative as an ordered rule list, Arrivals, and the Dispatch feed.

Not built yet: Volley, Charge, Contact, Morale, Concealment, Powder Smoke, sound.

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
<!-- docs:end -->
