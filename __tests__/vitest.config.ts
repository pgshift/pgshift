import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['unit/**/*.spec.ts', 'integration/**/*.test.ts'],
    globalSetup: ['integration/setup/global.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
})
