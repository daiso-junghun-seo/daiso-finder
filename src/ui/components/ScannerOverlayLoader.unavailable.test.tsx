// src/ui/components/ScannerOverlayLoader.unavailable.test.tsx — a scanner chunk that cannot be fetched
// must not throw during render (no error boundary above the overlay). The stand-in says so, keeps the
// dialog contract, and retries with the only action that can help a failed chunk: a reload.
//
// The throwing mock stands in for a stale service worker serving an index.html whose chunk hash has
// rotated — the same failure shape main.test.tsx uses for the diagnostics chunk.
import { render, screen, waitFor } from '@testing-library/react';
import type { ScannerPort } from '../../domain/ports';
import { ScannerOverlayLoader } from './ScannerOverlayLoader';

vi.mock('./ScannerOverlay', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

const scanner: ScannerPort = { scan: vi.fn() };

test('a failed scanner chunk renders the honest stand-in and keeps the dialog contract', async () => {
  const onClose = vi.fn();
  render(
    <ScannerOverlayLoader scanner={scanner} locale="ko" onDecoded={vi.fn()} onClose={onClose} />,
  );
  expect(
    await screen.findByText(
      '지금 연결이 원활하지 않아요. 다시 시도하거나 매장 직원에게 문의해 주세요.',
      { selector: 'p' },
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: '바코드 스캔' })).toBeInTheDocument();
  // Focus lands from the shell's mount effect, which can trail the DOM mutation that resolves
  // findByText under a loaded worker — wait for it instead of racing it.
  await waitFor(() => expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus());
  // The retry is intentionally a reload (a failed chunk cannot be retried by re-rendering). jsdom's
  // location.reload is non-configurable, so only its presence is pinned here.
  expect(screen.getByRole('button', { name: '다시 확인' })).toBeInTheDocument();
});
