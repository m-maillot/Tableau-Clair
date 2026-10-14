import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/global.css';
import { Catalogue } from './Catalogue';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Catalogue />
  </StrictMode>,
);
