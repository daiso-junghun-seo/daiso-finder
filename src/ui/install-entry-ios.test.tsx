// src/ui/install-entry-ios.test.tsx — §B51 surface wiring (iOS path). Safari never fires
// beforeinstallprompt, so the entry opens the share-sheet guide instead of a native prompt.
// The store reads the UA when it is first created, so the stub must exist before render.
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initInstallCapture } from '../pwa/install';
import { AvailabilitySurface } from './AvailabilitySurface';
import { useAvailabilityStore } from './store';

Object.defineProperty(window.navigator, 'userAgent', {
  value:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  configurable: true,
});

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

test('iOS: the entry opens the share-sheet guide, makes the background inert, and restores focus', async () => {
  initInstallCapture();
  const user = userEvent.setup();
  render(<AvailabilitySurface />);

  const button = screen.getByRole('button', { name: '앱 설치' });
  expect(button).toHaveAttribute('aria-haspopup', 'dialog');

  await user.click(button);
  expect(screen.getByRole('dialog', { name: '홈 화면에 추가' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus();
  expect(document.querySelector('.surface-content')).toHaveAttribute('inert');

  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  // The guide is not a one-shot prompt: the opener stays and takes focus back.
  expect(button).toHaveFocus();
});
