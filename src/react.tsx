'use client';

import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
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
  /** `false` stops the animation, for a canvas that's covered without leaving the screen. */
  active?: boolean;
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
  active = true,
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
    // Reads settings without depending on them: later changes go through
    // set() below. Recording them as applied keeps that effect from passing
    // this render's changes to the instance being replaced.
    applied.current = settings;
    const instance = new ParticleNetwork(canvas.current!, {
      settings,
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

  useEffect(() => {
    if (network) {
      network.active = active;
    }
  }, [network, active]);

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

// A shortcut typed into a field is text, not a command. Checkboxes and
// buttons keep focus after a click but take no text, so they don't count.
function isTextEntry(target: EventTarget | null) {
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLInputElement &&
      !['checkbox', 'radio', 'button', 'range', 'color'].includes(
        target.type,
      )) ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

const BUTTON_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
};

const SLIDERS_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden
  >
    <path d="M4 6h16M4 12h16M4 18h16" />
    <circle cx="9" cy="6" r="2" fill="currentColor" />
    <circle cx="15" cy="12" r="2" fill="currentColor" />
    <circle cx="7" cy="18" r="2" fill="currentColor" />
  </svg>
);

export interface ParticleNetworkSettingsProps {
  /** The network to control. The button shows right away; the panel opens once the network exists. */
  network: ParticleNetwork | null;
  /** Key that toggles the panel, compared with `KeyboardEvent.key` ignoring case. `null` turns it off. */
  shortcut?: string | null;
  /** Where the panel opens relative to the button. */
  placement?: 'above' | 'below';
  /** Accessible name and tooltip of the button. */
  label?: string;
  /** Positions the button, with the panel anchored to it. */
  className?: string;
  style?: CSSProperties;
  /** Styles the button instead of the built-in inline styles. */
  buttonClassName?: string;
  /** The button's content. Defaults to a sliders icon. */
  children?: ReactNode;
}

/** A button that opens the settings panel, with a keyboard shortcut and Escape to close. */
export function ParticleNetworkSettings({
  network,
  shortcut = 'h',
  placement = 'above',
  label = 'Animation settings',
  className,
  style,
  buttonClassName,
  children = SLIDERS_ICON,
}: ParticleNetworkSettingsProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (
        !shortcut ||
        event.key.toLowerCase() !== shortcut.toLowerCase() ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTextEntry(event.target)
      ) {
        return;
      }
      setOpen((current) => !current);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcut]);

  return (
    <div className={className} style={style}>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          aria-label={label}
          title={shortcut ? `${label} (${shortcut.toUpperCase()})` : label}
          aria-keyshortcuts={shortcut ?? undefined}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className={buttonClassName}
          style={
            buttonClassName
              ? undefined
              : { ...BUTTON_STYLE, opacity: open ? 1 : 0.6 }
          }
        >
          {children}
        </button>
        {open && network && (
          <div
            id={panelId}
            style={{
              position: 'absolute',
              right: 0,
              [placement === 'above' ? 'bottom' : 'top']: 'calc(100% + 8px)',
              zIndex: 10,
              width: 280,
              maxHeight: '60vh',
              overflowY: 'auto',
            }}
          >
            <ParticleNetworkPanel network={network} />
          </div>
        )}
      </div>
    </div>
  );
}
