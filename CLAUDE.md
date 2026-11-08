# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

The package manager is pnpm (`pnpm-lock.yaml`).

- **Dev server:** `pnpm dev` (Vite, port 5173)
- **Build:** `pnpm build` (runs `tsc && vite build`; `tsc` only type-checks because `noEmit` is on)
- **Type-check only:** `pnpm exec tsc`
- **Preview production build:** `pnpm preview`
- **Format:** `pnpm dlx prettier --write src` (Prettier isn't a devDependency; `.prettierrc` sets single quotes and trailing commas)

No test runner or linter is configured, so `pnpm build` is the only automated check.

## Architecture

This is a vanilla TypeScript canvas animation that renders a particle network: particles drift across a full-screen canvas and links are drawn between particles within `linkDistance`, with opacity based on proximity. The code says "link" for these lines; the panel's "Connections" and "Mouse" folders keep friendlier labels.

**Entry flow:** `index.html` declares `<canvas id="canvas">` and the panel elements, then loads `src/main.ts`. It loads the saved settings, starts the `ParticleNetwork` on the canvas, and creates the control panel. CSS in `src/style.css` sizes the canvas to fill the viewport.

**Core modules:**

- **Settings** (`src/lib/settings.ts`) holds `DEFAULT_SETTINGS`, the slider `RANGES`, and localStorage load and save. The `ParticleNetwork` and the panel share one mutable settings object, and the network reads it every frame, so changes apply live. Loading clamps numbers to `RANGES` and drops wrong types and non-hex colors. Saving stores only values that differ from the defaults, and never `paused`.
- **`ParticleNetwork`** (`src/lib/particle-network.ts`) owns the `requestAnimationFrame` loop. Each frame it fits the canvas, draws the background, moves and wraps particles (unless paused), then draws links and particles on top. Links use a grid of `linkDistance`-wide cells over the wrap area, so each particle is only compared with particles in its own and neighboring cells. Line opacity is `(1 - distance / linkDistance) ** falloff`, rounded to `ALPHA_LEVELS` steps so all lines of one level go in a single `Path2D` and one `stroke()`. Opacity is applied with `globalAlpha` rather than `rgba()` strings, which are costly to parse per particle. With triangles on, `fillTriangles()` fills triangles under the lines, shaded by their weakest or average edge level. The `mosaic` style takes the Delaunay triangulation (via `delaunator`) and keeps triangles whose edges are all links: they never overlap and number at most two per particle. The `overlapping` style fills every mutually linked triple, found from the per-particle `adjacency` recorded during the link pass (grid cells hold particle indices for this); its count grows with the square of each particle's neighbor count, so it gets slow when dense. Each triangle is filled on its own, because a single fill draws overlapping shapes once and batching made overlaps flicker. Per-triangle opacity lives in `fades`, keyed by the three particle indices, and eases toward its target over `triangleTransition` ms, including fading out after an edge breaks.
- **`Particle`** (`src/lib/particle.ts`) holds position, a velocity inside the unit disk, and a `size` from 0 to 1. The network scales them by `maxSpeed` and the radius range at draw time, so those settings apply to existing particles.
- **Pointer interactions** live in the `ParticleNetwork`; `src/main.ts` forwards canvas pointer events to `setPointer`, `clearPointer` and `emitShockwave`. Forces never change a particle's own drift: they add to its `pushX`/`pushY`, which decays by `PUSH_DECAY` per reference frame so pushed particles settle back. The `pointerForce` modes (attract, repel, vortex) apply within `forceRadius`. A shockwave ring kicks each particle once, tracked in the wave's `hit` set, because a kicked particle can move ahead of the ring. Pointer links add lines from the pointer to particles within `linkDistance`. Pointer triangles join the pointer to pairs of particles linked to it and to each other (all pairs when overlapping, angular neighbors when mosaic). They share the triangle fades with `POINTER_INDEX` as their third index and vanish when the pointer leaves. The flashlight multiplies line and triangle opacity near the pointer.
- **Panel** (`src/panel.ts`) builds the Tweakpane controls, hidden until the toggle button or the `h` key opens them. It saves settings on each finished change, skipping the FPS monitor, which emits `change` on every poll.

Behavior that spans these files:

- `REFERENCE_FPS` in `settings.ts` only sets the unit of time, not a frame cap. The loop runs at the display's rAF rate, and `delta` is elapsed time in units of `1000 / REFERENCE_FPS` ms (`FRAME_MS`), so `maxSpeed` is pixels per reference frame.
- The wrap area is the canvas plus a `linkDistance` margin on every side, so lines fade out before a particle jumps to the other side. Wrapping is modular, so a huge `delta` after the tab was hidden doesn't pile particles onto the boundary.
- Particle count and spawn positions cover the whole wrap area, so the visible density matches `density`.
- `fit()` runs every frame and acts when the canvas's CSS size, `devicePixelRatio`, `linkDistance` or `density` changes. On a size change it sizes the backing store in device pixels and scales the context, so all simulation and drawing code works in CSS pixels. It then stretches existing particles to the new wrap area, rebuilds the grid, and adds or removes particles to keep the density.

## Tech Stack

- TypeScript (strict mode, ES2023 target)
- Vite 8 (bundler/dev server, uses Rolldown), no `vite.config`, so Vite defaults apply
- No framework: direct Canvas 2D API
- Runtime dependencies: Tweakpane 4 for the control panel, and `delaunator` for the mosaic triangles. Tweakpane's type declarations import `@tweakpane/core`, so that devDependency is required for `tsc` even though nothing imports it directly.
