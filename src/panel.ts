import { Pane } from 'tweakpane';
import { RANGES } from './settings';
import type { ParticleNetwork } from './particle-network';

/** Builds the Tweakpane controls for `network` inside `container`. */
export function createPanel(network: ParticleNetwork, container: HTMLElement) {
  const { settings } = network;
  const pane = new Pane({ title: 'Controls', container });
  const stats = { fps: 0 };

  const simulation = pane.addFolder({ title: 'Simulation' });
  simulation.addBinding(settings, 'paused');
  simulation
    .addButton({ title: 'Randomize particles' })
    .on('click', () => network.randomize());
  const fps = simulation.addBinding(stats, 'fps', {
    readonly: true,
    view: 'graph',
    min: 0,
    max: 150,
  });

  const particles = pane.addFolder({ title: 'Particles' });
  particles.addBinding(settings, 'density', RANGES.density);
  particles.addBinding(settings, 'maxSpeed', {
    ...RANGES.maxSpeed,
    label: 'speed',
  });
  particles.addBinding(settings, 'minRadius', {
    ...RANGES.minRadius,
    label: 'min radius',
  });
  particles.addBinding(settings, 'maxRadius', {
    ...RANGES.maxRadius,
    label: 'max radius',
  });
  particles.addBinding(settings, 'particleColor', { label: 'color' });

  const connections = pane.addFolder({ title: 'Connections' });
  connections.addBinding(settings, 'linkDistance', {
    ...RANGES.linkDistance,
    label: 'distance',
  });
  connections.addBinding(settings, 'falloff', RANGES.falloff);
  connections.addBinding(settings, 'lineWidth', {
    ...RANGES.lineWidth,
    label: 'width',
  });
  connections.addBinding(settings, 'lineColor', { label: 'color' });
  connections.addBinding(settings, 'additive', { label: 'glow' });

  const triangles = pane.addFolder({ title: 'Triangles' });
  triangles.addBinding(settings, 'triangles', { label: 'fill' });
  triangles.addBinding(settings, 'triangleStyle', {
    label: 'style',
    options: {
      mosaic: 'mosaic',
      'overlapping (slow when dense)': 'overlapping',
    },
  });
  triangles.addBinding(settings, 'triangleShade', {
    label: 'shade by',
    options: { 'weakest edge': 'weakest', 'average edge': 'average' },
  });
  triangles.addBinding(settings, 'triangleColor', { label: 'color' });
  triangles.addBinding(settings, 'triangleOpacity', {
    ...RANGES.triangleOpacity,
    label: 'opacity',
  });
  triangles.addBinding(settings, 'triangleTransition', {
    ...RANGES.triangleTransition,
    label: 'transition ms',
  });

  const mouse = pane.addFolder({ title: 'Mouse' });
  mouse.addBinding(settings, 'pointerForce', {
    label: 'force',
    options: {
      off: 'off',
      attract: 'attract',
      repel: 'repel',
      vortex: 'vortex',
    },
  });
  mouse.addBinding(settings, 'forceRadius', {
    ...RANGES.forceRadius,
    label: 'radius',
  });
  mouse.addBinding(settings, 'forceStrength', {
    ...RANGES.forceStrength,
    label: 'strength',
  });
  mouse.addBinding(settings, 'pointerLinks', { label: 'cursor links' });
  mouse.addBinding(settings, 'pointerTriangles', {
    label: 'cursor triangles',
  });
  mouse.addBinding(settings, 'spawnOnClick', {
    label: 'click adds particle',
  });

  const flashlight = pane.addFolder({ title: 'Flashlight' });
  flashlight.addBinding(settings, 'flashlight', { label: 'on' });
  flashlight.addBinding(settings, 'flashlightRadius', {
    ...RANGES.flashlightRadius,
    label: 'radius',
  });
  flashlight.addBinding(settings, 'flashlightBoost', {
    ...RANGES.flashlightBoost,
    label: 'boost',
  });

  const background = pane.addFolder({ title: 'Background' });
  background.addBinding(settings, 'background', { label: 'fill' });
  background.addBinding(settings, 'backgroundInner', { label: 'center' });
  background.addBinding(settings, 'backgroundOuter', { label: 'edges' });

  pane
    .addButton({ title: 'Reset to defaults' })
    .on('click', () => network.reset());

  pane.on('change', (event) => {
    // Monitors emit change on every poll, not only on user input
    if (event.target !== fps && event.last) {
      network.save();
    }
  });
  const unsubscribe = network.onChange(() => pane.refresh());

  let frames = 0;
  let since = performance.now();
  let frameRequest = 0;
  const countFrames = (now: number) => {
    frames++;
    if (now - since >= 500) {
      stats.fps = Math.round((frames * 1000) / (now - since));
      frames = 0;
      since = now;
    }
    frameRequest = window.requestAnimationFrame(countFrames);
  };
  frameRequest = window.requestAnimationFrame(countFrames);

  return {
    /** Removes the controls and stops the FPS monitor. */
    destroy() {
      window.cancelAnimationFrame(frameRequest);
      unsubscribe();
      pane.dispose();
    },
  };
}
