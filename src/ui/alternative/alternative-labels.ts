// src/ui/alternative/alternative-labels.ts
// The answer card's negative status, restated as Flow 3's "why we are here" line. It lives in its own
// module because the EAGER Suspense stand-in (AvailabilitySurface's AlternativeContext) renders it while
// the lazy surface chunk loads — importing alternative-types for it would pull Flow 3's cache/query
// vocabulary back into the entry chunk.
import type { AlternativeReason } from '../../domain/types';
import type { CopyTable } from '../../i18n/strings';

export function altReasonLabel(reason: AlternativeReason, S: CopyTable): string {
  switch (reason) {
    case 'temporarilyOut':
      return S.ALT_REASON_TEMPORARILY_OUT;
    case 'discontinued':
      return S.ALT_REASON_DISCONTINUED;
    case 'notCarried':
      return S.ALT_REASON_NOT_CARRIED;
    case 'franchise':
      return S.ALT_REASON_FRANCHISE;
    case 'flow2':
      return S.ALT_REASON_FLOW2;
  }
}
