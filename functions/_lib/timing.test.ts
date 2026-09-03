import { createUpstreamTimer, diagTimingEnabled, withTiming } from './timing';

// A deterministic clock: each call returns the next value. Tests assert exact durations, so a real
// clock would make them flaky and would prove nothing about the arithmetic.
function clock(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

test('diagTimingEnabled is opt-in: only the exact string "1" turns it on', () => {
  expect(diagTimingEnabled({ DIAG_TIMING: '1' })).toBe(true);
  expect(diagTimingEnabled({})).toBe(false);
  expect(diagTimingEnabled({ DIAG_TIMING: '' })).toBe(false);
  expect(diagTimingEnabled({ DIAG_TIMING: '0' })).toBe(false);
  expect(diagTimingEnabled({ DIAG_TIMING: 'true' })).toBe(false);
});

test('a disabled timer records nothing and passes the thunk result through untouched', async () => {
  const timer = createUpstreamTimer(false, clock([0, 100, 500]));
  await expect(timer.leg('str', async () => 'value')).resolves.toBe('value');
  expect(timer.header()).toBeNull();
});

test('a disabled timer still propagates a rejection unchanged', async () => {
  const timer = createUpstreamTimer(false);
  const boom = new Error('upstream down');
  await expect(timer.leg('str', () => Promise.reject(boom))).rejects.toBe(boom);
});

test('header carries total plus each completed leg, in call order', async () => {
  // created@0, legA 10->30 (20ms), legB 30->75 (45ms), header@100
  const timer = createUpstreamTimer(true, clock([0, 10, 30, 30, 75, 100]));
  await timer.leg('search', async () => 1);
  await timer.leg('str', async () => 2);
  expect(timer.header()).toBe('total;dur=100, search;dur=20, str;dur=45');
});

test('an enabled timer emits total even when no leg ran (the early-400 shape)', () => {
  // report.ts's reading rule -- "no 상류 anywhere means the flag is off" -- depends on this.
  const timer = createUpstreamTimer(true, clock([0, 7]));
  expect(timer.header()).toBe('total;dur=7');
});

test('a leg that throws is still recorded, and the rejection is re-thrown unchanged', async () => {
  const timer = createUpstreamTimer(true, clock([0, 5, 45, 60]));
  const boom = new Error('pkupStck 502');
  await expect(timer.leg('stck', () => Promise.reject(boom))).rejects.toBe(boom);
  expect(timer.header()).toBe('total;dur=60, stck;dur=40');
});

test('a leg still in flight when header() is called is absent, not zero', async () => {
  const timer = createUpstreamTimer(true, clock([0, 5, 20]));
  let release: (v: string) => void = () => {};
  const pending = timer.leg(
    'auth',
    () =>
      new Promise<string>((r) => {
        release = r;
      }),
  );
  expect(timer.header()).toBe('total;dur=20');
  release('done');
  await pending;
});

test('withTiming attaches server-timing and the CORS expose header when enabled', () => {
  const timer = createUpstreamTimer(true, clock([0, 42]));
  const res = withTiming(new Response('{}', { status: 200 }), timer);
  expect(res.headers.get('server-timing')).toBe('total;dur=42');
  expect(res.headers.get('access-control-expose-headers')).toBe('server-timing');
});

test('withTiming returns the response untouched when the timer is disabled', () => {
  const res = withTiming(new Response('{}', { status: 200 }), createUpstreamTimer(false));
  expect(res.headers.get('server-timing')).toBeNull();
  expect(res.headers.get('access-control-expose-headers')).toBeNull();
});
