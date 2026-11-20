import { defineConfig } from 'vitest/config'

// Tests that need no browser and no build live beside their source. Playwright owns e2e/*.spec.ts.
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } })
