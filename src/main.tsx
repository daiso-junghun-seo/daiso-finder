import { registerSW } from 'virtual:pwa-register';
import { type ComponentType, StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { isDiagnosticsEnabled } from './diagnostics/enabled';
import { AvailabilitySurface } from './ui/AvailabilitySurface';
import './styles/tokens.css';
import './styles/layout.css';

// Lazy so a run without ?debug=1 never imports, parses or executes the panel or its stylesheet. (The
// service worker still precaches both chunks — `workbox.globPatterns` sweeps every emitted asset; see
// open-questions.md §B31-7 for why that is accepted rather than excluded.)
//
// The rejection is swallowed on purpose. A lazy import can fail for reasons that have nothing to do
// with diagnostics — a stale service worker serving an index.html whose chunk hash has rotated, a first
// load racing SW install, a flaky LAN — and this <Suspense> has no error boundary above it, so a
// rejected import would throw during render and unmount the entire root. A diagnostics chunk that fails
// to load must produce no panel, never an unmounted shopper surface.
// The explicit ComponentType widens the element type so the render-nothing fallback and the real panel
// share one type; without it the fallback's `null` return does not match the module's JSX.Element.
const DiagnosticsBar = lazy<ComponentType>(() =>
  import('./ui/components/DiagnosticsBar').catch(() => ({ default: () => null })),
);

registerSW({ immediate: true });

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <AvailabilitySurface />
    {/* A sibling of <main>, so `inert` on .surface-content never reaches it and DOM order paints it
        above the sheet and the scanner overlay. */}
    {isDiagnosticsEnabled() && (
      <Suspense fallback={null}>
        <DiagnosticsBar />
      </Suspense>
    )}
  </StrictMode>,
);
