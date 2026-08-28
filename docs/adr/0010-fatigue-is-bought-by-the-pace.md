# Fatigue is bought by the pace

A **Unit** carries a **Fatigue**, from 0 fresh to 1 blown. It buys it with the pace it asks of its
men and with nothing else: each step, the cube of the pace it was actually making against the pace
its own Arm marches at. Standing still gives it back, at twenty minutes from blown to fresh.

What it costs is CONTEXT's three and one more. It takes a third off the pace, it takes a third off
the fire, it takes a quarter off the steadiness Grade buys, and above `blown` it denies a **Charge**
outright — the one hard edge, because a regiment either goes at somebody or it does not. **Blown is
a state with two marks**: entered at 0.6 and left only under 0.4, which is four minutes standing.

`CHARGE_RANGE` stays. [DESIGN](../../DESIGN.md) §10 recorded that Fatigue would replace it; it does
not, and the reversal is the second half of this decision.

## Why

**A Charge had to stop being free, and so did the rest of the afternoon.** The 150m seam priced
exactly one thing — the last stretch of a run-in — and left everything around it free. A battalion
could march the length of the Field, arrive, and fight as steadily as one that had stood on that
ground since Deployment; a regiment could be let go four times and be the same regiment on the
fourth. Fatigue is the bill for the ground, and the seam was only ever the bill for the last
hundred and fifty metres of it.

**It is bought by the pace and not by the Order, so nothing in it knows what a Unit was told to
do.** A flank march, a Rout, a gallop and a battery hitching up and trundling off are the same
arithmetic asked four times. That is what keeps it from growing a rule per situation, which is the
failure mode of every exhaustion system that starts by asking *what is this Unit doing*: there is
no list to keep in step, and Pursuit — when it is built — will cost what running costs without
anybody writing down what a Pursuit costs.

**Formation reaches it through the pace and nowhere else, which is [F8](../../DESIGN.md) held to
where it would be easiest to break.** A table of fatigue per Formation is precisely the
per-Formation constant F8 exists to forbid, and it would have been the obvious way to say that
column is the hurrying Formation. It says it anyway, and derives it: a column tires five times what
a line does a second because it walks at 1.4 metres a second against 0.8, and about three times
over the same ground. A battalion in a hurry gets there in half the time and pays three times a
metre for it. Square and guns In Battery cost nothing, having no speed to cost anything with.

**The cube, and not the pace itself or its square.** Troops do not tire in proportion to how fast
they are going; they tire on the last stretch of it, which is why horse walked up and galloped
home. Squared, a cavalry regiment was blown by crossing the Field at the trot and a gallop cost
barely twice a march — the wrong shape at both ends. Cubed, a regiment can trot all afternoon and
pays for the two hundred metres that matter.

**Read against the Unit's own marching pace, so it is one law rather than a number per Arm.** A
horse's work is a horse's. Every Unit in its travelling Formation is doing exactly one second of
work a second, and what separates the Arms afterwards is how far above that their charge sits.

**The ground is paid for in work and never refunded in it.** The pace Fatigue reads is the ground
gained with the Ground's own cut handed back, so a battalion wading a marsh is putting in a
column's effort for a third of the distance — and is in there three times as long doing it. Read
off the ground gained instead, a marsh would have been the restful way across the Field, which is
the opposite of what it is.

**Blown is a state and not a threshold, because the way out is not the way in.** Read off the
figure alone it was a revolving door: a regiment sitting just over the line at 0.62 needed
twenty-four seconds of standing before it would go again — charge, halt half a minute, charge —
and the Dispatch fired afresh on every crossing, so the feed reported the same regiment blown four
times in five minutes. That is the rule failing to make the claim it was written to make. The shape
it wants is the one Breaking already has: a Unit does not un-Break when its Morale creeps over
zero, it stays Routing until it can **Rally**, and a Rally is a higher bar plus a clearance. So
`blown` is carried on the Unit, entered at 0.6 and left under 0.4, and both ends are said once.

**The fourth cost is in the ubiquitous language already, in the dialogue rather than the
definition.** *You don't destroy it. You break it. It'll go at a quarter of its Strength, sooner if
it's tired.* Grade is the ladder a Unit's steadiness stands on and Fatigue is the sag in it, so an
elite battalion marched off its feet is steadier than a conscript one and less steady than it was
at noon. It puts a blown Unit under [F10](../../DESIGN.md)'s 15–30% band on purpose: the band is
where a Unit that has been left something to fight with breaks.

## Considered

**Fatigue from running alone — charges and Routs, and nothing else.** Sharper, more period-legible,
and the first design on the table. Rejected on arithmetic: with the seam in place a cavalry run-in
is twenty-one seconds and an infantry one is sixty-eight, so a charge would have cost a few
hundredths and a regiment would have had to be let go a dozen times to feel anything. That is a
feature that exists in the code and never in a battle.

**Removing `CHARGE_RANGE`, as DESIGN said Fatigue would.** The recorded intent, and it is wrong for
two reasons that only became visible with Fatigue actually in hand. The seam is not a tax standing
in for Fatigue — it *is* Fatigue, as the period practised it: regiments walked up and galloped the
last stretch because of what a gallop costs, so removing the seam would model commanders who had
never learned the thing the rule is about. And the seam is doing a second job nothing else would
do. Dread is charged per second of a Charge running at a Unit; a gallop from six hundred metres is
eighty-six seconds of it against twenty-one, which breaks a fresh battalion by fear before anybody
reaches it. Reshaping dread to fall off with the range is a real design and a separate one, and it
would have to be built and re-tuned before the seam could go.

**A rate per Formation.** The direct way to say what the cube says. Rejected on F8, and it is worth
naming the *reason* F8 wants it rejected here: with a table, column-is-tiring is an opinion someone
typed, and it would have to be re-typed for every Formation added after. Derived from the speed,
it is a consequence of the one number a Formation already has to have.

**Recovery hastened by the Headquarters, the way Morale's is.** Attractive for the symmetry, and
rejected because it says something false. A commander riding along the line steadies men; he does
not rest their legs. Morale recovers twice as fast near its own staff and Fatigue recovers at one
rate everywhere, which is the difference between the two states put in the only place the player
can see it.

**Slowing a Rout.** Every other pace in the simulation goes through C8's one funnel and is hobbled
there. A Rout is moved on its own and is not, which is deliberate: a mob running for the rear is
not pacing itself, and the simulation is in no position to decide a man cannot run for his life
while out of breath.

## Consequence

**A reserve is now a thing, rather than a Unit that happens not to have been used.** Two identical
battalions at the twentieth minute are not identical if one of them walked there, which is the
first time in this simulation that the ground a Unit covered is still on it after it arrives. The
flank march has a price, and it is paid at the moment the flank march arrives.

**The third charge is the one that is not there.** A long Charge costs a cavalry regiment about a
tenth of its wind between the walk-up and the run-in, and crossing the Field to reach the fight
costs a fifth. What that adds up to is a regiment that can be spent, and a player who has to decide
which charge is the one worth having — where before, the answer was all of them.

**A blown regiment refuses an Order, which no Unit did before.** The Charge dies where it lands,
with a Dispatch saying why, rather than walking the Unit up to be ridden down; the rule list gets
the same answer, so blown cavalry stands to receive a charge it would otherwise have met coming
on. The card offers the button disabled rather than hiding it, because the reason is the point.
Four minutes standing is what buys it back, and the Dispatch says that too — a Charge going back on
the table is as much a thing the player can act on as one coming off it.

**Nothing is saved between battles, so Fatigue is an afternoon's arithmetic and not a campaign's.**
Twenty minutes from blown to fresh is most of the clock ADR-0006 spends. When Rosters are written
back out — the door CONTEXT leaves open for casualties from Lodi to be missing at Castiglione —
Fatigue is the state that should *not* travel with them.

**It is watched at both ends.** On a thirty-minute clock infantry may never tire enough to notice,
in which case the rule is decoration for two Arms out of three; equally, an army that is winded
before it makes contact is a battle spent watching men who cannot fight. **Trigger to revisit:**
a Castiglione where no Unit is ever winded, or one where a battalion is blown before the first
Volley.
