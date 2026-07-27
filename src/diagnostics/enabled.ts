// Whether the on-screen diagnostics panel is active. Deliberately NOT `import.meta.env.DEV`: the DEV
// build wires the mock scanner (composition.ts), so the camera/decoder facts the panel exists to show
// only exist in PROD builds — `npm run dev:live` and real devices, where no console is available.
export const DEBUG_PARAM = 'debug';
export const DEBUG_STORAGE_KEY = 'daiso-finder:debug';

function safeGet(storage: Storage | null): string | null {
  try {
    return storage?.getItem(DEBUG_STORAGE_KEY) ?? null;
  } catch {
    return null; // Safari private mode and friends
  }
}

function safeSet(storage: Storage | null, value: string): void {
  try {
    storage?.setItem(DEBUG_STORAGE_KEY, value);
  } catch {
    // Persistence is a convenience; the URL parameter already decided this run.
  }
}

function safeRemove(storage: Storage | null): void {
  try {
    storage?.removeItem(DEBUG_STORAGE_KEY);
  } catch {
    // As above.
  }
}

/**
 * Resolve the flag and mirror it into storage. Not pure — it writes — which is why `storage` is a
 * parameter: the tests exercise every branch without touching a real one.
 */
export function resolveDebugEnabled(search: string, storage: Storage | null): boolean {
  const requested = new URLSearchParams(search).get(DEBUG_PARAM);
  if (requested === '1') {
    safeSet(storage, '1');
    return true;
  }
  if (requested === '0') {
    safeRemove(storage);
    return false;
  }
  return safeGet(storage) === '1';
}

function bootStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

// Resolved ONCE, at module init. The flag cannot change mid-session, so every consumer sees one answer
// and no consumer has to re-read the URL.
const enabled =
  typeof window === 'undefined'
    ? false
    : resolveDebugEnabled(window.location.search, bootStorage());

export function isDiagnosticsEnabled(): boolean {
  return enabled;
}
