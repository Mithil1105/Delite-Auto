# UI/UX pass: Shop toolbar, filters, grid/list view, left-aligned header, PDP details accordion

> Branch `uiux` (cut from `figma`).

## Metadata

| Field          | Value                                                      |
|----------------|-------------------------------------------------------------|
| Feature name   | Shop toolbar + working filters + grid/list view + header logo-left |
| File           | `Documentations MD/uiux-shop-toolbar-and-header.md`        |
| Branch         | uiux                                                        |
| Owner          | Hasti                                                       |
| Status         | Done (Shop, Header, PDP details panel); PNG logo + review-card photos pending assets |
| Created        | 2026-10-10                                                  |
| Last updated   | 2026-10-10                                                  |

## Summary

The Shop page gets a proper toolbar (Filters toggle with active-count badge, product count,
"Recommended" sort dropdown, grid/list view toggle), an applied-filters chip bar, and a filter
panel with real, working controls. The header now puts the logo on the left. Everything is
responsive (phone / iPad / desktop).

## Why

User request (2026-10-10): implement the *functionality* seen in a Framer reference (filter,
recommended sort, tile/list view, bar) but styled to the Delite theme, using Delite's own text and
tokens — the Framer link is a behavioural reference only (its page is JS-rendered; nothing was
copied from it). Logo moves left; a PNG logo will be supplied later.

## Scope

Included:
- Shop toolbar, applied-filter chips, redesigned filter panel, grid/list view, sticky sidebar.
- `ProductCard` `layout="list"` (horizontal row) — grid layout is unchanged.
- Header: logo left, nav next to it, search/lang/account/wishlist/cart right; on `<lg` the
  hamburger joins the right icon cluster and `MobileNavDrawer` now slides in from the right.
- i18n keys in en/hi/gu; "Relevance" label is now "Recommended".

- Product detail page: the Description/Reviews/Return/Delivery **tabs became an accordion** (per the
  user's Figma "Product details panel" reference) with a quick-facts chip row above it (30-day
  returns, ships in 2–3 days, COD/UPI/cards). Several sections can be open at once; first tab is
  now labelled "Feature details". `ReviewsSection` itself is unchanged; "Write a review" opens the
  Reviews section and scrolls to it. The Figma reference's "2-year warranty" chip was deliberately
  **not** added — there's no warranty data in the catalog.

Not included (deferred): the review-card visual redesign (awaiting user's photos + link); the real
PNG logo; a mega-menu.

## Implementation notes

- File: `src/pages/Shop.tsx` — toolbar, chips, `FiltersPanel` rewrite, `view`/`min`/`sale` URL
  params. All state lives in the URL (shareable/back-button safe). `clearAll` keeps `view`, `sort`
  and `q`.
- Filter behaviour: vehicle (All/Car/Bike), category, brand (with search box when >8 brands) are
  **server-side** as before. Min/max price, "On sale" (`mrp > price`), availability, colour are
  **client-side refinements** of the loaded page(s) — same honest approach as before (no Odoo
  domain verified for them); the count reflects the refined set when active.
- File: `src/components/product/ProductCard.tsx` — new optional `layout` prop.
- File: `src/components/Header.tsx`, `src/components/MobileNavDrawer.tsx` — layout changes above.
  The text pill "DELITE" is a placeholder: replace the inner `<span>` with an `<img>` when the PNG
  arrives.
- File: `src/pages/ProductDetail.tsx` — tabs → accordion (`openTabs` set, `aria-expanded`/`aria-controls`).
- File: `src/i18n/{en,hi,gu}.ts` — new `shop.*` keys (viewGrid, viewList, vehicleType, priceRange,
  minPrice, maxPrice, onSale, onSaleOnly, searchBrands, activeFilters, removeFilter).
- Breakpoints: `<sm` 1-col grid, `sm` 2-col, `md` (iPad portrait) 3-col, `lg+` sidebar layout
  (3 cols, 4 when the sidebar is collapsed). List view: 1 col (2 cols on tablet / sidebar-closed
  desktop).

## Interfaces / data

URL params added: `view=list`, `min=<n>`, `sale=1`. `onSaleOnly` i18n key is defined but unused.

## Dependencies

None new.

## Testing / verification

- `npx tsc -b` clean; `oxlint` on changed files clean.
- Playwright screenshots (dev server, `--mode interaction`) of `/shop` grid + list at 1440, 820,
  390px reviewed.
- `home-figma-fidelity.spec.ts` (hamburger/drawer/header tests) re-run after the header change:
  12/12 passed.

## Known issues / follow-ups

- Visual-regression baselines for Header/Shop will need regenerating.
- Product images in the live catalog render blank for some items (Odoo data), unrelated.
- Review-card redesign pending the user's assets. The PDP accordion was verified by typecheck/lint
  only, not by a screenshot.

## Revision log

| Date       | Author | Change                                                    |
|------------|--------|------------------------------------------------------------|
| 2026-10-10 | Claude | Initial version: Shop toolbar/filters/grid-list view, header logo-left, drawer from right |
| 2026-10-10 | Claude | PDP details tabs → accordion + quick-facts chips; header specs re-run (12/12) |
