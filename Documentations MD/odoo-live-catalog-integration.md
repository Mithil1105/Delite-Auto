# Odoo Live Catalog Integration

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Real Odoo catalog integration (products, categories, media, variants) |
| File           | `Documentations MD/odoo-live-catalog-integration.md` |
| Branch         | figma                                   |
| Owner          | Claude (pairing with the user)          |
| Status         | Code complete, **connection still unverified after two sessions** — see "Known gaps" |
| Created        | 2026-09-15                              |
| Last updated   | 2026-09-15                              |

> **2026-09-15, second pass:** A follow-up task asked to verify against the "deployment
> environment" the project owner had supposedly configured with real `ODOO_*` secrets. That
> environment was not reachable from this session either (no `.env`, no `.vercel` project link, no
> Vercel CLI, no deployment URL documented anywhere in the repo) — same blocker as the first pass,
> confirmed again rather than assumed. What *was* done in that pass, without needing a live
> connection: real server-side category filtering (was a known limitation, now fixed for the
> category dimension using the standard `categ_id`/`public_categ_ids` fields), and migrating
> `Home.tsx`'s product carousels and `Brands.tsx`'s per-brand counts onto `catalogService` (the
> two surfaces explicitly deferred in the first pass). See "Server-side filtering" and "Storefront
> migration" below, and `Documentations MD/odoo-schema-report.md`'s revision log.

## Summary

Replaces the Odoo scaffolding from `figma-shop-product-odoo-integration.md` (which never made a
real call) with a genuine implementation: `api/catalog/*` now calls Odoo via
`server/odoo/client.ts` when configured, normalizes real records to the app's `Product`/
`ProductDetail`/`Category` DTOs, paginates, and fails loudly (not silently) when Odoo is
configured but the call fails. Two new diagnostic endpoints
(`api/internal/odoo/{health,schema}`) let an operator confirm the connection and discover the
real schema. Shop and Product Detail now fetch through `catalogService` instead of importing the
mock data module directly, so flipping `VITE_CATALOG_SOURCE=http` (once verified) requires no
further frontend changes.

**No live Odoo connection was ever reachable while this was built** — no `ODOO_*` credentials
existed locally, and no deployed URL was provided. Sections 25/26 of the originating task
(fetching and eyeballing real products against the Odoo UI) could not be performed. This is
stated plainly per that task's own stop-condition rule, not glossed over — see "Known gaps."

## Why

The prior pass (`figma-shop-product-odoo-integration.md`) explicitly scoped itself to
scaffolding-only because no Odoo credentials were available. This pass's brief was to "make the
connection real," but the same blocker was still true in this environment: no `.env` file, no
Vercel CLI/`vercel.json` to run `api/` functions locally, and no reachable deployment. Rather than
either (a) guessing field names to produce something that looks finished, or (b) doing nothing,
the approach taken was: build everything that can be built and verified without a live
connection (real RPC calls using Odoo's standard/stable fields, pagination, DTOs, media proxy,
frontend migration, normalization tests against fixtures), and make the *custom* field mapping
(brand, vehicle, fitment, MRP) operator-configurable via env vars rather than guessed — so the
moment someone with real access runs the schema endpoint and fills in three env vars, the
integration becomes fully real with no further code changes.

## Scope

**In scope:**
- Real `execute_kw`/`search_read`/`fields_get` calls in `server/odoo/client.ts`.
- Product/category/variant normalization using Odoo's standard, near-universal fields
  (`server/odoo/normalizeProduct.ts`, `productFields.ts`).
- Operator-configurable custom field mapping for brand/vehicle/MRP (`customFieldMap.ts`) — never
  a guessed field name.
- Real `GET /api/catalog/products` (paginated), `GET /api/catalog/products/:slug` (with variants),
  `GET /api/catalog/categories` (tries `product.public.category`, falls back to
  `product.category`).
- Real media proxy (`GET /api/catalog/media/:model/:id/:field`) — whitelisted models/fields,
  decodes Odoo's base64 image field, sniffs content type, sets cache headers.
- Two diagnostic endpoints: `GET /api/internal/odoo/health`, `GET /api/internal/odoo/schema`.
- A stable slug strategy (`name--odooId`) replacing `slugify(name)`.
- Migrated `Shop.tsx` and `ProductDetail.tsx` from importing `src/data/products.ts` directly to
  `catalogService` (async, with loading/error states).
- Recommendation engine (`src/lib/recommendations/engine.ts`) accepts an optional `candidates`
  override, sourced from `catalogService.getProducts()` via a shared, cached
  `useCatalogProducts()` hook — `CartRecommendations` and `ProductDetail`'s "You might also like"
  both use it.
- Cart-line identity extended to `(product.id, variantId)`, not just `product.id`
  (`CartContext.tsx`).
- An "Open in Odoo" URL builder (`server/odoo/adminLink.ts`) — helper only, no admin UI.
- Normalization unit tests (Vitest, fixture-based) and an opt-in live-connection integration test.
- `Documentations MD/odoo-schema-report.md` — a template, explicitly marked NOT VERIFIED
  throughout.

**Also in scope (second pass, 2026-09-15):**
- Real server-side category filtering — `server/odoo/fetchProducts.ts` now builds a genuine Odoo
  domain clause for `category` (previously a documented known limitation: it only narrowed the
  already-fetched page). `brand`/`vehicle` remain post-filtered — see "Server-side filtering."
- `Home.tsx` and `Brands.tsx` migrated onto `catalogService` (previously deferred) — see
  "Storefront migration."

**Explicitly not in scope (per the task):**
- No Delite Admin, no `/admin`, no product create/edit/stock-edit/price-edit from Delite. Odoo
  remains the only place product data is written.
- No real image gallery (multiple photos per product) — only the single primary image
  (`image_1920`) is wired up; see "Media model."
- No real PDP variant-selection UI (the "Select Car Variant" dropdown is unchanged — still a
  single-option stub); `product.variants`/`ProductVariant.attributes` are normalized and available
  on the DTO for a future PDP pass to consume.

## Architecture

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
server/odoo/{fetchProducts,fetchProductDetail,fetchCategories,media}.ts
   |
   v
server/odoo/client.ts  (odooExecuteKw / odooSearchRead / odooSearchCount / odooFieldsGet)
   |
   v
Odoo JSON-RPC  (/jsonrpc — common.login, then object.execute_kw)
```

React never imports anything under `server/odoo/` or `api/` — the only thing that crosses that
boundary is the `Product`/`ProductDetail`/`Category` DTOs returned by `catalogService`. Verified
by grepping the production bundle (see "Security").

## Authentication method

Odoo's documented external JSON-RPC API: `common.login(database, username, api_key)` → uid,
cached per warm serverless instance; then `object.execute_kw(database, uid, api_key, model,
method, args, kwargs)` for every model call. Implemented in `server/odoo/client.ts`. **Not yet
exercised against a real instance** — the request shape follows Odoo's own documentation but has
never returned a real response in this environment.

## Models used

| Purpose | Model | Status |
|---|---|---|
| Product list/detail | `product.template` | Code implemented; field names NOT VERIFIED (see schema report) |
| Product variants | `product.product` | Code implemented; NOT VERIFIED |
| Variant attribute labels | `product.template.attribute.value` | Code implemented; NOT VERIFIED |
| Categories (primary attempt) | `product.public.category` | Code implemented; existence on this instance NOT VERIFIED |
| Categories (fallback) | `product.category` | Code implemented; NOT VERIFIED |

## Custom Delite fields discovered

**None discovered — no live connection was reachable to run `fields_get`.** Brand, vehicle type,
and MRP/compare-at price have no standard Odoo field; `server/odoo/customFieldMap.ts` reads three
optional env vars (`ODOO_BRAND_FIELD`, `ODOO_VEHICLE_FIELD`, `ODOO_MRP_FIELD`) instead of guessing
— unset today, so `normalizeProduct.ts` currently always returns `brandSlug: ""`, `vehicle:
"universal"`, `mrp: undefined` for every Odoo-backed product, exactly like the previous
scaffolding did. See `Documentations MD/odoo-schema-report.md` for how to actually find and
configure these.

## Category model

Tries `product.public.category` (the Website/eCommerce module's customer-facing tree) first,
falls back to `product.category` if that model doesn't exist on this instance
(`server/odoo/fetchCategories.ts`). Which one this store actually needs is unconfirmed.

## Brand mapping

Not mapped — see "Custom Delite fields discovered." `Category`/`Product` DTOs already have the
field (`brandSlug`); it's simply always empty for Odoo-backed products until `ODOO_BRAND_FIELD`
is configured.

## Vehicle mapping

Not mapped — same as brand. `resolveVehicle()` in `normalizeProduct.ts` does a best-effort
substring match ("car"/"bike" appearing in the configured field's raw value or many2one label)
once `ODOO_VEHICLE_FIELD` is set; until then every Odoo-backed product is `"universal"`.

## Fitment mapping

Not modeled at all. No normalized `fitment` field exists on the DTO yet (the task's own
"conceptual shape" included `fitment?: VehicleFitment[]`, but inventing that shape without knowing
whether Odoo represents fitment as an attribute, a tag, or a custom relation would be exactly the
kind of guess the task explicitly forbids). Add this once the schema report identifies the real
mechanism.

## Variant architecture

`product.template` (the sellable "product" concept in Delite's UI) has zero or more
`product.product` variants. `Product.odooId` is the template id; `ProductVariant.odooVariantId` is
the variant's own id — kept distinct, never collapsed into one flat id (see
`src/data/types.ts`). `ProductDetail.variants` is populated by
`server/odoo/fetchProductDetail.ts`, which also resolves each variant's
`product_template_attribute_value_ids` into human-readable `{ attribute, value }` pairs (e.g.
`{ attribute: "Colour", value: "Black" }`) via a second `product.template.attribute.value` read.
`Product.variantCount` (from `product_variant_count`) is available at the list level too, so
`productRequiresSelection()` (`src/lib/recommendations/variants.ts`) can decide "Quick Add" vs.
"Select Options" without fetching the full detail.

## Stock mapping

Uses `qty_available` today — chosen as the most commonly customer-facing stock field, but **not
confirmed** against this store's actual Odoo configuration (multi-warehouse setups, reserved
stock, or a deliberately different "customer-facing available" computation could all mean
`virtual_available` or `free_qty` is more correct here — see `types.ts`, which declares both as
candidates). A product is `available` only when `active !== false && sale_ok !== false &&
qty_available > 0` — an inactive or not-for-sale product is never shown as purchasable regardless
of stock.

## Media model

Only the single primary image (`image_1920`, with `image_1024`/`image_512`/`image_256`/
`image_128` also whitelisted for future use) is wired up, via `server/odoo/media.ts` +
`api/catalog/media/[model]/[id]/[field].ts`. No gallery/multi-image model (e.g. a hypothetical
`product.image` line-item model) is implemented — not confirmed to exist on this instance, and
the task explicitly said not to guess. The proxy fetches via `execute_kw` `read()`, decodes the
base64 payload, sniffs the actual image format from magic bytes (Odoo's `read()` doesn't return a
content-type), and sets `Cache-Control: public, max-age=3600, s-maxage=86400,
stale-while-revalidate=604800`. Model/field access is whitelisted (`product.template`/
`product.product` only; the five `image_*` fields only) — this is the one Odoo-touching endpoint
reachable from the public internet, so it must never become a general "read any Odoo field" proxy.

## Slug strategy

`name--odooId` (e.g. `premium-seat-cover--442`), not just `slugify(name)` — see
`buildStableSlug`/`odooIdFromSlug` in `normalizeProduct.ts`. A live Odoo catalog can have its
product names edited at any time (unlike the static mock data this replaces), and two different
products can slugify to the same string; appending the immutable Odoo id makes the slug both
collision-proof and rename-proof. The **Odoo id, not the slug**, is the canonical identity
everywhere else in the stack (cart lines via `Product.odooId`, the future "Open in Odoo" link).
`GET /api/catalog/products/:slug` parses the id back out of the slug and looks the product up by
id — a slug that doesn't parse, or an id Odoo doesn't have, is a genuine 404, never a silent
substitute product.

## Catalog endpoints

| Endpoint | Behavior |
|---|---|
| `GET /api/catalog/products` | Real Odoo `search_read` when configured; paginated (`page`/`limit` or `offset`/`limit`, default 24, max 60 per request — never the whole catalog at once); total/page/pageSize returned as `X-Total-Count`/`X-Page`/`X-Page-Size` response headers (body stays a plain `Product[]` — no breaking change to `CatalogService`'s existing contract) |
| `GET /api/catalog/products/:slug` | Real Odoo template + variant + attribute-label fetch; genuine 404 for an unresolvable slug/id |
| `GET /api/catalog/categories` | Tries `product.public.category`, falls back to `product.category` |
| `GET /api/catalog/media/:model/:id/:field` | Whitelisted proxy, see "Media model" |
| `GET /api/internal/odoo/health` | Diagnostic — see below |
| `GET /api/internal/odoo/schema` | Diagnostic — see below |

### Server-side filtering

- **`q`** — real Odoo domain clause (`name ilike`) from the start.
- **`category`** — **fixed in the second pass.** `server/odoo/fetchProducts.ts`'s
  `buildCategoryDomainClause` resolves the category slug to a real Odoo category id (via
  `fetchOdooCategories()`) and adds a genuine domain clause: `[["categ_id", "=", id]]` when
  categories come from `product.category`, or `[["public_categ_ids", "in", [id]]]` when they come
  from `product.public.category`. Both field names are standard, documented Odoo fields (not
  guessed) — `categ_id` is the core many2one on `product.template`; `public_categ_ids` is the
  Website/eCommerce module's own field name for that relation since Odoo 13.0. `search_count` uses
  the same domain, so `total` is now accurate for a category-filtered query — this closes the
  pagination gap described below for the category dimension. A slug that matches no real category
  returns `{ items: [], total: 0 }` (a real "no such category"), not "ignore the filter."
- **`brand`/`vehicle`** — **still post-filtered on the fetched page only**, and this is not a
  simple omission: even once `ODOO_BRAND_FIELD`/`ODOO_VEHICLE_FIELD` are configured with the real
  field *name*, building a correct domain clause also needs the field's Odoo *type* (a many2one
  needs `["field", "=", id]` or `["field", "in", [id]]`; a char/selection needs `["field", "=",
  "value"]`) — which only `GET /api/internal/odoo/schema`'s `fields_get` response reveals. Guessing
  the operator/value shape would be exactly the kind of assumption this integration is built to
  avoid. `?brand=dolphin&limit=24` (or `vehicle=`) still fetches 24 templates by `id asc` (now
  also narrowed by `category`/`q` if present) and filters *those* down — `total` in that case
  reflects the category/search domain alone, not further reduced by the brand/vehicle
  post-filter, since that's the honest number computable without fetching the whole catalog.

## Failure behavior

Three distinct states, not two:
1. **Not configured** (no `ODOO_*` env vars) — dev-only fallback to the local mock catalog. Every
   `api/catalog/*` route branches on `isOdooConfigured()` first.
2. **Configured but the Odoo call fails** (auth failure, network error, unknown field, etc.) —
   returns a controlled `502 { error: "Catalog temporarily unavailable" }` (or `"Categories
   temporarily unavailable"`). **Never** falls back to mock data in this state — that could show
   fake price/stock. `Shop.tsx`/`ProductDetail.tsx` render a "Catalog temporarily unavailable" +
   Retry UI in this case (see `shop.catalogUnavailableTitle`/`catalogUnavailableDesc`/`retry` i18n
   keys).
3. **Configured and working** — real data, normalized.

## Security model

- `ODOO_*` credentials are read only inside `server/odoo/client.ts`, only from `process.env`,
  only inside files under `server/`/`api/` — never imported from `src/`. Verified empirically by
  grepping the production `dist/assets/*.js` bundle for every credential env var name and for
  `server/odoo` code signatures (e.g. the `common`/`login` JSON-RPC call shape) — none found (see
  Testing).
- `api/internal/odoo/{health,schema}` never return database/username/API key or a raw Odoo error
  payload — only booleans, a uid, and (for schema) field metadata/tiny samples. Gated by
  `server/odoo/internalAccessGuard.ts`: open in development, refused outright in production unless
  a matching `x-internal-token` header is sent against `INTERNAL_DIAGNOSTICS_TOKEN` (fails closed
  if that env var isn't set — never fails open).
- The media proxy whitelists model (`product.template`/`product.product` only) and field (the five
  `image_*` sizes only) — cannot be used to read an arbitrary Odoo record.
- Query params reaching Odoo (`q`, pagination numbers) are coerced (`String()`/`Number()`) and
  clamped (`limit` capped at 60) before use; no user input is interpolated into RPC method names.

## Mock vs. real mode

`VITE_CATALOG_SOURCE` (`mock` default, `http` for real) — unchanged mechanism from the prior pass,
now genuinely meaningful since `http` mode's server side actually calls Odoo. **Not switched to
`http` in this pass** — there is no way to verify it works from this environment (no reachable
Odoo instance, and no local way to even run the `api/` Vercel functions — no `vercel.json`, no
`@vercel/node`/Vercel CLI installed). Flipping this flag should only happen after `GET
/api/internal/odoo/health` reports `authenticated: true, canReadCatalog: true` against the real
deployment.

## Testing / verification

- `npm run typecheck:server` (new script; `tsconfig.server.json`, new) — clean. `server/`/`api/`
  sit outside `tsconfig.app.json`'s `include` (unchanged from the prior pass — Vercel type-checks
  `api/` independently at deploy time), so this is a new, additional check specifically for this
  pass's code, not part of `npm run build`.
- `npm run test:unit` (Vitest) — 35 tests (34 passing + 1 opt-in skipped):
  - `server/odoo/normalizeProduct.test.ts` (15 tests) — fixture-based: standard field mapping,
    stable slug (and its rename-survives / no-trailing-id-returns-null cases), missing optional
    fields, zero stock, inactive-but-in-stock, custom field resolution (via `vi.stubEnv`), variant
    labeling (with and without resolvable attribute labels), media presence/absence, category
    mapping.
  - `server/odoo/media.test.ts` (5 tests) — proxy URL generation, model/field whitelist
    accept/reject.
  - `server/odoo/adminLink.test.ts` (3 tests) — modern/legacy URL shape, trailing-slash handling.
  - `server/odoo/liveConnection.integration.test.ts` (1 test, **skipped** — gated on
    `isOdooConfigured()`, which is `false` in every environment this was run in). This is the
    section-25/28 "test real connection" requirement, implemented and ready, but never actually
    executed against a real instance.
  - `src/lib/recommendations/engine.test.ts` (11 tests, unchanged from the prior pass) — still
    green after the `candidates` override was added, confirming the default (local-catalog)
    behavior is unaffected.
- `npx playwright test` (full suite) — 21 tests, all passing: the pre-existing 4 visual + 12
  cart-drawer + 3 cart-recommendation tests (unchanged, confirming Shop/ProductDetail's migration
  to `catalogService` didn't regress cart/recommendation flows that route through those pages),
  plus 2 new `tests/interaction/shop-catalog.spec.ts` tests confirming Shop genuinely renders via
  the async service and that category filtering still works post-migration.
- `npm run lint` — one new warning beyond the pre-existing baseline
  (`react(set-state-in-effect)` on `Shop.tsx`/`ProductDetail.tsx`'s catalog-fetch effects,
  resetting error/loading state before a new fetch — the same accepted pattern as the existing
  `CartDrawer.tsx`/`MobileCartAddedIndicator.tsx` warnings from the prior pass); exhaustive-deps
  warnings were fixed properly (stable `EMPTY_PRODUCTS`/`EMPTY_CATEGORIES` module-level fallbacks
  in `Shop.tsx`, not suppressed).
- `npm run build` — clean.
- Verified the production bundle contains no `ODOO_*` credential names and no `server/odoo` RPC
  code (see "Security").
- **Not performed — no live connection reachable, in either session that has worked on this
  integration:** sections 25/26 of the originating task (fetch ≥5 real products, verify a variant
  product's SKUs/attributes, verify a multi-image product's gallery, manually compare API output
  to the Odoo UI). See "Known gaps."

## Storefront migration status

| Page/surface | Source | Notes |
|---|---|---|
| `Shop.tsx` | `catalogService` | Async, with loading/error/retry UI |
| `ProductDetail.tsx` | `catalogService` | Async, with loading/error/404 UI |
| `Home.tsx` (trending, "perfect vehicle", car/bike category carousels) | `catalogService`, falling back to the local catalog as a same-shape placeholder while loading | See "Known gaps" for why the fallback-on-failure exception exists here specifically |
| `Brands.tsx` (per-brand product count) | `catalogService`, same fallback pattern as Home | — |
| `CartRecommendations` / PDP "You might also like" | `catalogService` via `useCatalogProducts()`, with the pure engine's own local-catalog fallback if that hasn't resolved yet | Unchanged from the first pass |
| Cart line data (`CartContext`) | Whatever `Product` was passed to `addToCart` (already catalog-sourced everywhere it's called from) | — |

## Known gaps

- **No live Odoo connection has ever been reachable, across two separate work sessions.** This is
  the single biggest gap and the reason the schema report is still a template, not a confirmed
  document, despite a dedicated follow-up task asking specifically to verify it. Both sessions
  checked for a local `.env`, a `.vercel` project link, the Vercel CLI, and any documented
  deployment URL (package.json, README, every doc in `Documentations MD/`, `git remote -v`) — none
  exist. To close it: either point this session at a reachable URL for the deployment where
  `ODOO_*` is actually configured, have someone with access run `GET /api/internal/odoo/health`
  then `GET /api/internal/odoo/schema` themselves and share back the (non-secret) JSON, or add a
  local `.env` with the real values (the file, never the values in chat) — then fill in
  `Documentations MD/odoo-schema-report.md` for real.
- **Brand, vehicle, vehicle make/model/year, variant/trim, fitment, MRP, and website-visibility
  are all unmapped** until the schema report identifies the real field names (brand/vehicle/MRP
  have a ready `ODOO_*_FIELD` config seam — see `server/odoo/customFieldMap.ts`; the others have no
  seam yet because their representation (attribute? tag? custom field? not modeled by this store
  at all?) is unknown). Every Odoo-backed product normalizes to `brandSlug: ""`, `vehicle:
  "universal"`, `mrp: undefined` until then.
- **No image gallery** — only one photo per product (`image_1920`). Confirm whether this instance
  has a multi-image model before promising a gallery UI.
- **`brand`/`vehicle` filters still only narrow within the fetched page**, not the whole catalog
  — `category` was upgraded to a real domain clause in the second pass (see "Server-side
  filtering"); `brand`/`vehicle` need both a confirmed field name AND type first.
- **No real PDP variant-selection UI** — `ProductDetail.tsx`'s "Select Car Variant" dropdown is
  unchanged (still a single-option stub); the normalized `ProductDetail.variants` data is ready
  for a future pass to actually wire up.
- **No fitment, no Delite Admin "Open in Odoo" button** — `adminLink.ts` is a ready helper, not
  wired to any UI (none exists — no admin was built, per the task's own instruction).
- **`Home.tsx`/`Brands.tsx` fall back to the local mock catalog on a genuinely FAILED Odoo call**
  (not just while loading), which is a deliberate, documented exception to "never silently show
  mock data when Odoo is configured but failing" for these two surfaces specifically — see the
  comment in `Home.tsx`. `Shop`/`ProductDetail`/`Cart` (the actual purchase path) do NOT have this
  exception and correctly show a real error state on failure.
- **`INTERNAL_DIAGNOSTICS_TOKEN` is unset** in this environment — meaning if this were deployed to
  production as-is, `api/internal/odoo/*` would refuse all requests (fail closed) until an
  operator sets that env var. This is intentional, not a bug.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-15 | Claude | Initial version — real Odoo RPC calls (products/categories/media/variants), pagination, stable slug strategy, operator-configurable custom-field mapping, health/schema diagnostic endpoints, Shop/ProductDetail migrated to catalogService, recommendation engine candidate-source override, cart-line variant identity, normalization test suite. No live connection was reachable to verify against — see "Known gaps." |
| 2026-09-15 | Claude | Second pass (follow-up verification task) — confirmed again that no reachable Odoo deployment exists in this environment (no `.env`, `.vercel` link, Vercel CLI, or documented URL). Implemented what didn't require live access: real server-side category filtering via standard `categ_id`/`public_categ_ids` fields (`fetchProducts.ts`), `Home.tsx`/`Brands.tsx` migrated onto `catalogService`. Updated `odoo-schema-report.md` to the requested `VERIFIED`/`NOT PRESENT`/`UNKNOWN` vocabulary — still all `UNKNOWN`. |
