import type { GraphLogMonitorBindingApi } from '@tweakpane/core';
import { Pane, type BladeApi, type FolderApi } from 'tweakpane';
import { RANGES, type Settings } from './settings.js';
import type { ParticleNetwork } from './particle-network.js';

// The particle total graph keeps 15 s at one point per 500 ms
const HISTORY_POINTS = 30;

// A number field for a range too wide for a slider to set small values. A max
// would draw a slider, so the field enforces it itself.
function addNumberField(
  folder: FolderApi,
  settings: Settings,
  key:
    | 'forceStrength'
    | 'spawnCount'
    | 'spawnSpread'
    | 'spawnRate'
    | 'spawnLifetime'
    | 'deathDuration',
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
  return field;
}

/** Builds the Tweakpane controls for `network` inside `container`. */
export function createPanel(network: ParticleNetwork, container: HTMLElement) {
  const { settings } = network;
  // Dragging a slider over the canvas would otherwise add a particle
  container.setAttribute('data-particle-network-ignore', '');
  const pane = new Pane({ title: 'Controls', container });
  const stats = { fps: 0, total: 0, fromDensity: 0, fromMouse: 0 };

  // Controls that do nothing while another setting is off, greyed out then
  const dependents: [BladeApi, () => boolean][] = [];
  const enabledWhile = (enabled: () => boolean, ...blades: BladeApi[]) => {
    blades.forEach((blade) => dependents.push([blade, enabled]));
  };

  pane.addBinding(settings, 'paused', { label: 'pause' });
  pane
    .addButton({ title: 'Randomize particles' })
    .on('click', () => network.randomize());

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

  const links = pane.addFolder({ title: 'Links' });
  links.addBinding(settings, 'linkDistance', {
    ...RANGES.linkDistance,
    label: 'distance',
  });
  links.addBinding(settings, 'falloff', RANGES.falloff);
  links.addBinding(settings, 'lineWidth', {
    ...RANGES.lineWidth,
    label: 'width',
  });
  links.addBinding(settings, 'lineColor', { label: 'color' });
  links.addBinding(settings, 'additive', { label: 'glow' });

  const triangles = pane.addFolder({ title: 'Triangles' });
  triangles.addBinding(settings, 'triangles', { label: 'fill' });
  // Triangles at the cursor use these too
  enabledWhile(
    () => settings.triangles || settings.pointerTriangles,
    triangles.addBinding(settings, 'triangleStyle', {
      label: 'style',
      options: {
        mosaic: 'mosaic',
        'overlapping (slow when dense)': 'overlapping',
      },
    }),
    triangles.addBinding(settings, 'triangleShade', {
      label: 'shade by',
      options: { 'weakest edge': 'weakest', 'average edge': 'average' },
    }),
    triangles.addBinding(settings, 'triangleColor', { label: 'color' }),
    triangles.addBinding(settings, 'triangleOpacity', {
      ...RANGES.triangleOpacity,
      label: 'opacity',
    }),
    triangles.addBinding(settings, 'triangleTransition', {
      ...RANGES.triangleTransition,
      label: 'fade ms',
    }),
  );

  const cursor = pane.addFolder({ title: 'Cursor' });
  cursor.addBinding(settings, 'pointerLinks', { label: 'links' });
  cursor.addBinding(settings, 'pointerTriangles', { label: 'triangles' });
  cursor.addBlade({ view: 'separator' });
  cursor.addBinding(settings, 'pointerForce', {
    label: 'force',
    options: {
      off: 'off',
      attract: 'attract',
      repel: 'repel',
      vortex: 'vortex',
    },
  });
  enabledWhile(
    () => settings.pointerForce !== 'off',
    cursor.addBinding(settings, 'forceRadius', {
      ...RANGES.forceRadius,
      label: 'radius',
    }),
    addNumberField(cursor, settings, 'forceStrength', 'strength', 0.1),
  );
  cursor.addBlade({ view: 'separator' });
  cursor.addBinding(settings, 'flashlight');
  enabledWhile(
    () => settings.flashlight,
    cursor.addBinding(settings, 'flashlightRadius', {
      ...RANGES.flashlightRadius,
      label: 'radius',
    }),
    cursor.addBinding(settings, 'flashlightBoost', {
      ...RANGES.flashlightBoost,
      label: 'boost',
    }),
  );

  const spawning = pane.addFolder({ title: 'Spawning' });
  spawning.addBinding(settings, 'spawnOnClick', { label: 'add on click' });
  const clicking = () => settings.spawnOnClick;
  enabledWhile(
    clicking,
    addNumberField(spawning, settings, 'spawnCount', 'per click', 1),
    addNumberField(spawning, settings, 'spawnSpread', 'spread px', 10),
  );
  spawning.addBlade({ view: 'separator' });
  // Auto-fire only runs while clicks add particles
  enabledWhile(
    clicking,
    spawning.addBinding(settings, 'autoSpawn', { label: 'auto-fire' }),
  );
  enabledWhile(
    () => settings.spawnOnClick && settings.autoSpawn,
    addNumberField(spawning, settings, 'spawnRate', 'rate /s', 1),
    spawning.addBinding(settings, 'spawnOverlap', { label: 'allow overlap' }),
  );
  spawning.addBlade({ view: 'separator' });
  enabledWhile(
    clicking,
    addNumberField(spawning, settings, 'spawnLifetime', 'lifetime ms', 100),
    addNumberField(spawning, settings, 'deathDuration', 'fade out ms', 100),
  );

  const background = pane.addFolder({ title: 'Background' });
  background.addBinding(settings, 'background', { label: 'fill' });
  enabledWhile(
    () => settings.background,
    background.addBinding(settings, 'backgroundInner', { label: 'center' }),
    background.addBinding(settings, 'backgroundOuter', { label: 'edges' }),
  );

  pane
    .addButton({ title: 'Reset to defaults' })
    .on('click', () => network.reset());

  const statsFolder = pane.addFolder({ title: 'Stats' });
  const fps = statsFolder.addBinding(stats, 'fps', {
    readonly: true,
    view: 'graph',
    min: 0,
    max: 150,
  });
  const whole = { readonly: true, format: (value: number) => value.toFixed(0) };
  const totalRow = statsFolder.addBinding(stats, 'total', {
    ...whole,
    label: 'particles',
  });
  // Polled as often as the counts update, so its points match recentTotals
  const history = statsFolder.addBinding(stats, 'total', {
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
    statsFolder.addBinding(stats, 'fromDensity', {
      ...whole,
      label: 'from density',
    }),
    statsFolder.addBinding(stats, 'fromMouse', {
      ...whole,
      label: 'from mouse',
    }),
  ]);

  const syncEnabled = () => {
    dependents.forEach(([blade, enabled]) => {
      blade.disabled = !enabled();
    });
  };
  syncEnabled();
  pane.on('change', (event) => {
    // Monitors emit change on every poll, not only on user input
    if (monitors.has(event.target)) {
      return;
    }
    syncEnabled();
    if (event.last) {
      network.save();
    }
  });
  const unsubscribe = network.onChange(() => {
    pane.refresh();
    syncEnabled();
  });

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
