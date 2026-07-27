import { registerSW } from 'virtual:pwa-register';
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { isDiagnosticsEnabled } from './diagnostics/enabled';
import { AvailabilitySurface } from './ui/AvailabilitySurface';
import './styles/tokens.css';
import './styles/layout.css';

// Lazy so a build without ?debug=1 never downloads the panel or its stylesheet.
const DiagnosticsBar = lazy(() => import('./ui/components/DiagnosticsBar'));

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
