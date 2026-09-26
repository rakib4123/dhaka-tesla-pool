import { defineConfig } from 'vitest/config';

// One place defines where the test database lives. globalSetup (added in Task 2) reads it too.
process.env.TEST_DATABASE_URL ??= 'postgresql://tesla:tesla@localhost:5432/tesla_pool_test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    fileParallelism: false, // integration tests share one database
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      JWT_SECRET: 'test-only-secret-not-for-production',
      LOG_LEVEL: 'silent',
      AUTH_RATE_LIMIT_MAX: '10000',
    },
  },
});
