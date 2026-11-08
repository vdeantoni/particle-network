'use client';

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from 'react';
import { ParticleNetwork } from './particle-network.js';
import { DEFAULT_SETTINGS, type Settings } from './settings.js';

const NO_SETTINGS: Partial<Settings> = {};

// A key left out of next goes back to its default, as with any omitted prop
function changedSettings(previous: Partial<Settings>, next: Partial<Settings>) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return Object.fromEntries(
    [...keys]
      .map((key) => key as keyof Settings)
      .map((key) => [key, next[key] ?? DEFAULT_SETTINGS[key]] as const)
      .filter(
        ([key, value]) => value !== (previous[key] ?? DEFAULT_SETTINGS[key]),
      ),
  ) as Partial<Settings>;
}

export interface ParticleNetworkCanvasProps {
  /** Applied live. Only keys whose values changed reach `set()`, so panel edits survive re-renders. */
  settings?: Partial<Settings>;
  /** Use `'window'` when the canvas sits behind page content. */
  pointerTarget?: 'canvas' | 'window';
  storageKey?: string;
  respectReducedMotion?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Receives the `ParticleNetwork`, to hand to `<ParticleNetworkPanel>`. */
  ref?: Ref<ParticleNetwork>;
}

/** A canvas running the animation. Size it with `className` or `style`. */
export function ParticleNetworkCanvas({
  settings = NO_SETTINGS,
  pointerTarget,
  storageKey,
  respectReducedMotion,
  className,
  style,
  ref,
}: ParticleNetworkCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [network, setNetwork] = useState<ParticleNetwork | null>(null);
  // What the network last received, so a re-render only applies real changes
  const applied = useRef(settings);

  useImperativeHandle<ParticleNetwork | null, ParticleNetwork | null>(
    ref,
    () => network,
    [network],
  );

  useEffect(() => {
    const instance = new ParticleNetwork(canvas.current!, {
      settings: applied.current,
      pointerTarget,
      storageKey,
      respectReducedMotion,
    });
    setNetwork(instance);
    return () => {
      instance.destroy();
      setNetwork(null);
    };
  }, [pointerTarget, storageKey, respectReducedMotion]);

  useEffect(() => {
    const changed = changedSettings(applied.current, settings);
    applied.current = settings;
    if (network && Object.keys(changed).length > 0) {
      network.set(changed);
    }
  }, [network, settings]);

  return (
    <canvas ref={canvas} className={className} style={style} aria-hidden />
  );
}

export interface ParticleNetworkPanelProps {
  network: ParticleNetwork;
  className?: string;
  style?: CSSProperties;
}

/** The settings panel. Tweakpane loads when this first renders, so pages without it never download it. */
export function ParticleNetworkPanel({
  network,
  className,
  style,
}: ParticleNetworkPanelProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let panel: { destroy(): void } | undefined;
    let mounted = true;
    void import('./panel.js').then(({ createPanel }) => {
      if (mounted) {
        panel = createPanel(network, container.current!);
      }
    });
    return () => {
      mounted = false;
      panel?.destroy();
    };
  }, [network]);

  return <div ref={container} className={className} style={style} />;
}
