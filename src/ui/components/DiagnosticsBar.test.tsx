const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../diagnostics/enabled', () => ({ isDiagnosticsEnabled: () => flag.enabled }));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  beginScannerRun,
  publishNetwork,
  publishScanner,
  resetDiagnostics,
} from '../../diagnostics/bus';
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
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: () => Promise.reject(new Error('insecure context')) },
  });
  render(<DiagnosticsBar />);
  await user.click(screen.getByRole('button', { name: /스캔 전/ }));
  await user.click(screen.getByRole('button', { name: '복사' }));
  expect(await screen.findByText(/복사 실패/)).toBeInTheDocument();
});
