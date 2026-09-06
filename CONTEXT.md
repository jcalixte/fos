# Field of Strategy III

Real-time tactical battles of the Napoleonic era, seen from above in 2D. A **Commander** takes one
of the Scenario's two armies, arranges it before the battle, and issues Orders during it. A battle
is fought by one Commander against an authored **Plan**, or by two against each other.

## Language

### The army

**Unit**:
The smallest body of troops a **Commander** can give an Order to: one body that maneuvers and
changes Formation as one. What it is called historically — battalion, squadron, battery — is a
display name; the model sees only an Arm, a Grade and a Strength.
_Avoid_: stack, squad, troop, group, regiment, battalion

**Arm**:
The branch a Unit belongs to — infantry, cavalry, or artillery.
_Avoid_: type, class, branch, category

**Grade**:
The training and experience tier of a Unit. It sets how fast the Unit drills — Formation
changes and reloading — how close it lets an enemy come before its nerve makes it fire, and
how much it takes to Break. It is never a multiplier on how lethal a Volley is. Grades are an ordered
ladder of three — conscript, line, elite — and each Roster supplies its own display names.
_Avoid_: level, veterancy, tier, quality, rank (a rank is a row of men)

**Army**:
The whole of one side's force in a battle — its Roster on the Field, plus its Headquarters.
_Avoid_: side, team, faction, force, player

**Figure**:
A drawn marker at a fixed slot in a Unit's Formation, standing for several men. How many men
it stands for follows the view scale, not the rules. It has no position, behaviour or fate of
its own.
_Avoid_: soldier, man, agent, entity, model, sprite

### State of a Unit

**Strength**:
The number of men still with a Unit. It counts men, never Figures.
_Avoid_: hit points, health, HP, size, manpower

**Morale**:
A Unit's willingness to stay and fight. It is the real health bar: a Unit is beaten when its
Morale gives out, not when its Strength runs down.
_Avoid_: hit points, health, spirit, courage

**Fatigue**:
Accumulated exhaustion. It slows a Unit, blunts its fire, unsteadies it so it goes sooner than a
fresh one would, and above **blown** denies it a **Charge** outright — and a blown **Unit** stays
blown until it has rested well under the mark it crossed, the way one that **Broke** stays running
until it can **Rally**. It is bought by the pace a
Unit is asked for and by nothing else, so a **Formation** reaches it only through how fast that
Formation walks ([ADR-0010](./docs/adr/0010-fatigue-is-bought-by-the-pace.md)). Read in words —
fresh, winded, blown — the way **Morale** is.
_Avoid_: stamina, energy, tiredness

**Disorder**:
The state of a Unit whose ranks have lost their shape. A Disordered Unit cannot change
Formation or charge until it re-forms, and its fire falls off while it is in it. It is something
that happens to a Unit and never something it does: a **Pursuit** puts the pursuer in it, a
**Rout** running over a formed Unit puts that Unit in it, and two formed Units that have walked
through each other are both in it. The way out is standing still for the
drill, which a Unit that is marching is not doing
([ADR-0012](./docs/adr/0012-disorder-is-what-a-mob-costs-the-troops-it-runs-over.md)). Its opposite
is Ordered.
_Avoid_: broken (that is Break), shaken, chaos, messy

**Break**:
The moment a Unit's Morale gives out and it stops obeying Orders.
_Avoid_: destroyed, killed, dead, wiped, defeated

**Rout**:
The state of a Unit that has Broken: fleeing toward its own rear, deaf to Orders.
_Avoid_: fleeing, retreat (a retreat is ordered; a Rout is not), panic

**Rally**:
A Routing Unit coming back under command of its own accord, once it is clear of the enemy and
its Morale has crept back above a floor. It cannot be Ordered — routing Units are deaf. Routing
past the Headquarters hastens it.
_Avoid_: heal, repair, recover, reinforce, regroup

**Morale Ceiling**:
The highest Morale a Unit can recover to. It drops each time the Unit Rallies, so a Unit that
has Broken once Breaks sooner the next time.
_Avoid_: max morale, morale cap

**Pursuit**:
Chasing a Routing Unit to finish it rather than letting it get away. It leaves the pursuer in
Disorder, heavy with Fatigue and far out of position. It is not an Order of its own: it is what a
**Charge** becomes when what it was aimed at is a mob, which is why only an **Arm** that outruns a
**Rout** can make one, and why the moment the Commander decides it is the moment he lets the horse go.
_Avoid_: chase, follow up, mop up

### The ground

**Field**:
The battleground a battle is fought on: a grid of cells, each carrying a Ground and a Height.
_Avoid_: map, level, board, arena, terrain

**Ground**:
What a cell of the Field is made of — open, wood, village, marsh, road, water.
_Avoid_: terrain type, tile type, biome, surface

**Crossing**:
A passable strip through otherwise impassable terrain — a bridge, a ford, a gorge. Impassability
comes from Ground or from gradient, so a defile between cliffs is a Crossing exactly as a bridge
over a river is. A Crossing has a width, and a Unit gets through it only if its Frontage is no
wider: a bridge deck admits a march column and nothing else, while the Osteria gorge would let an
attack column through. So "only a column crosses" is a consequence of the gap, not a rule about
Formations.
_Avoid_: bridge (a bridge is one kind of Crossing), path, passage, chokepoint, defile

**Height**:
A cell's elevation in metres. It decides what a Unit can see, what it can be seen by, what a
Charge costs, and — through the gradient to its neighbours — what is impassable. A cliff is a
gradient, not a Ground.
_Avoid_: altitude, elevation, z

**Frontage**:
The ground a Unit covers across its face. It is derived, never authored:
`ceil(Strength / ranks) x spacing`, with ranks and spacing coming from the Arm and Formation.
Casualties shrink it.
_Avoid_: width, size, span

**Footprint**:
The rectangle of Field a Unit's Formation covers. Terrain applies to a Unit by averaging the
cells under its Footprint — a Unit is never partly in two places, it is "60% in wood". It is also
the ground the Unit holds: a march is stopped against an enemy Footprint and a **Charge** strikes
the first one it reaches
([ADR-0015](./docs/adr/0015-a-unit-stands-in-ground-of-its-own.md)). **Open Order** and a mob hold
none.
_Avoid_: hitbox, bounds, collider, area

**Density**:
How much of the ground under a Formation is actually body rather than air, read off the
intervals a Unit stands at. It is what a shot crossing the Formation fails to find: men in
line at two-foot intervals are a wall, and a screen in Open Order at over five feet is
mostly the gap between them. Derived from the Formation's spacing, never authored, and it
is the reason dispersal is not priced as Depth — a screen stands better under guns than a
line, and a column stands worst of all.
_Avoid_: packing, spread, cover, evasion, armour

### Seeing and hearing

**Powder Smoke**:
The cloud a Unit leaves behind when it fires. It is drawn and it drifts, and that is all it does
— it never blinds the Commander, and whether it blunts fire is a dial that starts at nothing.
_Avoid_: smog, fog, dust, haze

**Report**:
What a **Unit**'s own officers render about it: its exact **Strength** in men, how it is blowing,
and what its next **Volley** would fall on. A **Commander** gets Reports from his own **Units** and
from no others — an enemy Unit is read off the **Field** like everything else on it, by its
silhouette, its bar and its glyph. Not a **Dispatch**, which is a line about something that just
happened; a Report is how a Unit stands right now, and it is asked for rather than delivered.
_Avoid_: card, panel, inspector, stats, tooltip, readout

**Concealment**:
The state of a Unit the enemy cannot see, because opaque Ground covers it or a Height stands
between. Open ground in view is never concealed — terrain is the only thing that hides anything.
_Avoid_: fog of war, stealth, hidden, invisible

**Noise**:
What the Field is heard doing: a **Volley**, a gun, a **Charge** going in, **Contact**, a **Unit**
Routing, and a rider reaching one of your own. Heard from where your **Headquarters** is standing,
so fire near the staff is loud and fire a kilometre off is a murmur — and it moves as you ride. A
discharge rolls rather than cracks, because six hundred men do not fire together.
Everything the Noise says is also on the screen, which is why it is the one thing here that can be
turned off.
_Avoid_: audio, SFX, sound effect, cue, ambience

**Band**:
Recorded music played under a battle and looped through in turn. The one thing in the game that is
not the battle — a **Volley** is heard because a Volley happened, and this is not. It is pulled down
under the fighting, ships with no tracks in it at all, and names the licence of every track it does
have.
_Avoid_: BGM, OST, playlist, background music

### Commanding

**Commander**:
Whoever has taken an **Army**. A battle has one or two of them, and an **Army** answers to exactly
one — everything the language says about commanding is said about a Commander and never about
whoever happens to be watching. Two Commanders share a battle and nothing inside one: separate
**Headquarters**, separate **Couriers**, separate **Orders**, and no sight of each other's **Army**
until both have finished **Deployment**.
_Avoid_: player, user, side, host, guest, opponent

**Headquarters**:
A **Commander**'s own position on the Field. Orders are couriered from it, so it is what makes
distance cost time; it is also an eye, and it can be shot at. Sited at Deployment and sent to new
ground by hand after, at a staff's pace — and while it is riding, no Order can leave it at all,
though what is said then is a **Dictated Order** and goes the moment it is established
([ADR-0008](./docs/adr/0008-the-headquarters-rides-and-can-be-harried.md)). It is the one piece of
a **Commander**'s command apparatus the enemy can see, because it is the one that can be
**Harried** and **Overrun** — a thing that cannot be aimed at is not a thing that can be shot at.
_Avoid_: HQ (in prose), base, command post, general

**Dictated Order**:
An **Order** the commander gave while his **Headquarters** was riding. It has no **Courier** under
it and is nowhere on the **Field** — a line in an aide's notebook — and becomes an Order with a
rider the moment the staff is established, from the ground it settled on and at whatever that table
costs. One **Unit** holds one: a second replaces the first. The blackout is unchanged by it; what
it costs is that the Order was decided against a Field older than the one it lands on.
_Avoid_: queued order, pending order, buffer, backlog, batched

**Harried**:
The state of a **Headquarters** the enemy is shooting at, or standing within musket shot of: every
**Order** waits at the table before its rider sets off, and the ride after it is unchanged. Read
off the beaten ground rather than off a radius of its own, so a battery a kilometre off harries a
staff and a line firing over its head does not.
_Avoid_: suppressed, pinned, disrupted, debuff, under pressure

**Overrun**:
An enemy **Unit** reaching the **Headquarters**. It is never captured and the army is never
silenced: the staff mounts and bolts three hundred metres rearward, which is a ride and therefore a
blackout, and every **Order** for the rest of the afternoon leaves a little later for it.
_Avoid_: captured, taken, destroyed, killed, decapitated

**Courier**:
The rider who carries an Order from the Headquarters to a Unit. His speed and the distance he
must ride are the whole of an Order's delay, and he is drawn on the Field while he rides — an
Order in flight is a thing a **Commander** can watch, not a hidden timer. He is drawn for the
Commander who sent him and for nobody else: at the scale this game is seen from, a single rider is
smaller than a pixel, so what is on the screen is a promise about your own Order rather than a man
anyone could see. Whether the enemy's riders show at all is a dial, and it starts at nothing —
their *number* is a read on how busy his staff is, which is a mechanic and not a depiction.
_Avoid_: messenger, aide, runner, dispatch, latency

**Ghost**:
The greyed outline drawn where an Order will put a Unit — its destination Footprint, in the
ordered Formation and facing — held on screen from the moment the Order is issued until the
Courier arrives. A **Commander** sees his own and never the enemy's: a **Courier** is a man riding,
but a Ghost is what he is carrying, and reading it would be reading the enemy's mail.
_Avoid_: preview, marker, waypoint, indicator

**Dispatch**:
A single reported line of what just happened and why — "12e Ligne broke: 31% down, enfiladed by
the battery on the ridge". Delivered at once, unlike an Order. A **Commander**'s own army only: it
is his command's log, the way a **Report** is his battalion's return. What the enemy's army does he
watches — a **Break** is on the bar and a **Rout** is a mob running — but he is never told it, and
never told why.
_Avoid_: event, log line, notification, message, feed

**Initiative**:
The judgement a Unit exercises when no Order covers its situation — returning fire, forming square
against oncoming cavalry, Breaking, Routing, choosing what to march in, and giving or taking as
much ground as its Standing Order allows. It never picks an objective, and it suspends a live
Order rather than cancelling it.
_Avoid_: AI, autonomy, behaviour, reflex

**Standing Order**:
The brief a Unit carries and consults all afternoon, rather than an Order it carries out once: how
much Latitude it has. Given free at Deployment, because that is the hour a subordinate is briefed
in, and couriered like anything else after. Arriving, it changes what the Unit does unbidden and
never what it is doing under orders.
_Avoid_: stance, posture, mode, rules of engagement, doctrine

**Latitude**:
How far a Unit may act on its own account, as one rung of an ordered ladder: **stand off** gives
ground rather than be closed with, **hold ground** moves neither way, **close up** may advance to
bring an enemy under its fire, and **follow up** may advance after one that is giving way. Every
rung but the lowest is bounded in metres from the Post ([ADR-0007](./docs/adr/0007-a-standing-order-sets-a-units-latitude.md)).
_Avoid_: aggression, stance, autonomy, ROE

**Post**:
The ground a Unit was given: the destination of its last Move Order, where it was last halted, or
where it was deployed. It is what Latitude is measured from, so it is the whole of the difference
between a battalion that may shift a hundred metres and one that may go hunting.
_Avoid_: anchor, home, station, waypoint

**Scenario**:
An authored battle: a Field, both armies, a Plan for each of them, and what counts as winning.
_Avoid_: level, mission, map, match, stage

**Campaign**:
The named group a Scenario is shelved under — one theatre, one season, the same two armies. It is
a shelf and nothing more. Nothing crosses from one battle to the next: no casualties, no Fatigue,
no Roster, no order of play, and a Scenario is fought exactly the same whether it is reached
through its Campaign or on its own. Every Scenario names the one it belongs to, which is all a
Campaign is made of. Carrying state forward would be *campaign persistence*, which is a different
thing and is not built ([DESIGN](./DESIGN.md) §9) — so the word must not be used for it here.
_Avoid_: chapter, season, act, war, theatre, series, progression

**Roster**:
An army's order of battle as a standalone thing — which Units, of which Arm, at which Grade, at
what Strength, under what display name. A Scenario names the Rosters it puts on the Field rather
than containing them. Authoring rule: size a Unit so its Frontage lands in roughly 75-150m, and
split anything wider.
_Avoid_: army list, order of battle, force, lineup

**Taking an Army**:
Which of a Scenario's two armies a **Commander** takes, answered before Deployment and never
revisited: an army is arranged by the hand that will command it. Taking one drops its half of
the Plan, since an army that is commanded cannot also be driven.
_Avoid_: side, faction, team, picking a colour

**Deployment**:
The paused phase before a battle in which each **Commander** arranges the army they have taken
inside a zone and sites the **Headquarters**. No Orders are given; nothing is being commanded yet.
Where a battle has two Commanders neither sees the other's army while it is being arranged, and it
ends when both have **Stood To** or the Deployment clock runs out — whichever comes first.
Authoring rule: site neither **Headquarters** inside an enemy's beaten ground, nor within
**Harried** range of an enemy **Unit**. A staff handed to a Commander already under fire charges
every **Order** the harried surcharge from the first minute to the last, and a Commander who never
thinks to move it never learns why — while a **Plan**, which applies its Orders where they land
rather than couriering them, pays nothing at all. Where the player then takes the staff is his own
affair: being able to site it badly is the decision ADR-0008 exists to offer.
_Avoid_: setup, placement, pre-battle, draft

**Stand To**:
A **Commander** declaring his army arranged and handing the afternoon to the clock. It is the act
and the state both: he Stands To, and then he is standing to while the other finishes. What he is
told while he waits is *that* the other is still arranging and never what he is doing, or
**Deployment** stops being blind in the one room built to keep it so.
_Avoid_: ready, commit, confirm, lock in, start

**Arrival**:
A Unit entering the Field after the clock has started, at a named point or a Field edge, on a
clock time or a trigger. Unlike Deployment, a Commander does not place it and cannot see it coming.
_Avoid_: reinforcement, spawn, entry, respawn

**Key Ground**:
A named piece of the Field whose possession at the end of a battle decides it — the bridge,
the farm, the ridge. An army holds one by having the nearest Unit on it: a Unit is in the running
only while it stands inside the radius, and of those that do, the closest to the centre decides
it. A Routing Unit holds nothing. A piece marched away from stays held until somebody takes it.
_Avoid_: point of interest, objective, capture point, control point, flag

**Army Break**:
The point at which an army has nothing left in hand — every one of its **Units** Broken, running
or gone off the **Field** — and quits. It is the floor under the **Scenario** clock and not the
ordinary way a battle ends: an army half wrecked at the tenth minute stays and fights the other
twenty. It is never annihilation, because a **Unit** leaves the count by Breaking and not by being
killed.
_Avoid_: defeat, game over, army rout, collapse

**Outcome**:
What decided a battle: an **Army Break**, the **Key Ground** counted when the **Scenario** clock
ran out, what each army had left where that count was even, or a **Commander** choosing to **Break
Off**. It names the army left holding the Field, and never a score. It says which of the four
decided it rather than merely that the clock ran out, because an army that split the **Key
Ground** one apiece and won on what it had left did not win on ground it never took.
_Avoid_: result, victory points, win condition, score

**Break Off**:
A **Commander** taking his own army off the Field rather than fight the clock out. It is the one way a
battle ends that no rule reaches — the commander's hand, not his men's nerve, which is why it is
not an **Army Break**. It always leaves the day to the enemy, so a commander cannot bank a **Key
Ground** he happens to be sitting on by stopping the clock on it.
_Avoid_: concede, surrender, forfeit, quit, resign

**Out of Contact**:
A **Commander** whose army is on the Field and who is not at the table — a dead connection, a
closed tab, a man who walked away. It is not a **Break Off**, which is a decision: the battle does
not stop, the clock runs, and his army fights on the **Standing Orders** and **Initiative** it
already carries, drifting no further from its **Post** than its **Latitude** allows. He rejoins at
the same address and takes his army where it has got to, having lost the afternoon he was away and
nothing else; if he never comes back the **Scenario** clock ends the battle as it always does. The
other **Commander** is told — what this game hides is what stands on the **Field**, never who is at
the table.
_Avoid_: disconnected, offline, dropped, AFK, timed out, abandoned

**Return**:
What each army had to show for the afternoon, read off the battle at the moment it ended: Units
still in hand, Units running, Units gone, men lost against the men mustered, and how far the army
went toward **Army Break**. A tally of facts and never a total — the ground an army took and the
men it spent taking it are two currencies, and the **Outcome** has already said which decided
the day.
_Avoid_: score, summary, results screen, scoreboard, stats

**Plan**:
An army's authored intent — Orders fired by clock time or by trigger. A Scenario carries one for
each army, and a Plan is fired only for an army no **Commander** has taken — so either army can be
played and the other has an afternoon of its own, and a battle with two Commanders fires neither. There is no planning intelligence behind it; the
tactical competence lives in each Unit's Initiative.
_Avoid_: AI, script, strategy, behaviour tree

**Order**:
An instruction a **Commander** issues to a Unit, which reaches it only after a delivery delay
rather than taking effect at once.
_Avoid_: command, instruction, action, move

**Route**:
The line a Unit works out for itself across the Field to reach where an Order sends it. The
Commander may draw one instead, but does not have to.
_Avoid_: path, waypoints, trajectory

**Formation**:
The geometric arrangement a Unit holds. Each Arm has its own set — infantry: march column,
attack column, line, square, **Open Order**; cavalry: march column, line; artillery:
**Limbered** and **In Battery**. Changing Formation takes real time, and a Unit is at its
worst while it does. A Formation can also forbid movement outright: guns In Battery are off
their limbers and traverse where they stand, so moving a battery means hitching up first.
_Avoid_: stance, shape, posture, order

**Face**:
A side of a Formation that is prepared to fight. A line and an attack column have one; a square
has four; a march column and Open Order have none. A Charge resolves against the Face it strikes,
and striking anywhere that is not a Face is not a fight.
_Avoid_: front, side, facing (a facing is a direction, a Face is a side)

**Withdraw**:
An ordered fall-back that keeps its shape and its facing. The opposite number of a Rout,
which keeps neither.
_Avoid_: retreat, fall back, disengage, flee

### Fighting

**Volley**:
A Unit's discrete act of firing — one moment on a reload clock, never a continuous stream.
_Avoid_: shooting, damage, attack, fire rate, DPS

**Charge**:
A committed run at another Unit, resolved as a short sequence that ends with one side
Breaking or the chargers recoiling.
_Avoid_: attack, rush, engage

**Contact**:
The brief, violent state of two Units' blocks touching. It is decided in seconds and is
never sustained.
_Avoid_: melee, fight, combat, battle

### Time

**Tempo**:
The dial that runs the battle clock faster or slower than history. It scales how long a
**Commander** waits; it changes no ratio inside the battle. Where a battle has two Commanders it is
not something either can do to the other: each asks for a Tempo and the battle runs at the slower
of the two, so the afternoon goes at the pace of whoever needs the most time. Thinking is the one
thing the dial is not neutral about, and that is the whole reason it is asked for rather than set.
_Avoid_: game speed, time scale, simulation speed

## Relationships

- An **Army** is composed of many **Units**
- A **Unit** belongs to exactly one **Arm** and holds exactly one **Grade**
- A **Unit** holds exactly one **Formation** at a time
- An **Order** is issued to exactly one **Unit**, and is delivered to it after a delay
- An **Order**'s delay is the ride a **Courier** makes from the **Headquarters** to the **Unit**,
  plus whatever the **Headquarters** makes him wait before he sets off
- A **Headquarters** may be sent to new ground while the battle runs, and no **Courier** leaves it
  while it is riding — what is ordered then is a **Dictated Order**, and rides once it is
  established; **Harried** costs every **Order** the same wait, and being **Overrun** costs it for
  good
- Every **Order** in flight is a **Courier** visibly on the **Field**, and a **Ghost** where it leads
- An **Order** given to several **Units** at once sends a **Courier** to each, so they arrive apart
- An **Order** is one of: **Move**, **Form**, **Charge**, **Fire**, **Halt**, **Withdraw**, or a
  new **Standing Order**
- A **Move** carries a destination, an arrival facing and an arrival **Formation**
- A **Move**'s arrival **Formation** is the last one the **Commander** asked that **Unit** for with a
  **Form**, never the one it happens to be standing in — so a battalion told to make square and
  then sent somewhere goes there to make square, and one **Initiative** has filed into column
  arrives in what it was told to hold and not in the column it travelled in
- A **Move** onto the ground a **Unit** already stands on is how it is turned where it is:
  guns In Battery traverse rather than wheel, and it needs no **Order** of its own because a
  **Move** already carries a facing — this one simply has no ground in it
- A **Unit** picks its own travelling **Formation** by **Initiative**, unless a **Form** pins one
- A **Formation** determines the slots that a Unit's **Figures** are drawn in
- A **Formation** and a facing give a Unit its **Footprint** on the **Field**
- **Ground** and **Height** reach a Unit only through the cells under its **Footprint**
- A **Crossing** is the only way a Unit passes impassable **Ground**, and only if its **Frontage**
  fits the gap
- A **Unit** holds the ground under its **Footprint**: an enemy march is stopped against it and a
  **Charge** strikes the first one it comes to, whatever it was aimed at. **Open Order** holds none,
  because a screen is mostly the gaps between its men, and a mob has none left to hold
- A **Unit** given somewhere to be finds its own **Route** there, funnelling to **Crossings**
- A **Unit** with no applicable **Order** acts on its **Initiative**
- **Initiative** suspends an **Order** and resumes it; it never cancels one
- A **Unit**'s **Standing Order** says how much its **Initiative** is permitted, and is the one
  instruction that arrives without disturbing what the **Unit** is already doing
- **Latitude** is spent in metres from the **Post**, so a **Unit** acting on its own account can
  drift from the ground it was given and can never choose different ground
- A **Scenario** carries a **Field**, two **Rosters**, a **Plan** for each army, a clock, and its **Key Ground**
- A **Scenario** belongs to exactly one **Campaign**, and a **Campaign** holds one or more of them;
  nothing else passes between the two, because nothing a **Scenario** does outlives it
- A **Commander** takes one **Army** before **Deployment**; the **Plan** written for it is dropped, and
  the one written for the other is what it fights the afternoon to
- A battle ends when the **Scenario** clock runs out — and then the **Key Ground** is counted, and
  where it is even, what each army has left — or at an **Army Break**, which takes every **Unit**
  of an army, or when a **Commander** chooses to **Break Off**
- To **Break Off** is to lose: an army that has gone has left whatever it was standing on, the
  same as one that has reached **Army Break**
- An army ending on the clock with more **Key Ground** wins it whatever it cost; only where the
  **Key Ground** says nothing does what each army has left decide it, and only by a telling margin
- A battle that has ended has a **Return** for each army, which reports and never decides
- A **Roster** entry either stands on the **Field** at **Deployment** or waits on an **Arrival**
- An **Arrival** can land after its army is already near **Army Break**, so a battle is not lost
  while a column is still on the road
- How far an army went toward **Army Break** is weighted by **Grade**; whether it got there is not,
  because nothing standing is nothing standing at any weight
- An army sees from the eyes of all its own **Units**, never from where the camera is pointed
- **Height** blocks sight past it, so a ridge conceals its own reverse slope — symmetrically,
  for both armies
- A **Unit** carries a **Strength**, a **Morale** and a **Fatigue**, and is either Ordered or in **Disorder**
- Casualties reduce both **Strength** and **Morale**; **Morale** is what decides the Unit's fate
- **Fatigue** is bought by the pace and never by the Order, so a flank march, a **Rout** and a
  **Charge**'s run-in are the same arithmetic — and standing still is the only thing that gives it
  back, at a rate no **Headquarters** hastens, because a commander steadies men and does not rest
  their legs
- A blown **Unit** will not be let go at anybody: the **Charge** is the one thing **Fatigue**
  forbids outright rather than by degrees
- A **Unit** whose **Morale** gives out will **Break** into a **Rout**, and may later **Rally**
- A Routing **Unit** sheds **Strength** as it runs, and **Rallies** with a lower **Morale Ceiling**
- **Pursuit** denies a **Rally** outright, and costs the pursuer **Disorder**, **Fatigue** and position
- A **Unit** in **Disorder** re-forms by standing still, and a **Unit** that is marching is not
  standing still — so what a **Pursuit** costs in ranks is paid on the walk home
- The **Headquarters** hastens a **Rally**, which is its third job after couriers and sight
- A Routing **Unit** that crosses a formed one throws it into **Disorder**, whichever army it
  belongs to — men coming back through a line at the run do not present their colours first
- Two formed **Units** that have walked through each other are both in **Disorder**, which is what
  a brigade pays for not leaving intervals between its lines
- A **Unit** delivers a **Volley** on its own reload clock, or presses a **Charge** into **Contact**
- A **Unit** has to be halted to deliver a **Volley**, because what has to be halted is the
  **Face** — so a **Formation** with no **Face** and reach to fire with, which is **Open Order**
  alone, fires on the move and pays for it in the reload
- A **Volley**'s effect turns mostly on the target's **Formation**: a column offers a quarter of
  a line's frontage and far more depth to plough through
- A **Unit**'s fire falls off as its **Morale** drops and **Disorder** sets in — which is the
  route by which **Grade** reaches lethality, rather than any direct multiplier
- **Contact** ends when one **Unit** **Breaks** — it is never a state a **Unit** sits in
- A **Charge** resolves against the **Face** it strikes; off a **Face** there is no fight
- A **Formation** with four **Faces** has no direction it is not fighting in, so it beats the
  ground all round it and not four slabs with corners between them. What the **Faces** decide is
  which one is firing and how much of it bears, never where the fire may point at all
- The ranks standing behind a **Unit**'s fight hold it together when something arrives at it:
  depth is worth nothing against a **Volley** and something against a **Charge**, both coming on
  and landing. A **Formation** with no **Face** has none of it, whatever its depth
- A **Contact** costs the **Unit** it lands on more nerve for having landed on a narrow front —
  a line struck along its whole length has been shoved, and one struck over a third of it has a
  hole in the middle of it. This is what an **attack column** is for
- A **Contact** pays a **Unit** for being in motion, so two regiments meeting head-on both pay it
  and one standing to receive brings nothing
- Cavalry meets a **Charge** committed to it on its **Initiative**, because horse standing to
  receive is horse ridden over: the one **Charge** a Commander does not give, and it can be aimed at
  nothing but what is already coming on
- A **Square** resists cavalry by having four **Faces** and therefore no flank — it needs no rule
  of its own
- Fire striking a **Unit** off its facing runs down the **Frontage** it cannot present, so a
  flanked line is a worse target than a column — this is enfilade, and it needs no rule either
- Being engaged off its facing costs a **Unit** **Morale** sharply, scaling with the angle and
  worst from behind. This is a deliberate rule, not geometry: Units broke from being flanked
  long before the casualties justified it
- A **Charge** closing on a **Unit** costs it **Morale** every second it is running, and three
  times as much if the Unit has no **Face** turned toward it. A deliberate rule for the same
  reason as the one above: infantry broke at the sight of cavalry far more often than it broke
  at the sabre, and that is what the drill into **Square** is buying

## Example dialogue

> **Dev:** "When the Commander tells a Unit to form square, does it form square?"
> **Designer:** "It receives an Order to form square. Whether it has formed square by the
> time the cavalry arrives is the whole game."
>
> **Dev:** "Nobody ordered the 12th into march column. Why is it in march column?"
> **Designer:** "Because you told it to be on the ridge and it has two kilometres to walk.
> That's Initiative. And that is exactly why the hussars are sitting in that wood."
>
> **Dev:** "So how much Strength does it take to destroy a battalion?"
> **Designer:** "You don't destroy it. You break it. It'll go at a quarter of its Strength,
> sooner if it's tired, sooner still if the battalion beside it went first."

## Flagged ambiguities

- "formation" was used for both the *shape* a Unit holds and the *body of troops* itself.
  Resolved: **Formation** is the shape; **Unit** is the body of troops. Never swapped.
- "command" is avoided for a **Commander**'s instruction — **Order** is the term. "Command" is left
  free for its historical sense (a body of troops under an officer).
- a Unit is never "destroyed" or "killed". It **Breaks**, and what happens next is a **Rout**.
- "broken" and "Disordered" are different states: a Disordered Unit still obeys Orders.
- the camera is not the eye. Visibility is computed from where the army is, not from where the
  Commander is looking.
- the ladder is neutral in the model, not French. "Vieille Garde" is a French *label* for the
  guard rung, not the rung itself — otherwise the Coldstream Guards end up carrying it.
- "discipline makes them deadlier" is true but indirect. **Grade** buys rate of fire and
  steadiness under fire — never a flat damage bonus.
- a battalion historically detached a skirmish company rather than dispersing whole. Modelling
  that would split a Unit in two and break "one Unit, one Formation", so **Open Order** applies
  to the whole battalion. Known simplification, deliberately taken.
- a **Report** and a **Dispatch** both "report" and are not the same thing. A Dispatch is an event
  — a line about what just happened, delivered. A Report is a state — how a **Unit** stands, asked
  for by selecting it. Neither is ever rendered about the enemy's army: a
  **Commander** gets his own Reports and his own Dispatches, and watches everything else.
- reading an enemy **Unit** is not **Concealment** and does not touch T9. Nothing is hidden on the
  **Field**; you simply are not sent a **Report** about a battalion that is not yours. The rule
  holds whether the enemy is a **Plan** or a second **Commander** — a rule that applied in one
  battle and not another would be two games.
- **Contact** is deliberately not called "melee": melee suggests a sustained grind, and this is
  a thing that is over in seconds.
- **Tempo** scales the clock only. Changing how a battle *plays* means editing the underlying
  seconds and metres, which are a separate set of knobs.
- a **Figure** is not a man. It is a drawn marker standing for several, at a ratio that follows
  the view scale — so `unit.figures.length` is never a Unit's **Strength**. The word "soldier"
  was used for this early on and was wrong.
- "rank" means a row of Figures within a Formation, never a Unit's quality — that is **Grade**.
- "how big is a Unit" was two questions wearing one coat. Resolved: men per Unit, map size and
  Unit count are tuning data and stay changeable; a Unit being *battalion-sized* is structure and
  is fixed — see [ADR-0001](./docs/adr/0001-unit-is-always-a-battalion.md).
- "a Unit is a battalion" was a French-army assumption. Austrian cavalry regiments ran 1,000-1,400
  men against a French 250, so no historical title unifies across armies. Resolved: a **Unit** is
  defined by function — one body maneuvering as one — and sized by a **Frontage** band on the
  **Roster**. The model holds no opinion about squadrons versus regiments.
