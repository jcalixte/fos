# A Unit stands in ground of its own

Two thousand men do not walk through two thousand men. A **Unit** holds the ground its
**Formation** covers, and three rules fall out of that one fact:

**A march is held against an enemy it cannot walk through.** The step is refused, the Unit stands,
and the **Order** stands with it — the same answer `admits` gives at the mouth of a **Crossing**.
Nothing pushes anything.

**A Charge strikes the first Face it comes to**, and not the one it was aimed at. The **Charge** is
re-aimed on what it ran into, so the recoil goes back from that Unit and a **Pursuit** follows that
Unit's mob.

**Two formed Units that have walked through each other are both in Disorder.** The third buyer of
**Disorder**, beside the **Pursuit** and the **Rout** ([ADR-0012](./0012-disorder-is-what-a-mob-costs-the-troops-it-runs-over.md)).

Two Formations are exempt from all three. A mob has no Formation left to hold ground with, and what
a **Rout** costs the troops it comes through is Disorder and not a halt. **Open Order** holds none
either, which is C3's own words for it — *a screen at 1.6m intervals … but it holds no ground
itself* — so a battalion walks through a screen and the screen falls back through the battalion.

## Why

**Nothing in the simulation gave a Unit any presence against another Unit.** A Route was costed by
**Ground** alone (C5), a march tested the **Field** and the Crossing width and nothing else, and a
Charge closed on the gap to its target and nothing else. So a screen bought nothing, a second line
bought nothing, and a regiment let go at the guns behind a line rode through both **Faces** of an
intact battalion to reach them. The only place two bodies of men were acknowledged not to share
ground was a mob running over a formed Unit, and that had been written for **Disorder** rather than
for the ground.

**Refusing the step, rather than resolving a collision.** Nothing gives way, nothing is pushed, and
nothing has to decide which of two battalions moves. Two Units cannot deadlock each other by both
having somewhere to be, because neither is trying to occupy the other's ground for any reason but
passing through it — and the case where they genuinely cannot is the case where one of them is an
enemy standing on the objective, which is not a deadlock but a battle.

**The Order is held and never cancelled.** A battalion stopped against an enemy line has not failed
its Order; it has arrived at the reason the Order was worth giving. Killing it would mean the
**Commander** finding out ninety seconds later that a march he ordered had quietly ended, which is
the failure ADR-0004 already named for suspension.

**A Charge re-aims rather than merely resolving once.** A Contact against the wrong Unit that left
`targetId` pointing two hundred metres beyond it would have a recoil measuring its distance from a
body of men it never touched, and a Pursuit riding after a mob it never broke. What the player
committed to was a direction and a moment; the screen standing in it is the answer to what he
committed to.

**Everything is measured along the line of the charge and never between two centres.** A regiment of
horse is two hundred metres wide. Centre to centre it reads as touching everything it rides abreast
of, and a charge down a corridor would strike the walls of it. The lane is the charge's own
**Frontage** widened by what the other Unit presents across it, and the gap is the ground still to
cover before the two shapes meet — so a battalion in march column threads between two lines
untouched, and a regiment strikes what stands in its two hundred metres *in front of it*.

**Somebody has to be walking for the passage to cost anything.** ADR-0012 already refused the
version of its own rule that fired on a mob streaming *past* a line, because Disorder must not
become an ambient tax on standing anywhere near anybody. A mob always gets past and the refresh
always ends; two battalions that have come to rest in each other never would, and would carry
Disorder for the whole afternoon over a state neither was doing anything about. Standing still is
also exactly what mends ranks, so the pair sort themselves out where they stand and are crowded
rather than ruined.

**A Unit already standing in one is let out.** A **Deployment** or an **Arrival** can put two
enemies in the same ground without anybody having marched there. Barring the step on the overlap
alone would leave neither of them a step to take for the rest of the day.

**Open Order had to be exempt, and the exemption was already written down.** Measured on the
nominal runs with screens holding ground, one skirmish line standing over the battery it screened
put that battery in permanent Disorder and flickered its own — a screen's way back out of Disorder
is the drill from Open Order into Open Order, which is no time at all. The fix is not a special case
for skirmishers: it is `explainFormation`'s existing claim about them made true in the one place it
was not.

## Considered

**True blocking, with shoving.** A Unit physically displacing another rather than being stopped by
it. Rejected: it needs jostling to keep two battalions from deadlocking in a defile, and jostling is
a steering system this design has never bought and has no other use for. The cost of not having it
is that a battalion can be held by an enemy indefinitely, which is a thing that happened.

**Routing round other Units, in C5.** Putting Units into the cost field so a march paths around
them. Rejected on the budget — the cost field is stamped per Field and reused across Routes, and
making it per-Unit-per-step is the one thing DESIGN §8 rank 14 says not to spend on — and on the
behaviour: a battalion that picks its way round the enemy rather than stopping in front of him has
made a decision the Commander did not give it.

**Disorder for walking through an enemy, instead of being barred by one.** Considered as the whole
answer, and it is too weak: a battalion that marched through an enemy line and came out the far side
ragged has still marched through an enemy line. Kept as the rule for one's own side, where the
alternative — barring a brigade from its own second line — would be worse.

**Blocking a Volley that crosses a friendly Footprint.** The obvious third member of this family and
deliberately left out. ADR-0004 already declined the Initiative version of it (*no holding fire
because a friendly is about to mask you*); this would be the geometric version, which that ADR does
not cover. Left out because a battery that goes silent for a reason the player cannot see is a
worse afternoon than one that fires through its own men, until the Dispatch that explains it has
been designed. **Trigger:** a player asking why his guns stopped firing.

## Consequence

**A formed line in front of the guns is worth having, and a screen still is not.** The battery
behind a battalion can no longer be charged through it; the battalion is struck instead, and the
horse is committed to the battalion. A screen buys nothing here, because Open Order holds no ground
and horse aimed past it rides through it — which is the same answer it got before this ADR, arrived
at deliberately rather than by omission. Skirmishers who open their files for a charge and are then
ridden down are not modelled, and this is the place that would notice. **Trigger:** a player putting
a screen in front of a battery and being surprised the horse came through it.

**A second line is worth leaving intervals in.** A brigade drawn up in two lines can no longer march
the second clean through the first for free. The price of not leaving the intervals is half a minute
of not being able to make square, which is the moment horse tends to be coming on.

**Disorder roughly triples across the nominal runs**, from between 1 and 15 spells a run to between
16 and 57, and every added spell is a formed Unit walking through a formed Unit. The longest single
spell is 479s, inside a drill and a half, which is the check that the rule is charging a passage and
not a standing condition.

**One of the four nominal runs changes hands.** Rivoli taken Austrian ends by Key Ground to the
French where it ended by condition to the Austrians, and Rivoli's Breaks come back inside the
15–30% band — one out of twenty-five outside it, against five out of twenty-eight. The other three
runs keep their winners. That an afternoon turns on it is the point: units that walked through each
other were not fighting the battle the Field describes.

**A recoil that can get no further back pulls up there**, which the Charge had no way to do
before. The state ended at `RECOIL_DISTANCE` and at nothing else, so a regiment thrown back onto a
wood or a bank stood in contact with what threw it for the rest of the afternoon — a hang that was
always reachable and became easy to reach the moment a Unit behind it could be the thing in the way.

**A Move Order can now be held indefinitely by an enemy standing on its destination**, silently, the
way one held at a Crossing already could be. That silence is the known cost, and it is the same
cost, so it is left where `admits` left it rather than answered twice.
