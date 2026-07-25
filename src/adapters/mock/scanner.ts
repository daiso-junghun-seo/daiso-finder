// src/adapters/mock/scanner.ts — DEV/test scanner: no camera, no permission prompt. Resolves the mock
// catalog's base pdNo so the whole scan → answer flow is exercisable in `vite dev`, Vitest and the
// Playwright dev sweep (spec §8; the real camera path is PROD-only and stays field-unverified, §B9).
import type { ScanOutcome, ScannerPort } from '../../domain/ports';
import { mockCandidates } from './productSearch';

export const MOCK_SCAN_VALUE = mockCandidates[0]?.pdNo ?? '19987';

export function createMockScanner(
  outcome: ScanOutcome = { kind: 'decoded', value: MOCK_SCAN_VALUE },
): ScannerPort {
  return {
    scan: async (_target, signal) => (signal.aborted ? { kind: 'cancelled' } : outcome),
  };
}
