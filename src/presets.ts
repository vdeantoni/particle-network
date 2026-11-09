import { parseSettings, type Settings } from './settings.js';

/** Looks the panel offers besides the page's own settings, applied over `DEFAULT_SETTINGS`. */
export const BUILT_IN_PRESETS: Record<string, Partial<Settings>> = {
  Classic: {},
  Mosaic: {
    density: 0.8,
    minSpeed: 0,
    maxSpeed: 0.4,
    minRadius: 0,
    maxRadius: 0,
    linkDistance: 160,
    lineWidth: 0,
    triangles: true,
    triangleColor: '#ffffff',
    triangleOpacity: 0.29,
    triangleTransition: 750,
    pointerLinks: false,
    pointerForce: 'repel',
    backgroundInner: '#1a1a1a',
    backgroundOuter: '#050505',
  },
  Constellation: {
    density: 0.3,
    minSpeed: 0.05,
    maxSpeed: 0.3,
    minRadius: 0.8,
    maxRadius: 2.5,
    particleColor: '#fff4dc',
    linkDistance: 200,
    falloff: 3,
    lineWidth: 0.5,
    lineColor: '#c8d4ff',
    backgroundInner: '#0a1030',
    backgroundOuter: '#000000',
  },
  Web: {
    minSpeed: 0.2,
    maxSpeed: 0.6,
    minRadius: 0,
    maxRadius: 1,
    particleColor: '#7fdcff',
    linkDistance: 110,
    falloff: 1.5,
    lineWidth: 0.4,
    lineColor: '#7fdcff',
    triangles: true,
    triangleStyle: 'overlapping',
    triangleShade: 'average',
    triangleColor: '#2a6cff',
    triangleOpacity: 0.12,
    pointerTriangles: true,
    backgroundInner: '#06121f',
    backgroundOuter: '#000000',
  },
  Paint: {
    density: 0.2,
    minSpeed: 0,
    maxSpeed: 0.3,
    minRadius: 1,
    maxRadius: 3,
    particleColor: '#ff7ad9',
    linkDistance: 80,
    lineColor: '#ffb347',
    pointerLinks: false,
    autoSpawn: true,
    spawnRate: 60,
    spawnLifetime: 3000,
    deathDuration: 1500,
    flashlight: false,
    backgroundInner: '#1a0626',
    backgroundOuter: '#000000',
  },
};

export interface SavedPreset {
  name: string;
  settings: Partial<Settings>;
}

export interface SavedPresets {
  // The panel's key for the preset last chosen
  selected?: string;
  presets: SavedPreset[];
}

export function loadPresets(key: string): SavedPresets {
  let stored: unknown;
  try {
    stored = JSON.parse(localStorage.getItem(key) ?? '{}');
  } catch {
    return { presets: [] };
  }
  const { selected, presets } =
    typeof stored === 'object' && stored !== null
      ? (stored as Record<string, unknown>)
      : {};

  return {
    selected: typeof selected === 'string' ? selected : undefined,
    presets: (Array.isArray(presets) ? presets : []).flatMap(
      (preset: unknown) => {
        const { name, settings } = (preset ?? {}) as Record<string, unknown>;
        return typeof name === 'string' && name.trim() !== ''
          ? [{ name, settings: parseSettings(settings) }]
          : [];
      },
    ),
  };
}

export function savePresets(key: string, saved: SavedPresets) {
  try {
    localStorage.setItem(key, JSON.stringify(saved));
  } catch {
    // Storage can be disabled or full; presets then last until reload
  }
}
