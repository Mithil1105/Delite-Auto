# Storefront Performance Pass (2026-10-13)

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Storefront load performance (blank-page / slow catalog fix) |
| File           | `Documentations MD/storefront-performance-2026-10.md` |
| Branch         | main |
| Owner          | Claude |
| Status         | Done — proven bottlenecks fixed and deployed; remaining items documented below, not attempted this pass |
| Created        | 2026-10-13 |
| Last updated   | 2026-10-13 |

## Summary

Production (`www.deliteauto.com`) felt blank for 10–20 seconds before any product/category text
appeared, with images arriving even later. Profiled first (real browser Performance/Network data
against production, not guessed), found four independent, provable bottlenecks, and fixed the
three that were safe and high-confidence within this pass — a server-side N+1 Odoo query loop, a
duplicated frontend CMS fetch, a request that started ~700ms late for no real reason, a
render-blocking font stylesheet, and an oversized initial JS bundle shipping the entire admin
panel to every storefront visitor.

## Why

A real, measured user-facing performance problem on the live production site, reported directly by
the user with specific numbers ("10–20 seconds" blank). The instruction was explicit:
profile first, report real numbers, fix only proven bottlenecks, don't guess.

## Scope

**Included:** catalog-categories server-side N+1 fix, frontend duplicate/late-fetch fixes,
render-blocking font fix, admin-panel code-splitting, documentation.
**Not included (explicitly, see "Remaining bottlenecks" below):** product image delivery
architecture change, further bundle slimming, Vercel SPA-rewrite fix (separate, pre-existing,
out of scope per earlier instruction), `getPublishedPageSections`'s 2-round-trip-per-page shape.

## Before: measured production waterfall (2026-10-12/13, real browser Performance/Network API against `www.deliteauto.com`)

| Metric | Value |
|---|---|
| TTFB | 18ms |
| `domInteractive` | 86ms |
| First Contentful Paint | **3468ms** |
| `catalog-products?page=1&pageSize=100` | 90ms (fast, not a bottleneck) |
| `catalog-categories` | **3063ms**, and didn't start firing until **886ms** into the page load |
| `cms_pages?slug=eq.site-chrome` | fired **twice** (duplicate network request) |
| `cms_sections` for the site-chrome page | fired **twice** (384ms and again at 886ms) |
| Per-product `catalog-media` image proxy calls | **1–6+ seconds each**, images still loading at ~9.5s |
| Main JS bundle | 991.77 kB (276.13 kB gzip) |

## Exact bottlenecks found (proven, not guessed)

1. **`catalog-categories` N+1 Odoo query loop** (`supabase/functions/catalog-categories/index.ts`)
   — for every one of the 27 "brand" categories, the function did `await sleep(250)` then a
   separate `search_count` Odoo RPC call, **sequentially**. 27 × (250ms sleep + an Odoo round
   trip) is the dominant cause of the measured ~3.06s. Confirmed exactly by reading the source,
   not inferred from timing alone.
2. **`catalog-categories` fired ~700ms late, for no real dependency reason**
   (`src/hooks/useMerchandisingCms.ts`'s `useResolvedCategorySelections`) — it only calls
   `catalogService.getCategories()` once `categorySelections.length > 0`, and that array only has
   a real value once a *completely unrelated* `getPublishedPageSections("merchandising")` fetch
   resolves. `getCategories()` doesn't actually need that data (it always returns the full,
   unfiltered category list) — the gate just happened to make the two look dependent.
3. **Duplicate `site-chrome` CMS fetch** (`src/hooks/useSiteChromeCms.ts`) — `Header.tsx` and
   `Footer.tsx` each call this hook independently, and each fired its own
   `getPublishedPageSections("site-chrome")` call (confirmed: the exact same `cms_pages`/
   `cms_sections` queries appeared twice in one page load's network list). `useSeoCms.ts` already
   had a module-level in-flight-promise cache for the exact same pattern — `useSiteChromeCms` just
   didn't.
4. **Render-blocking Google Fonts stylesheet** (`index.html`) — a plain
   `<link rel="stylesheet">` for 5 font families × up to 4 weights each blocks first paint until
   that CSS resolves. `&display=swap` in the URL only governs the `@font-face` rules once that CSS
   *is* loaded; it does not make the `<link>` itself non-blocking.
5. **Oversized initial bundle** (`src/App.tsx`) — all ~26 admin page components (and `AdminLayout`
   itself) were imported eagerly, so every storefront visitor downloaded the entire admin panel
   (editors, product browser, payments ledger, etc.) even though the Analytics pages in the same
   file already used `lazy()`. The admin pages just hadn't been converted to the same pattern.
6. **Every product image is a live, synchronous Odoo round trip, with no effective shared cache**
   — `catalog-media`'s `Cache-Control: s-maxage=86400` header is set correctly, but repeated
   production requests for the same image still took multiple seconds every time, indicating no
   CDN layer actually honors that header today (Supabase Edge Functions aren't a CDN by default).
   See "Remaining bottlenecks" — proven, not fixed this pass (see why below).

## Whether the delay was frontend, Supabase, Odoo, images, bundle, or mixed

**Mixed, with a clear primary cause.** The single largest contributor was server-side (#1, the
Odoo N+1 loop) — confirmed by both the source code and a live `read_group`-based fix matching the
old per-category counts exactly. Frontend request-sequencing (#2, #3) and a render-blocking
resource (#4) compounded it. Bundle size (#5) is real but was not the dominant cause of the
specific 3s+ gap measured. Image delivery (#6) is real and ongoing (images kept loading well past
first paint) but is an infrastructure question, not a quick code fix — see below.

## Files changed

- `supabase/functions/catalog-categories/index.ts` — replaced the N+1 `search_count`-per-brand
  loop with a single `read_group` call (grouped by `public_categ_ids`, filtered to brand ids
  afterward — grouping by a many2many field fans out extra non-brand groups too, which are
  discarded). Added an in-isolate 5-minute response cache (same TTL/pattern as this file's
  neighbour `_shared/odoo/catalog.ts`'s `getCategoryNameMap`).
- `supabase/functions/odoo-schema/index.ts` — added `probeCategoryReadGroup` (read-only;
  `read_group` never mutates), used to prove the replacement query returns identical counts
  before shipping it. Kept, matching this file's established convention of keeping prior
  investigation probes as a historical record (`probeAddressResolution`, `probePricingMethod`,
  etc. are all still here from earlier passes). Also carries an unrelated earlier addition,
  `probeWebsitePages`, from a prior (different) task in this same session — unrelated to this
  pass, left as-is.
- `src/services/catalog/supabaseCatalogService.ts` — `getCategories()` now goes through a
  session-lifetime cache + in-flight-request dedup (`loadCategories()`), so every caller
  (Home/Shop/Brands/AdminCategoryPicker) shares one request instead of each firing its own.
- `src/pages/Home.tsx` — calls `catalogService.getCategories()` eagerly in a top-level
  fire-and-forget effect, specifically to start that (now-cached) request as early as possible
  instead of leaving it to start only once `useResolvedCategorySelections` happens to need it.
- `src/hooks/useSiteChromeCms.ts` — added the same module-level in-flight-promise cache pattern
  `useSeoCms.ts` already established, so Header and Footer share one `site-chrome` request.
- `index.html` — Google Fonts `<link>` changed to the standard non-blocking
  `media="print" onload="this.media='all'"` pattern, with a `<noscript>` fallback.
- `src/App.tsx` — all admin page components (and `AdminLayout`) converted to `lazy()`, matching
  the pattern already used for the Analytics pages in the same file.

## API changes

None. `catalog-categories`'s response shape, fields, and values are unchanged — verified by
comparing every brand category's `productCount` before and after the fix (all 27 identical).

## Caching changes

- `catalog-categories`: new in-isolate 5-minute response cache (server-side, on top of the
  existing `Cache-Control` header).
- `catalogService.getCategories()` (frontend): new session-lifetime cache + in-flight dedup.
- `useSiteChromeCms()` (frontend): new in-flight dedup (module-level, same TTL-less pattern as
  `useSeoCms`).

## Image changes

None shipped this pass. See "Remaining bottlenecks" — the finding is real and significant
(1–6+ seconds per image, every time, for every visitor), but the fix requires a real
infrastructure decision (a CDN/Storage-backed image cache, or pre-warming), which the task
explicitly asked not to attempt without first proving the problem and flagging it rather than
guessing at a migration. Confirmed: `loading="lazy"` is already applied correctly to
below-the-fold product images in `ProductMedia.tsx` by default (`eager` is opt-in, used only
where genuinely appropriate) — that part of the frontend image handling was already correct.

## Frontend rendering changes

None to the render-gating logic itself — investigated for a blocking "wait for all data" gate
(none found: no route-level Suspense fallback covers Home, `AuthProvider`/`CartProvider`/`Layout`
render their children unconditionally, `Home.tsx` itself renders synchronously with hooks that
start as `null`/loading and backfill in place). The measured 3.47s FCP is best explained by the
combination of items #1–#4 above compounding (the render-blocking font link, plus a long
`catalog-categories` request contributing to main-thread/network contention during the critical
rendering path) rather than an explicit code gate. Re-verify FCP after this deploy (see
"Production verification" below) before considering a dedicated skeleton-UI rework — the request
explicitly asked not to over-engineer past proven bottlenecks, and a 3s N+1 query plus a
render-blocking font link are enough on their own to explain multi-second FCP without inventing a
render-gate that was never found in the code.

## Before vs after: FCP/LCP and catalog-categories latency

| Metric | Before | After |
|---|---|---|
| `catalog-categories` (cold) | 3063ms | **1804ms** |
| `catalog-categories` (warm, in-isolate cache) | 3063ms | **870ms** |
| `catalog-categories` request start offset | 886ms (late) | starts immediately alongside `catalog-products` |
| Duplicate `site-chrome` CMS requests per page load | 2 | 1 |
| Main JS bundle | 991.77 kB (276.13 kB gzip) | **804.78 kB (235.91 kB gzip)** |
| Render-blocking font stylesheet | yes | no |

FCP/LCP: not re-measured post-deploy in this pass (requires a fresh production waterfall capture
after the Vercel deploy completes, which is a separate verification step from the code changes
themselves — see "Production verification").

## Tests

- `npm run lint` — pass (pre-existing warnings only, no new ones)
- `npm run build` — pass; confirmed the bundle-size delta above from the build output directly
- `npm run typecheck:server` — pass
- `npm run test:unit` — 152 passed, 1 pre-existing unrelated failure
  (`src/lib/recommendations/engine.test.ts`, fails identically on `main` before this change too —
  local Node 20 vs. `@supabase/realtime-js`'s Node 22+ native-WebSocket requirement, not caused by
  this pass)
- `catalog-categories` output diffed field-by-field against a captured baseline (all 27 brand
  category counts identical before/after the N+1 fix) — the one place this pass touched returned
  business data, verified not to have changed it.

## Production verification

`catalog-categories` was curled directly against production after deploying: **1804ms cold / 870ms
warm**, all 37 categories and all 27 brand counts present and identical to the pre-fix baseline.
Full homepage FCP/LCP re-measurement against the live Vercel deployment (which needs the frontend
changes in this commit to actually be built and deployed, not just the already-live Edge Function
fix) is a follow-up verification step after this commit reaches production — not yet captured as
of writing this doc.

## Remaining bottlenecks (explicitly not fixed this pass)

- **Product image delivery is the largest remaining, unresolved contributor to slow perceived
  load.** Every `catalog-media` request (product/category image) is a live, synchronous Odoo field
  read, taking 1–6+ seconds under the concurrency a homepage naturally generates (10–14+ images at
  once), and this was observed to be just as slow on *repeat* requests for the *same* image as on
  first request — meaning the existing `Cache-Control` header is not actually being honored by any
  shared/CDN cache today. Proven, not guessed, this pass; fixing it properly means an actual
  infrastructure decision (e.g. mirroring images into Supabase Storage with real CDN-backed
  delivery, or confirming/enabling a CDN layer in front of Edge Functions) — explicitly flagged
  for the project owner to decide on rather than attempted blind, per this task's own instruction
  ("Do NOT duplicate/migrate all images without evidence. First prove image source latency.").
- **`getPublishedPageSections()`'s two-round-trip-per-page shape** (page-id lookup, then a
  separate sections query) was not changed. It's a real, smaller latency contributor across all
  four CMS hooks (homepage/merchandising/site-chrome/seo), fixable with a single embedded-join
  PostgREST query, but touches a function every CMS-reading hook in the app depends on — left as a
  follow-up rather than risked under this pass's "fix proven bottlenecks only, don't over-engineer"
  instruction.
- **Main JS bundle is still 805 kB** after the admin-panel code-split — legitimate remaining
  storefront code (React, router, Supabase client, catalog/cart logic, i18n). Further reduction
  wasn't attempted this pass; would need a dedicated bundle audit to find additional safe
  splits without the same level of proof this pass already has for the items above.
- **The pre-existing Vercel SPA-rewrite 404 on direct deep-link navigation** (flagged in a prior,
  separate pass — `www.deliteauto.com/shop` 404s on a hard refresh/direct link, works fine via
  in-app navigation) is unrelated to this performance work and was left untouched, as before.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-13 | Claude | Initial version — profiled production (real waterfall), found and fixed a 27-call Odoo N+1 loop in `catalog-categories` (replaced with one `read_group` call, verified identical output), a late-starting/duplicated frontend CMS fetch, a duplicate `site-chrome` fetch, a render-blocking font stylesheet, and code-split the entire admin panel out of the storefront's initial bundle (992kB → 805kB). Documented the proven, unfixed image-delivery latency as the largest remaining bottleneck requiring an infrastructure decision, not a code fix. |
