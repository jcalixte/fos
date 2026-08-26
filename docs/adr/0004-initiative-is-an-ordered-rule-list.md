# Initiative is an ordered rule list, and it suspends Orders rather than cancelling them

A Unit's Initiative is an ordered priority list of rules evaluated each tick, first match wins —
not a behaviour tree and not a utility scorer. When a rule fires it *suspends* the Unit's live
Order; when no rule matches any more, the Unit resumes it.

## Why

Two properties decided it, and neither is simplicity.

**Every autonomous act needs a nameable cause.** We committed that a Dispatch says *why* something
happened. In a rule list the rule that fired is the reason — "formed square on its own initiative,
cavalry at 300m" is the rule's own name, not text written alongside it. A utility scorer
fundamentally cannot answer "why": the answer is a vector of scores, and an explanation layer
would have to be invented and kept honest beside it.

**Suspending rather than cancelling is what makes order delay tolerable at all.** A battalion
marching to a ridge meets cavalry, forms square, and the cavalry sheers off. If Initiative had
cancelled the Order, that battalion now sits in square in an empty field until a new Order reaches
it — ninety seconds away, and the player may not notice it has stopped. Across an army, every
cavalry feint would strand the whole line. Suspension means a Unit can be trusted to look after
itself *and* still arrive.

## Considered

A behaviour tree — more expressive, but node ordering and blackboard state make determinism
something to defend rather than something you get. Utility scoring — most flexible, hardest to
tune, and structurally unable to explain itself.

## Consequence

The rule list cannot express anything subtle: no holding fire because a friendly is about to mask
you, no coordinating with the battalion alongside. Each such case is a new rule, and the list will
grow long and order-sensitive. That is the accepted price — an 1796 battalion commander had a short
list of things he was permitted to do unbidden, which is why the concept carries that name.

Initiative is also kept strictly *defensive*: it returns fire, forms square, breaks, routs, rallies
and picks a travelling Formation. It never advances, never takes ground, never chooses an objective.
That boundary is what stops good Initiative from making the player redundant.
