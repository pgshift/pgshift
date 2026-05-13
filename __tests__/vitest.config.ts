import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['unit/**/*.spec.ts', 'integration/**/*.test.ts'],
    environment: 'node',
  },
})
