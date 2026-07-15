import { registerSW } from 'virtual:pwa-register';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AvailabilitySurface } from './ui/AvailabilitySurface';
import './styles/tokens.css';

registerSW();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <AvailabilitySurface />
  </StrictMode>,
);
