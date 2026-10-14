import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    // Plage 6000–6100 réservée au projet : on échoue plutôt que de prendre un autre port.
    // Pas 6000 : les navigateurs Chromium le bloquent (ERR_UNSAFE_PORT, réservé à X11).
    port: 6002,
    strictPort: true,
    proxy: { '/api': 'http://localhost:6001' },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
});
