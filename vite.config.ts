import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
// `test` covers vitest (unit tests for pure logic, e.g. src/lib/recommendations/engine.ts) —
// Playwright (tests/) is configured separately in playwright.config.ts and is unaffected by this.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
