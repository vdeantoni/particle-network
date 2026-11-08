# @vdeantoni/particle-network

![Animation](https://miro.medium.com/max/1400/1*a4tiXdRcOxYEQn-SyV6Jcw.png)

Particles drift across a canvas, and a line links each pair closer than the link distance. Lines fade as their particles move apart, and the triangles they form can be filled. The pointer can attract, repel or swirl particles, and pressing adds a particle that you can drag into place. An optional panel exposes every setting.

[Live demo](https://particle-network-live.vercel.app/), where `h` or the button in the top-right corner opens the panel.

## Install

```sh
pnpm add @vdeantoni/particle-network
```

The package is ESM only. The React components need React 19 or later.

## Usage

### Plain JavaScript

```ts
import { ParticleNetwork } from '@vdeantoni/particle-network';

const network = new ParticleNetwork(canvas, {
  settings: { density: 0.8, triangles: true },
});

// When the canvas goes away
network.destroy();
```

The animation starts right away. The canvas takes whatever size your CSS gives it and follows resizes and the device pixel ratio, so give it a size, such as `width: 100%; height: 100%`.

### Settings panel

```ts
import { createPanel } from '@vdeantoni/particle-network/panel';

const panel = createPanel(network, document.getElementById('panel'));

// Later
panel.destroy();
```

The panel is built with [Tweakpane](https://tweakpane.github.io/docs/), which is 31 KB gzipped against 6.4 KB for the animation. It lives in its own entry point, so it's only bundled when you import it. Showing, hiding and positioning its container is up to you.

### React

```tsx
'use client';

import { useState } from 'react';
import type { ParticleNetwork } from '@vdeantoni/particle-network';
import {
  ParticleNetworkCanvas,
  ParticleNetworkPanel,
} from '@vdeantoni/particle-network/react';

export function Hero() {
  const [network, setNetwork] = useState<ParticleNetwork | null>(null);

  return (
    <section className="relative isolate">
      <ParticleNetworkCanvas
        ref={setNetwork}
        pointerTarget="window"
        settings={{ background: false }}
        className="absolute inset-0 -z-10 size-full"
      />
      {/* Page content */}
      {network && (
        <ParticleNetworkPanel
          network={network}
          className="fixed right-4 top-4"
        />
      )}
    </section>
  );
}
```

`ref` receives the `ParticleNetwork`, which the panel needs. Changes to the `settings` prop apply live. Only keys whose values changed are applied, so an inline object doesn't undo panel edits on every render, and a key you remove goes back to its default. `<ParticleNetworkPanel>` loads Tweakpane when it first renders, so pages that never show it never download it.

### Behind page content

A canvas behind text and buttons never receives pointer events, because the content on top of it does. Pass `pointerTarget: 'window'` to follow the pointer over the whole page instead. The pointer only counts while it's over the canvas's area. Presses on links, buttons, form controls, the panel, and anything inside an element with a `data-particle-network-ignore` attribute don't add particles. Turn `background` off to let the page's own background show through.

## Options

| Option                 | Default    | Description                                                                             |
| ---------------------- | ---------- | --------------------------------------------------------------------------------------- |
| `settings`             | `{}`       | Settings merged over the defaults. `reset()` returns to these.                          |
| `pointerTarget`        | `'canvas'` | Where pointer events are read: `'canvas'`, `'window'` or an element.                    |
| `storageKey`           | none       | Saves panel changes in localStorage under this key and restores them on the next visit. |
| `respectReducedMotion` | `true`     | Holds particles still when the user prefers reduced motion.                             |

The animation pauses while the canvas is off screen.

## Methods

| Method               | Description                                                                        |
| -------------------- | ---------------------------------------------------------------------------------- |
| `settings`           | The live settings object, read every frame.                                        |
| `set(settings)`      | Changes settings and makes them what `reset()` returns to.                         |
| `reset()`            | Drops changes made in the panel.                                                   |
| `randomize()`        | Replaces every particle with a new random one.                                     |
| `onChange(listener)` | Calls `listener` after `set()` or `reset()`. Returns a function that unsubscribes. |
| `destroy()`          | Stops the animation and removes its event listeners.                               |

## Settings

Colors are hex strings like `'#4d7cff'`, which the panel's color pickers need.

| Setting                  | Default      | Description                                                                                                            |
| ------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `paused`                 | `false`      | Stops the particles. Links and pointer effects keep updating.                                                          |
| `density`                | `1`          | Particles per 5,000 px² of canvas.                                                                                     |
| `maxSpeed`               | `0.15`       | Fastest drift, in px per 1/60 s.                                                                                       |
| `minRadius`, `maxRadius` | `0.5`, `1.5` | Range of particle radii, in px.                                                                                        |
| `particleColor`          | `'#ffffff'`  |                                                                                                                        |
| `linkDistance`           | `100`        | Particles closer than this many px are linked.                                                                         |
| `falloff`                | `2`          | How fast a link fades with distance. Higher values fade sooner.                                                        |
| `lineWidth`              | `0.6`        | Link width in px.                                                                                                      |
| `lineColor`              | `'#ffffff'`  |                                                                                                                        |
| `additive`               | `true`       | Overlapping lines add up and glow. Turn it off on light backgrounds, where the glow fades to white.                    |
| `triangles`              | `false`      | Fills the triangles that links form.                                                                                   |
| `triangleStyle`          | `'mosaic'`   | `'mosaic'` triangles never overlap and stay fast. `'overlapping'` fills every linked triple and slows down when dense. |
| `triangleShade`          | `'weakest'`  | Shades each triangle by its `'weakest'` or `'average'` link.                                                           |
| `triangleColor`          | `'#4d7cff'`  |                                                                                                                        |
| `triangleOpacity`        | `0.3`        |                                                                                                                        |
| `triangleTransition`     | `400`        | Milliseconds a triangle takes to fade in or out.                                                                       |
| `pointerForce`           | `'off'`      | `'attract'`, `'repel'` or `'vortex'` moves particles near the pointer.                                                 |
| `forceRadius`            | `150`        | Reach of the pointer force, in px.                                                                                     |
| `forceStrength`          | `0.1`        |                                                                                                                        |
| `pointerLinks`           | `true`       | Links the pointer to nearby particles.                                                                                 |
| `pointerTriangles`       | `false`      | Fills triangles between the pointer and pairs of linked particles.                                                     |
| `spawnOnClick`           | `true`       | Pressing adds a particle, which follows the pointer until release.                                                     |
| `flashlight`             | `true`       | Brightens links and triangles near the pointer.                                                                        |
| `flashlightRadius`       | `200`        | Reach of the flashlight, in px.                                                                                        |
| `flashlightBoost`        | `3`          | Opacity at the pointer is multiplied by 1 + this.                                                                      |
| `background`             | `true`       | Paints a radial gradient. Off leaves the canvas transparent.                                                           |
| `backgroundInner`        | `'#0b1226'`  | Gradient color at the center.                                                                                          |
| `backgroundOuter`        | `'#000000'`  | Gradient color at the edges.                                                                                           |

`DEFAULT_SETTINGS` and the panel's slider `RANGES` are exported too.

## Development

```sh
pnpm install
pnpm dev          # demo at http://localhost:5173
pnpm build        # library into dist/
pnpm build:demo   # demo site into dist-demo/
```
