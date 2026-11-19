import { registerSW } from 'virtual:pwa-register';
import { type ComponentType, StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { isDiagnosticsEnabled } from './diagnostics/enabled';
import { isLocaleLoaded, loadLocaleTable } from './i18n/strings';
import { initInstallCapture } from './pwa/install';
import { AvailabilitySurface } from './ui/AvailabilitySurface';
import { useAvailabilityStore } from './ui/store';
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
// Before React mounts: beforeinstallprompt fires once and may arrive before the first render.
initInstallCapture();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

// Every non-ko guidance table is a lazy chunk (§B52): load the detected locale BEFORE the first
// render so the entry never paints Korean for a shopper whose browser is, say, Japanese. Korean
// mounts in the same tick as before. A failed chunk drops to Korean rather than a blank screen or
// mismatched copy; the stored choice is untouched, so the next boot retries.
function mount() {
  createRoot(rootElement as HTMLElement).render(
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
}

const initialLocale = useAvailabilityStore.getState().locale;
if (isLocaleLoaded(initialLocale)) {
  mount();
} else {
  void loadLocaleTable(initialLocale)
    .catch(() => {
      // The detected table could not be fetched. Only Korean is resident, so drop to it rather
      // than render Korean guidance under, say, a Japanese <select> value. The stored choice is
      // left untouched, so the next boot retries the chunk.
      useAvailabilityStore.setState({ locale: 'ko' });
    })
    .then(mount);
}
