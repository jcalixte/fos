# A battle ends on the clock, and Army Break is the floor underneath it

The Scenario clock is what ends a battle. When it runs out the Key Ground is counted, and where
that is even, what each army has left decides. Army Break still exists and still ends a battle,
but it now takes *every* Unit of an army being run off or broken — not a third of it.

## Why

Army Break at a third is the period-true figure and it made the game worse.

The bridge-march fixture ended at 5:32 of a 30:00 clock. Two Austrian battalions broke, which on a
four-Unit roster is 44% weighted, and the army quit — with two Units still in hand, its battery
unfired-on and its hussars untouched, and its own Plan holding a Move Order due at 7:00 that never
fired. The player got a decisive victory before the enemy had finished deploying into it.

That is not a tuning error in the threshold. A third of an army is a real number and four Units is
not a real army: the weighting puts one battalion at 22% and two at 44%, so the entire end
condition lives in the gap between the first battalion and the second and there is no state in
between. Any threshold below 1 has this problem on a small Roster; 1 is the only value with no gap
above it.

**The clock is the honest shape of a battle here.** It is what a turn count is to a turn-based
game: a fixed budget of decisions, known at the start, the same every time. F1 already prices a
far-flank Order at ~115 seconds, so a 30-minute clock is roughly ten order-cycles — and how many
of those a commander gets is the game. An end condition that can cut the clock to a fifth without
warning takes the budget away, and takes it away hardest from the player who was winning slowly.

**Army Break at 1 still means something.** It is not annihilation and it is not a Strength count.
What has to be true is that no Unit is left in hand, and a Unit leaves that count by Breaking. An
army reaches it with its men and without its nerve, which is the same claim F10 makes about a
battalion, made one level up. It is a backstop for the case where the Field is genuinely empty of
one side, not a race either commander runs.

## Considered

**Thicken the Austrian Roster and give it a reserve on the road.** Weight 4.5 to 7.25, three Units
arriving at eight minutes, and the fixture survives its first crisis. It fixes this battle and it
is the right scenario work regardless — but it leaves the end condition able to cut any future
battle short the moment an author writes a small force, and it makes battle length a property of
Roster size rather than of the clock. Worth doing; not a substitute for this.

**A dwell timer — Army Break must hold for 30–60 seconds before it fires.** Cheaper, and it stops
a momentary double-Rout ending an afternoon. Rejected as a half-measure: it delays the tripwire
without removing it, and it adds a rule whose only job is to distrust another rule.

**Soften SHOCK, or the fire model.** Rejected outright. F10's band is met as measured — 16.4%
conscript, 22.2% line, 25.9% elite — and the Volleys are calibrated against the period. Detuning
calibrated numbers to compensate for an end condition spends that calibration on every scenario
authored afterwards.

## Consequence

**Key Ground now decides nearly every battle, and it was not authored to.** This is the real bill.
§8 recorded that on the fixture nobody ever comes within the bridge's 90m radius — the Austrian
Plan parks its covering battalion 111m off — so the clock branch was decided by whoever marched
onto the bridge, which is only ever the player. That was a footnote while the clock branch was
rare. It is now the game.

Answered for this fixture by moving the objective to the ground the Austrians were already
standing on: the hamlet on the far bank, which the Plan garrisons at 90 seconds, alongside a
tightened bridge. It is answered as data and it has to be answered again for every Field authored
afterwards — a Key Ground that only one army can reach is a result written before the deployment.
The general form of the rule is that Key Ground is authored where the defender already wants to
stand, not where the attacker is going.

**Dead time is now possible and was not before.** An army wrecked at minute six cannot quit, so the
player may sit on a decided Field for twenty minutes. Break Off is the release valve and it is the
player's hand rather than a rule, which is the right place for it — but it means Break Off has
gone from a rare gesture to a normal way to end an evening, and it should be read as ending the
battle rather than as losing it.

**The Grade weighting no longer decides when a battle ends.** Nothing standing is nothing standing
at any weight. It still decides the share the Return reports and the clock that ran out level, so
it is kept and it is now doing a smaller, more honest job.

**Army Break keeps its name.** At 1 it is still an army whose Units have all Broken, which is what
the name says. Renaming it would churn the Outcome, the Return, the Dispatches and the glossary to
say the same thing.
