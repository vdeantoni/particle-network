export const REFERENCE_FPS = 60;

export const TRIANGLE_SHADES = ['weakest', 'average'] as const;
export type TriangleShade = (typeof TRIANGLE_SHADES)[number];

export const TRIANGLE_STYLES = ['mosaic', 'overlapping'] as const;
export type TriangleStyle = (typeof TRIANGLE_STYLES)[number];

export const POINTER_FORCES = ['off', 'attract', 'repel', 'vortex'] as const;
export type PointerForce = (typeof POINTER_FORCES)[number];

export const DEFAULT_SETTINGS = {
  paused: false,
  density: 1,
  minSpeed: 1,
  maxSpeed: 1,
  minRadius: 0.5,
  maxRadius: 1.5,
  particleColor: '#ffffff',
  linkDistance: 100,
  falloff: 2,
  lineWidth: 0.6,
  lineColor: '#ffffff',
  additive: true,
  triangles: false,
  triangleStyle: 'mosaic' as TriangleStyle,
  triangleShade: 'weakest' as TriangleShade,
  triangleColor: '#4d7cff',
  triangleOpacity: 0.3,
  triangleTransition: 400,
  pointerForce: 'off' as PointerForce,
  forceRadius: 150,
  forceStrength: 0.1,
  pointerLinks: true,
  pointerTriangles: false,
  spawnOnClick: true,
  autoSpawn: false,
  spawnRate: 10,
  spawnOverlap: false,
  spawnLifetime: 60000,
  deathDuration: 1000,
  flashlight: true,
  flashlightRadius: 200,
  flashlightBoost: 3,
  background: true,
  backgroundInner: '#0b1226',
  backgroundOuter: '#000000',
};

export type Settings = typeof DEFAULT_SETTINGS;

export const RANGES = {
  density: { min: 0.1, max: 10, step: 0.1 },
  minSpeed: { min: 0, max: 10, step: 0.01 },
  maxSpeed: { min: 0, max: 10, step: 0.01 },
  minRadius: { min: 0, max: 4, step: 0.1 },
  maxRadius: { min: 0, max: 4, step: 0.1 },
  linkDistance: { min: 10, max: 1000, step: 5 },
  falloff: { min: 0.5, max: 10, step: 0.1 },
  lineWidth: { min: 0, max: 3, step: 0.05 },
  triangleOpacity: { min: 0, max: 1, step: 0.01 },
  triangleTransition: { min: 0, max: 2000, step: 50 },
  forceRadius: { min: 50, max: 1000, step: 10 },
  forceStrength: { min: 0, max: 10, step: 0.01 },
  spawnRate: { min: 1, max: 500, step: 1 },
  spawnLifetime: { min: 100, max: 60000, step: 10 },
  deathDuration: { min: 0, max: 60000, step: 10 },
  flashlightRadius: { min: 50, max: 600, step: 10 },
  flashlightBoost: { min: 0, max: 10, step: 0.1 },
} satisfies Partial<
  Record<keyof Settings, { min: number; max: number; step: number }>
>;

const COLOR_KEYS = [
  'particleColor',
  'lineColor',
  'triangleColor',
  'backgroundInner',
  'backgroundOuter',
] as const;

const BOOLEAN_KEYS = [
  'additive',
  'triangles',
  'pointerLinks',
  'pointerTriangles',
  'spawnOnClick',
  'autoSpawn',
  'spawnOverlap',
  'flashlight',
  'background',
] as const;

export function loadSettings(key: string): Partial<Settings> {
  const settings: Partial<Settings> = {};

  let stored: unknown;
  try {
    stored = JSON.parse(localStorage.getItem(key) ?? '{}');
  } catch {
    return settings;
  }
  if (typeof stored !== 'object' || stored === null) {
    return settings;
  }

  const values = stored as Record<string, unknown>;
  for (const key of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      const { min, max } = RANGES[key];
      settings[key] = Math.min(max, Math.max(min, value));
    }
  }
  for (const key of COLOR_KEYS) {
    const value = values[key];
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
      settings[key] = value;
    }
  }
  for (const key of BOOLEAN_KEYS) {
    const value = values[key];
    if (typeof value === 'boolean') {
      settings[key] = value;
    }
  }
  const shade = TRIANGLE_SHADES.find((name) => name === values.triangleShade);
  if (shade) {
    settings.triangleShade = shade;
  }
  const style = TRIANGLE_STYLES.find((name) => name === values.triangleStyle);
  if (style) {
    settings.triangleStyle = style;
  }
  const force = POINTER_FORCES.find((name) => name === values.pointerForce);
  if (force) {
    settings.pointerForce = force;
  }

  return settings;
}

export function saveSettings(key: string, settings: Settings, base: Settings) {
  // Only values that differ from the configured ones are saved, so later
  // changes to those still reach returning visitors. Paused never is.
  const changed = Object.fromEntries(
    Object.entries(settings).filter(
      ([name, value]) =>
        name !== 'paused' && value !== base[name as keyof Settings],
    ),
  );
  try {
    localStorage.setItem(key, JSON.stringify(changed));
  } catch {
    // Storage can be disabled or full; settings then last until reload
  }
}
