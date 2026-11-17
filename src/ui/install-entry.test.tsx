// src/ui/install-entry.test.tsx — §B51 surface wiring (Chromium path). main.tsx starts the
// capture before React mounts; here the test does the same and dispatches the event the browser
// would, proving the header entry appears, prompts once, and disappears when the event is spent.
import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initInstallCapture } from '../pwa/install';
import { AvailabilitySurface } from './AvailabilitySurface';
import { useAvailabilityStore } from './store';

beforeEach(() => {
  localStorage.clear();
  useAvailabilityStore.setState({
    ui: { state: 'default' },
    store: { strCd: '001', strNm: '명동역점' },
    sheetOpen: false,
    scannerOpen: false,
    locale: 'ko',
    carts: {},
    cartOpen: false,
    recentViews: [],
    recentSearches: [],
  });
});

function promptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  return Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome }),
  });
}

test('a captured install prompt adds the header button and is consumed by one tap', async () => {
  initInstallCapture();
  const user = userEvent.setup();
  render(<AvailabilitySurface />);

  // Nothing to prompt yet: no dead entry.
  expect(screen.queryByRole('button', { name: '앱 설치' })).not.toBeInTheDocument();

  const event = promptEvent('accepted');
  act(() => {
    window.dispatchEvent(event);
  });

  const button = screen.getByRole('button', { name: '앱 설치' });
  // The browser's mini-infobar is suppressed in favour of the in-app entry.
  expect(event.defaultPrevented).toBe(true);

  await user.click(button);
  expect(event.prompt).toHaveBeenCalledTimes(1);
  // The deferred event is one-shot — the entry goes away after it is spent.
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: '앱 설치' })).not.toBeInTheDocument(),
  );
});
