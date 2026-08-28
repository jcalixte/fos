# The URL names a battle, and nothing inside one

The app has two addresses. `/` is the battles on offer. `/battles/:battle` is one battle, and an
optional `?army=` takes it in the same breath and goes straight to Deployment. A battle is named
by its directory under `public/scenarios/`, which is the one name `index.json` already gives it.

Nothing further is routed. **Deployment, the battle and the Return are phases of `useBattle` and
have no address of their own.** `Phase` loses its `menu` member: not being in a battle is the
router's answer now, and not the composable's.

This is the first half of G6 — *it's a link you can hand someone* — actually arriving.
[ADR-0003](./0003-typescript-with-a-pure-simulation-core.md) chose a web stack partly for
shipping as a URL, and until now that URL was the same one for every battle.

## Why

**An address is a promise that what it names can be returned to, and a battle in progress cannot
be.** Nothing in a running battle is saved; `leave` says so in as many words — whatever the battle
had reached is gone, and there is nothing to come back to. So `/battles/castiglione/deployment`
would resolve, on a reload or a pasted link, to the army offer: the address bar naming one thing
and the screen showing another, silently, with no way for the player to tell which of the two was
lying. The line is drawn where it is because it is the only place it can be drawn honestly. Route
what a bookmark can keep its promise about, and leave the rest to the phase machine.

**Where the player is had two answers, and they were kept apart on purpose.** `ui.phase === "menu"`
meant *not in a battle*, and the menu was drawn as an overlay on a PixiJS host that stayed mounted
the entire time — deliberately, so that there would be a box to hand the renderer the moment a
battle was chosen. That is a renderer kept alive for a screen with nothing to draw, and a phase
machine carrying a member for the state of not running. One of the two had to hold the fact. The
router is the better keeper of it because it is the one the browser already agrees with: Back,
Forward, reload and a pasted link all mean something to a route and meant nothing at all to
`ui.phase`. A Field now exists for exactly as long as the page showing it, which is a shorter
sentence than the one it replaces.

**The shortcut back in was already a URL — it was just written somewhere only one browser could
read it.** `LastBattle` in localStorage remembers the last battle and army so that getting back
onto a Field under work is one press. That is a bookmark, hand-rolled: invisible, holding exactly
one entry, and unable to leave the machine that wrote it. Making it an address costs nothing and
gives it a second tab, a Back button and a link. localStorage stays, doing the smaller job it is
genuinely good at — answering *what did I last play* on a cold open, which no URL can be expected
to know.

**The army is a query rather than a path segment, and it replaces rather than pushes.** Both fall
out of the same fact: the path is the page's identity, and the view is keyed on it. Putting the
army in the path would tear down and remount the Field the instant one was chosen, re-decoding the
Field's PNGs to arrive at the state already on screen. And Back out of Deployment should reach the
menu, not the offer that was just answered — pushing would leave an address naming no army sitting
over an army already arranged, which is the same broken promise as a routed Deployment, one level
down.

## Considered

**An address for every phase** — `/battles/castiglione/austrian/deployment` and the rest. It is the
shape most apps would take, and it is honest only if a reload can re-enter what it names. That is
not fantasy here: ADR-0003 keeps the simulation pure and fixed-step precisely so that a battle is
reproducible from a Scenario plus a seed, so a resumable address is a Scenario, a seed and the
Orders given — a real feature with a real design already under it. It is simply not built, and
routing ahead of it would ship the URLs without the thing that makes them true. Deferred rather
than rejected: the day a battle can be saved, the phases become routable and this decision is the
one to revisit.

**`history.pushState` by hand, keeping the phase machine as it stands.** Rejected as the router
with fewer features and more places to forget one — matching, guards, link resolution and the Back
button all re-implemented against the day they are needed, and the two sources of truth left
exactly where they were, which was the actual complaint.

**Hash addresses** — `/#/battles/castiglione`. They ask nothing of the server. Rejected because the
server already gives it for free: `nginx.conf` falls back to `index.html`, so real paths cost
nothing to serve, and G6 asks for a link you can hand someone. A hash is a worse one.

**An authored `id` in `scenario.json` instead of the directory name.** It would decouple the
address from the folder layout, which is the usual reason to want it. Rejected on F16: `index.json`
lists directories and nothing else, so a battle is named in exactly one place and adding one stays
dropping a folder beside the others. A second name is a second thing to keep in step, plus a
uniqueness rule to enforce, bought against a folder rename that has not happened yet.

## Consequence

**A battle is now a link, which is a content feature wearing navigation's clothes.** *Fight
Castiglione as the Austrians* is an address that can be sent to someone, and the thing they open is
the thing that was meant. G6 is weighted 5 and its recorded source is still ADR-0003; the stack was
only ever half of it.

**An unknown battle has to be turned back at the door, because the server will not do it.**
`try_files $uri $uri/ /index.html` hands back *any* unmatched path as the app's own HTML — so
loading a Scenario for a slug that names nothing fetches `index.html`, gets a 200, and fails as a
JSON parse error: a stack trace where the answer is *that battle is not on offer, here is the
list*. A route guard checks the slug against the catalogue before the page is entered at all. The
catalogue is therefore read before the first Field rather than only by the menu, so it is read once
and shared — `index.json` is authored and not generated, and cannot change under a tab that is
already open.

**The Field's lifetime is now exactly the page's, and that exposed a leak which was survivable
before.** The old teardown cancelled the frame and destroyed the renderer but did not bump the load
counter, so a Scenario still decoding when the player walked out would finish into a page that no
longer existed — mounting a renderer onto a detached host and starting a frame loop with nothing
left to stop it. Under the always-mounted host there was no way to walk out mid-decode. There is
now, so teardown is the whole of `leave` and not a narrower cleanup.

**Deep links are a deployment constraint the project did not previously have.** Anything serving
this build must fall back to `index.html`. The container already does. A static host that does not
will 404 every address except `/`, and the failure will look like the router being broken rather
than the server being unconfigured.

**The phase machine can no longer describe not being in a battle, and should not learn to again.**
If a later screen — a campaign, the Scenario editor ADR-0003 signed up for — needs an address, it
is a route and not a `Phase` member. The rule is the one at the top: an address is a promise about
what can be returned to, and a phase is what is true while you are already there.
