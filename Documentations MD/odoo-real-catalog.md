# Real Odoo Catalog Implementation

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Real Odoo catalog integration (production data path) |
| File           | `Documentations MD/odoo-real-catalog.md` |
| Branch         | figma |
| Owner          | Claude |
| Status         | Done. Stabilized 2026-09-17 — availability semantics split into honest, separately-named fields (see "Stock decision" below); no architectural change. |
| Created        | 2026-09-16 |
| Last updated   | 2026-09-17 |

## Summary

Replaces every remaining mock/scaffold Odoo code path with a real, verified integration: five new
Supabase Edge Functions (`catalog-products`, `catalog-product-detail`, `catalog-categories`,
`catalog-media`, plus the one-off diagnostic `odoo-catalog-classify`) serve real, server-side
filtered/paginated Odoo product data to the storefront, and `src/services/catalog/` gained a
`supabaseCatalogService` that the frontend uses when `VITE_CATALOG_SOURCE=supabase`. Shop, Product
Detail, Brands, Home, the cart, and the recommendation engine were all wired to consume this real
data honestly — including several real gaps in Odoo's schema (no MRP field, no brand attribute in
use, no separate fitment fields, inconsistent stock tracking) that had to be discovered and handled
explicitly rather than assumed.

## Why

The previous integration attempts (`server/odoo/*`, `api/catalog/*`) were built against an
*assumed* schema before any live Odoo connection was reachable — every field name was a guess.
Once `odoo-schema-report.md` verified the real schema (see that doc), this phase's job was to
build the actual production catalog path on top of *only* verified facts, and explicitly refuse to
guess anything the schema report didn't confirm (brand field, MRP field, fitment structure, stock
semantics).

## Scope

**Included:**
- `supabase/functions/_shared/odoo/{client,types,catalog,media,fetch}.ts` — the shared Deno Odoo
  client + catalog domain model (classification config, eligibility domain, normalizers).
- `supabase/functions/catalog-{products,product-detail,categories,media}` — the four production
  Edge Functions.
- `supabase/functions/odoo-catalog-classify` — a kept-around, re-runnable diagnostic that verifies
  the brand/vehicle/other category classification and the stock-tracking decision against live
  data (see "How the classification was verified" and "Stock decision" below).
- `src/services/catalog/supabaseCatalogService.ts` + `catalogService.ts`'s new `"supabase"` source.
- `src/data/types.ts` — additive fields on `Product`/`ProductVariant`/`ProductDetail`/`Category`
  (never removed anything the mock catalog uses).
- `Shop.tsx`, `ProductDetail.tsx`, `Brands.tsx`, `Home.tsx` — real data wiring.
- `CartContext.tsx` — cart persistence rewritten (see "Cart identity" below), variant-aware
  quantity/remove/subtotal throughout `CartDrawerItem.tsx`/`CartDrawer.tsx`/`Cart.tsx`.
- `src/lib/recommendations/engine.ts` — fixed three real-data correctness bugs (see "Recommendation
  engine adjustments").
- `tests/interaction/real-catalog.spec.ts` (new) + `shop-catalog.spec.ts` (updated).

**Explicitly not included** (per the task's own instructions):
- Delite Admin — not started.
- Any storefront visual/layout redesign.
- Deleting `api/catalog/*`/`server/odoo/*` (kept for parity/rollback — see "Legacy path").
- A `Brand` product.attribute (id 9) integration — confirmed unused, not built on.
- MRP — confirmed absent, not fabricated.

## Verified facts this implementation encodes

Everything below was confirmed via real `search_read`/`search_count` calls against the live
instance (server `19.0+e`), not assumed. See `odoo-schema-report.md` for the original schema
introspection and the "How to re-run this" sections below for how each fact here can be
re-verified.

### Catalog eligibility (non-catalog record filtering)

Verified via `odoo-catalog-classify`: the 7 known non-catalog POS/service records ("Standard
delivery", "Booking Fees", "Tips", "Settle Due", "Deposit", "Down Payment (POS)", "Service on
Timesheets") **all** have `website_published = false` AND `is_published = false`. Every sampled
genuine catalog product has **both true**. That pair alone cleanly separates the two groups — no
reliance on category name/id, which could change:

```ts
// supabase/functions/_shared/odoo/catalog.ts
export const CATALOG_ELIGIBILITY_DOMAIN: unknown[] = [
  ["sale_ok", "=", true],
  ["active", "=", true],
  ["website_published", "=", true],
  ["is_published", "=", true],
];
```

Every catalog-facing Edge Function (`catalog-products`, `catalog-product-detail`) builds its
domain starting from this constant. `catalog-product-detail` additionally requires `id = <the
requested id>` in the same domain, so guessing a non-catalog template id via the detail endpoint
also 404s — verified live against id 2 ("Booking Fees").

### Category classification (`_shared/odoo/catalog.ts`)

`product.public.category` is confirmed **flat** (every one of 37 real records has `parent_id =
false`) and mixes vehicle type, brand, promo tags, and product-type tags as siblings. Delite layers
a classification **on top**, never duplicating the category's own name (always resolved live):

```ts
export const VEHICLE_TYPE_CATEGORY_IDS = { car: 1, bike: 2 };
export const BRAND_CATEGORY_IDS = [23, 24, 25, 28, 29, 30, 31, 32, 33, 34, 35, 38, 39, 41, 42, 43, 49, 51, 52, 53, 54, 55, 56, 57, 58, 60, 61, 62];
export const OTHER_CATEGORY_IDS = [11, 12, 13, 17, 18, 21, 59]; // promo tags + product-type tags
```

**How the classification was verified** (not a name guess): `odoo-catalog-classify` fetched **all
37** real `product.public.category` records (not a 40-record sample — confirmed that's the true
total) with a real `search_count` of `product.template` against each one's `public_categ_ids`
membership. The 9 ids excluded from `BRAND_CATEGORY_IDS` were cross-checked against real product
co-occurrence — e.g. category 59 ("CAR MATS") appears on the same real products as category 1
("CAR") and category 25 ("4N"), confirming it's a product-type tag riding alongside a real vehicle
tag and a real brand tag, not a brand itself. All 28 `BRAND_CATEGORY_IDS` are real,
recognizable brand names (Wurth, Pricol, Nakamichi, Uno Minda, JBL, JVC, etc.) with real,
non-zero product counts (verified in the same pass).

Re-run: `curl -X POST https://<ref>.supabase.co/functions/v1/odoo-catalog-classify -H "Authorization: Bearer <publishable-key>" -H "x-internal-token: <INTERNAL_DIAGNOSTICS_TOKEN>"`

### Brand

The formal `product.attribute` "Brand" (id 9) is confirmed **unused** (zero values in a 40-record
sample) — never used as the brand mechanism. Brand is instead resolved from `public_categ_ids`
against `BRAND_CATEGORY_IDS`:

```ts
function resolveBrand(ids: number[], categoryNameById: Map<number, string>) {
  const brandId = ids.find((id) => BRAND_CATEGORY_IDS.includes(id));
  if (brandId === undefined) return null; // genuinely unclassified — not "no brand"
  return { id: brandId, name: categoryNameById.get(brandId) ?? `Category ${brandId}` };
}
```

### Vehicle type

Same `public_categ_ids` field, category 1 = CAR / 2 = BIKE. **Not every product is tagged** — an
empty result is surfaced as `vehicleTypes: []` on the DTO, which the frontend maps to
`Vehicle = "unknown"`, never `"universal"`. `"universal"` is reserved for a product genuinely
tagged with **both** category 1 and 2 — a real claim, not a fabricated one. See
`src/data/types.ts`'s `Vehicle` type doc comment.

### Fitment

All fitment/make/model/year/trim data is one `product.attribute` ("Model", id 10) with free-text
values like `"Brezza 2024 / LXI"`. **Never parsed.** `splitFitmentAndAttributes` in
`_shared/odoo/catalog.ts` pulls every `product.template.attribute.value` row where
`attribute_id[0] === FITMENT_ATTRIBUTE_ID (10)` into `{ id, label }` pairs, preserving Odoo's own
label verbatim (including its own `"Model: Brezza 2024 / LXI"` display-name convention — that
prefix is Odoo's, not something this code adds). Verified live against real template id 101
("Posh Vegan Leather Car Seat Cover For Maruti Brezza") — two real fitment values, both preserved
as raw strings; `fitmentValueId` filtering (`?fitment=7`) confirmed to correctly narrow
`catalog-products` results via `["attribute_line_ids.value_ids", "in", [id]]`.

### MRP

Confirmed **not present** on this instance — no field, no second pricelist concept. The normalized
DTO always sets `mrp: null`; `ProductDetail.tsx`'s existing `{product.mrp && ...}` strike-through
block already no-ops correctly with no change needed — it was already written defensively.

### Stock — the one finding that changed the original plan

**Original assumption:** gate variant purchasability on `qty_available`/`free_qty` > 0.

**What `odoo-catalog-classify`'s live `stockCheck` actually found:** of 365 real `product.product`
records, only **6 (1.6%)** have any nonzero value across `qty_available`, `free_qty`, or
`virtual_available` — the other 359 are genuinely `active`/`sale_ok`/website-published catalog
items that all show **zero** across every stock field. This store does not operationally track
inventory quantities for the vast majority of its catalog.

**Decision:** purchasability is driven by the variant's `active` flag, **not** its stock quantity.
The numeric stock value is still surfaced on every variant for informational display, but a zero
does not disable Add to Cart.

**2026-09-17 stabilization pass — semantics split into five honest fields, not one conflated
`available`/`stock` pair:** the original single `available: boolean` was found, on audit, to be
silently equal to `active !== false` with no way for a reader (human or AI) to tell that apart from
a real inventory claim — exactly the trap this decision's own doc comment warned against. Fixed by
replacing it, on both `CatalogVariant` and `CatalogProduct`, with:

- `catalogActive` — Odoo's own `active` flag, record-level, says nothing about inventory.
- `inventoryQuantity` — the raw `free_qty`/`qty_available` number, honest, can be 0, purely informational.
- `inventoryTracked` — the store-level operational fact from this section (`false`), now an
  exported constant (`STORE_INVENTORY_TRACKED` in `_shared/odoo/catalog.ts`) instead of an implicit
  assumption baked into the formula.
- `inStock` — `inventoryQuantity > 0`, purely inventory-derived, **never** business-rule-adjusted.
- `purchasable` — the actual Add-to-Cart gate: `catalogActive && (inStock || !inventoryTracked)`.
  This is the field the frontend (`Product.purchasable`/`ProductVariant.purchasable`, renamed from
  `available`) actually gates on — identical real-world behavior today (since
  `inventoryTracked = false`), but now every consumer of the DTO can see *why* a product is
  purchasable instead of inferring it from a single ambiguous boolean.

`inventoryTracked` is deliberately a **store-wide constant**, not a per-item computation: Odoo
returns `0` identically whether a specific item is genuinely tracked-and-empty or simply never
tracked, so there is no reliable per-item signal to tell the two apart — computing it per-product
would be fabricating precision that doesn't exist. This was a real, load-bearing design decision
made during the audit, not an oversight.

A real gap was also found and fixed on the frontend while auditing consumers of this field:
`ProductDetail.tsx`'s `canAddToCart` previously ignored the selected variant's own availability
entirely for a single-variant or variant-less product (it only checked "IS a variant selected",
never "IS the selected/implicit variant purchasable") — a product with exactly one archived variant
could have shown an enabled Add to Cart button. Fixed to gate on `purchasable` in both the
variant-present and no-variant branches.

This is documented in `normalizeVariant`'s own doc comment in `_shared/odoo/catalog.ts` so a future
reader/AI doesn't re-collapse these back into one ambiguous flag. **Follow-up:** if this store later
adopts real inventory tracking (quants populated broadly), flip `STORE_INVENTORY_TRACKED` to `true`
after re-running `odoo-catalog-classify`'s `stockCheck` and confirming materially different numbers
— `purchasable` will then correctly also require `inStock` with no other code change needed.

Re-run: same `odoo-catalog-classify` call above; see the `stockCheck` field in its response.

### Media

`product.image` (gallery) is a real, distinct-per-record model — verified live: template 24's
gallery entry (`product.image` id 89) returned a genuinely different 69KB image, not a duplicate of
the 358KB primary `product.template.image_1920`. `catalog-media` was extended to accept
`model=product.image` (in addition to `product.template`/`product.product`) so gallery photos
render their own real photo instead of repeating the primary image.

## Architecture

```
React (Shop/ProductDetail/Brands/Home)
  → src/services/catalog/supabaseCatalogService.ts  (fetch, Authorization: Bearer <publishable key>)
    → Supabase Edge Functions (Deno)
      catalog-products        — GET, paginated/filtered list
      catalog-product-detail  — GET, one product by slug or id
      catalog-categories      — GET, real product.public.category + role + brand counts
      catalog-media           — GET, allowlisted binary image proxy
        → supabase/functions/_shared/odoo/{client,catalog,fetch,media,types}.ts
          → Odoo JSON-RPC (common.login + object.execute_kw)
```

React never talks to Odoo directly, never receives raw Odoo field names, and no Odoo credential
ever leaves the Supabase Edge Function runtime (verified — see "Security" below).

## Implementation notes

- `supabase/functions/_shared/odoo/client.ts` — the canonical Deno Odoo JSON-RPC client (replaces
  the earlier flat `_shared/odoo.ts`, which has been deleted; `odoo-schema` was migrated onto this
  file with a one-line import change and re-verified working). `odoo-health` deliberately keeps its
  own separate inline login logic (already deployed/working — not worth the risk of touching).
- `_shared/odoo/types.ts` — raw Odoo record shapes, every field annotated with its verified status.
- `_shared/odoo/catalog.ts` — the classification config, eligibility domain, field lists, slug
  helpers, media URL builder, and all DTO normalizers (`normalizeProduct`, `normalizeVariant`,
  `splitFitmentAndAttributes`, `normalizeCategoryRecord`). This is the one file that knows Odoo's
  real field names for the catalog path.
- `_shared/odoo/fetch.ts` — batched composite fetchers shared by the list and detail endpoints
  (`fetchVariantsByTemplateId`, `fetchTemplateAttributeValuesByTemplateId`,
  `fetchGalleryImagesByTemplateId`, `normalizeTemplates`). Every fetch here is one `search_read`
  across the *whole* page's ids — never one call per product/variant (see "Performance" below).
- `_shared/odoo/media.ts` — the media-proxy allowlist + binary fetch/content-type sniff logic.
- **Rate limiting**: every multi-call Edge Function here (like `odoo-schema` before it) runs its
  Odoo RPC calls **sequentially** with a small `sleep()` between them, not `Promise.all`. This
  instance genuinely 429s under concurrent load — confirmed again this session when
  `catalog-product-detail`'s original `Promise.all` of 4 batched calls for a multi-variant product
  (id 24) intermittently 502'd with `HTTP 429` from Odoo; fixed by making them sequential.
- `src/services/catalog/supabaseCatalogService.ts` — maps the Edge Functions' `CatalogProduct` DTO
  onto the existing `Product`/`ProductDetail`/`Category` shapes. `brandSlug`/`categorySlug` are
  deliberately `""` for real products (no meaningful single value in Odoo's flat multi-tag model) —
  `brand`/`categories`/`vehicleTypes` are the real source of truth instead.
- `src/pages/Shop.tsx` — rewritten around `catalogService.getProductsPage()` (real server-side
  pagination/filtering) instead of fetch-all-then-filter-in-`useMemo`. Category/vehicle/brand/
  fitment/search/sort are all sent to the server; price/colour/availability/wishlist (no verified
  Odoo domain in this phase) remain an honest client-side refinement on top of whichever page(s)
  are loaded, with the visible count reflecting that refinement rather than a fabricated total.
- `src/pages/ProductDetail.tsx` — real variant selector (auto-selects a single variant, disables
  Add to Cart until a multi-variant product's selection is made), real gallery thumbnails, a new
  Fitment section rendering raw labels, and category/brand-aware breadcrumb fallback for
  Odoo-backed products (`categorySlug` being `""` means `categoryBySlug` can't resolve one).
- `src/context/CartContext.tsx` — **cart persistence was rewritten**, not just extended (see "Cart
  identity" below); this was a real, previously-undiscovered bug, not a speculative improvement.
- `src/lib/recommendations/engine.ts` — three real-data correctness fixes (see below).

## Cart identity (a real bug found and fixed)

The pre-existing `loadCart()` persisted only `{ id, qty, variantId }` and rehydrated the `product`
by looking `id` up in the **static mock** `src/data/products.ts` array. A real Odoo template id
(e.g. `"442"`) is never in that array, so **every real cart line would have silently vanished on
page reload** — not a hypothetical, a real bug this task's own spec explicitly warned about
("must not silently discard... must not silently map to unrelated products"). Fixed by persisting
the full `Product` snapshot directly (no catalog lookup needed at load time at all — works
identically for mock and real data). A pre-migration entry (no embedded `product`) is dropped, not
guessed at — see `CartContext.tsx`'s `loadCart`/`isValidProduct`.

Cart lines also now capture the selected variant's label/price at add-time
(`CartLine.variantLabel`/`variantPrice`), since `Product` (what a list card passes to `addToCart`)
doesn't carry `variants` the way the richer `ProductDetail` a PDP fetches does. `CartDrawerItem`,
`Cart.tsx`, and both subtotal calculations (`CartDrawer.tsx`, `Cart.tsx`) were updated to use
`variantPrice ?? product.price`, and quantity/remove actions now pass `variantId` through so two
different variants of the same product are correctly two independent cart lines (previously,
`setQuantity`/`removeLine` with no `variantId` matched *every* line for that product regardless of
variant — see the inline comments in `CartDrawer.tsx`/`CartDrawerItem.tsx`).

`odooVariantId` (the authoritative Odoo `product.product` id) is threaded through unchanged from
`ProductVariant.odooVariantId` — `ProductDetail.tsx` resolves it via the variant selector, and
`CartLine.variantId` (`ProductVariant.id`, a string) is `String(odooVariantId)` for a real product.

## Recommendation engine adjustments (`src/lib/recommendations/engine.ts`)

Three real, silent scoring bugs were found and fixed — all stem from the same root cause:
`categorySlug`/`brandSlug` are `""` for every real Odoo-backed product, and the pre-existing
scoring code compared them with `===` without checking for emptiness first:

1. **False "same-category"/"same-brand" matches**: `candidate.categorySlug === currentProduct.categorySlug` is `true` for any two unrelated real products (both `""`). Fixed by requiring both sides non-empty before that comparison, with a real-data fallback (`categories`/`brand` id comparison) added alongside it.
2. **False "same-category-as-cart" penalty**: `cartCategories` (built from cart lines'
   `categorySlug`s) would contain `""`, and `cartCategories.has(candidate.categorySlug)` would then
   match *every* real candidate — silently applying a -25 penalty to essentially all real
   recommendations whenever the cart had anything in it. Fixed by filtering `""` out of the set.
3. **Diversity cap collapsing to 2 total results**: `rankAndDiversify`'s per-category cap
   (`MAX_PER_CATEGORY = 2`) grouped by raw `categorySlug` — every real candidate collided into one
   `""` bucket, capping PDP/cart-cross-sell results at 2 regardless of how many genuinely different
   products scored. Fixed with a `diversityKey()` helper that falls back to the first real category
   id, then the product's own id, so real candidates are never spuriously grouped together.

Also added `isVehicleWildcard()`: `"unknown"` (real data with no verified vehicle tag) is treated
the same as `"universal"` for **scoring/inclusion** purposes (never exclude a candidate just
because its vehicle classification is missing) — but this is a gating decision only, never a
label; nothing in the UI renders an unclassified product as "Universal fit".

All of these were caught by re-reading the engine against the real DTO shape, not by a failing
test — the existing `engine.test.ts` suite (11 tests, all still passing) only ever exercised the
mock catalog's non-empty `categorySlug`/`brandSlug` values, so it could not have caught them.

## Interfaces / data

**`CatalogProduct` DTO** (returned by `catalog-products`/`catalog-product-detail`, defined in
`_shared/odoo/catalog.ts`):

```ts
interface CatalogProduct {
  id: string; odooTemplateId: number; slug: string; name: string; sku?: string;
  price: number; mrp: number | null; description?: string;
  categoryIds: number[]; categories: { id: number; name: string }[];
  brand: { id: number; name: string } | null;
  vehicleTypes: ("car" | "bike")[];
  fitment: { id: number; label: string }[];
  attributes: { attributeId: number; attributeName: string; values: { id: number; label: string }[] }[];
  variants: { odooVariantId: number; sku?: string; name: string; price: number; attributes: { attribute: string; value: string }[]; catalogActive: boolean; inventoryQuantity: number; inventoryTracked: boolean; inStock: boolean; purchasable: boolean }[];
  primaryImage: string; media: { id: string; url: string; alt: string }[];
  catalogActive: boolean; purchasable: boolean;
  stockSummary: { totalOnHand: number; anyVariantInStock: boolean; anyVariantPurchasable: boolean };
  websitePublished: boolean;
}
```

See "Stock decision" above for why `catalogActive`/`purchasable`/`inventoryQuantity`/
`inventoryTracked`/`inStock` are five separate fields, not one `available` boolean (2026-09-17).

**Endpoints:**
- `GET catalog-products?page&pageSize&q&category=<id>&vehicle=car|bike&brand=<id>&fitment=<id>&sort=relevance|price-asc|price-desc|name` → `{ items, page, pageSize, total, totalPages }`
- `GET catalog-product-detail?slug=<slug>|id=<id>` → `CatalogProduct` or 404
- `GET catalog-categories` → `{ categories: { id, name, role, productCount? }[] }` (`productCount` only on `role: "brand"` rows)
- `GET catalog-media?model=product.template|product.product|product.image&id=<id>&field=image_1920|...` → raw image bytes
- `POST odoo-catalog-classify` (diagnostic, `x-internal-token` gated) → category classification data + `knownNonCatalogRecords`/`genuineCatalogSample`/`stockCheck`

**Frontend `Product`/`ProductDetail`/`Category` additions** (`src/data/types.ts`, all additive,
all optional): `Vehicle` gained `"unknown"`; `Product` gained `vehicleTypes`, `brand`, `categories`,
`primaryImage`; `ProductVariant` gained `catalogActive`, `inventoryQuantity`, `inventoryTracked`,
`inStock` (2026-09-17 — see "Stock decision"); `ProductDetail` gained `fitment`,
`productAttributes`; `Category` gained `role`, `productCount`. `Product.available` and
`ProductVariant.available`/`.stock` were **renamed** to `purchasable`/`inventoryQuantity`
(2026-09-17, not additive — every consumer, `Shop.tsx`/`ProductDetail.tsx`/
`recommendations/engine.ts`, was updated in the same pass; see "Stock decision").

**`CatalogService` interface** (`src/services/catalog/types.ts`) gained `getProductsPage(query):
Promise<PagedProductResult>` — implemented by all three services (`mockCatalogService`,
`httpCatalogService`, `supabaseCatalogService`).

## Dependencies

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (client-side, non-secret) — already
  present from the Supabase Edge Functions work.
- `VITE_CATALOG_SOURCE=supabase` — new value, selects `supabaseCatalogService`.
- Odoo secrets (`ODOO_BASE_URL`/`ODOO_DATABASE`/`ODOO_USERNAME`/`ODOO_API_KEY`) — Supabase-only,
  already configured from prior sessions; nothing new added here.
- No new npm packages.

## Testing / verification

**Live data (all via direct `curl` against the deployed functions, and via the browser/Playwright
against the running dev server with `VITE_CATALOG_SOURCE=supabase`):**
- `catalog-categories`: 37 real categories, correctly split into `vehicle`/`brand`/`other` roles;
  28 brand rows carry real, non-zero `productCount`s (e.g. 4N=8, ALP=20, matching the classify
  diagnostic's own counts).
- `catalog-products`: default list (345 total eligible templates), `vehicle=car` (97 results, all
  correctly tagged), `brand=25` (8 real "4N" products), `q=activa` (5 real name matches),
  `fitment=7` (1 correct match — the real Brezza product).
- `catalog-product-detail`: id 24 ("ACTIVA SEAT COVER") returns 3 real variants with real
  Black/Blue/Gray attribute labels and distinct `odooVariantId`s; id 101 returns 2 real raw fitment
  labels, never parsed; id 2 ("Booking Fees", a known non-catalog record) correctly 404s.
- `catalog-media`: `product.template` id 24 primary image (358KB, `image/webp`) and its
  `product.image` id 89 gallery entry (69KB, genuinely different bytes) both load correctly.
- Security: `dist/assets/*.js` grepped for `ODOO_API_KEY`/`ODOO_USERNAME`/`ODOO_DATABASE`/the raw
  API key value — zero matches; only the safe Supabase project ref appears.
- `npm run build`, `npm run lint` (no new errors — one new unused-import warning introduced and
  fixed; remaining warnings are pre-existing, same pattern already used elsewhere in the codebase),
  `npm run typecheck:server`, `npm run test:unit` (34 passed, 1 skipped, all pre-existing) all
  clean.
- Playwright: `tests/interaction/real-catalog.spec.ts` (new, 3 tests — non-catalog exclusion,
  multi-variant selection gating + successful add, real fitment label display) and
  `tests/interaction/shop-catalog.spec.ts` (updated to be source-agnostic) — **all 5 pass when run
  serially** (`--workers=1`). See "Known issues" for why serial matters.

## Known issues / follow-ups

- **Playwright + this Odoo instance's rate limiting**: running the new real-catalog tests with
  Playwright's default parallel workers intermittently produces a real `502 Catalog temporarily
  unavailable` (confirmed via server log: Odoo returned `HTTP 429`) because multiple workers hit
  the same live, rate-limited Odoo instance simultaneously. The app's own error handling behaved
  correctly (a genuine error state, not a silent mock fallback) — this is a test-environment
  concurrency limitation, not an application bug. Run `tests/interaction/real-catalog.spec.ts` with
  `--workers=1` (or a dedicated low-concurrency project) until/unless this Odoo instance's rate
  limit is raised.
- **Pre-existing `networkidle` timeouts** in `tests/interaction/cart-drawer.spec.ts` and
  `cart-recommendations.spec.ts` (15 tests): both use `page.waitForLoadState("networkidle")`, which
  never resolves against a Vite dev server (its HMR WebSocket keeps the connection "busy"
  indefinitely — a known Vite/Playwright incompatibility). This predates this task (these test
  files were untracked/never-run at the start of this session) and is unrelated to the catalog
  work; `shop-catalog.spec.ts`/`real-catalog.spec.ts` were written to wait for a concrete element
  instead and pass reliably. Fixing the other two files is a test-infra task outside this phase's
  scope.
- **Price/colour/availability/wishlist filters** on Shop have no verified Odoo domain in this
  phase — they remain an honest client-side refinement over whatever page(s) are already loaded,
  not a server-wide filter. A future phase could add real domain support if these become priority
  filters for the live catalog (colour in particular would need a real Odoo attribute-based
  mechanism — no such data currently exists in `product.colors` for real products).
- **Recommendation candidate pool is capped at 100 products** for real data
  (`supabaseCatalogService.getProducts()` calls `getProductsPage({ pageSize: 100 })` once) — a
  practical tradeoff to avoid an unbounded full-catalog fetch for a secondary cross-sell/related
  surface; the actual Shop/PDP purchase paths always use real, complete server-side pagination.
- **Cart-drawer highlight-scroll ref is keyed by `product.id` only**, not `(product.id,
  variantId)` — if a cart ever holds two lines for the *same* product with two different variants,
  the "just added" scroll/highlight could target either line. This is a cosmetic edge case (not a
  data-correctness one — quantity/remove/subtotal are all correctly variant-scoped), left as a
  known follow-up rather than expanding `itemRefs`'s keying in this phase.
- **`CategoryGrid.tsx`** (confirmed dead/unrouted in an earlier phase) remains untouched.
- Legacy `api/catalog/*` / `server/odoo/*` (Vercel routes) are **not deleted** — kept for
  parity/rollback per this task's own instruction. They still run against the older, unverified
  assumed-schema code and should not be treated as production-ready; `httpCatalogService.ts` is
  documented as legacy-only.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-16 | Claude | Initial version — real Odoo catalog implementation: shared Deno client/catalog/media modules, four production Edge Functions + one diagnostic, verified category classification (37 real categories, 28 confirmed brands) and catalog eligibility domain, verified stock decision (98% of catalog has no tracked quantity — purchasability driven by `active`, not stock), Shop/PDP/Brands/Home wired to real paginated/filtered data, cart persistence bug fix (real cart lines were being silently discarded on reload), three recommendation-engine real-data scoring bugs fixed, new Playwright coverage. |
| 2026-09-17 | Claude | Stabilization pass — re-verified full live recovery after an Odoo API key rotation (345 products, 37 categories, non-catalog exclusion, car/bike/brand/fitment filters, multi-variant + gallery product all re-confirmed against live data). Fixed the availability-semantics audit finding from this pass: the single conflated `available`/`stock` fields (silently `= active`, not real inventory) were replaced with five honest fields — `catalogActive`, `inventoryQuantity`, `inventoryTracked` (now an exported `STORE_INVENTORY_TRACKED` constant), `inStock`, `purchasable` — on both `CatalogVariant` and `CatalogProduct`, threaded through `supabaseCatalogService.ts` and `src/data/types.ts` (`Product.available`/`ProductVariant.available`/`.stock` renamed to `purchasable`/`inventoryQuantity`). Fixed a real bug found while auditing consumers: `ProductDetail.tsx`'s `canAddToCart` didn't check the selected/implicit variant's own purchasability for a single-variant or variant-less product. No architectural change — same live data, same business rule, now honestly named and fully documented. See `odoo-supabase-edge-functions.md`'s new "Operational note: API key rotation" section for the recovery procedure. |
