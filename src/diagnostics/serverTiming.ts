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
// A Server-Timing dur value is a plain decimal, optionally with a fractional part (it is a double
// per spec -- this proxy emits integers today, but the parser stays defensive). Deliberately NOT
// the grammar Number() accepts: no sign, no radix prefix (0x/0o/0b), no exponent, no Infinity/NaN.
const DUR_FORMAT = /^\d+(?:\.\d+)?$/;

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
    const durValue = dur.slice(DUR_PREFIX.length).trim();
    // Number() accepts far more than a Server-Timing dur value ever should: hex/octal/binary
    // literals (0x0, 0o0, 0b0), signs (+0, -1), exponents (1e3) and 'Infinity' itself all parse to
    // a number -- judging Number()'s RESULT is not enough (that includes the earlier '' -> 0
    // fabrication). The FORMAT is validated before Number() ever runs, never judged after the fact.
    if (!DUR_FORMAT.test(durValue)) continue;
    const ms = Number(durValue);
    // Still guarded, for a pathological input the format check above cannot rule out (a digit
    // string long enough to overflow to Infinity) -- a malformed duration is DROPPED, never
    // coerced to 0.
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
