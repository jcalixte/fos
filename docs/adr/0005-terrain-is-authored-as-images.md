# Terrain is authored as images, not in an editor

A Field's two continuous layers are authored as PNGs and decoded at load: `height.png` in greyscale
and `ground.png` in indexed colour. Height is painted at low resolution (~64×64) and bilinearly
upsampled; Ground is painted at full cell resolution. Everything discrete — Key Ground, Crossings,
deployment zones, Arrivals, the enemy's Plan — lives in a `scenario.json` beside them.

## Why

[ADR-0003](./0003-typescript-with-a-pure-simulation-core.md) records the terrain editor as the main
thing given up by choosing TypeScript over Godot. It turns out not to be given up: a Height per cell
and a Ground per cell *are* two images, so authoring happens in Aseprite or GIMP — tools better at
painting than anything we would build — and the loader is a few dozen lines.

It also buys something Godot's tile editor would not: a period map of the Arcole marshes can be
dropped in as a background layer and the dikes painted directly over it. Historical fidelity becomes
tracing rather than data entry.

The two resolutions are not a workaround. Elevation is smooth and low-frequency; hand-painting a
250×250 greyscale produces blotchy terrain with stair-stepping and phantom sight-blockers. Wood
edges are sharp and high-frequency and want full resolution. Different layers, different rates.

## Consequence

Terrain is opaque in a diff — a change cannot be reviewed in a pull request, and there is no way to
grep for which Scenario contains a marsh. For six battles and one author that is acceptable; a
PNG-to-JSON dump script is trivial if it stops being.

Cliffs fall out of this for free. Impassability comes from gradient as well as Ground, so an 8m cell
dropping 50m to its neighbour is impassable without anyone painting it, and the Osteria gorge at
Rivoli is a Crossing for exactly the same reason a bridge is.
