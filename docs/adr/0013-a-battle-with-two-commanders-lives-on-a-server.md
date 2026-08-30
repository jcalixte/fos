# A battle with two Commanders lives on a server

Two people can fight the same battle. The battle is held and advanced by a server; each browser
draws it and sends Orders back. Solo play is untouched and stays a static site.

What makes that one build rather than two is a single seam. **A battle session takes Orders, emits
`BattleSnapshot`s, and reports the Outcome** — `useBattle` talks to that and never learns which it
has. There are two implementations: a local one wrapping `BattleRunner` in the tab, and a remote
one wrapping a socket. Neither contains a rule. The rules are `src/sim/`, imported unchanged by
both, which is the whole of what [ADR-0003](./0003-typescript-with-a-pure-simulation-core.md) was
keeping pure for.

## Why

**The expensive half was built two milestones ago for another reason.** `scripts/load-headless.ts`
already loads an authored Scenario with no browser anywhere — `png.mjs` decodes the Field, and
`buildScenario` is shared with the browser loader, so "a divergence would have to be in decoding a
PNG rather than in reading one". `scripts/budget.measure.ts` runs whole battles that way for the
DESIGN §8 numbers. Running the simulation outside a tab is not work this decision has to do.

**A rule about what a Commander may not see has to be enforced somewhere neither Commander is
sitting.** Deployment is blind: while two armies are being arranged, neither Commander sees the
other's. And a **Report** — a Unit's exact Strength, how it is blowing, what its next Volley falls
on — is rendered about your own Units and no others. Both are cuts in what is *sent*, not what is
drawn. A host-authoritative peer can make those cuts against the guest, and cannot make them
against the host, whose own machine necessarily holds the whole battle. That is one rule obeyed by
one army, which is the exact complaint DESIGN §9 logs against the enemy Headquarters paying nothing
for ADR-0008. Building multiplayer by reproducing that asymmetry would be building the thing this
feature exists to end.

**Lockstep was the shape the codebase looked built for, and the floor is not solid.** Both browsers
running the whole simulation with only Orders on the wire is what F18 and a fixed 10Hz step suggest.
But the simulation's arithmetic includes 15 `sin`, 15 `cos`, 8 `hypot` and 4 `atan2`, and ECMA-262
leaves all four implementation-approximated — `hypot` most of all. F18's bit-identical outcome is
true on one engine, which is all the tests have ever asked of it. One ULP of divergence compounds
into two people watching two different battles, each correct on his own screen, **with nothing on
either screen to say so**. A wrong answer that reports itself is a bug; this one doesn't.

**It is the day [ADR-0009](./0009-the-url-names-a-battle.md) named.** That ADR routed only what a
bookmark can keep a promise about, because "a battle in progress cannot be returned to", and wrote
down its own revisit condition: *the day a battle can be saved, the phases become routable*. A
server-held battle is that day — reached without the serialisation T13 refused, by the state simply
living somewhere that outlives the tab. It is what makes **Out of Contact** survivable rather than
fatal: a dropped Commander comes back to the same address and takes his army where it has got to.

**The latency this buys is beneath the resolution of the mechanic.** A Courier rides at 13 m/s;
F1's targets are 200m ≈ 15s and 1500m ≈ 115s. A round trip of a few tens of milliseconds is a
fraction of one simulation step, in a game whose central rule is that Orders are late. This is a
real-time game that can afford a network, and it can afford one *because of*
[ADR-0002](./0002-orders-are-couriered-from-a-headquarters.md).

## Considered

**Host-authoritative** — one Commander's browser is the battle, the other is a client. Cheapest by
a distance, needs no process anywhere, and was the recommendation until blind Deployment and the
Report rule appeared. Rejected on the asymmetry above, and on the smaller thing behind it: the
battle would die with one particular tab, so **Out of Contact** would mean one thing for one
Commander and another for the other.

**Lockstep peers** — rejected above, on silent desync.

**Server-authoritative for every battle, solo included** — one code path instead of two. Rejected
because it takes the six existing battles away from anyone without a live server, puts a round trip
under every solo Order, and turns G6's link into a link to infrastructure. The local session exists
so the answer to "does this still work as a static site" stays yes.

## Consequence

**F19 is dead for multiplayer and alive for solo, and that split has to be defended.** "Static
assets, no server" now describes one of two paths. The local session is what keeps the other honest,
and the moment something rules-shaped moves into the remote session that the local one lacks, there
are two games and this ADR has been broken rather than extended.

**There is a process to deploy and keep alive.** The container already builds; this adds a service
beside nginx on Coolify, and something that has to be running for a link to work. A battle now
outlives the tab that opened it, which nothing in this project has ever done.

**The filters in the renderer become the second line rather than the first.** `BattleView` already
declines to draw enemy Ghosts (`:1085`) and draws only its own Headquarters (`:1600`). Under a
server those cuts move into what is sent — enemy Ghosts, enemy Couriers, enemy Reports and enemy
Dispatches never reach the client at all. The renderer's tests stay; they are no longer what is
holding the line.

**Two implementations of one interface can drift, and only the seam prevents it.** The guard is that
neither implementation may contain a rule. Anything either of them knows about a battalion is a
thing that belongs in `src/sim/`.
