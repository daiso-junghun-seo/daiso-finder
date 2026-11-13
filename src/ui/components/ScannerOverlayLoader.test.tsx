// src/ui/components/ScannerOverlayLoader.test.tsx — pins the lazy boundary itself: the dialog contract
// (title, focused 닫기, Escape) holds from the shell's first frame, and the loaded overlay replaces it
// without losing that contract.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScannerPort } from '../../domain/ports';
import { ScannerOverlayLoader } from './ScannerOverlayLoader';

// Cancelled immediately: the loader test is about the boundary, not decode timing. The overlay ignores
// cancelled outcomes, so no notice is rendered.
const scanner: ScannerPort = { scan: vi.fn(async () => ({ kind: 'cancelled' as const })) };

test('the shell carries the dialog, focus and Escape contract before the overlay chunk lands', async () => {
  const onClose = vi.fn();
  const { container } = render(
    <ScannerOverlayLoader scanner={scanner} locale="ko" onDecoded={vi.fn()} onClose={onClose} />,
  );

  expect(screen.getByRole('dialog', { name: '바코드 스캔' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus();

  await userEvent.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledTimes(1);

  // The real overlay arrives with the viewfinder and keeps the same labelled dialog. The video is the
  // shell's structural absence: only the loaded overlay renders it.
  await waitFor(() => expect(container.querySelector('video')).not.toBeNull());
  expect(screen.getByRole('dialog', { name: '바코드 스캔' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus();
});
