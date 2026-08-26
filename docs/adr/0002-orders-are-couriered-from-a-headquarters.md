# Orders are couriered from a Headquarters

An Order is not a call on a Unit — it is a message with a delivery time. The player occupies
a Headquarters on the Field, and an Order's delay is the distance from the Headquarters to the
Unit divided by a courier's speed. The Headquarters can be moved, is a vantage point for
seeing, and can be shot at.

## Why

Delay is the game's central friction, and a flat constant makes it arbitrary: commanding a
battalion 1500m out on the flank would cost exactly what commanding the one in front of you
costs, which erases the reason armies of this period were hard to control. Deriving delay from
a real distance makes the flanks genuinely expensive and gives the player one decision —
*where do I stand* — that trades control against safety and against sight.

## Considered

A flat per-Order delay (simplest, but arbitrary and flattens the flanks), and delay measured
from the player's deployment edge (keeps distance-costs-time with nothing to place, but
punishes advancing rather than punishing distance from the commander).

## Consequence

The Courier is drawn on the Field while he rides. This is not decoration: an invisible delay
reads as lag and broken hands, whereas a rider crossing the field reads as command, and it
doubles as free feedback on how many Orders are in flight and when each lands. It also makes a
Courier who fails to arrive a fair mechanic rather than an infuriating one — a silently
discarded order is unforgivable, but one whose rider the player watched go down is drama.
Interception stays behind a switch until delay itself is proven.

Two systems collapse into one object. The Headquarters is simultaneously the origin of order
delay and an eye for [Concealment](../../CONTEXT.md), so taking a hill pays twice. And per
[ADR-0001](./0001-unit-is-always-a-battalion.md), the relay layer that scales the game up to a
100-battalion battle is just another hop in this same delivery chain.
