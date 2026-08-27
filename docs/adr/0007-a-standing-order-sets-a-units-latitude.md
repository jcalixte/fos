# A Standing Order sets a Unit's Latitude, and every act it buys is leashed to the Post

A Unit carries a **Standing Order**: one rung of a Latitude ladder — stand off, hold ground, close
up, follow up — and whether it is to hold its fire. It is given free at Deployment, because that
is the brief before the battle, and couriered like anything else once the clock runs. Arriving, it
changes what the Unit does unbidden and does not touch what it is doing under orders.

Above *hold ground* the ladder lets a Unit take ground on its own account. That amends
[ADR-0004](./0004-initiative-is-an-ordered-rule-list.md), which held Initiative to be strictly
defensive.

## Why

**The old boundary was two claims wearing one coat.** ADR-0004 forbade advancing in order to
guarantee that Initiative never picks an objective, and it is the second claim that keeps the
player in the game. A leash buys it outright: every autonomous move is bounded in metres from the
**Post**, which is the ground the player last gave the Unit — the destination of its last Move
Order, or where it was halted, or where it was deployed. The Unit never chooses where to be. It
chooses how far off what it was given it may drift, and the answer is a hundred metres or three
hundred, not the width of the Field.

**A battalion left standing while an enemy shoots at it from outside its reach is not obedience,
it is a bug the player has to ride out to fix.** Ninety seconds of Courier for a hundred metres of
ground is the wrong price for a thing every officer of the period did without being told. What was
worth defending was the ground the player *chose*, not the last metre of it.

**Fire and feet are two questions.** Holding fire is not a rung below holding ground — a battalion
told to hold its fire may still be told to close up. Folded onto one ladder the rungs stop being
ordered, and a ladder whose rungs are not ordered is a menu. So: one ladder for the feet, one flag
for the fire.

**It is the only part of command that scales without the Courier scaling with it.** As a Field
carries more Units, the number needing an Order inside the next ninety seconds grows with them and
the ride does not get shorter. A brief given once, before the clock, is bought at Deployment and
spent all afternoon.

## Considered

**One ladder, hold fire at the bottom of it.** Fewer buttons. Rejected: it makes "hold fire"
and "hold ground" sound like neighbours on a scale when they are answers to different questions,
and it leaves no way to say the useful thing — a Unit that may close up and must not open fire.

**A free toggle on the Unit card, no Courier.** Every other instruction the player gives costs a
ride. A dial that does not hands back instantaneous army-wide control and quietly undoes
[ADR-0002](./0002-orders-are-couriered-from-a-headquarters.md) — the more so because the rungs are
where the interesting instructions live. Free at Deployment, couriered after: an army is briefed
before it marches, and changing the brief costs what changing anything else costs.

**Hunting: let a Unit pick an enemy and go after it.** This is what the ask usually means and it
is the one thing the leash exists to refuse. A Unit that hunts competently is a Unit the player
stops sending Orders to, and Orders taking a minute and a half is the whole game.

**Intermediate command — brigadiers with their own Headquarters, passing Orders on.** The other
answer to a bigger Field, and a better one for the problem of *how many things must I talk to*.
Much larger, and it does not conflict: a Standing Order is what a subordinate is briefed with, and
a chain of command is who briefs him. Not built, not precluded.

## Consequence

**The rule list is now read differently on different Units.** A rule can ask what the Unit is
permitted before it asks what the situation is, so "why did it do that" has two halves — the rule
that fired, and the rung that let it. The Dispatch still carries the rule's name, which is the
cause; the rung is on the Unit's card, which is where the player put it.

**A Unit beyond its leash does not walk back to its Post.** The leash bounds what the Unit may do,
not where it may be. A regiment that charged three hundred metres out stays there until it is
ordered, which is right — nothing should undo the player's Order on its own, least of all a rule
about tidiness.

**`suspendedBy` no longer means standing still.** Initiative can now suspend an Order and move, and
the two rules that do — stand off, follow up — are the first that walk a Unit anywhere without an
Order behind them. Anything reading suspension as a halt has to be read again.

**Hold fire is absolute, and can be forgotten.** A battalion told to hold its fire will watch a
column go past at fifty metres. That is the instruction, given plainly and shown plainly on the
card, and the alternative — a release range at which it stops obeying — is a rule invented to
distrust the player.

**Every Unit deploys at hold ground, fire at will**, which is exactly what a Unit did before this
existed. Scenarios authored before it play identically until somebody moves the dial.
