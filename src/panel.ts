import type { GraphLogMonitorBindingApi } from '@tweakpane/core';
import {
  Pane,
  type BladeApi,
  type FolderApi,
  type ListBladeApi,
  type TextBladeApi,
} from 'tweakpane';
import { DEFAULT_SETTINGS, RANGES, same, type Settings } from './settings.js';
import type { ParticleNetwork } from './particle-network.js';
import {
  BUILT_IN_PRESETS,
  loadPresets,
  savePresets,
  type SavedPreset,
} from './presets.js';

// The particle total graph keeps 15 s at one point per 500 ms
const HISTORY_POINTS = 30;

// A preset sets everything but pause
const PRESET_KEYS = (
  Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]
).filter((key) => key !== 'paused');

function presetValues(settings: Settings): Partial<Settings> {
  return Object.fromEntries(PRESET_KEYS.map((key) => [key, settings[key]]));
}

interface PresetChoice {
  // Prefixed, since the page or a later version can add a built-in named like
  // a saved preset
  key: string;
  name: string;
  builtIn: boolean;
  values: Settings;
}

const DEFAULT_PRESET = 'default';
const savedKey = (name: string) => `saved:${name}`;

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

// The network caps at the max, so a min dragged above it would do nothing.
// Dragging either end past the other pulls the other along instead.
function addRange(
  folder: FolderApi,
  settings: Settings,
  [minKey, maxKey]: ['minSpeed', 'maxSpeed'] | ['minRadius', 'maxRadius'],
  name: string,
) {
  const low = folder.addBinding(settings, minKey, {
    ...RANGES[minKey],
    label: `min ${name}`,
  });
  const high = folder.addBinding(settings, maxKey, {
    ...RANGES[maxKey],
    label: `max ${name}`,
  });
  low.on('change', ({ value }) => {
    if (value > settings[maxKey]) {
      settings[maxKey] = value;
      high.refresh();
    }
  });
  high.on('change', ({ value }) => {
    if (value < settings[minKey]) {
      settings[minKey] = value;
      low.refresh();
    }
  });
}

export interface PanelOptions {
  /**
   * Looks offered besides the page's own settings, applied over
   * `DEFAULT_SETTINGS`. Defaults to `BUILT_IN_PRESETS`.
   */
  presets?: Record<string, Partial<Settings>>;
}

/** Builds the Tweakpane controls for `network` inside `container`. */
export function createPanel(
  network: ParticleNetwork,
  container: HTMLElement,
  { presets: builtIns = BUILT_IN_PRESETS }: PanelOptions = {},
) {
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

  const presetsKey = network.storageKey && `${network.storageKey}-presets`;
  const stored = presetsKey ? loadPresets(presetsKey) : { presets: [] };
  let saved = stored.presets;
  const choices = (): PresetChoice[] => [
    {
      key: DEFAULT_PRESET,
      name: 'Default',
      builtIn: true,
      values: network.defaults,
    },
    ...Object.entries(builtIns).map(([name, values]) => ({
      key: `built-in:${name}`,
      name,
      builtIn: true,
      values: { ...DEFAULT_SETTINGS, ...values },
    })),
    ...saved.map(({ name, settings }) => ({
      key: savedKey(name),
      name,
      builtIn: false,
      values: { ...DEFAULT_SETTINGS, ...settings },
    })),
  ];
  const exists = (key?: string) =>
    choices().some((choice) => choice.key === key);
  let selected = exists(stored.selected) ? stored.selected! : DEFAULT_PRESET;
  const current = () => choices().find((choice) => choice.key === selected)!;
  const isModified = (choice: PresetChoice) =>
    PRESET_KEYS.some((key) => !same(settings[key], choice.values[key]));
  const store = (change = (presets: SavedPreset[]) => presets) => {
    saved = change(saved);
    if (presetsKey) {
      savePresets(presetsKey, { selected, presets: saved });
    }
  };

  const presetList = pane.addBlade({
    view: 'list',
    label: 'preset',
    options: [{ text: current().name, value: selected }],
    value: selected,
  }) as ListBladeApi<string>;
  const nameField = pane.addBlade({
    view: 'text',
    label: 'name',
    parse: (value: string) => value.trim(),
    value: current().name,
  }) as TextBladeApi<string>;
  // The field only commits on blur or Enter, too late to enable the buttons
  const nameInput = nameField.element.querySelector('input')!;
  const typedName = () => nameInput.value.trim();
  const saveButton = pane.addButton({ title: 'Save' });
  const saveNewButton = pane.addButton({ title: 'Save as new' });
  const deleteButton = pane.addButton({ title: 'Delete' });
  const revertButton = pane.addButton({ title: 'Revert changes' });
  pane.addBlade({ view: 'separator' });

  pane.addBinding(settings, 'paused', { label: 'pause' });
  pane
    .addButton({ title: 'Randomize particles' })
    .on('click', () => network.randomize());

  const particles = pane.addFolder({ title: 'Particles' });
  particles.addBinding(settings, 'density', RANGES.density);
  addRange(particles, settings, ['minSpeed', 'maxSpeed'], 'speed');
  addRange(particles, settings, ['minRadius', 'maxRadius'], 'radius');
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
  // Monitors emit change on every poll, and the preset controls handle their own
  const notSettings = new Set<unknown>([
    presetList,
    nameField,
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
  const syncPresets = () => {
    const all = choices();
    const chosen = all.find((choice) => choice.key === selected)!;
    const modified = isModified(chosen);
    presetList.options = all.map(({ key, name }) => ({
      text: key === selected && modified ? `${name} (modified)` : name,
      value: key,
    }));
    presetList.value = selected;

    const name = typedName();
    const taken = all.some(
      (choice) => choice.name === name && choice !== chosen,
    );
    saveButton.disabled =
      chosen.builtIn ||
      name === '' ||
      taken ||
      (!modified && name === chosen.name);
    saveNewButton.disabled = name === '' || taken || name === chosen.name;
    deleteButton.disabled = chosen.builtIn;
    revertButton.disabled = !modified;
  };
  const apply = (values: Settings) => {
    Object.assign(settings, presetValues(values));
    network.save();
    pane.refresh();
    syncEnabled();
    syncPresets();
  };

  presetList.on('change', ({ value }) => {
    // Also fires when syncPresets() sets the value
    if (value === selected) {
      return;
    }
    selected = value;
    store();
    nameField.value = current().name;
    apply(current().values);
  });
  nameInput.addEventListener('input', syncPresets);
  saveButton.on('click', () => {
    const previous = current().name;
    const preset = { name: typedName(), settings: presetValues(settings) };
    selected = savedKey(preset.name);
    store((presets) =>
      presets.map((other) => (other.name === previous ? preset : other)),
    );
    nameField.value = preset.name;
    syncPresets();
  });
  saveNewButton.on('click', () => {
    const preset = { name: typedName(), settings: presetValues(settings) };
    selected = savedKey(preset.name);
    store((presets) => [...presets, preset]);
    nameField.value = preset.name;
    syncPresets();
  });
  deleteButton.on('click', () => {
    const { name } = current();
    if (!window.confirm(`Delete the preset "${name}"?`)) {
      return;
    }
    selected = DEFAULT_PRESET;
    store((presets) => presets.filter((preset) => preset.name !== name));
    nameField.value = current().name;
    syncPresets();
  });
  revertButton.on('click', () => apply(current().values));
  // Keeps the list current while another tab saves or deletes presets
  const reload = (event: StorageEvent) => {
    if (presetsKey && event.key === presetsKey) {
      saved = loadPresets(presetsKey).presets;
      if (!exists(selected)) {
        selected = DEFAULT_PRESET;
      }
      syncPresets();
    }
  };
  window.addEventListener('storage', reload);

  syncEnabled();
  syncPresets();
  pane.on('change', (event) => {
    if (notSettings.has(event.target)) {
      return;
    }
    syncEnabled();
    syncPresets();
    if (event.last) {
      network.save();
    }
  });
  const unsubscribe = network.onChange(() => {
    pane.refresh();
    syncEnabled();
    syncPresets();
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
      window.removeEventListener('storage', reload);
      unsubscribe();
      pane.dispose();
      container.removeAttribute('data-particle-network-ignore');
    },
  };
}
