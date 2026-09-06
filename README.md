# Field of Strategy III

Real-time tactical battles of the Napoleonic era, seen from above in 2D. You are the army
commander: you take one of the two armies, deploy it, then issue Orders that take time to arrive.

## Run it

```bash
pnpm install
pnpm dev           # the battle on :5173
pnpm server        # the two-Commander server on :8787, proxied at /ws by pnpm dev
pnpm test          # the simulation, headless — no canvas involved
pnpm measure       # the DESIGN section 8 budget: whole battles stepped to the clock
pnpm lint          # oxlint  (pnpm lint:fix to autofix)
pnpm fmt           # oxfmt   (pnpm fmt:check to verify only)
pnpm build         # type-check and build to static assets
node scripts/make-bridge-fixture.mjs     # repaint the bridge fixture's Field
node scripts/make-castiglione-field.mjs  # repaint Castiglione's, and audit what stands on it
node scripts/make-rivoli-field.mjs       # repaint Rivoli's, and audit that nothing is walled in
node scripts/make-arcole-field.mjs       # repaint Arcole's, and audit that its Crossings still span water
node scripts/make-quatre-bras-field.mjs  # repaint Quatre Bras's, and audit that no Order sends anyone into the pond
```

Vite builds the site; **Bun runs the server and the tests**, because the simulation is measured on
whatever engine plays it ([ADR-0014](./docs/adr/0014-one-javascript-engine-for-the-simulation.md)).
A solo battle needs no server at all — the app loads over HTTP and the whole afternoon then runs in
the tab. `pnpm server` is only for fighting somebody.

Deployed at https://fos.apoena.dev — pushes to `main` are picked up by Coolify. Two images:
`docker-compose.yml` runs nginx for the site and Bun for the socket.

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

The ground a Unit stands in, which nothing used to hold. A march is stopped against an enemy
Footprint rather than walking through it, the Order standing until the enemy gives way; a Charge
strikes the first Face it comes to and re-aims itself on it, so the line in front of the guns costs
the horse its Contact where before it was ridden through unnoticed; and two of one's own Units that
walk through each other come out of it in Disorder, which is what a brigade pays for not leaving
intervals between its lines. A screen holds no ground and a mob has none left to hold, and both are
walked through freely
([ADR-0015](./docs/adr/0015-a-unit-stands-in-ground-of-its-own.md)).

The Charge, which is the one Order aimed at a Unit and not at a piece of ground. It walks up at the
Formation's own pace and runs only the last hundred and fifty metres, and where it lands is decided
by which Face it struck: off a Face there is no fight, and a battalion in march column or halfway
into square has none. Contact takes very few men and is over inside one step, because it is nerve
that gives out. A square throws horse back on a quarter of a line's Frontage, which is the whole of
what square is for and needs no rule of its own. What horse does to the battalion it broke is ride
on after it, which is a Pursuit: the mob is finished rather than let go — a third of what is left
of it every minute, and no Rally for what is left after that — and the regiment is winded and half
a kilometre into the enemy's rear with a Courier ride between it and its next Order. Foot pulls up
instead, a mob at the run being faster than a battalion at the charge.

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
rung of a ladder — stand off, hold ground, close up, follow up. Above holding ground a Unit may
give ground rather than be closed with, walk far enough forward to bring an enemy under its fire,
or take the ground an enemy who has given way has left; and every one of those is bounded in metres
from its Post, which is the ground the player last gave it. So a battalion drifts a hundred metres
off what it was given and can never choose somewhere else, which is what keeps a well-briefed army
from commanding itself ([ADR-0007](./docs/adr/0007-a-standing-order-sets-a-units-latitude.md)). It
is free at Deployment and costs a Courier after, and it is the one Order that arrives without
disturbing the march.

A Roster carries the rung too, which is that same freedom spent by whoever wrote the Roster rather
than by whoever takes the army. It is how the enemy gets a brief at all — a Plan issues Orders and
has never issued a rung — and it is what lets the design measure its own leash: with every Unit
built at hold ground, the three rules that spend one could not fire on any authored battle, and
four full battles said nothing about the bound. Briefed, they say it exactly: a hundred metres at
close up, two hundred and fifty at stand off, three hundred at follow up, reached and never passed.
What a brief buys is not the battle — the winner is the same in all four silent runs — but a
harder one, and the bill falls on whoever is attacking (DESIGN §8).

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

Disorder, which is the ranks rather than the nerve or the legs — the third thing a Unit spends, and
the one nothing it does can spend. Three things buy it: riding a mob down, a mob running back over
a formed Unit, either army's, and two formed Units walking through each other. It costs the three CONTEXT always said it would — no Formation change,
and a drill already under way is ruined; no Charge, whoever asks; and half its fire, because a Unit
whose files are mixed has no dressed rank to level along, which is what Open Order already pays for
in its reload. The way out is standing still for the drill out of the loosest order there is, taken
off the same table that times a battalion into square, so an elite gets its ranks back faster than a
conscript and nothing in the rule says how long anything takes. A Unit that is marching is not
standing still, which is how a Pursuit finally costs its third price: the regiment is disordered
afresh every step it is among them and is not standing still until it has come home, so the length
of the ride is charged without anything counting it
([ADR-0012](./docs/adr/0012-disorder-is-what-a-mob-costs-the-troops-it-runs-over.md)). It is also
the first rule by which one Unit's collapse reaches another directly: a broken battalion streaming
back through its own second line now costs that line half a minute of not being able to make square,
and that is exactly the minute horse tends to arrive in. On the map it takes the glyph — the last
mark a Unit had left (DESIGN §8 rank 7, T21) — because Disorder has no silhouette, no colour and no
edge of its own, and the silhouette already says what Formation a Unit is in.

Powder Smoke, which is the first thing built that changes nothing. One cloud per Volley, born at
the muzzles rather than on the men, drifting on one breeze and gone in forty-five seconds — and
inert, so the simulation never learns the Field is full of it (T10). What it is really about is the
one rule the design wrote down in advance as dangerous: smoke is thickest exactly where the fighting
is, and that is where the silhouettes have to read. The mitigation was *capped opacity, drawn behind
Unit bases*, and building it turned both halves into numbers. Behind the bases means a Unit is never
drawn through its own smoke, so only the ground under it is veiled. Capped means capped: the whole
bank is composited once through one filter, so ten battalions firing into the same hundred metres
come out at the same 0.268 as one does. And the colour is the part the measure decided rather than
the eye — real powder white takes the Austrians, who are near-white themselves, to 1.72 against the
ground they stand on, under the tone the settings keep on file as the one to argue against. Counting
a Unit's keyline as well as its body, smoke *sharpens* an elite battalion and a line one, because
dark ink gains what a pale body loses; the single Unit it costs is a conscript in the white army,
which by design has almost no keyline to gain by. There is exactly one in the six Rosters authored.

**Two Commanders, on one battle.** Press *Fight another Commander* on the army offer and you get a
link to hand over; he takes the army you leave. The battle is held and stepped by a server, and each
of you is sent only what is his — no enemy Reports, Ghosts, Couriers or Dispatches, and at
Deployment no enemy army at all, so both are arranged blind. The clock runs when you have both Stood
To, or after three minutes, whichever comes first, and it runs at the slower of the two Tempos you
ask for. Going Out of Contact is not an ending: the afternoon does not stop, your army fights on its
Standing Orders, and coming back to the same address gives you the same seat
([ADR-0013](./docs/adr/0013-a-battle-with-two-commanders-lives-on-a-server.md)).

The rule about what one Commander may not see is obeyed in solo too. A selected enemy battalion used
to hand over its exact Strength, its Fatigue and what its next Volley was laid on; now it shows what
the map shows and nothing else. And both Headquarters are drawn — yours filled, his hollow — which
is what makes Harried and Overrun a rule both armies obey.

**The Field, heard.** A Volley, a gun, a Charge going in, Contact, a Unit Routing, and a rider
reaching one of your own — each its own sound, and each heard from where your Headquarters is
standing, so fire near the staff is loud and fire a kilometre off is a murmur and both change as you
ride. A discharge rolls rather than cracks: six hundred men do not fire together, so a Volley is a
dozen cracks scattered across half a second, and distance dulls them and smears them into each other
as well as quietening them.

Nothing is downloaded for any of that: every sound the battle itself makes is a filter and four
numbers. It ships off, and the settings — off, quiet, full — are on the Settings page and on the
battle screen, because leaving a battle to quieten it would cost you the battle. Synthesis stops at
the events, which is deliberate: a discharge is a short physical thing and a filter is honest about
it, whereas anything continuous made the same way is a noise generator left running.

**The band**, if you want one, is the only part of this the game does not make itself. Drop tracks
into `public/music/` and name them in the `index.json` beside them — they are streamed rather than
bundled, so the build stays where it is and nothing is fetched until the switch is thrown, and they
are looped through in turn and pulled down under the fire. It ships empty; the README in that folder
says where to find music that is genuinely free, and every track's licence is printed in Settings
because attribution is a condition of most of them.

Not built yet: Concealment. No tutorial: what a mark means is meant to be learned from the game, and
how is an open question (DESIGN §1, G9).

## Layout

| Path | What lives there |
|---|---|
| `src/sim/` | the simulation: pure, no DOM, no renderer ([ADR-0003](./docs/adr/0003-typescript-with-a-pure-simulation-core.md)) |
| `src/render/` | PixiJS drawing, and the only place interpolation happens |
| `src/scenario/` | decoding a Scenario's PNGs and JSON into a Battle — `build.ts` is shared, `loader.ts` needs a canvas, `disk.ts` needs a filesystem |
| `src/sound/` | the Field made audible: `listen.ts` decides what is worth hearing and is pure, `index.ts` holds the audio device, `music.ts` the band |
| `public/music/` | tracks the band plays, named by `index.json`; ships empty and streamed, never bundled |
| `src/session/` | the seam: takes Orders, emits snapshots, reports the Outcome — local in the tab, or remote over a socket ([ADR-0013](./docs/adr/0013-a-battle-with-two-commanders-lives-on-a-server.md)) |
| `server/` | the process a two-Commander battle lives in: `Bun.serve`, one WebSocket, no framework |
| `public/scenarios/`, `public/rosters/` | the battles themselves, as data; `scenarios/index.json` names the ones on offer |
| `public/campaigns.json` | the Campaigns the battles are shelved under — a name, its years and a line on the war, and never a list of its battles: each Scenario names its own |
| `scripts/` | the Field painters, each of which audits the Scenario standing on its ground |

<!-- docs:start -->
## Documentation

- [CONTEXT.md](./CONTEXT.md) — the ubiquitous language: what a Unit, Order, Formation and Grade mean here
- [DESIGN.md](./DESIGN.md) — goals, the functions that serve them, and what was traded away
- [PLAN.md](./PLAN.md) — the multiplayer build, in the order it should be built (delete when done)
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
  - [0011 — Morale comes back out of the fight](./docs/adr/0011-morale-comes-back-out-of-the-fight.md)
  - [0012 — Disorder is what a mob costs the troops it runs over](./docs/adr/0012-disorder-is-what-a-mob-costs-the-troops-it-runs-over.md)
  - [0013 — A battle with two Commanders lives on a server](./docs/adr/0013-a-battle-with-two-commanders-lives-on-a-server.md)
  - [0014 — One JavaScript engine for the simulation, and it is the server's](./docs/adr/0014-one-javascript-engine-for-the-simulation.md)
  - [0015 — A Unit stands in ground of its own](./docs/adr/0015-a-unit-stands-in-ground-of-its-own.md)
<!-- docs:end -->
