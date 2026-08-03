// Whether the on-screen diagnostics panel is active. Deliberately NOT `import.meta.env.DEV`: the DEV
// build wires the mock scanner (composition.ts), so the camera/decoder facts the panel exists to show
// only exist in PROD builds — `npm run dev:live` and real devices, where no console is available.
export const DEBUG_PARAM = 'debug';
export const DEBUG_STORAGE_KEY = 'daiso-finder:debug';
export const ZOOM_PARAM = 'zoom';

// The upper bound is the adapter's MAX_SCAN_ZOOM, deliberately duplicated as a literal rather than
// imported: this module parses URLs and must not depend on a camera module. The test next door reads
// browserScanner.ts's own source text and asserts this parser's accepted boundary against the number
// declared there, so the two constants cannot silently drift apart even though neither imports the other.
const MAX_ZOOM_OVERRIDE = 2;

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

/**
 * The sweep parameter, or null when there is nothing to honour.
 *
 * PURE, and the signature is the point: no `Storage` parameter, so a zoom cannot persist the way the
 * debug flag does. A sticky zoom would ride a later run the tester had forgotten about — the sweep tool
 * corrupting the sweep.
 *
 * Out of range is REJECTED rather than clamped. Clamping would let `?zoom=3` record a 2.0 run under a
 * URL that claims 3, which is exactly the mis-attribution this parameter exists to avoid.
 */
export function resolveZoomOverride(search: string, diagnosticsEnabled: boolean): number | null {
  if (!diagnosticsEnabled) return null;
  const raw = new URLSearchParams(search).get(ZOOM_PARAM);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (value <= 0 || value > MAX_ZOOM_OVERRIDE) return null;
  return value;
}
