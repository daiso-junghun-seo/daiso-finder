import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScanOutcome, ScannerPort } from '../../domain/ports';
import {
  SCAN_AIM_GUIDE,
  SCAN_AIM_GUIDE_TOKEN,
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

// The notice already renders as a visible paragraph; the live region repeats it for assistive tech only.
test('the scanner live region does not duplicate the notice on screen', () => {
  const scanner: ScannerPort = { scan: async () => ({ kind: 'failed' }) };
  render(<ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />);
  expect(screen.getByRole('status')).toHaveClass('visually-hidden');
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
  const { container } = render(
    <ScannerOverlay scanner={never} onDecoded={() => {}} onClose={() => {}} />,
  );
  // No waitFor: the scan never resolves, so this must already be on screen on the first render —
  // not something that only appears once an outcome (or the 10s hint) lands.
  // Looked up by id, not getByText(SCAN_AIM_GUIDE): the <strong> emphasis splits the paragraph's
  // text nodes, and Testing Library's getNodeText only concatenates *direct* text-node children.
  expect(container.querySelector('#scanner-aim-guide')?.textContent).toBe(SCAN_AIM_GUIDE);
});

test('the aim guide names the 계산바코드 label and emphasises it', () => {
  const { container } = render(
    <ScannerOverlay scanner={never} onDecoded={() => {}} onClose={() => {}} />,
  );
  const guide = container.querySelector('#scanner-aim-guide');
  // The emphasis must not change what the sentence says — the dialog's description is computed from it.
  expect(guide?.textContent).toBe(SCAN_AIM_GUIDE);
  expect(guide?.querySelector('strong')?.textContent).toBe(SCAN_AIM_GUIDE_TOKEN);
});

test("the dialog's accessible description resolves to the aiming guide", () => {
  render(<ScannerOverlay scanner={never} onDecoded={() => {}} onClose={() => {}} />);
  // Focus lands on 닫기 for the whole overlay (see focus test above), so a bare paragraph would
  // never be read aloud — the guide must be wired as the dialog's accessible description instead.
  // Containment, not exact equality: nesting the <strong> emphasis can insert whitespace at element
  // boundaries in the computed accessible description, and containment also survives the Bible
  // swapping the wording later.
  const dialog = screen.getByRole('dialog', { name: SCAN_BUTTON_LABEL });
  expect(dialog).toHaveAccessibleDescription(expect.stringContaining('계산바코드'));
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
  const { container } = render(
    <ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />,
  );
  // Present at first, before the outcome lands...
  // Looked up by id, not getByText(SCAN_AIM_GUIDE): the <strong> emphasis splits the paragraph's
  // text nodes, and Testing Library's getNodeText only concatenates *direct* text-node children.
  expect(container.querySelector('#scanner-aim-guide')?.textContent).toBe(SCAN_AIM_GUIDE);
  expect(await screen.findByText(SCAN_FAILED, noticeParagraph)).toBeInTheDocument();
  // ...and gone once the notice takes its place — the guide is no longer relevant once we know why.
  // Asserted against the id, not queryByText(SCAN_AIM_GUIDE): after the <strong> split, that text
  // lookup never matches the paragraph at all (present or not), so it would pass whether or not the
  // guide is actually on screen — silently losing its ability to guard this behaviour.
  expect(container.querySelector('#scanner-aim-guide')).not.toBeInTheDocument();
});

test('a square aiming guide is drawn over the camera while scanning', () => {
  const { container } = render(
    <ScannerOverlay scanner={never} onDecoded={() => {}} onClose={() => {}} />,
  );
  const aim = container.querySelector('.scanner-overlay__aim');
  expect(aim).toBeInTheDocument();
  // Decoration only: the instruction below carries the meaning for assistive tech.
  expect(aim).toHaveAttribute('aria-hidden', 'true');
  // It must sit inside the positioned wrapper, next to the video it aims.
  expect(
    container.querySelector('.scanner-overlay__viewport .scanner-overlay__aim'),
  ).toBeInTheDocument();
});

// Leaving an aiming guide on screen after the camera failed would be an instruction the app cannot honour.
test('the aiming guide disappears once an outcome notice replaces the guidance', async () => {
  const scanner: ScannerPort = { scan: async () => ({ kind: 'permissionDenied' }) };
  const { container } = render(
    <ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />,
  );
  await screen.findByText(SCAN_PERMISSION_DENIED, noticeParagraph);
  expect(container.querySelector('.scanner-overlay__aim')).not.toBeInTheDocument();
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
  const { container } = render(
    <ScannerOverlay scanner={scanner} onDecoded={() => {}} onClose={() => {}} />,
  );
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
  // Looked up by id, not getByText(SCAN_AIM_GUIDE): the <strong> emphasis splits the paragraph's
  // text nodes, and Testing Library's getNodeText only concatenates *direct* text-node children.
  expect(container.querySelector('#scanner-aim-guide')?.textContent).toBe(SCAN_AIM_GUIDE);
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
