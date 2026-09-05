# Disorder is what a mob costs the troops it runs over

A **Unit** is either Ordered or in **Disorder**. Disorder is bought by two things and no third: a
regiment riding a mob down is in it for as long as it is among them, and a Unit a **Rout** runs over
is in it from the moment the crowd is on top of it. Nothing the player can ask for buys it, and
nothing about being shot at, tired or shaken buys it either — it is something that happens to a
Unit, never something it does.

**Amended by [ADR-0015](./0015-a-unit-stands-in-ground-of-its-own.md).** There is now a third: two
formed Units that have walked through each other have opened each other's files, which is the same
fact as the mob read without the Rout in it. The clause it amends is the count; everything else here
holds, and *the mob has to run over a Unit and not merely past it* is the reasoning ADR-0015 leans
on to insist that somebody be walking.

What it costs is CONTEXT's three. No **Formation** change, and a drill already under way is ruined.
No **Charge**, whoever asks — an **Order**, or the rule list answering horse coming on. And half its
fire, folded into `fireEffect` beside **Morale** and **Fatigue**.

The way out is standing still, for the drill out of the loosest order there is into whatever the
Unit holds — thirty-five seconds back into line, forty-five into square, scaled by the **Grade**
that already decides how fast a battalion drills. A Unit that is walking does not re-form.

## Why

**A Pursuit was charged two of its three prices.** CONTEXT has always said a Pursuit leaves the
pursuer in Disorder, heavy with Fatigue and far out of position. The wind was charged by
[ADR-0010](./0010-fatigue-is-bought-by-the-pace.md) and the position by the mob having run to its
own rear, and neither needed a rule — but the ranks were not charged at all, so a regiment that had
spent two minutes loose among a crowd re-formed as tidily as one that never moved. This is the
third price, and it is the only one that had to be written down.

**It is a state and not a scale, because a Unit is either a Unit or a crowd.** Fatigue is a scale
because a battalion is tired by degrees; nothing about a battalion is *half* dressed. What is
counted here is not how disordered a Unit is but how long the way back is, which is a drill — so
the field on the Unit holds seconds owed, and every question asked of it is `> 0`.

**The drill is taken from C3's own table rather than named here, so F8 survives it.** There is no
Formation for *a crowd*, and the nearest thing the table has to one is Open Order: men who have let
go of each other, which is precisely what a Unit in Disorder is. Re-forming is therefore priced at
the drill out of Open Order and into whatever the Unit is standing in — and Grade and Arm reach it
through the same scalars that time every other drill. There is not one number in `disorder.ts` that
says how long anything takes.

**Half the fire is borrowed and not invented.** Open Order is the one other way a Unit fires without
a dressed Face to level along, and C6 already prices that at a shot every forty-five seconds against
a formed battalion's twenty-two. A Unit in Disorder is men firing on their own account, so it puts
down what men firing on their own account put down. One global scalar, nothing per Formation.

**A Pursuit's length is paid for on the walk home, so nothing has to count it.** The regiment is
disordered afresh every step it is among them and re-forms only standing still — and it is not
standing still until it has come back. Two minutes among a mob is two minutes of not re-forming plus
the drill, without an accumulator anywhere. It is the same shape ADR-0010 found for Fatigue: charge
the state, let the clock do the arithmetic.

**The mob has to run *over* a Unit and not merely past it.** Written first as the two shapes
touching, it fired on a crowd streaming twenty metres in front of a line without a man of it coming
through, and Disorder became an ambient tax on standing anywhere behind a fight. Asked as the two
being in among each other — the crowd over the Unit's centre, or its own centre on the Unit's
Footprint — three of the four nominal runs come back with the same winner and near enough the same
numbers, and the fourth pays for a real thing that happened on it.

**A Break clears it, because a Rout is the dearer bill and is charged instead.** A mob has no ranks
left to have lost. What it costs to be a Unit again is the **Rally**'s own drill at a **Morale
Ceiling** it will not get back, and stacking Disorder on top of that would be charging the same
collapse twice.

## Considered

**Disorder as a scale, the way Fatigue is.** Rejected on CONTEXT, which says a Unit is either
Ordered or in Disorder and means it, and on there being nothing for the scale to *do*: every one of
the three costs is a thing a Unit can or cannot do, and none of them is a dial. A scale would also
have needed a rate of accumulation and a rate of recovery, which is two more numbers than the
question has.

**Charging it on the reload rather than on the Volley's effect.** Attractive because that is exactly
where Open Order pays, and the fire penalty is borrowed from Open Order. Rejected because CONTEXT
puts it elsewhere in so many words — *a Unit's fire falls off as its Morale drops and Disorder sets
in* — and because that clause is what puts Disorder beside Morale and Fatigue in one place rather
than in three.

**Blocking the Formation change inside `beginChange`.** The obvious home, and it would have made
C3 import C7 while C7 was already importing C3 for the drill table. The guard sits at the three
places a Formation change is asked for instead: the two in C8 where an Order reaches the drill, and
the one in C2 where a rule does.

**Leaving a drill already under way alone.** Gentler, and wrong: a battalion three-quarters of the
way into square that a mob runs through is not three-quarters of the way into anything. Ruining it
is also the reading CONTEXT asks for, since a Unit mid-change *is* changing Formation.

**Denying a re-form while the Unit is under fire, the way [ADR-0011](./0011-morale-comes-back-out-of-the-fight.md)
denies Morale.** Tempting for the symmetry and left out on purpose. It is a second rule of the same
shape stacked on the same afternoon before anything has measured whether the first one was enough,
and the honest order is to measure and then decide. **Trigger:** a battalion that visibly re-forms
in the middle of a firefight it should not have been able to dress in.

## Consequence

**A regiment that pursues comes home ragged, and cannot be let go again until it has stood.** That
is the decision the Pursuit was always supposed to cost and never did: the horse is spent, far out
of position, out of shape, and a Courier ride away from being told anything. Blown and Disordered
now say the same thing on the charge button for different reasons, and the card says which.

**A Rout is dangerous to the army it belongs to.** Before this, a broken battalion streaming back
through its own second line cost that line nothing at all. It now costs it its shape, which is half
a minute of not being able to make square — and the moment a Rout goes back through a reserve is
exactly the moment horse tends to be coming on. It is the first rule in the simulation by which one
Unit's collapse reaches another Unit directly.

**The glyph is spent.** [DESIGN](../../DESIGN.md) §8 rank 7 held one rung in reserve on F5's
fallback ladder and T18 recorded that a fourth read on a Unit would have nowhere else to go.
Disorder is that fourth read, and it takes the glyph — a dark saw-tooth laid across the middle of
the Unit. It is spent on this rather than on naming the Formation, because the silhouette already
names the Formation and nothing at all names this.

**It fires on every nominal run, and never once as a Pursuit.** Between one and fifteen spells a
run, twenty-one to nine hundred and thirty-seven Unit-seconds, and all of it a mob coming back
through — because no Plan has ever issued a Charge and no rung of the Latitude ladder buys one, so
the silent runs cannot reach a Pursuit at all. The half of the rule the design was actually built
for is exercised on the fixture instead (`disorder.test.ts`), which is the same answer §0 already
gives for square and the countercharge.
