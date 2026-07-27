// Pins main.tsx's lazy-import guard against the real wiring, not a re-created imitation of it.
//
// `<Suspense fallback={null}>` in main.tsx has no error boundary above it. A lazy import can fail for
// reasons that have nothing to do with diagnostics — a stale service worker serving an index.html whose
// chunk hash has rotated, a first load racing SW install, a flaky LAN — and an unguarded rejection
// throws during render and unmounts the whole root. The shopper surface would disappear because a
// *diagnostics* module failed to load. Mutation check: dropping the `.catch(...)` in main.tsx fails
// this test.
import { act, screen, waitFor } from '@testing-library/react';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => () => {} }));
// The panel is only lazily imported at all when the flag is on, so the failure path needs it on.
vi.mock('./diagnostics/enabled', () => ({ isDiagnosticsEnabled: () => true }));
// Stands in for a chunk that cannot be fetched: importing the module rejects.
vi.mock('./ui/components/DiagnosticsBar', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

test('a diagnostics chunk that fails to load renders no panel and leaves the app mounted', async () => {
  document.body.innerHTML = '<div id="root"></div>';

  // main.tsx renders at import time; act() flushes that root render inside the test's act scope.
  await act(async () => {
    await import('./main');
  });

  // First run has no persisted store, so the store-selection sheet is the app's leading surface.
  await waitFor(() => {
    expect(screen.getByRole('dialog', { name: '매장 선택' })).toBeInTheDocument();
  });
  // The rejection resolves to a component that renders nothing — no panel, and no torn-down root.
  expect(document.querySelector('.diagnostics-bar')).toBeNull();
  expect(screen.getByRole('dialog', { name: '매장 선택' })).toBeInTheDocument();
});
