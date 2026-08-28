# Field of Strategy III

Real-time tactical battles of the Napoleonic era, seen from above in 2D. You are the army
commander: you take one of the two armies, deploy it, then issue Orders that take time to arrive.

## Run it

```bash
pnpm install
pnpm dev           # the battle on :5173
pnpm test          # the simulation, headless — no canvas involved
pnpm lint          # oxlint  (pnpm lint:fix to autofix)
pnpm fmt           # oxfmt   (pnpm fmt:check to verify only)
pnpm build         # type-check and build to static assets
node scripts/make-bridge-fixture.mjs     # repaint the bridge fixture's Field
node scripts/make-castiglione-field.mjs  # repaint Castiglione's, and audit what stands on it
node scripts/make-rivoli-field.mjs       # repaint Rivoli's, and audit that nothing is walled in
```

Deployed at https://fos.apoena.dev — pushes to `main` are picked up by Coolify.

## What is built

The first milestone, which has no fighting in it on purpose: it existed to answer whether an
Order that takes a minute and a half to arrive is a game or a nuisance. It is a game
([DESIGN](./DESIGN.md) §8). Deployment, Orders couriered from a Headquarters, Couriers and
Ghosts on the Field, Formation geometry and the morph between Formations, routing that funnels
to Crossings, Initiative as an ordered rule list, Arrivals, and the Dispatch feed.

Fighting, and what ends it. A Unit standing still with an enemy in its beaten ground fires on the
period's clock, and what that costs comes out of the geometry: how many weapons bear, how much
depth their shot has to find, and how much of that depth is body rather than the air between men.
Guns are laid on their target; muskets point where the rank points.
Standing still is what dresses the Face, so skirmishers in Open Order, having none, fire on the
march and reload at half the rate — over a beaten ground that is the screen's own Footprint blown
out by its reach, so its fire thins with the range like anybody else's. Their Density is what
keeps them alive out there: round shot ploughs a column because it is deep and goes through a
screen because it is mostly gap, so the safest place on the Field under guns is the loosest.
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

Either army, taken before Deployment. The bridge march is authored from both ends: the Austrians
have a Headquarters behind the ridge and ground of their own to arrange on, and the French advance
guard has a Plan that crosses and goes for the hamlet. A Scenario carries a Plan for each army and
fires only the one the player has not taken — command it, and its Plan is dropped.

The Standing Order, which is the brief a Unit carries rather than an Order it carries out. One
rung of a ladder — stand off, hold ground, close up, follow up — and whether it is to hold its
fire. Above holding ground a Unit may give ground rather than be closed with, walk far enough
forward to bring an enemy under its fire, or take the ground an enemy who has given way has left;
and every one of those is bounded in metres from its Post, which is the ground the player last
gave it. So a battalion drifts a hundred metres off what it was given and can never choose
somewhere else, which is what keeps a well-briefed army from commanding itself
([ADR-0007](./docs/adr/0007-a-standing-order-sets-a-units-latitude.md)). It is free at Deployment
and costs a Courier after, and it is the one Order that arrives without disturbing the march.

The Headquarters, which stops being a spot on the map and becomes a place that can be lost. It
rides: drag it during the battle and the staff walks there at its own pace, and until it is
established again no Order can leave it at all — so moving four hundred metres is a hundred seconds
out of command, and that is the price of standing somewhere better. Meanwhile the enemy can come at
it. A Unit whose beaten ground falls on the staff, or one simply up to it inside musket shot, leaves
every Order waiting twenty seconds at the table before its rider sets off — a wait the player
watches, since the rider sits at the Headquarters while the Ghost is already out on the Field. One
that reaches the tables overruns it: the staff mounts and bolts three hundred metres rearward, which
is a ride, which is a blackout, and every Order after it is permanently a little later. It is never
captured and the army is never silenced, because an army that cannot be ordered at all is a lost
battle the player still has to sit through
([ADR-0008](./docs/adr/0008-the-headquarters-rides-and-can-be-harried.md)).

Fatigue, which is the ground still on a Unit after it has arrived. It is bought by the pace and by
nothing else — the cube of what a Unit is asking of its men against what its Arm marches at — so a
flank march, a Rout and a gallop are one piece of arithmetic asked three times, and a Formation
reaches it only through how fast that Formation walks: a column pays a line three times over the
same ground, and a square standing still pays nothing. A marsh is paid for in work rather than
refunded in it. What it costs is a third of the pace, a third of the fire and a quarter of the
steadiness Grade buys — and above blown it denies a Charge outright, which is the one thing it
forbids rather than merely making worse: the Order dies at the Unit with a Dispatch saying why, and
cavalry with nothing left in it stands to receive a charge it would have met coming on. Blown is a
state with two marks rather than a line to sit astride of — four minutes standing buys the charge
back, the way a Unit that Broke stays running until it can Rally. Twenty
minutes standing gets it back, which is most of the clock, so a reserve is now a thing rather than a
Unit that happens not to have been used
([ADR-0010](./docs/adr/0010-fatigue-is-bought-by-the-pace.md)).

Rivoli, which is the second of the two battles the design is measured against and the harder one
(DESIGN §0). Castiglione is the everyday case; this is the ceiling — the Field at its size limit,
two hundred and twenty metres between the river and the top of the heights, ground that is
impassable because of its gradient and not because of what is painted on it, a Crossing that is a
gorge rather than a bridge, and eight Arrivals, two of which walk on behind the enemy rather than
behind their own line. Alvinczi comes down off Monte Baldo in
columns that torrent gullies keep from seeing one another until they are on the plateau,
Quasdanovich comes up the Adige road under the cliffs and has to file a battalion at a time up the
defile past the chapel of San Marco, and Lusignan is already round the back. It is also the first Field
on which a Unit can be authored into a place it can never walk out of, so the painter proves that
none is: every Unit, every destination in the Plan and both pieces of Key Ground are reachable
from where the men who have to get to them start.

Not built yet: Disorder, Pursuit, Concealment, Powder Smoke, sound.

## Layout

| Path | What lives there |
|---|---|
| `src/sim/` | the simulation: pure, no DOM, no renderer ([ADR-0003](./docs/adr/0003-typescript-with-a-pure-simulation-core.md)) |
| `src/render/` | PixiJS drawing, and the only place interpolation happens |
| `src/scenario/` | decoding a Scenario's PNGs and JSON into a Battle |
| `public/scenarios/`, `public/rosters/` | the battles themselves, as data; `scenarios/index.json` names the ones on offer |
| `scripts/` | the Field painters, each of which audits the Scenario standing on its ground |

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
  - [0007 — A Standing Order sets a Unit's Latitude](./docs/adr/0007-a-standing-order-sets-a-units-latitude.md)
  - [0008 — The Headquarters rides, and can be harried off its ground](./docs/adr/0008-the-headquarters-rides-and-can-be-harried.md)
  - [0009 — The URL names a battle, and nothing inside one](./docs/adr/0009-the-url-names-a-battle.md)
  - [0010 — Fatigue is bought by the pace](./docs/adr/0010-fatigue-is-bought-by-the-pace.md)
<!-- docs:end -->
