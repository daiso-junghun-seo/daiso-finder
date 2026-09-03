// functions/_lib/timing.ts — upstream latency instrumentation for the ?debug=1 panel.
// Why this exists: every latency this repo has measured crossed localtunnel, and the proxy never
// reported its own upstream duration, so path latency and vendor latency could not be separated.
// See docs/notes/open-questions.md §B30-18 ② and the design spec dated 2026-09-03.

export interface DiagEnv {
  DIAG_TIMING?: string;
}

// Explicit opt-in, defaulting to off. scripts/dev-proxy.mjs is BOTH the local dev server and the
// production one (its own header comment says so), so dev and production can differ only by env.
// Defaulting this on would make the exposure control fail-open: forget one env line in production and
// the header ships. Only the exact string '1' enables it, so a stray 'false' or '0' cannot turn it on.
export function diagTimingEnabled(env: DiagEnv): boolean {
  return env.DIAG_TIMING === '1';
}

export interface UpstreamTimer {
  leg<T>(name: string, run: () => Promise<T>): Promise<T>;
  header(): string | null;
}

export function createUpstreamTimer(enabled: boolean, now: () => number = Date.now): UpstreamTimer {
  // The ONLY branch in this module's usage. Call sites are unconditional: a disabled timer is a pure
  // pass-through, so instrumenting a handler cannot change what it does.
  if (!enabled) {
    return { leg: <T>(_name: string, run: () => Promise<T>) => run(), header: () => null };
  }
  const startedAt = now();
  const legs: { name: string; ms: number }[] = [];
  return {
    async leg<T>(name: string, run: () => Promise<T>): Promise<T> {
      const legStarted = now();
      try {
        return await run();
      } finally {
        // finally, not .then(): a leg that threw still spent real time, and how far a 502 got is
        // exactly what the failing case needs to show.
        legs.push({ name, ms: now() - legStarted });
      }
    },
    header(): string {
      // `total` is present whenever enabled, even with zero completed legs (an early 400 returns
      // before any upstream call). report.ts's reading rule -- "no 상류 on any line means the flag is
      // off" -- depends on that, so this must never collapse to null while enabled.
      const parts = [`total;dur=${now() - startedAt}`];
      for (const leg of legs) parts.push(`${leg.name};dur=${leg.ms}`);
      return parts.join(', ');
    },
  };
}

// ONE attach point per handler rather than one per return statement. The three handlers have 22 exit
// paths between them; threading a timer argument through each is a defect waiting to happen, and a
// missed path fails SILENTLY -- that line simply has no 상류, which is indistinguishable from the
// flag being off. Wrapping the handler body removes the failure mode instead of testing around it.
export function withTiming(response: Response, timer: UpstreamTimer): Response {
  const value = timer.header();
  if (value === null) return response;
  response.headers.set('server-timing', value);
  // Without this the header is invisible to script on a cross-origin read -- the SERVE_STATIC=0 +
  // ALLOW_ORIGIN mode. That failure is silent (상류 simply never appears), so it is set here rather
  // than left as something that mode has to remember.
  response.headers.set('access-control-expose-headers', 'server-timing');
  return response;
}
