# Morale comes back out of the fight, and not between Volleys

A **Unit** recovers **Morale** only once it has been left alone. It carries the time it was last
shaken — by casualties or by **Dread**, which are the two things that take nerve — and while that
is inside the last **thirty seconds** the recovery does not run at all. Out of the fight it runs
exactly as it did: a tenth of a Morale a minute, doubled inside a quarter of a kilometre of its own
**Headquarters**, and capped at the **Morale Ceiling**.

Thirty seconds because a battalion reloads in twenty-two and a half. Anything shorter and a Unit
under steady fire gets its nerve back between the Volleys, which is the whole of the case this
answers. The number is already in the repository under another name: the budget run treats thirty
seconds since a Unit last fired as the window in which it has answered for itself.

## Why

**A Unit under fire was getting its nerve back faster than the fire was taking it.** Recovery ran
every step, against anything, so a battalion in a ten-minute firefight was handed a whole Morale
back over the course of it. Where a Break costs lands straight out of that: casualties at Break come
to `1 − exp(−(1 + regained) / SHOCK)`, which is 16.4% of a battalion when nothing is regained, 30%
when a whole Morale is, and 36% at one and a half. `SHOCK` is calibrated on the first of those and
[DESIGN](../../DESIGN.md) §8 asks for 15–30%, so any fight lasting more than about ten minutes was
outside the band before it started.

**It is measured, and it is the difference between the Units that met the band and the ones that
did not.** Across the four nominal runs, the Units that Broke inside 15–30% had regained 0.11 to
0.20 Morale during the fight that broke them. The ones that Broke at 42–43% had regained 1.42 and
1.65. Nothing else separates them: same Grade, same Arm, same battle.

**Fixing the fire model instead was tried, and it moved the everyday battle the wrong way.** The
Volley into a deep target was genuinely broken and is now fixed — a march column cost 0.86 to 0.98
men a musket and costs 0.32 to 0.40. But slower fire means longer fights, longer fights mean more
recovery, and Castiglione's Break went from 30.0% to 39.9% for that reason alone. Restoring
line-against-line exactly to where it was did not move it back. The fire model was the smaller of
the two causes and it is the one that was already found.

**Bounded at zero, both battles come home.** With recovery switched off entirely — the bound, not
the proposal — Castiglione taken French Breaks at 19.4%, Rivoli taken French runs 13.1–28.9% with a
median of 17.4%, and Rivoli taken Austrian 14.3–57.4% with a median of 17.8%. The medians sit within
a point or two of the 16.4% `SHOCK` is calibrated to, which is the arithmetic above coming out
where it should. Rivoli's tail — the 89.7% this whole investigation started from — is gone.

**A battalion steadies when it is out of it.** That is the period's own account and it is the one
the rest of the design already tells: [ADR-0010](0010-fatigue-is-bought-by-the-pace.md) gives
Fatigue back for standing still, a **Rally** needs three hundred metres of clearance before it will
happen at all, and riding a mob down is described in C7 as putting Morale down faster than standing
anywhere puts it back. Recovery running under fire was the one place the simulation said a Unit
mends itself while being shot at.

**It is a rule and not a rate.** *When may a Unit get its nerve back* is a question with a nameable
answer, and the alternative — turning the rate down until the numbers land — answers a different
question badly. This is [T14](../../DESIGN.md)'s standard applied to Morale: every state a Unit is
in should have a cause somebody can say out loud.

## Considered

**Leave recovery alone and restate F10.** What §8's rank 4 permits — record the miss rather than
tune it away. Rejected because the band would then be measuring the length of the fight rather than
what a Break costs: a Unit in a two-minute fight and the same Unit in a twelve-minute one would be
held to targets ten points apart, and no number could be written down that meant anything for both.
The miss was worth recording while its cause was unknown. It is known.

**Turn `RECOVERY` down.** The obvious global scalar, and it slows the Rally exactly as much as it
slows the absorption. A battalion pulled out of the line for ten minutes *should* come back
steadier, and a rate low enough to fix the firefight makes that impossible — the reserve stops
being worth forming. What is wrong is not the rate but that it runs while men are being shot at.

**Raise `SHOCK` to compensate.** Moves the Break point for every Unit in the game, including the
ones in short fights that already meet the band. A constant fitted to the long-fight case pushes
the short-fight case under it, and the two cannot both be right while the recovery is the thing
that separates them.

**Cap the total a Unit may recover in a battle.** Lands the numbers and means nothing: there is no
account of a battalion by which the fourth time it steadies is harder than the first. The Morale
Ceiling already carries the one such claim the design makes, and it is paid for by a Rout.

**Stop recovery whenever an enemy is within reach, rather than when the Unit was last shaken.**
Cheaper — no state to carry — and wrong at both ends. Two battalions standing four hundred metres
apart all afternoon are not in a fight, and a Unit whose enemy has just been driven off is still
shaken for the next minute whether anything is in reach or not. What takes nerve is being shot at,
so what withholds the recovery should be having been shot at.

## Consequence

**Pulling a Unit out of the line becomes the way to get its nerve back**, which is a decision the
player makes rather than something that happens anyway. A battalion left in a firefight is spending
itself the whole time it is in one; the same battalion walked two hundred metres to the rear mends.
That is a use for ground, and for the Order that buys it, that the simulation did not have before.

**A firefight now decides.** Two lines exchanging Volleys reach an end instead of drifting, because
neither of them is being handed back what the other is taking. What that costs is that a
long-range, low-casualty exchange is no longer a stalemate the Units survive by attrition of
patience — it is a slow decision, but a decision.

**A mob under fire does not come back.** A Routing Unit recovers toward the Rally floor only once
it is clear, so a Unit pursued or shot at while it runs stays a mob. `canRally`'s three hundred
metres of clearance already said nearly this and now the two agree rather than pulling apart, and
C7's claim that a ridden-down Unit is under the floor for the rest of the day stops resting on the
sabre outpacing the recovery and becomes the rule.

**The Headquarters keeps its comfort, and it means something narrower.** Doubling recovery inside
two hundred and fifty metres now applies only to Units out of the fight, so standing the staff
behind the line steadies the reserve rather than the firing line. That is the truer claim and it
makes *where do I stand* — [ADR-0008](0008-the-headquarters-rides-and-can-be-harried.md)'s whole
subject — a question with one more real answer in it.

**Two Breaks stay outside the band, and they are the fire model's and not this rule's.** Even
bounded at zero, one Unit in each Rivoli run Breaks at 43.6% and 57.4%. Both are small Units —
a two-hundred-and-eighty-man cavalry regiment — taking a full battalion's Volley: `shots` scales
with the Unit firing and the overlap measures the target's width but never its size, so a quarter
of a regiment goes at a stroke however well the depth is priced. That is a separate finding and it
wants a separate decision.

**The numbers above are the bound and not the rule.** Recovery switched off entirely is what has
been measured; recovery withheld for thirty seconds after a shake will land somewhere between that
and today, nearer the bound in a close firefight and nearer today in a battle of long-range
skirmishing. **To be measured when it is built:** both nominals against F10's band, the Rally count
per run — which must not go to zero — and whether any Unit that Broke ever comes back at all.

**Trigger to revisit:** a battle in which nothing Rallies, which would mean the window is longer
than the gaps a battle actually contains; or a firefight that ends in under a minute, which would
mean the recovery was holding up more of the design than this ADR credits it with.
