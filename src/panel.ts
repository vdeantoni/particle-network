import type { GraphLogMonitorBindingApi } from '@tweakpane/core';
import { Pane, type FolderApi } from 'tweakpane';
import { RANGES, type Settings } from './settings.js';
import type { ParticleNetwork } from './particle-network.js';

// The particle total graph keeps 15 s at one point per 500 ms
const HISTORY_POINTS = 30;

// A number field for a range too wide for a slider to set small values. A max
// would draw a slider, so the field enforces it itself.
function addNumberField(
  folder: FolderApi,
  settings: Settings,
  key: 'spawnRate' | 'spawnLifetime' | 'deathDuration',
  label: string,
  keyScale: number,
) {
  const { max, ...range } = RANGES[key];
  const field = folder.addBinding(settings, key, {
    ...range,
    keyScale,
    pointerScale: keyScale / 10,
    label,
  });
  field.on('change', ({ value }) => {
    if (value > max) {
      settings[key] = max;
      field.refresh();
    }
  });
}

/** Builds the Tweakpane controls for `network` inside `container`. */
export function createPanel(network: ParticleNetwork, container: HTMLElement) {
  const { settings } = network;
  // Dragging a slider over the canvas would otherwise add a particle
  container.setAttribute('data-particle-network-ignore', '');
  const pane = new Pane({ title: 'Controls', container });
  const stats = { fps: 0, total: 0, fromDensity: 0, fromMouse: 0 };

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

  const count = pane.addFolder({ title: 'Particle count' });
  const whole = { readonly: true, format: (value: number) => value.toFixed(0) };
  const totalRow = count.addBinding(stats, 'total', whole);
  // Polled as often as the counts update, so its points match recentTotals
  const history = count.addBinding(stats, 'total', {
    ...whole,
    view: 'graph',
    interval: 500,
    bufferSize: HISTORY_POINTS,
    min: 0,
    label: 'history',
  }) as GraphLogMonitorBindingApi;
  const recentTotals: number[] = [];
  const monitors = new Set<unknown>([
    fps,
    totalRow,
    history,
    count.addBinding(stats, 'fromDensity', { ...whole, label: 'from density' }),
    count.addBinding(stats, 'fromMouse', { ...whole, label: 'from mouse' }),
  ]);

  const particles = pane.addFolder({ title: 'Particles' });
  particles.addBinding(settings, 'density', RANGES.density);
  particles.addBinding(settings, 'minSpeed', {
    ...RANGES.minSpeed,
    label: 'min speed',
  });
  particles.addBinding(settings, 'maxSpeed', {
    ...RANGES.maxSpeed,
    label: 'max speed',
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
  mouse.addBinding(settings, 'autoSpawn', { label: 'auto-fire' });
  addNumberField(mouse, settings, 'spawnRate', 'fire rate /s', 1);
  mouse.addBinding(settings, 'spawnOverlap', { label: 'fire on same spot' });
  addNumberField(mouse, settings, 'spawnLifetime', 'lifetime ms', 100);
  addNumberField(mouse, settings, 'deathDuration', 'fade out ms', 100);

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
    if (!monitors.has(event.target) && event.last) {
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
      const { total, added } = network.count();
      stats.total = total;
      stats.fromDensity = total - added;
      stats.fromMouse = added;
      recentTotals.push(total);
      if (recentTotals.length > HISTORY_POINTS) {
        recentTotals.shift();
      }
      // Fits the graph to its visible peak, so it shrinks once particles expire
      history.max = Math.max(1, ...recentTotals) * 1.25;
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
      container.removeAttribute('data-particle-network-ignore');
    },
  };
}
