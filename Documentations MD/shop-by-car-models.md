# Shop by Your Car (home section + car pages)

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | "Shop by Your Car" home section, `/cars` index and `/cars/:slug` accessory pages |
| File           | `Documentations MD/shop-by-car-models.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | Done — verified in headless Chromium (desktop + mobile) against the live catalog; not committed/deployed |
| Created        | 2026-10-21                               |
| Last updated   | 2026-10-21                               |

## Summary

A homepage section with 12 car-model tiles (cut-out car images) and a "View All" link. Each tile
opens a page listing the accessories for that car from every brand, with brand filter chips.

## Why

The user asked for a "Shop by Cars" section on the homepage with small car images (at least nine),
a see-all button, and a click-through to a page showing the accessories available for that car
across all brands.

## Scope

In scope: the section, `/cars`, `/cars/:slug`, 12 car images, translations (en/hi/gu), SEO route
default, photo credits.

Not in scope / deliberate limits:
- **No real fitment data.** Only 1 of 355 Odoo products has a "Model" attribute value. Car pages
  match the model name against Odoo product names instead (see below), so a car page shows products
  *named for* that car (mats, seat covers, dash-cam kits) and multi-model listings that name it.
  Universal products (e.g. an air pump) do not appear.
- **Not CMS-managed.** The section has no row in the admin Homepage editor (cannot be hidden or
  reordered there); its default position is right after "Shop by Brands". Its title is overridable
  via a `car-models` CMS section only if one is added later.
- **Images (updated 2026-10-22):** all twelve are client-supplied pictures with the background removed (imgly cut-out,
  trimmed, 720px webp). The Creta is the earlier plate-free version and was deliberately left unchanged.

## Implementation notes

- File: `src/data/carModels.ts` — the 12 models (slug, make, name, image, name-search `query`,
  client-side `match` regex, photo credit). Order: Creta, Innova Hycross, Swift, Ertiga, Thar,
  XUV 3XO, Seltos, Nexon, Brezza, Baleno, Fronx, Amaze — chosen because each appears in real
  product names. Punch and Scorpio-N were dropped (no usable CC photos on Commons).
- File: `src/components/home/CarModelGrid.tsx` — tile grid (2/3/4 columns), shared by Home and `/cars`.
- File: `src/pages/Home.tsx` — new `car-models` block + `DEFAULT_ORDER` entry; `sectionPosition()`
  places it half a step after `brands` when the CMS supplies display orders for the other sections.
- File: `src/pages/CarModels.tsx` — `/cars` index + collapsible photo credits.
- File: `src/pages/CarModelPage.tsx` — `/cars/:slug`: fetches up to 5×60 products via
  `catalogService.getProductsPage({ q: model.query })`, keeps names matching `model.match`, drops
  bike-only products (a bicycle lock named "Creta" matched), dedupes, then brand chips filter
  client-side (brand = Odoo brand category; unclassified = "Other"). Loading, error/retry and empty
  states included. Unknown slug redirects to `/cars`.
- File: `src/App.tsx`, `src/components/SeoHead.tsx`, `src/i18n/{en,hi,gu}.ts` — routes, `cars` SEO
  default, `home.carModelsTitle` and a `carModels` string group (hi/gu are my translations — have a
  native speaker check).
- Files: `public/images/cars/*.webp` — transparent cut-outs (background removed locally with
  `@imgly/background-removal-node`, windows filled, WebP ~35–80 KB each). Right-facing photos were
  mirrored (Swift, Brezza, XUV 3XO); readable number plates were blurred (Thar, Baleno, XUV 3XO,
  Fronx, Swift, Brezza; Nexon's was already blurred in the source).

## Interfaces / data

Routes: `/cars`, `/cars/:slug`. To add a car: drop `public/images/cars/<slug>.webp`, add an entry to
`carModels` (home shows all entries; the grid is 4 across on desktop, so use multiples of 4 (12 = 3 full rows)).

## Dependencies

Live Odoo catalog (`catalog-products` Edge Function). The earlier Wikimedia (CC BY-SA) photos were replaced by client-supplied images, so
no attributions are needed now; the optional `credit` field and the /cars "Photo credits" block (hidden when empty) remain.

## Testing / verification

- `tsc -p tsconfig.app.json --noEmit` clean.
- Headless Chromium (Playwright) against `localhost:5176`: homepage renders the section with 12
  tiles; clicking Creta opens `/cars/hyundai-creta`; no console errors. Every car page returned
  products: Creta 6, Innova 7, Swift 5, Ertiga 4, Thar 4, XUV 3XO 2, Seltos 4, Nexon 2, Brezza 2,
  Baleno 2, Fronx 1, Amaze 3. Mobile (390px) screenshots checked for home section and Creta page.
- No automated spec added.

## Known issues / follow-ups

- Real fitment: if Odoo products get "Model" attribute values, switch `CarModelPage` to the
  `fitment` filter and drop name matching.
- Section is not editable from the admin; images are static files.
- Some cut-outs are imperfect at full size (Amaze rear is cropped in the source photo; Fronx has a
  small edge artefact). Replace with proper renders when available (same filename).

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-21 | Claude | Initial version                          |
| 2026-10-22 | Claude | Replaced 11 car images with client-supplied pictures (background removed); Creta kept; Wikimedia credits removed. |
| 2026-10-21 | Claude | Desktop grid changed from 6 to 4 tiles per row at the user's request (lg:grid-cols-4) |
