// src/pwa/install.ts
// In-app install entry (§B51, owner exception). Android/Chromium browsers fire
// `beforeinstallprompt` once the PWA is installable; the event must be captured BEFORE React
// mounts and can be prompted exactly once. iOS never fires it (Safari installs through the
// share sheet), so the entry there opens written guidance instead of a native prompt.
//
// The store is injectable (createInstallStore) so the event/one-shot rules are unit-tested
// without a browser; the module-level singleton is what main.tsx and the hook share.

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';
export type InstallMode = 'button' | 'guide' | 'none';

export interface InstallSnapshot {
  /** A deferred beforeinstallprompt is held and can still be prompted. */
  readonly canPrompt: boolean;
  /** Running as an installed app (display-mode: standalone, or iOS navigator.standalone). */
  readonly installed: boolean;
  /** iOS/iPadOS: installable only through the share sheet, never through beforeinstallprompt. */
  readonly ios: boolean;
}

// The slice of BeforeInstallPromptEvent this module uses. Declared structurally so tests and
// non-Chromium browsers never need the (non-standard) DOM type.
export interface InstallPromptEvent {
  preventDefault: () => void;
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallEventType = 'beforeinstallprompt' | 'appinstalled';
type Listener = (event: unknown) => void;

export interface InstallEnvironment {
  readonly matchMedia?: (query: string) => { matches: boolean };
  readonly userAgent?: string;
  readonly maxTouchPoints?: number;
  /** navigator.standalone — the iOS-only standalone flag. */
  readonly standalone?: boolean;
  readonly addEventListener: (type: InstallEventType, listener: Listener) => void;
  readonly removeEventListener: (type: InstallEventType, listener: Listener) => void;
}

export interface InstallStore {
  getSnapshot(): InstallSnapshot;
  subscribe(listener: () => void): () => void;
  /** Registers the window listeners. Idempotent; returns a stop function. */
  start(): () => void;
  request(): Promise<InstallOutcome>;
}

export function detectStandalone(
  env: Pick<InstallEnvironment, 'matchMedia' | 'standalone'>,
): boolean {
  // jsdom has no matchMedia, and older WebViews can lack it too — optional chaining, not trust.
  return (
    env.standalone === true || env.matchMedia?.('(display-mode: standalone)')?.matches === true
  );
}

export function detectIos(env: Pick<InstallEnvironment, 'userAgent' | 'maxTouchPoints'>): boolean {
  const ua = env.userAgent ?? '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports a desktop "Macintosh" UA; the touch-point count is the tell (D069 does
  // not apply — this is capability detection, not copy).
  return /Macintosh/.test(ua) && (env.maxTouchPoints ?? 0) > 1;
}

// 'button' → native prompt held; 'guide' → iOS share-sheet instructions; 'none' → already
// installed, or a non-iOS browser with nothing to prompt (a dead entry is worse than none).
export function installModeOf(snapshot: InstallSnapshot): InstallMode {
  if (snapshot.installed) return 'none';
  if (snapshot.ios) return 'guide';
  return snapshot.canPrompt ? 'button' : 'none';
}

function asPromptEvent(event: unknown): InstallPromptEvent | null {
  if (typeof event !== 'object' || event === null) return null;
  const candidate = event as Partial<InstallPromptEvent>;
  return typeof candidate.prompt === 'function' && typeof candidate.preventDefault === 'function'
    ? (candidate as InstallPromptEvent)
    : null;
}

export function createInstallStore(env: InstallEnvironment): InstallStore {
  let snapshot: InstallSnapshot = {
    canPrompt: false,
    installed: detectStandalone(env),
    ios: detectIos(env),
  };
  let deferred: InstallPromptEvent | null = null;
  let stop: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const update = (patch: Partial<InstallSnapshot>) => {
    const next = { ...snapshot, ...patch };
    if (
      next.canPrompt === snapshot.canPrompt &&
      next.installed === snapshot.installed &&
      next.ios === snapshot.ios
    ) {
      return;
    }
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };

  const onPromptAvailable = (event: unknown) => {
    const promptEvent = asPromptEvent(event);
    // An install that already happened makes a late event stale — never offer it again.
    if (!promptEvent || snapshot.installed) return;
    // Suppress the browser's own mini-infobar: the entry inside the app is the one entry point.
    promptEvent.preventDefault();
    deferred = promptEvent;
    update({ canPrompt: true });
  };

  const onInstalled = () => {
    deferred = null;
    update({ canPrompt: false, installed: true });
  };

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    start() {
      if (stop) return stop;
      env.addEventListener('beforeinstallprompt', onPromptAvailable);
      env.addEventListener('appinstalled', onInstalled);
      stop = () => {
        env.removeEventListener('beforeinstallprompt', onPromptAvailable);
        env.removeEventListener('appinstalled', onInstalled);
        stop = null;
      };
      return stop;
    },

    async request() {
      const event = deferred;
      // The deferred event is one-shot: once consumed (or never captured) there is nothing to
      // prompt, and a second prompt() call would reject anyway.
      if (!event) return 'unavailable';
      deferred = null;
      update({ canPrompt: false });
      try {
        await event.prompt();
        const choice = await event.userChoice;
        return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
      } catch {
        // A browser that refuses the prompt leaves no retry path in this session; the caller
        // treats it exactly like "nothing to prompt" rather than inventing a result.
        return 'unavailable';
      }
    },
  };
}

// ── Browser singleton ───────────────────────────────────────────────────────────────────────────

const EMPTY: InstallSnapshot = { canPrompt: false, installed: false, ios: false };
let singleton: InstallStore | null = null;

function browserEnvironment(): InstallEnvironment {
  return {
    matchMedia:
      typeof window.matchMedia === 'function' ? (query) => window.matchMedia(query) : undefined,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
    addEventListener: (type, listener) => window.addEventListener(type, listener as EventListener),
    removeEventListener: (type, listener) =>
      window.removeEventListener(type, listener as EventListener),
  };
}

function store(): InstallStore | null {
  if (typeof window === 'undefined') return null;
  singleton ??= createInstallStore(browserEnvironment());
  return singleton;
}

/** Call once at startup, before React mounts — the event may fire before the first render. */
export function initInstallCapture(): void {
  store()?.start();
}

export function getInstallSnapshot(): InstallSnapshot {
  return store()?.getSnapshot() ?? EMPTY;
}

export function subscribeInstall(listener: () => void): () => void {
  return store()?.subscribe(listener) ?? (() => {});
}

export function requestInstall(): Promise<InstallOutcome> {
  return store()?.request() ?? Promise.resolve('unavailable');
}
