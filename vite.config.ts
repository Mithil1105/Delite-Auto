import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

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
// Dealer portal (B2B) — two ways it shares this repo with the storefront (see dealer-portal.md):
//  - DEV: the dealer SPA is served at /dealer/* from the same dev server (rewritten to dealer.html).
//  - BUILD: `npm run build:dealer` (APP_TARGET=dealer) produces a dealer-ONLY bundle whose entry is
//    emitted as index.html, for the second Vercel project on dealers.deliteauto.com. A normal
//    `vite build` (the storefront project) contains no dealer code at all.
const dealerTarget = process.env.APP_TARGET === 'dealer'

function dealerDevRoutes(): Plugin {
  return {
    name: 'dealer-dev-routes',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = (req.url ?? '').split('?')[0]
        if (/^\/dealer(\/|$)/.test(path) && !/\.[a-z0-9]+$/i.test(path)) req.url = '/dealer.html'
        next()
      })
    },
  }
}

function dealerEntryAsIndex(): Plugin {
  return {
    name: 'dealer-entry-as-index',
    apply: 'build',
    // `post` so Vite's own HTML plugin has already emitted dealer.html into the bundle.
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const html = bundle['dealer.html']
        if (dealerTarget && html) html.fileName = 'index.html'
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), dealerDevRoutes(), dealerEntryAsIndex()],
  build: dealerTarget ? { rollupOptions: { input: 'dealer.html' } } : undefined,
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'supabase/functions/_shared/**/*.test.ts'],
  },
})
