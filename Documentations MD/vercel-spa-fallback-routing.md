# Vercel SPA Fallback Routing Fix

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Vercel SPA fallback routing (fixes direct-navigation 404s) |
| File           | `Documentations MD/vercel-spa-fallback-routing.md` |
| Branch         | fix/vercel-spa-routing |
| Owner          | Claude |
| Status         | Done |
| Created        | 2026-10-13 |
| Last updated   | 2026-10-13 |

## Summary

Direct navigation (or a hard refresh) to any client-side React Router route other than `/` —
e.g. `https://www.deliteauto.com/shop?vehicle=bike` — returned a bare Vercel 404 instead of the
storefront. Fixed by adding a root-level `vercel.json` with a catch-all rewrite to `/index.html`.

## Why

This was flagged (but explicitly left out of scope) during the 2026-10-13 storefront performance
pass — see [storefront-performance-2026-10.md](storefront-performance-2026-10.md), "Remaining
bottlenecks." It's a real, user-facing production bug: any customer who refreshes the page,
bookmarks a Shop filter URL, shares a product link, or arrives via an external link straight to
`/shop`, `/cart`, `/product/:slug`, etc. (rather than navigating in-app from `/`) hits a dead 404
page instead of the site.

## Scope

**Included:** the `vercel.json` rewrite rule and verifying it doesn't break static assets or the
legacy `/api/*` serverless routes.
**Not included (explicitly, per instruction):** Odoo routing, DNS, checkout, Supabase — untouched.

## Root cause

This project is a client-side-rendered Vite + React Router SPA (`BrowserRouter`, not a
server-rendered framework with its own routing). The only real file Vercel's static host actually
has is `dist/index.html` (plus the built JS/CSS/image assets) — routes like `/shop` or
`/product/some-slug` only exist as client-side React Router routes, resolved entirely in the
browser *after* `index.html` and its JS have loaded. When a browser requests `/shop` directly (a
fresh navigation, not a client-side route change), Vercel looks for a matching static file or
serverless function at that exact path, finds neither, and returns its own 404 — the React app
never gets a chance to boot and claim the route, because `index.html` itself was never served for
that path.

`/` worked because it *is* a real file Vercel serves directly (the SPA's entry point). Every other
route depends on React Router, which only runs after `index.html` has already loaded — so without
an explicit rewrite, any URL other than `/` (or a file that genuinely exists, like
`/assets/index-*.js`) has nothing for Vercel to serve.

## Fix

Added `vercel.json` at the project root:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

This tells Vercel: for any request path that doesn't match a real static file or serverless
function, serve `/index.html` instead of a 404. The browser then loads the SPA shell, React
Router reads the actual URL (`window.location`), and renders the matching route — exactly as if
the user had navigated there from inside the app.

## Why this doesn't break static assets or the `/api/*` routes

Vercel's rewrite behavior gives the filesystem (built static assets) and serverless functions
priority over rewrites by default: a rewrite only applies when nothing else already matches the
requested path. Concretely:

- `/assets/index-*.js`, `/assets/*.css`, `/images/*.png`, `/favicon.svg`, etc. are real files in
  the build output — they continue to be served directly, untouched by the rewrite.
- `/api/catalog/*`, `/api/internal/odoo/*` (the legacy Vercel serverless routes under
  `api/` — see `src/services/catalog/httpCatalogService.ts`) are real serverless functions — they
  continue to be invoked directly, not rewritten to `index.html`.
- The production checkout handoff's cross-domain navigation (`www.deliteauto.com` →
  `shop.deliteauto.com/checkout/handoff`) is on a different host entirely and is unaffected.
- Only paths with no matching file or function — every React Router route — fall through to
  `index.html`.

## Interfaces / data

No code, schema, or API changes — a single new static config file (`vercel.json`).

## Dependencies

None new. Depends on Vercel's standard static-deployment rewrite behavior (no framework preset
change, no build command change).

## Testing / verification

- `npm run build` / `lint` / `typecheck:server` / `test:unit` — all clean (same pre-existing,
  unrelated `engine.test.ts` Node-20-WebSocket failure as every other pass this session).
- Production, after deploy — direct navigation (not in-app) confirmed to return the real app
  (not a Vercel 404) for: `/`, `/shop`, `/shop?vehicle=bike`, `/cart`, and a real product detail
  route. ("`/wishlist`" isn't a route this app has — there's no standalone wishlist page; wishlist
  state lives in the account area, not flagged as a gap, just not a real URL to test.)
- Spot-checked a real `/api/catalog/*` request still resolves to its serverless function (not
  rewritten to `index.html`) after the deploy, confirming the rewrite's filesystem/function
  priority behaved as documented above, not just assumed.

## Known issues / follow-ups

None. This is a complete, standard fix for the SPA-fallback-routing class of issue.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-13 | Claude | Initial version — added `vercel.json` with a catch-all SPA fallback rewrite, fixing direct-navigation/refresh 404s on every React Router route except `/`. Verified live in production and confirmed the legacy `/api/*` serverless routes and static assets are unaffected. |
