// src/pwa/install.test.ts — §B51 install capture. The store is injected so the one-shot
// beforeinstallprompt rules are tested without a browser: capture happens once, prompt() is
// callable once, and appinstalled is the only thing that may claim "installed".
import {
  type InstallEnvironment,
  type InstallSnapshot,
  createInstallStore,
  detectIos,
  detectStandalone,
  installModeOf,
} from './install';

type Listener = (event: unknown) => void;

function fakeEnvironment(overrides: Partial<InstallEnvironment> = {}) {
  const listeners = new Map<string, Set<Listener>>();
  const addEventListener = vi.fn((type: string, listener: Listener) => {
    const set = listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(type, set);
  });
  const removeEventListener = vi.fn((type: string, listener: Listener) => {
    listeners.get(type)?.delete(listener);
  });
  return {
    env: { addEventListener, removeEventListener, ...overrides } satisfies InstallEnvironment,
    addEventListener,
    removeEventListener,
    emit(type: string, event: unknown) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener(event);
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

function fakePromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const preventDefault = vi.fn();
  const prompt = vi.fn(async () => {});
  return {
    event: { preventDefault, prompt, userChoice: Promise.resolve({ outcome }) },
    preventDefault,
    prompt,
  };
}

const snapshot = (patch: Partial<InstallSnapshot>): InstallSnapshot => ({
  canPrompt: false,
  installed: false,
  ios: false,
  ...patch,
});

test('installModeOf: installed hides the entry, iOS guides, a held prompt is a button', () => {
  expect(installModeOf(snapshot({ installed: true, ios: true, canPrompt: true }))).toBe('none');
  expect(installModeOf(snapshot({ ios: true }))).toBe('guide');
  expect(installModeOf(snapshot({ canPrompt: true }))).toBe('button');
  expect(installModeOf(snapshot({}))).toBe('none');
});

test('detectStandalone reads display-mode, then the iOS standalone flag, and tolerates no matchMedia', () => {
  expect(detectStandalone({ matchMedia: () => ({ matches: true }) })).toBe(true);
  expect(detectStandalone({ matchMedia: () => ({ matches: false }) })).toBe(false);
  expect(detectStandalone({ standalone: true })).toBe(true);
  // jsdom and older WebViews have no matchMedia — the guard must not throw.
  expect(detectStandalone({})).toBe(false);
});

test('detectIos covers iPhone/iPad UAs and the iPadOS desktop UA (touch points)', () => {
  expect(detectIos({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe(
    true,
  );
  expect(detectIos({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' })).toBe(true);
  // iPadOS 13+ reports a desktop Macintosh UA; touch points are the tell.
  expect(
    detectIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }),
  ).toBe(true);
  expect(
    detectIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 }),
  ).toBe(false);
  expect(detectIos({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' })).toBe(false);
});

test('beforeinstallprompt is deferred, suppressed, and exposed as a button', () => {
  const { env, emit } = fakeEnvironment();
  const store = createInstallStore(env);
  const { event, preventDefault } = fakePromptEvent();

  store.start();
  emit('beforeinstallprompt', event);

  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot().canPrompt).toBe(true);
  expect(installModeOf(store.getSnapshot())).toBe('button');
});

test('request prompts once and reports the user choice', async () => {
  const { env, emit } = fakeEnvironment();
  const store = createInstallStore(env);
  const { event, prompt } = fakePromptEvent('accepted');

  store.start();
  emit('beforeinstallprompt', event);

  await expect(store.request()).resolves.toBe('accepted');
  expect(prompt).toHaveBeenCalledTimes(1);
  // The event is one-shot: the entry disappears and a second request has nothing to prompt.
  expect(store.getSnapshot().canPrompt).toBe(false);
  await expect(store.request()).resolves.toBe('unavailable');
});

test('request reports a dismissal without claiming an install', async () => {
  const { env, emit } = fakeEnvironment();
  const store = createInstallStore(env);
  store.start();
  emit('beforeinstallprompt', fakePromptEvent('dismissed').event);

  await expect(store.request()).resolves.toBe('dismissed');
  expect(store.getSnapshot().installed).toBe(false);
});

test('a prompt that rejects reports unavailable and consumes the one-shot event', async () => {
  const { env, emit } = fakeEnvironment();
  const store = createInstallStore(env);
  store.start();
  emit('beforeinstallprompt', {
    preventDefault: vi.fn(),
    prompt: vi.fn(() => Promise.reject(new Error('no user gesture'))),
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });

  await expect(store.request()).resolves.toBe('unavailable');
  expect(store.getSnapshot().canPrompt).toBe(false);
});

test('request without a captured event is unavailable and prompts nothing', async () => {
  const store = createInstallStore(fakeEnvironment().env);
  await expect(store.request()).resolves.toBe('unavailable');
});

test('appinstalled hides the entry and discards the deferred event', async () => {
  const { env, emit } = fakeEnvironment();
  const store = createInstallStore(env);
  store.start();
  emit('beforeinstallprompt', fakePromptEvent().event);

  emit('appinstalled', {});

  expect(store.getSnapshot()).toMatchObject({ installed: true, canPrompt: false });
  expect(installModeOf(store.getSnapshot())).toBe('none');
  await expect(store.request()).resolves.toBe('unavailable');
});

test('a standalone launch starts installed and ignores a late prompt', () => {
  const { env, emit } = fakeEnvironment({ matchMedia: () => ({ matches: true }) });
  const store = createInstallStore(env);
  store.start();
  emit('beforeinstallprompt', fakePromptEvent().event);

  expect(store.getSnapshot().canPrompt).toBe(false);
  expect(installModeOf(store.getSnapshot())).toBe('none');
});

test('a non-prompt event object is ignored', () => {
  const { env, emit } = fakeEnvironment();
  const store = createInstallStore(env);
  store.start();
  emit('beforeinstallprompt', {});
  expect(store.getSnapshot().canPrompt).toBe(false);
});

test('start is idempotent and its stop removes both listeners', () => {
  const { env, addEventListener, removeEventListener, listenerCount } = fakeEnvironment();
  const store = createInstallStore(env);

  const stop = store.start();
  store.start();
  expect(addEventListener).toHaveBeenCalledTimes(2);
  expect(listenerCount('beforeinstallprompt')).toBe(1);
  expect(listenerCount('appinstalled')).toBe(1);

  stop();
  expect(removeEventListener).toHaveBeenCalledTimes(2);
  expect(listenerCount('beforeinstallprompt')).toBe(0);

  // A stopped store can be restarted (main.tsx never does, but the contract is not one-way).
  store.start();
  expect(addEventListener).toHaveBeenCalledTimes(4);
});

test('subscribe notifies only on a real change and unsubscribes', () => {
  const { env, emit } = fakeEnvironment();
  const store = createInstallStore(env);
  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);
  store.start();

  emit('beforeinstallprompt', fakePromptEvent().event);
  expect(listener).toHaveBeenCalledTimes(1);

  // A second capture changes nothing observable (canPrompt is already true) — no notification.
  emit('beforeinstallprompt', fakePromptEvent().event);
  expect(listener).toHaveBeenCalledTimes(1);

  emit('appinstalled', {});
  expect(listener).toHaveBeenCalledTimes(2);

  unsubscribe();
  emit('beforeinstallprompt', fakePromptEvent().event);
  expect(listener).toHaveBeenCalledTimes(2);
});
