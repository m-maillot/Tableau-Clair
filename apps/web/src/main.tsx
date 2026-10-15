import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/global.css';
import { App } from './App';
import { registerServiceWorker } from './pwa/pwa';

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
