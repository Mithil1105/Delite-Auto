# Figma Shop/Product/Odoo Integration

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Shop/Product Detail rebuild + Odoo catalog architecture |
| File           | `Documentations MD/figma-shop-product-odoo-integration.md` |
| Branch         | figma                                   |
| Owner          | Claude (pairing with the user)          |
| Status         | In Progress — Odoo/catalog scaffolding, shared `ProductCard`, Shop, Product Detail (desktop+mobile), and a mobile-search Header fix are done; desktop mega-menus (Cars/Shop by Brands dropdowns) deferred |
| Created        | 2026-09-08                              |
| Last updated   | 2026-09-08                              |

## Summary

A larger continuation of the Figma homepage rebuild: bring Home, Shop, Product Detail,
Header/mobile-nav, and product imagery into one consistent architecture, backed eventually by a
real Odoo catalog through a server-side proxy instead of local mock data.

This happened in two passes within the same day. **Pass 1** (no Shop/PDP/Header screenshots yet)
built the Odoo/catalog service-layer scaffolding, expanded the product domain model, and fixed
`CategoryIconStrip` to use real photos. **Pass 2** (after the user shared 4 Figma screenshots
covering Shop desktop-with-filters, Shop desktop-no-filters, Shop mobile, Product Detail desktop,
Product Detail mobile, and a Header mega-menu/filter-sidebar reference) consolidated the two
competing product-card components into one shared `ProductCard`, and rebuilt `Shop.tsx` and
`ProductDetail.tsx` from the old dark-theme design onto the new Figma design system end to end
(desktop and mobile). The Header's desktop mega-menus (Cars/Shop by Brands dropdown content) were
**not** built — see Known issues — but a real, scoped fix (a dedicated mobile search icon/row,
replacing the old "search only inside the nav drawer" behavior) was.

## Why

The user provided a large, detailed spec (drafted with the help of another AI assistant, using a
gap-analysis document this session had written — see `figma-gap-analysis.md` at the repo root)
covering: a full Odoo-backed catalog architecture, a Shop page rebuild, a Product Detail page
rebuild, responsive Header/nav work, a shared `ProductCard` system, and loading/error states.

Before starting, this session found and corrected a factual error in its own prior documentation
that the spec had been partly built on: `src/lib/productImages.ts` and `categoryImages.ts`
already wire real catalog photos into `ProductArt` (used by `ProductCard`, `HomeProductCard`, and
`ProductDetail`) — the claim that product images were "unused" / that there was "no code path" to
a real photo was wrong. See the correction notes in `figma-gap-analysis.md` and
`figma-homepage-redesign.md`.

Given the corrected picture and the size of the ask, three scoping questions were asked and
answered before implementation:
1. **Shop/PDP/mobile-Header screenshots** — none had been shared; the user said they'd share them
   (not yet received as of this doc). Those sections are deliberately not attempted here to avoid
   "redesigning" an unseen Figma screen from a text description alone.
2. **Odoo access** — none available. Scaffolding only; no credentials invented, no live
   integration claimed.
3. **Deployment target** — Vercel, per the user's choice (matching the original spec's
   suggestion). The API layer below is built as Vercel serverless functions under `api/`.

## Scope

**In scope (this pass):**
- Product/media/variant/colour domain model additions (`src/data/types.ts`) — additive only.
- A `catalogService` abstraction (`src/services/catalog/`) with a mock implementation (wraps
  existing local data) and an HTTP implementation (calls the new API routes).
- Server-only Odoo scaffolding (`server/odoo/`) — client, types, normalizer, media-URL resolver.
  **Not connected to a real Odoo instance** — no credentials were available to verify any of it.
- Vercel serverless API routes (`api/catalog/`) that serve the local mock catalog today and have
  a clearly marked TODO branch for a real Odoo call once field mappings are confirmed.
- `.env.example` (placeholders only) + `.gitignore` update so a real `.env` is never committed.
- `CategoryIconStrip.tsx`: swapped in real photos for the 3 categories where `categoryImages.ts`
  genuinely depicts the label (Car Seat Covers, Car Mats, Audio System); left the other 4 on their
  icon fallback rather than show a mismatched/misleading photo (Handle Grips and Steel Guard would
  otherwise both show the same "bike-guards" photo, which is actually a side stand; Bike Seat
  Covers has no real product in the mock catalog to photograph at all — see Known issues).

**Added in Pass 2 (after Shop/PDP/Header screenshots arrived):**
- `src/components/product/ProductCard.tsx` — the single shared card, replacing both
  `src/components/ProductCard.tsx` (old dark theme) and `src/components/home/HomeProductCard.tsx`
  (Figma redesign, Home-only). Both old files were deleted; every usage (Home's 4 carousels,
  Shop's grid, Product Detail's related products) now imports the one component.
- `Shop.tsx` rebuilt end to end: centered "SHOP ALL" heading, breadcrumb, products-count +
  Show/Sort/Filter toolbar, a collapsible filter sidebar (`Category type`, `Brands`, `Model name`,
  `Availability`, `Price`, `Colors` — each its own accordion section), the required
  3-column-with-sidebar / 4-column-without-sidebar grid behavior (verified — see Testing), real
  numbered pagination (`Prev 1 2 3 … N Next`) on desktop, and a single-column grid with a
  "Load More" button (not pagination) on mobile, plus a filter drawer on mobile.
- `ProductDetail.tsx` rebuilt end to end: breadcrumb, gallery + thumbnail strip, price with a
  computed "SAVE n%" badge, star rating with a "+ Write a Review" link that jumps to the Reviews
  tab, colour swatches, a "Select Car Variant" dropdown, quantity stepper, `Add to Cart`
  (dark pill) / `Pay with` (gold pill) buttons, a "More Payment Options" link, a share row,
  4 tabs (Description/Reviews/Return & Exchange/Delivery & Payment), a feature-details table,
  two supporting images under Description (one with a play-button overlay standing in for the
  reference's video), a "You might also like" carousel, and the shared benefits row — all
  reachable and in the reference's order on both desktop and mobile.
- `Header.tsx`: added a dedicated mobile search icon that opens a focused search row (separate
  from the nav drawer), replacing the old behavior where search was only reachable by opening the
  full menu drawer. Removed the now-redundant search field that used to live inside that drawer.
- Reused the existing `TrustBadgesRow` (Free Delivery/Easy Returns/100% Genuine/24/7 Support) on
  both Shop and Product Detail — it already matched the spec's "shared benefits component" ask,
  so no new component was created (see Known issues for why).

**Still NOT in scope / not done:**
- **Header desktop mega-menus** (Cars dropdown, Shop by Brands dropdown — brand-logo grids,
  accessory icon grids, nested model dropdowns) — deliberately deferred given the scope already
  delivered in this pass; the nav links still work, they just don't expand into the rich reference
  mega-menu content. Flagged plainly rather than shipping a weak version.
- Wiring any page (`Home.tsx`, `Shop.tsx`, `ProductDetail.tsx`) to actually call `catalogService`
  instead of importing `src/data/products.ts` directly — the service layer exists and is
  type-checked but nothing consumes it yet (see Testing). Deliberate: swapping a working,
  synchronous page to an async service is a real behavioral change (loading/error states) that
  deserves its own pass, not a drive-by edit riding on this one.
- A real Odoo call anywhere. Every `api/catalog/*` route and `server/odoo/*` file is scaffolding.
- Product Detail's gallery thumbnails repeat the single real photo each product has (see
  Known issues) rather than showing real alternate angles — no per-product multi-photo data
  exists yet.
- "Select Car Variant" always shows one option (the product's own name) — no product in the mock
  catalog has `ProductVariant[]` populated yet, so there's nothing real to list.

## Implementation notes

- **`src/data/types.ts`** — added `ProductMedia`, `ProductVariant`, `ProductColour`, and
  `ProductDetail` (extends `Product` with a required `media` array, optional `variants`/
  `colours`). `Product` itself only gained one new optional field (`available?: boolean`) —
  everything else is additive via the new interfaces, so no existing code needed to change.
  Deliberately did **not** add any `odoo*` field to `Product`/`ProductDetail` — per the spec's own
  "React components must NOT know about Odoo field names" rule, that mapping lives entirely in
  `server/odoo/normalizeProduct.ts`.
- **`src/services/catalog/`**:
  - `types.ts` — the `CatalogService` interface (`getProducts`, `getProductBySlug`,
    `getCategories`, `getRelatedProducts`) and `ProductListQuery`.
  - `mockCatalogService.ts` — wraps `src/data/products.ts`/`categories.ts` (plus
    `productImages`/`categoryImages` for `ProductDetail.media`) in resolved promises. This is what
    the app uses by default.
  - `httpCatalogService.ts` — calls `/api/catalog/*` with `fetch`. Not currently used by any page
    (see Scope).
  - `catalogService.ts` — picks between the two via `VITE_CATALOG_SOURCE` (see Environment
    variables below). Exported as the single thing a page should ever import.
- **`server/odoo/`** (server-only — never import from `src/`):
  - `types.ts` — `OdooProductRecord`/`OdooCategoryRecord`, explicitly marked as **assumed**
    shapes based on Odoo's standard `product.template`/`product.category` models, not verified.
  - `client.ts` — `odooExecuteKw()` (Odoo's generic `object.execute_kw` RPC) and
    `isOdooConfigured()`. Implements `common.login` for a uid, caches it per warm serverless
    instance. **Never exercised against a real Odoo instance.**
  - `normalizeProduct.ts` — maps a raw Odoo record to `Product`/`ProductDetail`. `brandSlug` and
    `vehicle` have no obvious standard Odoo field and are left as `""`/`"universal"` with a `TODO`
    — this store almost certainly tracks them as a custom field or attribute, which needs
    confirming against the real instance.
  - `media.ts` — resolves a product's image to a same-origin proxy URL
    (`/api/catalog/media/:model/:id/:field`) rather than pointing the browser at Odoo directly.
- **`api/catalog/`** (Vercel serverless functions, file-based routing):
  - `products.ts` → `GET /api/catalog/products` (filters: `vehicle`, `category`, `brand`, `tag`,
    `q`, `limit`).
  - `products/[slug].ts` → `GET /api/catalog/products/:slug`.
  - `categories.ts` → `GET /api/catalog/categories`.
  - `media/[model]/[id]/[field].ts` → `GET /api/catalog/media/:model/:id/:field` — returns `501`
    always (not implemented; see Known issues).
  - Every route checks `isOdooConfigured()` and logs a warning if Odoo *is* configured but the
    real query path isn't implemented yet, then serves local mock data either way. None of these
    files are covered by `tsconfig.app.json` (`include: ["src"]`), so `npm run build`/`tsc -b`
    doesn't type-check them — Vercel type-checks its own functions at deploy time. They're
    loosely typed (`req: any, res: any`) rather than importing `@vercel/node`, which isn't a
    project dependency yet (see Dependencies).
- **`src/components/home/CategoryIconStrip.tsx`** — each item now optionally carries an `image`
  (from `categoryImages`); the circle renders the real photo via `object-cover` when present,
  the existing Lucide icon otherwise. See Scope above for which 3 of 7 got a real photo and why
  the other 4 didn't.
- **`.env.example`** (new) + **`.gitignore`** — added `ODOO_BASE_URL`/`ODOO_DATABASE`/
  `ODOO_USERNAME`/`ODOO_API_KEY` placeholders and `VITE_CATALOG_SOURCE`; `.gitignore` now ignores
  `.env`/`.env.*` (except `.env.example`) so real credentials can never be committed.
- **`src/vite-env.d.ts`** (new) — types `VITE_CATALOG_SOURCE` on `import.meta.env` (the project
  had no `vite-env.d.ts` before this).

**Pass 2 additions:**
- **`src/components/product/ProductCard.tsx`** (new — replaces the two deleted files noted
  above). Identical markup/logic to the old `HomeProductCard`, just relocated and made the single
  source of truth.
- **`src/pages/Shop.tsx`** (rewritten) — `PAGE_SIZE = 9`; a local `FilterSection` accordion
  component; `page` state drives both desktop pagination (`slice((page-1)*PAGE_SIZE,
  page*PAGE_SIZE)`) and mobile cumulative Load-More (`slice(0, page*PAGE_SIZE)`) — both grids are
  rendered (one hidden via `hidden lg:grid` / `lg:hidden`) rather than branching on viewport width
  in JS, since this is a client-only SPA with no matchMedia hook already in the codebase; a new
  `sidebarOpen` boolean toggles between `lg:grid-cols-[220px_1fr]` (3-col grid) and
  `lg:grid-cols-1` (4-col grid) — satisfies the "filters closed ⇒ 4 columns, not just a hidden
  sidebar" requirement. New URL params: `model` (substring match on product name — see Known
  issues), `availability` (`"in"`/`"out"`, reads the new `Product.available` field), `color` (hex
  match against `Product.colors`).
- **`src/pages/ProductDetail.tsx`** (rewritten) — `tab` state (`description|reviews|returns|
  delivery`); `savePercent` computed from `price`/`mrp`; gallery thumbnails resolved via
  `productImages`/`categoryImages` (same lookup `ProductArt` uses internally) since `Product`
  itself has no media array outside of `ProductDetail` (which nothing here constructs — this page
  still reads `Product` directly from `src/data/products.ts`, per the "not wiring pages to
  catalogService yet" decision above).
- **`src/components/Header.tsx`** — new `mobileSearchOpen` state; a `md:hidden` search icon button
  toggles a focused search row (`md:hidden` div, its own `<form>`) that sits between the header
  bar and the nav drawer in the DOM; removed the old search `<form>` that lived inside the `open`
  nav-drawer block.
- **`src/i18n/{en,hi,gu}.ts`** — added ~19 new keys under `shop` (e.g. `shopAllTitle`,
  `categoryType`, `modelName`, `availability`, `colorsLabel`, `loadMore`, `paginationPrev/Next`)
  and ~16 under `product` (e.g. `descriptionTab`, `coloursLabel`, `selectCarVariant`, `payWith`,
  `saveBadge`, `returnExchangeBody`, `deliveryPaymentBody`) — additive to both namespaces, all
  three languages updated in lockstep (required — `hi.ts`/`gu.ts` are typed as `typeof en`).

## Interfaces / data

- `ProductMedia { id, type: "image"|"video", src, alt, thumbnail? }`
- `ProductVariant { id, label, sku?, price?, mrp?, available?, mediaId? }`
- `ProductColour { id, name, hex?, mediaId? }`
- `Product.available?: boolean` (new optional field)
- `ProductDetail extends Product { media: ProductMedia[]; variants?: ProductVariant[]; colours?: ProductColour[] }`
- `CatalogService { getProducts(query?), getProductBySlug(slug), getCategories(), getRelatedProducts(product, count?) }`
- `ProductListQuery { vehicle?, categorySlug?, brandSlug?, tag?, search?, limit? }`
- REST-ish endpoints: `GET /api/catalog/products`, `GET /api/catalog/products/:slug`,
  `GET /api/catalog/categories`, `GET /api/catalog/media/:model/:id/:field` (the last returns
  `501` — not implemented).

## Odoo architecture

```
Browser
   |
   v
src/services/catalog/catalogService.ts   (picks mock vs http via VITE_CATALOG_SOURCE)
   |
   v  (http mode only)
api/catalog/*.ts                          (Vercel serverless functions)
   |
   v
server/odoo/client.ts  (odooExecuteKw, isOdooConfigured)
   |
   v
Odoo JSON-RPC  (/jsonrpc — common.login, then object.execute_kw)
```

`server/odoo/normalizeProduct.ts` is the only place Odoo field names may appear — everything
above it in the stack (API routes, catalog service, React) only ever sees `Product`/
`ProductDetail`. This isolation is real today (the types file has zero Odoo-specific fields) even
though the Odoo call itself isn't implemented yet.

### Environment variables

Server-only (never `VITE_`-prefixed, never sent to the browser):
- `ODOO_BASE_URL`, `ODOO_DATABASE`, `ODOO_USERNAME`, `ODOO_API_KEY` — read only by
  `server/odoo/client.ts` inside `api/catalog/*` functions (Node runtime).

Client-side, non-secret:
- `VITE_CATALOG_SOURCE` — `"mock"` (default) or `"http"`. Selects which `CatalogService`
  implementation `src/services/catalog/catalogService.ts` exports. Carries no credentials.

See `.env.example` for placeholders. No `.env` file was created or committed.

## Image policy

- **Marketing/decorative** (hero vehicle compositions): stock photos are acceptable here per the
  spec's own policy. `public/images/hero/car.png`/`bike.png` remain in this bucket — see
  `figma-homepage-redesign.md` for their history. Not moved to `public/images/marketing/` in this
  pass (no other file references that path yet; happy to do the rename as a follow-up once the
  Shop/PDP work also needs to agree on an asset layout).
- **Catalog/product imagery**: already flows through `productImages.ts`/`categoryImages.ts` →
  `ProductArt` for 37 of 39 products (pre-existing, not new). The new `mockCatalogService`/
  `httpCatalogService` reuse the same two lookup tables for `ProductDetail.media`, so a product's
  detail-page gallery and its card image are guaranteed to be the same photo, sourced once.
- **Fallback policy**: unchanged from the existing `ProductArt` behavior (icon-on-gradient when no
  photo is mapped) — `CategoryIconStrip` now follows the same principle explicitly (see Scope).

## Dependencies

- No new npm packages added. `@vercel/node` is referenced in comments as a recommended dev
  dependency for proper `VercelRequest`/`VercelResponse` typing on the `api/` functions, but
  wasn't installed — the functions type-check loosely (`any`) instead, since they sit outside
  `tsc -b`'s scope anyway.
- Depends on `figma-homepage-redesign.md`'s prior work (Hero, Shop-by-Cars/Bikes) staying intact;
  nothing in this pass touched those files.
- Blocked on: real Odoo credentials (live integration); Header desktop mega-menu content
  (deferred, not blocked — see Known issues).

## Testing / verification

- `npx tsc -b --noEmit` — clean, no errors (re-checked after every file change across both passes).
- `npm run lint` (oxlint) — same 3 pre-existing warnings throughout (`LanguageContext.tsx` x2,
  `CartContext.tsx` x1, all `react(only-export-components)`, unrelated to this work); no new
  warnings introduced by either pass.
- `npm run build` — clean production build, re-verified after Pass 2.
- **Pass 1**: manually screenshotted the homepage (Playwright) after the `CategoryIconStrip`
  change — confirmed real photos render for Car Seat Covers/Car Mats/Audio System, icon fallback
  for the other 4.
- **Pass 2**: manually screenshotted (Playwright, `http://localhost:5174`):
  - `/shop` at 1440px — breadcrumb, centered "SHOP ALL", products count, Filter/Sort controls,
    sidebar with one accordion section open, 3-column grid all render as expected.
  - Clicked the "Filter" toggle and re-screenshotted — sidebar disappears, grid genuinely
    re-flows to 4 columns (not just a hidden sidebar with the same 3-column grid), and the toggle
    button shows an active (filled) state.
  - `/shop` at 390px (mobile) — single-column cards, `Filter` pill + `Sort by` dropdown row, no
    sidebar.
  - A product detail page at 1440px (full page) — gallery + 4 thumbnails, price/save-badge/
    rating/write-review row, colours, variant dropdown, quantity, both purchase buttons, share
    row, tabs (Description active), description + feature table + two images, "You might also
    like" carousel, benefits row, footer — all present and in the reference's order.
  - The same product detail page at 390px (mobile, full page) — same content, single-column,
    stacked in the reference's mobile order.
  - Did **not** click through every tab (Reviews/Return & Exchange/Delivery & Payment) or every
    filter combination in a screenshot — verified those by reading the code path, not visually.
- The `catalogService`/`api/catalog/*` scaffolding still isn't exercised end-to-end (no page
  calls it) — verified only by type-checking and reading the code by hand, same as Pass 1.
- No Odoo testing was performed or could be performed — no credentials were available. Stated
  plainly rather than implied otherwise, per the original spec's own instruction.

## Known issues / follow-ups

- **Deferred (not blocked), needs a decision on priority:** Header desktop mega-menus (Cars
  dropdown → popular brands + accessory icon grid; Shop by Brands dropdown → car/bike brand logo
  grids). The reference shows substantial additional content here; building a shallow version
  felt worse than flagging it plainly. `vehicleBrands.ts`/`brands.ts`/`categories.ts` already have
  the data this would need.
- **Blocking, needs the user:** real Odoo credentials, plus confirmation of the actual field
  names for brand, vehicle (car/bike/universal), and category, before `normalizeProduct.ts`'s
  mapping can be trusted or the `api/catalog/media` proxy implemented.
- `api/catalog/media/[model]/[id]/[field].ts` always returns `501` — genuinely not implemented,
  not just "falls back to mock," since there's no local equivalent of an Odoo binary-image
  endpoint to fall back to.
- No page consumes `catalogService` yet (see Scope) — `Home.tsx`/`Shop.tsx`/`ProductDetail.tsx`
  still import `src/data/products.ts` directly.
- `Shop.tsx`'s "Model name" filter is a plain substring match against the product's display name
  (there's no distinct "model" field in the mock catalog) — a real implementation needs Odoo's
  actual model/variant data.
- `Shop.tsx` renders both the desktop and mobile product grids in the DOM simultaneously (one
  hidden via CSS) rather than branching in JS, since there's no viewport-width hook in the
  codebase yet — functionally correct but means product cards mount twice per page load. Fine at
  the current catalog size; worth a `matchMedia` hook if the catalog grows much larger.
- `ProductDetail.tsx`'s thumbnail strip repeats the single real photo each product has 4 times —
  there's no per-product multi-angle photography in `public/images/products/` to show instead.
- `ProductDetail.tsx`'s "Select Car Variant" dropdown always has exactly one option (the
  product's own name) — no mock product has `ProductVariant[]` populated.
- `CategoryIconStrip`'s "Bike Seat Covers" link (`/shop?category=seat-covers&vehicle=bike`) points
  at a combination with zero matching products in the current mock catalog (all three
  `seat-covers` products are `vehicle: "car"`) — pre-existing behavior, not introduced by this
  change, but worth the user knowing about since it surfaced while auditing this component.
- **Resolved in Pass 2** (kept here struck through in spirit, not deleted, so the history reads
  honestly): `ProductCard`/`HomeProductCard` are now one component
  (`src/components/product/ProductCard.tsx`); no separate `StoreBenefits.tsx` was created because
  the existing `TrustBadgesRow` already matched the spec's ask and is now reused on both Shop and
  Product Detail, not just Home.
- Hero/marketing images were not moved to a `public/images/marketing/` directory as the original
  spec suggested — left at `public/images/hero/` since nothing else needed to change and moving
  files with no other changes felt like churn; revisit if/when image organization comes up again.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-08 | Claude | Initial version (Pass 1) — Odoo/catalog service-layer scaffolding, product domain model expansion, CategoryIconStrip real-photo fix. Shop/PDP/mobile-Header rebuild deliberately not started (blocked on Figma references) |
| 2026-09-08 | Claude | Pass 2 — after the user shared Shop/PDP/Header screenshots: consolidated `ProductCard`, rebuilt `Shop.tsx` and `ProductDetail.tsx` (desktop + mobile) to match, added a mobile header search icon/row. Header desktop mega-menus deliberately deferred |
