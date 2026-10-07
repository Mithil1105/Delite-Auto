import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
// `test` covers vitest (unit tests for pure logic, e.g. src/lib/recommendations/engine.ts and
// server/odoo/normalizeProduct.ts) — Playwright (tests/) is configured separately in
// playwright.config.ts and is unaffected by this.
//
// `supabase/functions/_shared/**/*.test.ts` — Deno Edge Functions themselves have no automated
// test coverage in this repo (Deno-specific `Deno.serve`/`npm:` imports don't resolve under
// Vitest's Node runtime), but a handful of genuinely dependency-free helpers living under
// `_shared/` (e.g. `_shared/auth/jwt.ts`'s AAL decoding) can be unit-tested directly — see
// Documentations MD/delite-production-operations.md, "Deno Edge Function test harness".
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'supabase/functions/_shared/**/*.test.ts'],
  },
})
