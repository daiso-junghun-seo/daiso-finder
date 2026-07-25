import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScannerPort } from '../../domain/ports';
import { SCAN_BUTTON_LABEL, SCAN_HINT, SCAN_PERMISSION_DENIED, SCAN_UNSUPPORTED } from '../copy';
import { ScannerOverlay } from './ScannerOverlay';

const never: ScannerPort = { scan: () => new Promise(() => {}) };

test('is a labelled modal dialog that takes focus on open', async () => {
  render(<ScannerOverlay scanner={never} onDecoded={() => {}} onClose={() => {}} />);
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByRole('heading', { name: SCAN_BUTTON_LABEL })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus());
});

test('a decoded value is handed up exactly once', async () => {
  const decoded: string[] = [];
  const scanner: ScannerPort = { scan: async () => ({ kind: 'decoded', value: '19987' }) };
  render(
    <ScannerOverlay scanner={scanner} onDecoded={(v) => decoded.push(v)} onClose={() => {}} />,
  );
  await waitFor(() => expect(decoded).toEqual(['19987']));
});

test('a permission denial shows the honest fallback copy and stays open', async () => {
  const scanner: ScannerPort = { scan: async () => ({ kind: 'permissionDenied' }) };
  render(<ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />);
  expect(await screen.findByText(SCAN_PERMISSION_DENIED)).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('an unsupported browser says so without a technical term', async () => {
  const scanner: ScannerPort = { scan: async () => ({ kind: 'unsupported' }) };
  render(<ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />);
  expect(await screen.findByText(SCAN_UNSUPPORTED)).toBeInTheDocument();
});

test('a slow decode keeps the camera open and only adds a hint', async () => {
  vi.useFakeTimers();
  try {
    render(
      <ScannerOverlay scanner={never} onDecoded={() => {}} onClose={() => {}} hintDelayMs={10} />,
    );
    expect(screen.queryByText(SCAN_HINT)).not.toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(11);
    expect(screen.getByText(SCAN_HINT)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test('닫기 and Escape both close', async () => {
  const user = userEvent.setup();
  let closes = 0;
  const { unmount } = render(
    <ScannerOverlay
      scanner={never}
      onDecoded={() => {}}
      onClose={() => {
        closes += 1;
      }}
    />,
  );
  await user.click(screen.getByRole('button', { name: '닫기' }));
  expect(closes).toBe(1);
  unmount();

  render(
    <ScannerOverlay
      scanner={never}
      onDecoded={() => {}}
      onClose={() => {
        closes += 1;
      }}
    />,
  );
  await user.keyboard('{Escape}');
  expect(closes).toBe(2);
});

test('unmounting aborts the scan so the camera cannot outlive the overlay', async () => {
  let signal: AbortSignal | undefined;
  const scanner: ScannerPort = {
    scan: (_t, s) => {
      signal = s;
      return new Promise(() => {});
    },
  };
  const { unmount } = render(
    <ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />,
  );
  await waitFor(() => expect(signal).toBeDefined());
  unmount();
  expect(signal?.aborted).toBe(true);
});
