import Delaunator from 'delaunator';
import { Particle } from './particle.js';
import {
  DEFAULT_SETTINGS,
  REFERENCE_FPS,
  loadSettings,
  saveSettings,
  type Settings,
} from './settings.js';

const FRAME_MS = 1000 / REFERENCE_FPS;
const ALPHA_LEVELS = 32;
// Push velocity keeps this share per reference frame, settling in about a second
const PUSH_DECAY = 0.95;
// Inward pull mixed into the vortex swirl so particles orbit instead of flying off
const VORTEX_PULL = 0.35;
// Cells are as wide as the link distance, so linked particles share a cell
// or touch. Only half the neighbors are listed so each cell pair is visited once.
const NEIGHBORS = [
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function wrap(value: number, size: number, margin: number) {
  const span = size + 2 * margin;
  return ((((value + margin) % span) + span) % span) - margin;
}

// Float rounding in wrap() can land a particle just outside the grid
function cellIndex(value: number, count: number, cellSize: number) {
  const index = Math.floor(value / cellSize) + 1;
  return Math.min(count - 1, Math.max(0, index));
}

function levelAt(distance: number, maxDistance: number, falloff: number) {
  if (distance >= maxDistance) {
    return 0;
  }
  return Math.round((1 - distance / maxDistance) ** falloff * ALPHA_LEVELS);
}

function linkLevel(
  particle: Particle,
  other: Particle,
  maxDistance: number,
  falloff: number,
) {
  return levelAt(particle.distance(other), maxDistance, falloff);
}

interface TriangleFade {
  a: number;
  b: number;
  c: number;
  opacity: number;
  frame: number;
}

type TriangleVisitor = (
  a: number,
  b: number,
  c: number,
  ab: number,
  bc: number,
  ac: number,
) => void;

// Particle indices stay below 2^17, so a triangle's three pack exactly into a key
const INDEX_LIMIT = 2 ** 17;
// Stands in for the pointer as a triangle vertex; no particle index reaches it
const POINTER_INDEX = INDEX_LIMIT - 1;

function triangleKey(a: number, b: number, c: number) {
  return (a * INDEX_LIMIT + b) * INDEX_LIMIT + c;
}

interface PointerLink {
  index: number;
  level: number;
}

// Presses on these belong to the page or the panel, so they don't add a particle
const IGNORED =
  'a, button, input, select, textarea, label, [role="button"], [data-particle-network-ignore]';

function isIgnored(target: EventTarget | null) {
  return target instanceof Element && target.closest(IGNORED) !== null;
}

// A spread would copy undefined values over the defaults
function definedValues(settings: Partial<Settings>) {
  return Object.fromEntries(
    Object.entries(settings).filter(([, value]) => value !== undefined),
  ) as Partial<Settings>;
}

export interface ParticleNetworkOptions {
  /** Merged over `DEFAULT_SETTINGS`; `reset()` returns to these. */
  settings?: Partial<Settings>;
  /**
   * Where pointer events are read. Use `'window'` for a canvas behind page
   * content, which never receives pointer events itself. Defaults to the canvas.
   */
  pointerTarget?: 'canvas' | 'window' | HTMLElement;
  /** Saves panel changes in localStorage under this key and restores them. */
  storageKey?: string;
  /** Holds particles still when the user prefers reduced motion. Defaults to true. */
  respectReducedMotion?: boolean;
}

export class ParticleNetwork {
  /** The live settings, read every frame. Change them with `set()`. */
  public readonly settings: Settings;
  private base: Settings;
  private storageKey?: string;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private cells: number[][] = [];
  // adjacency[a] holds [b, level, b, level, ...] for each link to a later b
  private adjacency: number[][] = [];
  private fades = new Map<number, TriangleFade>();
  private coords = new Float64Array(0);
  private delaunay?: Delaunator<Float64Array>;
  private frame = 0;
  private pointer: { x: number; y: number } | null = null;
  // Kept in viewport coordinates and mapped every frame, so the pointer stays
  // put when the page scrolls under a still mouse
  private client: { x: number; y: number } | null = null;
  private hovered: EventTarget | null = null;
  // Added by the current press, and pinned to the pointer until release
  private held: Particle | null = null;
  // Particles owed by autoSpawn, up to one
  private spawnDue = 0;
  private reducedMotion: MediaQueryList | null;
  private observer: IntersectionObserver;
  private events = new AbortController();
  private listeners = new Set<() => void>();
  private frameRequest = 0;
  private visible = true;
  private isActive = true;
  private cols = 0;
  private rows = 0;
  private last: number = 0;
  private width = 0;
  private height = 0;
  private dpr = 0;
  private linkDistance = 0;
  private density = 0;
  private gradient: CanvasGradient | null = null;
  private gradientKey = '';

  constructor(
    private canvas: HTMLCanvasElement,
    options: ParticleNetworkOptions = {},
  ) {
    const {
      pointerTarget = 'canvas',
      storageKey,
      respectReducedMotion = true,
    } = options;
    this.ctx = canvas.getContext('2d')!;
    this.base = {
      ...DEFAULT_SETTINGS,
      ...definedValues(options.settings ?? {}),
    };
    this.storageKey = storageKey;
    const stored = storageKey ? loadSettings(storageKey) : {};
    this.settings = { ...this.base, ...stored };
    this.reducedMotion = respectReducedMotion
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

    const target =
      pointerTarget === 'window'
        ? document.documentElement
        : pointerTarget === 'canvas'
          ? canvas
          : pointerTarget;
    const { signal } = this.events;
    const track = (event: PointerEvent) => {
      this.client = { x: event.clientX, y: event.clientY };
      this.hovered = event.target;
    };
    const untrack = () => {
      this.client = null;
    };
    const release = () => {
      this.held = null;
    };
    // The browser took the gesture over, usually to scroll, so the press
    // wasn't meant to add a particle
    const cancel = () => {
      this.client = null;
      const index = this.held ? this.particles.indexOf(this.held) : -1;
      if (index >= 0) {
        this.particles.splice(index, 1);
      }
      this.held = null;
    };
    target.addEventListener('pointermove', track, { signal });
    target.addEventListener('pointerdown', this.press, { signal });
    target.addEventListener('pointerleave', untrack, { signal });
    // A release outside the target still ends the drag
    window.addEventListener('pointerup', release, { signal });
    window.addEventListener('pointercancel', cancel, { signal });
    // While a particle is dragged, the press shouldn't also select the
    // page's text or drag its images
    const holdPage = (event: Event) => {
      if (this.held) {
        event.preventDefault();
      }
    };
    document.addEventListener('selectstart', holdPage, { signal });
    document.addEventListener('dragstart', holdPage, { signal });

    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.resume();
    });
    this.observer.observe(canvas);
    this.frameRequest = window.requestAnimationFrame(this.loop);
  }

  /**
   * While false, the animation stops as it does off screen. A canvas fixed
   * behind the page always counts as on screen, even under opaque content.
   */
  public get active() {
    return this.isActive;
  }

  public set active(active: boolean) {
    this.isActive = active;
    this.resume();
  }

  /** Changes settings and makes them what `reset()` returns to. */
  public set(settings: Partial<Settings>) {
    const values = definedValues(settings);
    Object.assign(this.base, values);
    Object.assign(this.settings, values);
    this.save();
    this.notify();
  }

  /** Drops changes made in the panel. */
  public reset() {
    Object.assign(this.settings, this.base);
    this.save();
    this.notify();
  }

  /** Stores the settings under `storageKey`, if one was given. */
  public save() {
    if (this.storageKey) {
      saveSettings(this.storageKey, this.settings, this.base);
    }
  }

  /** Calls `listener` after `set()` or `reset()`. Returns an unsubscribe function. */
  public onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public randomize() {
    this.particles.length = 0;
    this.fades.clear();
    this.populate();
  }

  /** Stops the animation and removes its event listeners. */
  public destroy() {
    window.cancelAnimationFrame(this.frameRequest);
    this.observer.disconnect();
    this.events.abort();
    this.listeners.clear();
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  private resume() {
    if (
      this.visible &&
      this.isActive &&
      !this.frameRequest &&
      !this.events.signal.aborted
    ) {
      // Time spent stopped shouldn't count as one long frame
      this.last = 0;
      this.frameRequest = window.requestAnimationFrame(this.loop);
    }
  }

  private toCanvas(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      return null;
    }
    return { x, y };
  }

  private press = (event: PointerEvent) => {
    this.client = { x: event.clientX, y: event.clientY };
    this.hovered = event.target;
    const position = this.toCanvas(event.clientX, event.clientY);
    if (
      this.settings.spawnOnClick &&
      event.isPrimary &&
      event.button === 0 &&
      position &&
      !isIgnored(event.target)
    ) {
      this.held = this.spawn(position.x, position.y);
    }
  };

  private spawn(x: number, y: number) {
    const particle = Particle.create(x, y);
    particle.spawnedAt = performance.now();
    this.particles.push(particle);
    return particle;
  }

  private fit() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const dpr = window.devicePixelRatio;
    const { linkDistance, density } = this.settings;
    const resized =
      width !== this.width || height !== this.height || dpr !== this.dpr;
    if (
      !resized &&
      linkDistance === this.linkDistance &&
      density === this.density
    ) {
      return;
    }

    if (resized) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const oldMargin = this.linkDistance;
    const margin = linkDistance;
    const scaleX = (width + 2 * margin) / (this.width + 2 * oldMargin);
    const scaleY = (height + 2 * margin) / (this.height + 2 * oldMargin);
    this.particles.forEach((particle) => {
      particle.x = (particle.x + oldMargin) * scaleX - margin;
      particle.y = (particle.y + oldMargin) * scaleY - margin;
    });

    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.linkDistance = linkDistance;
    this.density = density;

    this.cols = Math.ceil((width + 2 * margin) / linkDistance);
    this.rows = Math.ceil((height + 2 * margin) / linkDistance);
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);

    this.populate();
  }

  private populate() {
    const { width, height, linkDistance: margin, density } = this;
    const population = Math.round(
      ((width + 2 * margin) * (height + 2 * margin)) / (5000 / density),
    );
    this.particles.length = Math.min(this.particles.length, population);
    while (this.particles.length < population) {
      this.particles.push(
        Particle.create(
          Math.random() * (width + 2 * margin) - margin,
          Math.random() * (height + 2 * margin) - margin,
        ),
      );
    }
  }

  private loop = (timestamp: number) => {
    this.frameRequest = 0;
    // resume() schedules the next frame once the canvas is on screen and active
    if (!this.visible || !this.isActive) {
      return;
    }
    const delta = !this.last ? 1 : (timestamp - this.last) / FRAME_MS;
    const { ctx, settings, client } = this;

    this.fit();
    this.expire(timestamp);
    this.pointer = client && this.toCanvas(client.x, client.y);

    ctx.globalCompositeOperation = 'source-over';
    // Links and particles leave globalAlpha below 1
    ctx.globalAlpha = 1;
    this.drawBackground();

    if (!settings.paused && !this.reducedMotion?.matches) {
      // After a long pause (hidden tab) forces would otherwise act for minutes
      const pushDelta = Math.min(delta, 4);
      this.applyPointerForce(pushDelta);

      const step = delta * settings.maxSpeed;
      const pushDecay = PUSH_DECAY ** pushDelta;
      this.particles.forEach((particle) => {
        particle.move(step, pushDelta, pushDecay);
        particle.x = wrap(particle.x, this.width, this.linkDistance);
        particle.y = wrap(particle.y, this.height, this.linkDistance);
      });
    }
    if (this.held && this.pointer) {
      this.held.x = this.pointer.x;
      this.held.y = this.pointer.y;
    }
    this.spawnAtPointer(delta);

    ctx.globalCompositeOperation = settings.additive
      ? 'lighter'
      : 'source-over';
    this.drawLinks(delta);
    this.drawParticles();

    this.last = timestamp;

    this.frameRequest = window.requestAnimationFrame(this.loop);
  };

  private spawnAtPointer(delta: number) {
    const { pointer, particles } = this;
    const {
      autoSpawn,
      spawnOnClick,
      spawnInterval,
      spawnOverlap,
      minRadius,
      maxRadius,
    } = this.settings;
    if (!autoSpawn || !spawnOnClick || !pointer || isIgnored(this.hovered)) {
      return;
    }

    this.spawnDue += (delta * FRAME_MS) / spawnInterval;
    // Closer than this, the new particle could overlap one already there
    const spacing = 2 * Math.max(minRadius, maxRadius);
    if (
      this.spawnDue >= 1 &&
      (spawnOverlap ||
        !particles.some((particle) => particle.distance(pointer) < spacing))
    ) {
      this.spawn(pointer.x, pointer.y);
      this.spawnDue -= 1;
    }
    // The remainder carries over, but time spent blocked or below one
    // frame per particle doesn't come out later as a burst
    this.spawnDue = Math.min(this.spawnDue, 1);
  }

  // Removes particles the pointer added once they outlive spawnLifetime
  private expire(now: number) {
    const { particles, held } = this;
    const lifetime = this.settings.spawnLifetime;
    const expired = (particle: Particle) =>
      particle.spawnedAt !== undefined &&
      particle !== held &&
      now - particle.spawnedAt >= lifetime;
    if (!particles.some(expired)) {
      return;
    }

    // Each particle's new index, or -1 once removed
    const moved = new Int32Array(particles.length);
    let kept = 0;
    particles.forEach((particle, index) => {
      if (expired(particle)) {
        moved[index] = -1;
      } else {
        moved[index] = kept;
        particles[kept++] = particle;
      }
    });
    particles.length = kept;

    // Fades are keyed by index, and later particles just moved down
    const fades = new Map<number, TriangleFade>();
    this.fades.forEach((fade) => {
      const a = moved[fade.a];
      const b = moved[fade.b];
      const c = fade.c === POINTER_INDEX ? POINTER_INDEX : moved[fade.c];
      if (a >= 0 && b >= 0 && c >= 0) {
        fades.set(triangleKey(a, b, c), { ...fade, a, b, c });
      }
    });
    this.fades = fades;
  }

  private applyPointerForce(delta: number) {
    const { pointer } = this;
    const { pointerForce, forceRadius, forceStrength } = this.settings;
    if (!pointer || pointerForce === 'off') {
      return;
    }

    this.particles.forEach((particle) => {
      const dx = pointer.x - particle.x;
      const dy = pointer.y - particle.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance >= forceRadius || distance < 1) {
        return;
      }

      // Scaled by 1 / distance so dx and dy act as a unit direction
      const force =
        (forceStrength * (1 - distance / forceRadius) ** 2 * delta) / distance;
      if (pointerForce === 'attract') {
        particle.pushX += dx * force;
        particle.pushY += dy * force;
      } else if (pointerForce === 'repel') {
        particle.pushX -= dx * force;
        particle.pushY -= dy * force;
      } else {
        particle.pushX += (-dy + dx * VORTEX_PULL) * force;
        particle.pushY += (dx + dy * VORTEX_PULL) * force;
      }
    });
  }

  // Multiplier for line and triangle opacity around the pointer
  private flashlightBoostAt(x: number, y: number) {
    const { pointer } = this;
    const { flashlight, flashlightRadius, flashlightBoost } = this.settings;
    if (!pointer || !flashlight) {
      return 1;
    }

    const distance = Math.sqrt((x - pointer.x) ** 2 + (y - pointer.y) ** 2);
    if (distance >= flashlightRadius) {
      return 1;
    }
    return 1 + flashlightBoost * (1 - distance / flashlightRadius) ** 2;
  }

  private drawBackground() {
    const { ctx, width, height } = this;
    const { background, backgroundInner, backgroundOuter } = this.settings;
    if (!background) {
      ctx.clearRect(0, 0, width, height);
      return;
    }

    const key = `${width}x${height} ${backgroundInner} ${backgroundOuter}`;
    if (!this.gradient || key !== this.gradientKey) {
      const cx = width / 2;
      const cy = height / 2;
      const gradient = ctx.createRadialGradient(
        cx,
        cy,
        0,
        cx,
        cy,
        Math.hypot(cx, cy),
      );
      gradient.addColorStop(0, backgroundInner);
      gradient.addColorStop(1, backgroundOuter);
      this.gradient = gradient;
      this.gradientKey = key;
    }

    ctx.fillStyle = this.gradient;
    ctx.fillRect(0, 0, width, height);
  }

  private drawParticles() {
    const { ctx } = this;
    const { minRadius, maxRadius, particleColor } = this.settings;
    const largest = Math.max(minRadius, maxRadius);
    if (largest === 0) {
      return;
    }

    ctx.fillStyle = particleColor;
    this.particles.forEach((particle) => {
      const radius = minRadius + particle.size * (maxRadius - minRadius);
      ctx.globalAlpha = radius / largest;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  private drawLinks(delta: number) {
    const { ctx, linkDistance, particles, adjacency } = this;
    const {
      falloff,
      lineColor,
      lineWidth,
      triangles,
      triangleStyle,
      pointerLinks,
      pointerTriangles,
    } = this.settings;
    const drawLines = lineWidth > 0;
    const recordAdjacency = triangles && triangleStyle === 'overlapping';

    if (recordAdjacency) {
      while (adjacency.length < particles.length) {
        adjacency.push([]);
      }
      adjacency.forEach((adjacent) => {
        adjacent.length = 0;
      });
    }

    const paths = Array.from({ length: ALPHA_LEVELS + 1 }, () => new Path2D());
    const addLine = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      level: number,
    ) => {
      if (!drawLines) {
        return;
      }
      const lit = Math.round(
        level * this.flashlightBoostAt((ax + bx) / 2, (ay + by) / 2),
      );
      const path = paths[Math.min(ALPHA_LEVELS, lit)];
      path.moveTo(ax, ay);
      path.lineTo(bx, by);
    };
    const link = (a: number, b: number) => {
      const particle = particles[a];
      const other = particles[b];
      const level = linkLevel(particle, other, linkDistance, falloff);
      if (level > 0) {
        addLine(particle.x, particle.y, other.x, other.y, level);
        if (recordAdjacency) {
          adjacency[Math.min(a, b)].push(Math.max(a, b), level);
        }
      }
    };
    if (drawLines || recordAdjacency) {
      this.findNearbyPairs(link);
    }

    const { pointer } = this;
    const linked: PointerLink[] = [];
    if (pointer && (pointerLinks || pointerTriangles)) {
      particles.forEach((particle, index) => {
        const level = levelAt(
          particle.distance(pointer),
          linkDistance,
          falloff,
        );
        if (level > 0) {
          linked.push({ index, level });
          if (pointerLinks) {
            addLine(pointer.x, pointer.y, particle.x, particle.y, level);
          }
        }
      });
    }

    if (triangles || (pointer && pointerTriangles)) {
      this.fillTriangles(delta, linked);
    } else {
      this.fades.clear();
    }

    if (!drawLines) {
      return;
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = Math.max(lineWidth, 1 / this.dpr);
    for (let level = 1; level <= ALPHA_LEVELS; level++) {
      ctx.globalAlpha = level / ALPHA_LEVELS;
      ctx.stroke(paths[level]);
    }
  }

  // Each pair of particles in the same or neighboring cells, the only ones
  // close enough to link
  private findNearbyPairs(visit: (a: number, b: number) => void) {
    const { cells, cols, rows, linkDistance, particles } = this;

    cells.forEach((cell) => {
      cell.length = 0;
    });
    particles.forEach((particle, index) => {
      const row = cellIndex(particle.y, rows, linkDistance);
      const col = cellIndex(particle.x, cols, linkDistance);
      cells[row * cols + col].push(index);
    });

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = cells[row * cols + col];

        for (let i = 0; i < cell.length; i++) {
          for (let j = i + 1; j < cell.length; j++) {
            visit(cell[i], cell[j]);
          }
        }

        for (const [dc, dr] of NEIGHBORS) {
          const c = col + dc;
          const r = row + dr;
          if (c < 0 || c >= cols || r >= rows) {
            continue;
          }

          for (const a of cell) {
            for (const b of cells[r * cols + c]) {
              visit(a, b);
            }
          }
        }
      }
    }
  }

  private fillTriangles(delta: number, linked: PointerLink[]) {
    const { ctx, particles, fades, pointer } = this;
    const {
      triangles,
      pointerTriangles,
      triangleColor,
      triangleOpacity,
      triangleShade,
      triangleStyle,
      triangleTransition,
    } = this.settings;
    const frame = ++this.frame;
    // Exponential easing that covers about 95% of the way in triangleTransition ms
    const ease =
      triangleTransition > 0
        ? 1 - Math.exp((-3 * delta * FRAME_MS) / triangleTransition)
        : 1;

    const show: TriangleVisitor = (a, b, c, ab, bc, ac) => {
      const level =
        triangleShade === 'weakest' ? Math.min(ab, bc, ac) : (ab + bc + ac) / 3;
      const key = triangleKey(a, b, c);
      let fade = fades.get(key);
      if (!fade) {
        fade = { a, b, c, opacity: 0, frame };
        fades.set(key, fade);
      }
      fade.frame = frame;
      fade.opacity += (level / ALPHA_LEVELS - fade.opacity) * ease;
    };
    if (triangles && triangleStyle === 'mosaic') {
      this.findMosaicTriangles(show);
    } else if (triangles) {
      this.findOverlappingTriangles(show);
    }
    if (pointer && pointerTriangles) {
      this.findPointerTriangles(pointer, linked, show);
    }

    const maxEdge = 2 * this.linkDistance;
    ctx.fillStyle = triangleColor;
    // One fill per triangle, so overlaps always add up the same way
    fades.forEach((fade, key) => {
      const p = particles[fade.a];
      const q = particles[fade.b];
      const r = fade.c === POINTER_INDEX ? pointer : particles[fade.c];
      // A resize removed one of its particles, or the pointer left the canvas
      if (!q || !r) {
        fades.delete(key);
        return;
      }

      if (fade.frame !== frame) {
        fade.opacity -= fade.opacity * ease;
        // A vertex that wrapped to the far side would stretch it across the screen
        if (
          fade.opacity < 0.002 ||
          p.distance(q) > maxEdge ||
          q.distance(r) > maxEdge ||
          p.distance(r) > maxEdge
        ) {
          fades.delete(key);
          return;
        }
      }

      const lit = this.flashlightBoostAt(
        (p.x + q.x + r.x) / 3,
        (p.y + q.y + r.y) / 3,
      );
      ctx.globalAlpha = Math.min(1, fade.opacity * triangleOpacity * lit);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.lineTo(r.x, r.y);
      ctx.fill();
    });
  }

  // The pointer plus two particles linked to it and to each other. The
  // mosaic style keeps only neighbors by angle, a fan that never overlaps.
  private findPointerTriangles(
    pointer: { x: number; y: number },
    linked: PointerLink[],
    show: TriangleVisitor,
  ) {
    const { particles, linkDistance } = this;
    const { falloff, triangleStyle } = this.settings;

    const visit = (u: PointerLink, v: PointerLink) => {
      const [a, b] = u.index < v.index ? [u, v] : [v, u];
      const ab = linkLevel(
        particles[a.index],
        particles[b.index],
        linkDistance,
        falloff,
      );
      if (ab > 0) {
        show(a.index, b.index, POINTER_INDEX, ab, b.level, a.level);
      }
    };

    if (triangleStyle === 'overlapping') {
      for (let i = 0; i < linked.length; i++) {
        for (let j = i + 1; j < linked.length; j++) {
          visit(linked[i], linked[j]);
        }
      }
      return;
    }

    const fan = linked
      .map((link) => {
        const particle = particles[link.index];
        const angle = Math.atan2(
          particle.y - pointer.y,
          particle.x - pointer.x,
        );
        return { link, angle };
      })
      .sort((u, v) => u.angle - v.angle);
    // With two particles the wrap-around pair would repeat the only pair
    const pairs = fan.length > 2 ? fan.length : fan.length - 1;
    for (let k = 0; k < pairs; k++) {
      const u = fan[k];
      const v = fan[(k + 1) % fan.length];
      const gap = (v.angle - u.angle + 2 * Math.PI) % (2 * Math.PI);
      // A wider gap would cover the far side of the pointer and overlap the fan
      if (gap < Math.PI) {
        visit(u.link, v.link);
      }
    }
  }

  // Every mutually linked triple, found once from its lowest index a via b < c
  private findOverlappingTriangles(show: TriangleVisitor) {
    const { particles, adjacency } = this;

    for (let a = 0; a < particles.length; a++) {
      const adjacentA = adjacency[a];
      for (let i = 0; i < adjacentA.length; i += 2) {
        const b = adjacentA[i];
        const adjacentB = adjacency[b];
        for (let j = 0; j < adjacentB.length; j += 2) {
          const c = adjacentB[j];
          let k = 0;
          while (k < adjacentA.length && adjacentA[k] !== c) {
            k += 2;
          }
          if (k < adjacentA.length) {
            show(a, b, c, adjacentA[i + 1], adjacentB[j + 1], adjacentA[k + 1]);
          }
        }
      }
    }
  }

  // Delaunay triangles whose edges are all links. They never overlap and
  // number at most two per particle, however dense the graph gets.
  private findMosaicTriangles(show: TriangleVisitor) {
    const { particles, linkDistance } = this;
    const { falloff } = this.settings;

    if (this.coords.length !== 2 * particles.length) {
      this.coords = new Float64Array(2 * particles.length);
      this.delaunay = undefined;
    }
    const coords = this.coords;
    particles.forEach((particle, i) => {
      coords[2 * i] = particle.x;
      coords[2 * i + 1] = particle.y;
    });
    if (this.delaunay) {
      this.delaunay.update();
    } else {
      this.delaunay = new Delaunator(coords);
    }

    const { triangles } = this.delaunay;
    for (let t = 0; t < triangles.length; t += 3) {
      let a = triangles[t];
      let b = triangles[t + 1];
      let c = triangles[t + 2];
      if (a > b) [a, b] = [b, a];
      if (b > c) [b, c] = [c, b];
      if (a > b) [a, b] = [b, a];

      const ab = linkLevel(particles[a], particles[b], linkDistance, falloff);
      const bc = linkLevel(particles[b], particles[c], linkDistance, falloff);
      const ac = linkLevel(particles[a], particles[c], linkDistance, falloff);
      if (ab > 0 && bc > 0 && ac > 0) {
        show(a, b, c, ab, bc, ac);
      }
    }
  }
}
