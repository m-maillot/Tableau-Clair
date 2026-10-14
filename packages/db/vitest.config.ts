import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Les tests créent chacun leur base PostgreSQL : on évite de les paralléliser.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
