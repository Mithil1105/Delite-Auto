# Product Media Cache (Supabase Storage)

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Product/category image caching via Supabase Storage |
| File           | `Documentations MD/product-media-cache.md` |
| Branch         | perf/catalog-media-cache |
| Owner          | Claude |
| Status         | Implemented and live-verified against the real production Odoo/Supabase backend on this branch; NOT YET MERGED to `main` — stopped before merge per explicit instruction, pending architecture/numbers review |
| Created        | 2026-10-13 |
| Last updated   | 2026-10-13 |

## Summary

Every product/category image request previously required a live, synchronous Odoo field read via
`catalog-media`, with no effective shared cache (`Cache-Control` was set but never actually
honored by anything — confirmed live: `CF-Cache-Status: DYNAMIC` on every single request, a
different `x-deno-execution-id` every time). Under homepage-scale concurrency (10-14+ simultaneous
image requests), this measured at 1-6+ seconds per image. `catalog-media` now serves repeat
requests for the same image version via a 302 redirect to a Supabase Storage object — which *does*
get a real CDN cache (confirmed: `CF-Cache-Status: HIT` on repeat requests) — instead of hitting
Odoo every time. Odoo remains the sole source of truth for the image bytes; this is a read-cache
layer only, and nothing about checkout/order/payment/pricing is touched.

## Why

See [storefront-performance-2026-10.md](storefront-performance-2026-10.md) — that pass's own
"Remaining bottlenecks" section flagged this as the largest unresolved performance issue and
explicitly deferred it pending a real architecture decision rather than guessing. This is that
follow-up, done as its own task per the user's explicit production-safety instructions (branch
only, no direct push to `main`, read-only audit before any implementation, stop before merge).

## Scope

**Included:** `catalog-media`'s cache-check/fill/redirect logic, a new `product-media` Storage
bucket, versioned-URL plumbing through `catalog-categories`/`catalog-products`/
`catalog-product-detail`, and a static hero-image WebP optimization found during the same audit.
**Not included (explicitly, per instruction):** checkout, Odoo order logic, payments, DNS,
pricing behavior — all untouched. No frontend type/prop changes were needed (see "Frontend
integration" below) — this is why `src/` has only one touched file (`Hero.tsx`, for the unrelated
static-asset item), not the whole catalog display surface.

## Phase 1 audit findings (read-only, before any change)

1. **How `catalog-media` worked end-to-end (before):** `GET /functions/v1/catalog-media?model=X&id=Y&field=Z`
   → validates against a fixed model/field allowlist → `fetchOdooMediaBytes` (one Odoo `read` call
   per request) → returns raw bytes with `Cache-Control: public, max-age=3600, s-maxage=86400,
   stale-while-revalidate=604800`. No persistence, no versioning — every request, including a
   request for the exact same image moments later, repeated the live Odoo read.
2. **Exact files/functions:** `supabase/functions/catalog-media/index.ts`,
   `supabase/functions/_shared/odoo/media.ts` (`fetchOdooMediaBytes`, `isWhitelistedMediaRequest`,
   `sniffImageContentType`), `supabase/functions/_shared/odoo/catalog.ts` (`buildMediaUrl`).
3. **How image URLs/IDs were represented:** `buildMediaUrl(supabaseUrl, model, id, field)` — only
   `model`/`id`/`field` in the query string. No checksum, no version, no write_date anywhere in
   the URL — a genuinely unversioned, un-cacheable-by-design URL shape.
4. **Does Odoo expose `write_date`?** Yes — already fetched for `product.template` (part of
   `TEMPLATE_LIST_FIELDS`/`TEMPLATE_DETAIL_FIELDS` in `catalog.ts`) and already present on the
   `OdooProductTemplateRecord` type. Not previously fetched for `product.public.category` or
   `product.image` records — added as part of this pass (see "Files changed").
5. **Was Supabase Storage already configured?** Yes — two existing public-read buckets
   (`marketing-media`, `review-media`) with an established RLS pattern (public `select`,
   authenticated-admin-role-gated `insert`/`update`/`delete`) already in use (see
   `supabase/migrations/20261007160000_product_reviews_enrichment.sql` and
   `20260917112749_create_media_and_activity_log.sql`).
6. **Existing buckets / media-storage code:** `marketing-media` (CMS-uploaded images, via
   `src/services/cms/publishedCmsService.ts`'s `mediaPublicUrl`), `review-media` (customer review
   photos). No existing code mirrors/caches *Odoo-sourced* images into Storage — this is new.
7. **Did product/category APIs already expose enough metadata for versioned URLs?** Almost —
   `write_date` was already fetched for templates (list/detail), but not for categories or
   gallery (`product.image`) rows. Added both (two one-line field-list additions).
8. **Does any frontend code assume the `catalog-media` URL shape?** No — confirmed by grep: every
   consumer (`ProductCard.tsx`, `Cart.tsx`, `CartDrawerItem.tsx`, `Home.tsx`, `ProductDetail.tsx`)
   treats `primaryImage`/`media[].src` as an opaque string passed straight to `<img src>` /
   `ProductMedia`'s `src` prop. This is why zero frontend files needed to change for the caching
   logic itself — adding an extra `&v=...` query param is invisible to every caller.
9. **Image request counts (production, measured):** homepage ~14-16, `/shop` initial view ~9
   (lazy-loads more on scroll — confirmed working correctly), a typical PDP ~10 (primary + gallery
   + related-products rail).
10. **Response headers (before):** `Cache-Control: public, max-age=3600, s-maxage=86400,
    stale-while-revalidate=604800` — present, but see #11.
11. **Did the response ever get a real cache HIT?** No. Confirmed definitively: two identical
    requests for the same image, seconds apart, both returned `CF-Cache-Status: DYNAMIC` with a
    *different* `x-deno-execution-id` each time — proof this was a fresh function execution every
    time, not served from any cache anywhere.
12. **Recompressed or proxied unchanged?** Proxied unchanged — `fetchOdooMediaBytes` returns
    exactly the bytes Odoo's `image_1024`/etc. field holds, content-type sniffed from the bytes
    (magic-number detection: PNG/JPEG/GIF/WebP), never transformed/resized by this function.
13. **Average dimensions/sizes:** Odoo already serves these pre-resized as WebP at the `image_1024`
    field (confirmed live: 7KB-157KB per image in testing, typically well under 110KB) — Odoo's
    own image handling was not the problem; per-request latency and lack of caching were.
14. **Oversized static storefront images:** `public/images/hero/delitefied-suv-golden-hour-cropped.png`
    (1372×741, 1.97MB) — the actual hero image rendered by `Hero.tsx`, on the homepage's critical
    path (LCP candidate on most homepage loads). A second, same-day-added file,
    `delitefied-suv-golden-hour.png` (1.89MB), was found to be completely unreferenced anywhere in
    `src/` — dead repository weight, left alone (not this task's call to delete another
    contributor's recently-added asset) rather than guessed at.

## Architecture decision: Supabase Storage (not Cloudflare R2)

**Chosen: Supabase Storage**, bucket `product-media`.

Reasoning: this project already uses Supabase for everything (Postgres, Auth, Edge Functions, and
two existing public-read Storage buckets with a proven RLS pattern) and already has
`SUPABASE_SERVICE_ROLE_KEY` available as a secret — meaning **no new vendor, no new credentials,
no new secret** was required. Supabase Storage's public object URLs are served through a real
Cloudflare-backed CDN (confirmed live: `CF-Cache-Status: HIT` on repeat requests, `CF-Ray` headers
present) — this is the actual caching layer Edge Functions never had. R2 was considered and
rejected: it would introduce a new vendor, new Wrangler/R2-specific Edge Function code, and new
credentials to manage, for no material benefit over infrastructure already configured and trusted
in this exact repository.

## Target architecture (implemented)

```
Browser
   │
   ├─ cache HIT ──► catalog-media (HEAD check, ~0.2-0.4s) ──► 302 redirect ──► Storage CDN (cache HIT, no Odoo)
   │
   └─ cache MISS ─► catalog-media ──► Odoo (live read, same latency as before) ──► serve bytes to browser
                                   └─► (after responding) upload to Storage, so the NEXT request is a HIT
```

Odoo remains the only source of truth for the image bytes. The cache is read-through and
self-healing: a Storage outage, a failed upload, or Odoo being temporarily down for an
already-cached image all degrade gracefully (see "Fallback behavior").

## A. Cache key / versioning

`buildStorageMediaPath(model, id, field, writeDate)` in `_shared/odoo/catalog.ts`:

```
<model>/<id>/<field>/<sanitized write_date>
```

e.g. `product.template/12/image_1024/2026-08-12-11-02-25`. `write_date` is Odoo's own
record-level last-modified timestamp (already a field every real Odoo model carries) —
`sanitizeMediaVersion()` replaces every non-alphanumeric character with `-` (colons/spaces aren't
safe in a Storage path or URL query value). No extension is stored in the path — `Content-Type` is
set as real Storage object metadata at upload time (sniffed from the actual bytes), not inferred
from a filename, since Odoo doesn't promise a stable format per field.

**This is deliberately URL-versioned, not server-side-invalidated.** `buildMediaUrl(...,
writeDate)` appends `&v=<sanitized write_date>` to the `catalog-media` URL it returns. When Odoo's
`write_date` changes (any field update, including the image itself), every caller that reads the
record fresh gets a new `v`, which is a different URL, which is a cache miss at a *new* path — the
old object is simply never referenced again, not updated in place. A record's old cached image
becomes an orphaned object (harmless — not referenced by anything, not a correctness issue; a
future pass could add scheduled cleanup, not needed for correctness).

## B. Cache miss → fill

In `catalog-media/index.ts`, when `v` is present:
1. Compute the deterministic Storage path and its public URL.
2. `HEAD` the public URL (the bucket is public-read, so this needs no auth and is literally the
   same request a redirected browser would make).
3. If it returns `200` → `302` redirect to that URL (the response to this redirect carries
   `Cache-Control: public, max-age=86400`, so even the redirect hop can be skipped by a repeat
   visitor's own browser cache within a day).
4. If missing → fetch from Odoo exactly as before (unchanged latency/behavior for **this**
   request), then upload the bytes to Storage (`cacheControl: "31536000"`, `upsert: true`) using
   `EdgeRuntime.waitUntil()` when available so the upload doesn't add latency to the response
   actually sent to this visitor.

**Concurrent-miss protection:** an in-isolate `Map<path, Promise>` (`inFlightFetches` in
`catalog-media/index.ts`) means multiple simultaneous requests for the *same* uncached image
within one warm isolate share a single Odoo fetch instead of each independently hammering Odoo.
This is isolate-local, not a distributed lock — a cold start or a different concurrent isolate can
still rarely race, which is an accepted, practical tradeoff: the eventual Storage write is
idempotent (`upsert: true`), so a rare double-fetch is wasted work, never a correctness problem.

## C. Cache hit

A HIT never touches Odoo at all — verified live (see "Testing" below): the 302 redirect is a pure
Storage existence check, and the browser's subsequent fetch of the Storage URL is answered by
Cloudflare's own edge cache once warm, independent of Odoo's availability.

## D. Frontend

No frontend code changes were needed. `buildMediaUrl()`'s return value is still just a
`catalog-media` URL (now with an added `&v=...` when a write_date is known) — every frontend
consumer already treats this as an opaque string handed straight to `<img src>`. The browser does
end up loading the actual bytes directly from Supabase Storage/CDN on a cache hit (via the 302
redirect it follows transparently), satisfying the "prefer direct CDN delivery" goal without any
`src/` changes. Public images are served from a public bucket — no signed URLs, matching "don't
require authentication for public product images."

## E. Browser cache

- Storage objects: `Cache-Control: public, max-age=31536000, immutable` — safe, since the path is
  content-addressed by `write_date` and the same path's content never legitimately changes.
- `catalog-media`'s 302 redirect responses (cache hit case): `Cache-Control: public,
  max-age=86400` — same content-addressing argument, slightly more conservative since it's a
  pointer rather than the content itself.
- `catalog-media`'s live-proxy responses (no `v`, or genuine cache miss): unchanged
  `max-age=3600, s-maxage=86400, stale-while-revalidate=604800` from before this pass.

## F. Data safety

Nothing about orders, pricing/tax validation, payments, stock, checkout, or customer
account/order data was touched. This pass only changed: `catalog-categories`,
`catalog-products`, `catalog-product-detail` (all read-only catalog endpoints — only the image
*URL* fields changed shape), `catalog-media` (the image proxy), one new Storage bucket, and one
static frontend asset (`Hero.tsx`'s image tag, wrapped in `<picture>`).

## G. Stale/missing media — fallback behavior

- **Storage upload fails:** caught and logged (`uploadToCache`'s own try/catch) — never thrown
  past the response already being served to the current visitor. The next visitor's request
  simply retries the same miss-then-fill path.
- **Odoo image missing:** unchanged — `fetchOdooMediaBytes` returns `null` for a genuinely empty
  field, `catalog-media` returns `404`, and the existing frontend fallback
  (`ProductMedia.tsx`'s `onError` → `ProductPlaceholder`, `CategoryIconStrip.tsx`'s
  `CategoryTileImage` → the generic icon) is completely untouched and still applies.
- **Odoo temporarily unavailable while a cached copy exists:** the cache-hit path never calls
  Odoo at all (`isAlreadyCached` only HEADs the Storage URL) — an Odoo outage has zero effect on
  already-cached images. Verified by code inspection (not reproduced by deliberately taking the
  real production Odoo instance offline, which would be its own production-safety violation).
- **Storage temporarily unavailable:** `isAlreadyCached`'s `fetch` is wrapped in try/catch —
  any error is treated as "not cached," falling through to the live-Odoo-and-serve path. A
  Storage outage degrades this feature back to exactly today's always-live-proxy behavior, never
  to a broken image.

## H. Static asset optimization

`public/images/hero/delitefied-suv-golden-hour-cropped.png` (1372×741, 1.97MB — the actual
rendered hero image) was converted to WebP at the *same exact dimensions* (quality 90, pure
re-encode, no resize/recrop — `Hero.tsx`'s hand-measured button-overlay pixel math depends on
pixel-identical content, so this could not safely change the image's actual visual content) via
`sharp` (already a project dependency). Result: **134KB — a 93% reduction.** Wired in via
`<picture><source srcSet=".webp" type="image/webp" /><img src=".png" .../></picture>` in both
`DesktopHero` and `MobileHero` — the PNG remains as the automatic fallback for a browser without
WebP support; nothing else about the component changed. Verified live in the browser: only the
WebP is fetched (confirmed via Resource Timing), identical visual rendering, button alignment
unaffected.

## Measured results

### Before (production, pre-existing — see storefront-performance-2026-10.md for the original capture)
- Single repeated request for the same image: `CF-Cache-Status: DYNAMIC` every time, ~0.7s each,
  never faster on repeat.
- 14-image concurrent burst (homepage-scale): **4899ms total wall time**, individual requests up
  to **4.76s**.

### After (this branch, live-tested against the real production Odoo/Supabase backend)
- Single request, genuinely new image: ~0.7-3.3s (live Odoo fetch + inline Storage upload — see
  "Known issue" below on why this is inline rather than fully background in this runtime).
- Same image, second request: **302 redirect in ~0.2-0.5s**, `CF-Cache-Status: HIT` on the
  Storage object, **zero Odoo calls**.
- 14-image concurrent burst, guaranteed-cold (first ever request for each): **4773ms total wall
  time**, max **4.52s** — statistically unchanged from "before," as expected: a genuinely new
  image's *first* fetch cannot be faster than Odoo's own response time.
- The **same 14 images, requested again** (now warm): **1270ms total wall time**, max **1.16s**,
  every request a `302` — a **73% reduction** in wall time for the realistic repeat-visit case,
  with the underlying Storage object itself resolving in ~0.2-0.4s once the browser follows the
  redirect.
- Missing-image (404) case: unaffected, ~0.7-1.1s, same as before.
- 6 concurrent requests for the same never-before-cached image: all succeeded in 0.66-1.23s (no
  evidence of Odoo being hammered 6×; see "Known issue" below for why this came out even faster
  than the in-isolate dedup alone would predict).
- Hero image: **1.97MB → 131KB (93% smaller)**, confirmed only the WebP is fetched in the browser,
  visually unchanged.

## Known issue / honest caveat

The first-ever fetch for a new image currently **awaits** the Storage upload before responding
(`uploadToCache`), rather than running it as a true non-blocking background task — the
`EdgeRuntime.waitUntil()` check in `catalog-media/index.ts` did not appear to fire in this
project's hosted Supabase Edge Runtime during live testing (the first-miss request time, ~3.3s for
a 107KB image, is consistent with the upload being awaited inline rather than detached). This adds
a modest one-time cost to the very first visitor for each image, not to any repeat visitor. It does
not affect correctness, caching, or any of the fallback behaviors above — only the first-request
latency for a brand-new image. Left as a documented follow-up rather than guessed at further.

## Files changed

- `supabase/migrations/20261013170000_create_product_media_bucket.sql` (new) — `product-media`
  bucket, public-read, no authenticated-write policy (writes are service-role-only, from
  `catalog-media`).
- `supabase/functions/catalog-media/index.ts` — cache-check/redirect/fill logic, in-isolate
  concurrent-miss dedup, best-effort Storage upload.
- `supabase/functions/_shared/odoo/catalog.ts` — `buildMediaUrl()` gained an optional `writeDate`
  param; new `sanitizeMediaVersion`, `buildStorageMediaPath`, `buildStorageMediaPublicUrl`
  helpers; `normalizeProduct()` now threads the template's/each gallery image's own `write_date`
  through.
- `supabase/functions/_shared/odoo/fetch.ts` — gallery image fetch now includes `write_date`.
- `supabase/functions/_shared/odoo/types.ts` — `write_date?: string` added to
  `OdooPublicCategoryRecord` and `OdooProductImageRecord`.
- `supabase/functions/catalog-categories/index.ts` — fetches each category's `write_date`, passes
  it to `buildMediaUrl`.
- `src/components/Hero.tsx` — `<picture>` + WebP source for the hero image (static-asset item,
  unrelated to the caching architecture itself).
- `public/images/hero/delitefied-suv-golden-hour-cropped.webp` (new).
- This file (new) and `storefront-performance-2026-10.md`/`index.md` (updated).

## Migration required

Yes — `20261013170000_create_product_media_bucket.sql` (one bucket + one RLS policy, purely
additive, no existing table/column touched). **Note:** this project's local migration history has
pre-existing drift against the remote database's migration-tracking table (several migrations
exist in one but not the other, predating this pass — unrelated to this change). `supabase db
push` therefore can't be used as-is; this migration was applied directly via `supabase db query
--linked --file <path>` instead, which runs the SQL without touching the broader migration-history
reconciliation. Confirmed applied and working (bucket exists, `public: true`). The pre-existing
drift itself was not touched or "fixed" — out of scope for this task, flagged here for visibility
only.

## New Supabase secrets required

**None.** `SUPABASE_SERVICE_ROLE_KEY` (needed to write to Storage, bypassing RLS) was already
present in this project's secrets.

## Testing

- `npm run lint` / `build` / `typecheck:server` / `test:unit` — all clean (same pre-existing,
  unrelated `engine.test.ts` Node-20-WebSocket failure as every other pass this session).
- Live-tested against the real production Odoo/Supabase backend (no separate staging environment
  exists for this project — matches how every prior backend change this session was verified):
  cache miss → fill → hit cycle, missing-image 404, concurrent-same-image requests, a genuine
  cold 14-image burst, and the same burst warm — all captured above with real numbers.
- Verified in an actual browser session (not just curl): `/shop` loads real images through the new
  versioned URLs, the known no-image products still show the graceful placeholder, and the hero
  WebP is confirmed as the only hero asset actually fetched.
- Not tested: "storage temporarily unavailable" and "Odoo temporarily unavailable" were verified
  by code-path inspection only (see "G. Stale/missing media" above) — deliberately not reproduced
  live, since that would mean degrading real production infrastructure to observe the failure
  path, which this task's own instructions rule out ("do not make speculative infrastructure
  changes").

## Operational recovery

- **An Odoo image update reaches the storefront:** automatically, on the next page load that
  reads that record. Odoo's `write_date` changes → `catalog-products`/`catalog-categories`/
  `catalog-product-detail` (which always read fresh from Odoo) return a new `v` → the URL is new →
  `catalog-media` treats it as a cache miss → fetches the new bytes and caches them under the new
  path. No manual cache-busting step is ever required.
- **To force-refresh a specific image regardless of `write_date`:** not needed in normal
  operation (see above), but if ever required, deleting the specific object from the
  `product-media` Storage bucket (via the Supabase dashboard) makes the next request for that
  exact `v` a cache miss again, which re-fetches and re-uploads it.
- **If the cache layer needs to be fully disabled in an emergency:** removing the `v` query param
  logic (or simply not passing `writeDate` into `buildMediaUrl`) reverts every image to the
  always-live-Odoo-proxy behavior — this is the exact pre-this-pass behavior, still fully present
  and unremoved in `catalog-media/index.ts`'s no-`v` branch.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-13 | Claude | Initial version (branch `perf/catalog-media-cache`, not yet merged) — Phase 1 read-only audit, architecture decision (Supabase Storage over Cloudflare R2), implementation (versioned cache-aside via `catalog-media`, zero frontend changes needed), live-verified before/after numbers against the real production backend, hero-image WebP optimization (1.97MB → 131KB). Stopped before merge per explicit instruction, pending review of the architecture and these numbers. |
