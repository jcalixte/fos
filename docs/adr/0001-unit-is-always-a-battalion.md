# A Unit is always a battalion-sized body

A Unit is the smallest body of troops the player gives an Order to, and it is fixed at
battalion scale — one body holding exactly one Formation. "Battalion scale" is expressed as a
Frontage band of roughly 75-150m rather than as a historical title, because no title unifies
across armies: an Austrian cavalry regiment ran 1,000-1,400 men against a French 250. Bigger battles are reached by
adding a command layer *above* the Unit (the player orders a division, which relays Orders
down), never by making a Unit represent a brigade or larger.

## Why

Formation is the heart of the game: a battalion visibly takes ~30 seconds to go from march
column to square, and whether it got there in time is the drama. A brigade cannot hold a
Formation — its battalions each hold their own — so a brigade-sized Unit would demote
Formation to an abstract stance and hollow the game out.

Scale is therefore split in two: men per Unit, map size, Unit count, ranges and speeds are
tuning data and stay changeable forever; the *size of the thing that holds a Formation* is
structure and is settled now.

## Consequence

The growth path and the fog-of-command feature are the same machinery. Because an Order is
already a message with an arrival time, a divisional commander is just one more hop in the
delivery chain — so a 100-battalion battle needs a relay layer, not a rewrite.
