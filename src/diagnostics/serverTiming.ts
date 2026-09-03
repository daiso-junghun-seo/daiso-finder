// src/diagnostics/serverTiming.ts — reads the proxy's Server-Timing header into an observation.
// The proxy reports one `total` (its handler wall clock) plus one entry per upstream leg. See
// functions/_lib/timing.ts for the producer and the design spec dated 2026-09-03 for why the panel
// must never sum the legs.

export interface UpstreamLeg {
  name: string;
  ms: number;
}

export interface UpstreamTiming {
  // The server's own wall clock. NEVER a sum of `legs`: disp and stck run in parallel, so a sum
  // exceeds the real elapsed time and would drive the panel's residual negative.
  totalMs: number | null;
  legs: ReadonlyArray<UpstreamLeg>;
}

const TOTAL_NAME = 'total';
const DUR_PREFIX = 'dur=';

export function parseServerTiming(value: string | null): UpstreamTiming | null {
  if (value === null) return null;
  let totalMs: number | null = null;
  const legs: UpstreamLeg[] = [];
  for (const raw of value.split(',')) {
    const [namePart, ...params] = raw.split(';');
    // split(';') on a defined string always yields index 0, but noUncheckedIndexedAccess still
    // types a destructured array element as possibly undefined -- '' is unreachable at runtime.
    const name = (namePart ?? '').trim();
    if (name === '') continue;
    const dur = params.map((p) => p.trim()).find((p) => p.startsWith(DUR_PREFIX));
    if (dur === undefined) continue;
    const ms = Number(dur.slice(DUR_PREFIX.length));
    // A malformed duration is DROPPED, never coerced to 0 -- a fabricated zero would read exactly
    // like an instant upstream call.
    if (!Number.isFinite(ms)) continue;
    if (name === TOTAL_NAME) totalMs = ms;
    else legs.push({ name, ms });
  }
  if (totalMs === null && legs.length === 0) return null; // nothing observed, not an empty stand-in
  return { totalMs, legs };
}

// Structural probe, mirroring readErrorBody's hasTextBody. FetchLike declares no headers because
// test doubles across this repo implement exactly { ok, status, json }, and widening the type would
// break every one of them (§B30-18 ⑧). Successive `in` checks narrow `object` step by step, which is
// what makes the property accesses legal with no cast at all.
function hasHeaders(res: object): res is { headers: { get(name: string): string | null } } {
  return (
    'headers' in res &&
    typeof res.headers === 'object' &&
    res.headers !== null &&
    'get' in res.headers &&
    typeof res.headers.get === 'function'
  );
}

export function readServerTiming(res: object): UpstreamTiming | null {
  if (!hasHeaders(res)) return null;
  try {
    return parseServerTiming(res.headers.get('server-timing'));
  } catch {
    return null; // an unreadable header is not an observation, and must not fail the lookup
  }
}
