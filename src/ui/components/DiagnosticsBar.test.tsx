const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../diagnostics/enabled', () => ({ isDiagnosticsEnabled: () => flag.enabled }));

import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  beginScannerRun,
  publishNetwork,
  publishScanner,
  resetDiagnostics,
} from '../../diagnostics/bus';
import type { AvailabilityAnswer, UiState } from '../../domain/types';
import { useAvailabilityStore } from '../store';
import DiagnosticsBar from './DiagnosticsBar';

beforeEach(() => {
  flag.enabled = true;
  resetDiagnostics();
  useAvailabilityStore.setState({
    ui: { state: 'default' },
    store: { strCd: '001', strNm: '명동역점' },
    sheetOpen: false,
    scannerOpen: false,
  });
});

// navigator.clipboard is a shared global and userEvent.setup() installs its own stub, so a test that
// overrides it must put back exactly what it found. Otherwise the next test appended to this file
// silently inherits a permanently-rejecting clipboard.
let restoreClipboard: (() => void) | null = null;

function stubClipboard(value: unknown): void {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
  restoreClipboard = () => {
    if (original) Object.defineProperty(navigator, 'clipboard', original);
    else Reflect.deleteProperty(navigator, 'clipboard');
  };
}

afterEach(() => {
  restoreClipboard?.();
  restoreClipboard = null;
});

test('the collapsed bar reports that no scan has run yet', () => {
  render(<DiagnosticsBar />);
  expect(screen.getByRole('button', { name: /스캔 전/ })).toBeInTheDocument();
});

test('the collapsed summary reflects published scanner facts', () => {
  beginScannerRun(Date.now());
  publishScanner({
    decoderPath: 'zxing',
    track: { width: 640, height: 480, frameRate: null, facingMode: null, deviceId: null },
  });
  render(<DiagnosticsBar />);
  expect(screen.getByRole('button', { name: /zxing/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /640×480/ })).toBeInTheDocument();
});

test('expanding reveals the full report and toggles aria-expanded', async () => {
  const user = userEvent.setup();
  publishNetwork({ path: '/api/availability', status: 200, ms: 42 });
  render(<DiagnosticsBar />);
  const toggle = screen.getByRole('button', { name: /스캔 전/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await user.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const report = screen.getByLabelText('진단 보고서') as HTMLTextAreaElement;
  expect(report).toHaveAttribute('readonly');
  expect(report.value).toContain('/api/availability');
  expect(report.value).toContain('명동역점');
});

test('the report reflects the current app state from the store', async () => {
  const user = userEvent.setup();
  useAvailabilityStore.setState({
    ui: { state: 'loading', query: '19987', slow: false, origin: 'scan' },
  });
  render(<DiagnosticsBar />);
  await user.click(screen.getByRole('button', { name: /스캔 전/ }));
  const report = screen.getByLabelText('진단 보고서') as HTMLTextAreaElement;
  expect(report.value).toContain('state: loading');
  expect(report.value).toContain('origin: scan');
});

// The clipboard API is unavailable over plain http — exactly the LAN setup used for phone testing.
// The textarea fallback is what keeps the copy path from dead-ending, so the failure must be visible.
test('a clipboard failure is surfaced instead of silently swallowed', async () => {
  const user = userEvent.setup();
  stubClipboard({ writeText: () => Promise.reject(new Error('insecure context')) });
  render(<DiagnosticsBar />);
  await user.click(screen.getByRole('button', { name: /스캔 전/ }));
  await user.click(screen.getByRole('button', { name: '복사' }));
  expect(await screen.findByText(/복사 실패/)).toBeInTheDocument();
});

// The tick effect is guarded by `if (!scanning) return;`. Reinstating the `|| expanded` it replaced
// keeps every other test in this file green, so the guard is otherwise unprotected — pin it here.
// Ticking while merely expanded rewrites the textarea's value twice a second (경과 and 캐시 나이 both
// move with Date.now()), and React writing node.value resets the caret and drops the selection. On
// plain http there is no clipboard API, so hand-selecting that text IS the copy path.
test('an expanded report holds still when no scan is running', () => {
  vi.useFakeTimers();
  try {
    // A COMPLETED run: startedAt set AND outcome set, so `scanning` is false while elapsed time is
    // still being rendered — the exact combination the guard has to get right.
    beginScannerRun(Date.now());
    publishScanner({ decoderPath: 'native', outcome: 'decoded' });
    render(<DiagnosticsBar />);
    fireEvent.click(screen.getByRole('button', { name: /native/ }));

    const report = screen.getByLabelText('진단 보고서') as HTMLTextAreaElement;
    const before = report.value;
    expect(before).toContain('경과: 0.0s');

    act(() => void vi.advanceTimersByTime(5_000));

    expect(report.value).toBe(before);
  } finally {
    vi.useRealTimers();
  }
});

// A fixed clock so 캐시 나이 is an exact number rather than a race with the test's own runtime.
const NOW = 1_800_000_000_000;
const ANSWER: AvailabilityAnswer = {
  kind: 'inStock',
  productName: '리빙 밀폐용기 1.2L',
  price: 2000,
  locations: [],
  qtyUpperBound: 5,
};

/** The `[앱 상태]` block only, up to the blank line that ends it. */
function appStateBlock(report: string): string {
  const lines = report.split('\n');
  const start = lines.indexOf('[앱 상태]');
  const end = lines.indexOf('', start);
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

function block(state: string, query: string, origin: string, candidates: string, age: string) {
  return [
    '[앱 상태]',
    `  state: ${state}`,
    `  query: ${query} · origin: ${origin}`,
    '  매장: 명동역점 (001)',
    `  후보 수: ${candidates}`,
    `  캐시 나이: ${age}`,
  ].join('\n');
}

// UiState has eight shapes and the panel derives five report lines from them — `error/${variant}`
// composition, the candidates-only count, and the partial variant whose freshness is nullable. Only
// the `loading` shape was covered, so a UiState refactor could silently change what the panel reports
// about every other one. Table-drive all eight.
const APP_STATE_CASES: Array<{ name: string; ui: UiState; expected: string }> = [
  {
    name: 'default',
    ui: { state: 'default' },
    expected: block('default', '미보고', '미보고', '미보고', '미보고'),
  },
  {
    name: 'loading',
    ui: { state: 'loading', query: '19987', slow: false, origin: 'scan' },
    expected: block('loading', '19987', 'scan', '미보고', '미보고'),
  },
  {
    // `origin` is optional and absent here, so it must read 미보고 rather than an invented default.
    name: 'empty',
    ui: { state: 'empty', query: '락앤락같은통', suggestions: [] },
    expected: block('empty', '락앤락같은통', '미보고', '미보고', '미보고'),
  },
  {
    name: 'candidates',
    ui: {
      state: 'candidates',
      query: '밀폐용기',
      candidates: [
        { pdNo: '1', name: 'A', price: 1000 },
        { pdNo: '2', name: 'B', price: 2000 },
      ],
    },
    expected: block('candidates', '밀폐용기', '미보고', '2', '미보고'),
  },
  {
    name: 'error/cached',
    ui: {
      state: 'error',
      variant: 'cached',
      query: '19987',
      answer: ANSWER,
      freshness: { class: 'cachedWithinThreshold', observedAt: NOW - 5_000 },
    },
    expected: block('error/cached', '19987', '미보고', '미보고', '5000ms'),
  },
  {
    name: 'error/noCache',
    ui: { state: 'error', variant: 'noCache', query: '19987' },
    expected: block('error/noCache', '19987', '미보고', '미보고', '미보고'),
  },
  {
    name: 'success',
    ui: {
      state: 'success',
      query: '19987',
      answer: ANSWER,
      freshness: { class: 'live', observedAt: NOW - 1_200 },
    },
    expected: block('success', '19987', '미보고', '미보고', '1200ms'),
  },
  {
    // partial is the only state whose freshness is nullable — the null path must reach 미보고 and not
    // become `${now - undefined}ms`.
    name: 'partial (freshness: null)',
    ui: {
      state: 'partial',
      trigger: 'franchise',
      query: '19987',
      answer: ANSWER,
      freshness: null,
    },
    expected: block('partial', '19987', '미보고', '미보고', '미보고'),
  },
];

for (const testCase of APP_STATE_CASES) {
  test(`the report's app-state block reflects UiState ${testCase.name}`, () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      useAvailabilityStore.setState({ ui: testCase.ui });
      render(<DiagnosticsBar />);
      fireEvent.click(screen.getByRole('button', { name: /스캔 전/ }));
      const report = screen.getByLabelText('진단 보고서') as HTMLTextAreaElement;
      expect(appStateBlock(report.value)).toBe(testCase.expected);
    } finally {
      vi.useRealTimers();
    }
  });
}
