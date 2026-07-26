import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScanOutcome, ScannerPort } from '../../domain/ports';
import {
  SCAN_AIM_GUIDE,
  SCAN_BUTTON_LABEL,
  SCAN_FAILED,
  SCAN_HINT,
  SCAN_PERMISSION_DENIED,
  SCAN_UNSUPPORTED,
} from '../copy';
import { ScannerOverlay } from './ScannerOverlay';

const never: ScannerPort = { scan: () => new Promise(() => {}) };

test('is a labelled modal dialog that takes focus on open', async () => {
  const { container } = render(
    <ScannerOverlay scanner={never} onDecoded={() => {}} onClose={() => {}} />,
  );
  const dialog = screen.getByRole('dialog', { name: SCAN_BUTTON_LABEL });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByRole('heading', { name: SCAN_BUTTON_LABEL })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus());
  // The camera preview carries no information a screen reader can use — every state is stated
  // in text, so the video itself must never reach the accessibility tree.
  expect(container.querySelector('video')).toHaveAttribute('aria-hidden', 'true');
});

test('a decoded value is handed up exactly once', async () => {
  const decoded: string[] = [];
  const scanner: ScannerPort = { scan: async () => ({ kind: 'decoded', value: '19987' }) };
  render(
    <ScannerOverlay scanner={scanner} onDecoded={(v) => decoded.push(v)} onClose={() => {}} />,
  );
  await waitFor(() => expect(decoded).toEqual(['19987']));
});

// The visible notice and the a11y live region carry the same sentence (the surface's own idiom), so
// every "is it on screen" assertion below scopes to the paragraph.
const noticeParagraph = { selector: 'p' } as const;

test('the aiming guide is visible immediately on mount, while scanning is in progress', () => {
  render(<ScannerOverlay scanner={never} onDecoded={() => {}} onClose={() => {}} />);
  // No waitFor: the scan never resolves, so this must already be on screen on the first render —
  // not something that only appears once an outcome (or the 10s hint) lands.
  expect(screen.getByText(SCAN_AIM_GUIDE)).toBeInTheDocument();
});

test("the dialog's accessible description resolves to the aiming guide", () => {
  render(<ScannerOverlay scanner={never} onDecoded={() => {}} onClose={() => {}} />);
  // Focus lands on 닫기 for the whole overlay (see focus test above), so a bare paragraph would
  // never be read aloud — the guide must be wired as the dialog's accessible description instead.
  expect(
    screen.getByRole('dialog', { name: SCAN_BUTTON_LABEL, description: SCAN_AIM_GUIDE }),
  ).toBeInTheDocument();
  const dialog = screen.getByRole('dialog', { name: SCAN_BUTTON_LABEL });
  const describedBy = dialog.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  expect(document.getElementById(describedBy as string)).toHaveTextContent(SCAN_AIM_GUIDE);
});

test('a permission denial shows the honest fallback copy and stays open', async () => {
  const scanner: ScannerPort = { scan: async () => ({ kind: 'permissionDenied' }) };
  render(<ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />);
  expect(await screen.findByText(SCAN_PERMISSION_DENIED, noticeParagraph)).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: SCAN_BUTTON_LABEL })).toBeInTheDocument();
});

test('an unsupported browser says so without a technical term', async () => {
  const scanner: ScannerPort = { scan: async () => ({ kind: 'unsupported' }) };
  render(<ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />);
  expect(await screen.findByText(SCAN_UNSUPPORTED, noticeParagraph)).toBeInTheDocument();
});

test('a decode failure shows the honest fallback copy and stays open', async () => {
  const scanner: ScannerPort = { scan: async () => ({ kind: 'failed' }) };
  render(<ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />);
  expect(await screen.findByText(SCAN_FAILED, noticeParagraph)).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: SCAN_BUTTON_LABEL })).toBeInTheDocument();
});

test('the aiming guide gives way to the notice on a failure outcome', async () => {
  const scanner: ScannerPort = { scan: async () => ({ kind: 'failed' }) };
  render(<ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />);
  // Present at first, before the outcome lands...
  expect(screen.getByText(SCAN_AIM_GUIDE)).toBeInTheDocument();
  expect(await screen.findByText(SCAN_FAILED, noticeParagraph)).toBeInTheDocument();
  // ...and gone once the notice takes its place — the guide is no longer relevant once we know why.
  expect(screen.queryByText(SCAN_AIM_GUIDE)).not.toBeInTheDocument();
});

// Focus never leaves 닫기 when an outcome lands, so a notice that is only rendered is silence for a
// shopper using a screen reader — the sentence has to reach a live region to be spoken at all.
test.each([
  ['failed', SCAN_FAILED],
  ['permissionDenied', SCAN_PERMISSION_DENIED],
  ['unsupported', SCAN_UNSUPPORTED],
] as const)('the %s notice is announced, not merely rendered', async (kind, copy) => {
  const scanner: ScannerPort = { scan: async () => ({ kind }) as ScanOutcome };
  render(<ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />);
  const live = screen.getByRole('status');
  expect(live).toHaveAttribute('aria-live', 'polite');
  // The region is mounted with the dialog and only its TEXT changes — a region inserted at the same
  // moment as its content is announced unreliably.
  await waitFor(() => expect(live).toHaveTextContent(copy));
});

test('a cancelled scan leaves no notice behind, unlike every other terminal outcome', async () => {
  const scanner: ScannerPort = { scan: async () => ({ kind: 'cancelled' }) };
  render(<ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />);
  // Flush the already-resolved scan promise chain past a macrotask boundary — 'cancelled' never
  // calls a state setter, so there is no state-driven condition to waitFor() against.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const dialog = screen.getByRole('dialog', { name: SCAN_BUTTON_LABEL });
  expect(screen.queryByText(SCAN_FAILED)).not.toBeInTheDocument();
  expect(screen.queryByText(SCAN_PERMISSION_DENIED)).not.toBeInTheDocument();
  expect(screen.queryByText(SCAN_UNSUPPORTED)).not.toBeInTheDocument();
  expect(screen.queryByText(SCAN_HINT)).not.toBeInTheDocument();
  // Belt-and-braces: no NOTICE paragraph of any kind, not just the four known copies above — the
  // only paragraph left standing is the aiming guide, which stays up whenever there is no outcome
  // notice (a cancelled scan included: it never sets one).
  expect(dialog.querySelectorAll('p')).toHaveLength(1);
  expect(screen.getByText(SCAN_AIM_GUIDE)).toBeInTheDocument();
});

test('a slow decode keeps the camera open and only adds a hint', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const scanner: ScannerPort = {
    scan: (_target, s) => {
      if (!signal) signal = s; // capture only the FIRST controller's signal
      return new Promise(() => {});
    },
  };
  try {
    render(
      <ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} hintDelayMs={10} />,
    );
    expect(screen.queryByText(SCAN_HINT)).not.toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(11);
    expect(screen.getByText(SCAN_HINT)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: SCAN_BUTTON_LABEL })).toBeInTheDocument();
    // The hint is additive, never a teardown: the scan started on mount must still be the live one.
    expect(signal?.aborted).toBe(false);
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

test('Escape during IME composition does not close the overlay (F8)', async () => {
  const onClose = vi.fn();
  render(<ScannerOverlay scanner={never} onDecoded={() => {}} onClose={onClose} />);
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }),
  );
  expect(onClose).not.toHaveBeenCalled();
  // Sanity: the same event without composition still closes (guard is composition-scoped).
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
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

test('a decode landing after unmount does not surface as onDecoded or a crash', async () => {
  let resolveScan: ((outcome: ScanOutcome) => void) | undefined;
  const scanner: ScannerPort = {
    scan: () =>
      new Promise((resolve) => {
        resolveScan = resolve;
      }),
  };
  const decoded: string[] = [];
  const { unmount, container } = render(
    <ScannerOverlay scanner={scanner} onDecoded={(v) => decoded.push(v)} onClose={() => {}} />,
  );
  await waitFor(() => expect(resolveScan).toBeDefined());
  unmount();
  expect(() => resolveScan?.({ kind: 'decoded', value: '99999' })).not.toThrow();
  // Flush the now-late .then() past a macrotask boundary before asserting it changed nothing.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(decoded).toEqual([]);
  expect(container).toBeEmptyDOMElement();
});
