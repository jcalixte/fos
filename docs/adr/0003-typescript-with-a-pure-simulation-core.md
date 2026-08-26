# TypeScript, with the simulation as a pure module

The game is built in TypeScript with Vite and PixiJS. The simulation lives in `src/sim/` as a
pure module that imports no renderer and touches no DOM: it advances on a fixed timestep and
exposes state that the renderer reads at a fixed 10Hz. Tempo scales how many steps are taken per
real second, never the size of a step. The renderer draws *between* the last two simulation states
rather than at them — without that interpolation, everything moves in ten discrete jumps a second
regardless of frame rate. Interpolated positions must never feed back into the simulation, or
replays diverge.

## Why

Rendering cost is not a factor here — figures are drawn one per ~10 men, so the whole Field is
around 1,200 sprites and any engine would do. The deciding factors were velocity in a familiar
stack and shipping as a URL.

Keeping the simulation pure is what buys the things that actually matter for a rules-heavy
wargame: it runs headless in tests, a battle is reproducible from a Scenario plus a seed, and
volley resolution, morale and order delivery can be exercised without a canvas. A fixed
timestep is what makes that reproducibility true; letting Tempo stretch the step instead would
make every result depend on the player's chosen speed.

## Considered

Godot 4, whose TileMap editor and inspector are most of the content tooling this project needs,
against the cost of a new language and fussier headless testing. Rust with macroquad or bevy,
rejected as buying performance headroom this design has already shown it does not need.

## Consequence

The terrain and Scenario editor has to be written by hand, in the browser. That is real work
and is the main thing given up by not choosing Godot — it should be planned for, not
discovered.
