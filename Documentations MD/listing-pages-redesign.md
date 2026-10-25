# Listing Pages Redesign (Shop + car accessories pages)

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Redesigned product-listing layout — Filters card, chip filters, sort/view toolbar, hide-filters toggle |
| File           | `Documentations MD/listing-pages-redesign.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | Done — verified in headless Chromium (desktop + phone); not committed/deployed |
| Created        | 2026-10-22                               |
| Last updated   | 2026-10-22                               |

## Summary

`/shop` (which also serves search results, the saved/wishlist view, brand and deal filters) and
`/cars/:slug` now share one layout modelled on the Framer reference the client supplied
(https://vivacious-requests-849455.framer.app/): a "Filters" card on the left with chip groups and a
segmented control, and a heading row with sort and grid/list switch above the product grid.

## Why

The client asked for the Shop-style filter/product-grid sections to be redesigned from the reference, on
every page that lists products. A first pass also had an in-page search bar (as in the reference); the
client asked for it to be removed because the site header already has search, and asked for a way to close
the filters panel and for proper mobile behaviour.

## Scope

In: Shop page, car accessories page, shared components, new strings (en/hi/gu).
Not changed: the filtering/pagination logic of Shop (URL params, server-side paging, Load More), the
product card, or other pages — no other page combines filters with a product grid (Wishlist/search/brand/
deal links are all `/shop?…`; Brands, Deals and Home show carousels or brand/category tiles).

## Implementation notes

- `src/components/listing/ListingKit.tsx` — `FilterCard` (header with "Reset all" and an optional hide ✕),
  `FilterGroup`, `Chip` (selected = solid black), `ChipGroup` (optional "All" chip, "Show more/less"),
  `Segmented`, `SortSelect`, `ViewToggle`, `ListingToolbar` (heading + count left; Filters button, sort,
  view switch right; on phones the heading sits on its own line and the controls fill one row).
- `src/lib/listing/priceBands.ts` — price presets (Any, Under ₹500, ₹500–1,000, ₹1,000–2,000, ₹2,000–5,000,
  ₹5,000 & above) shared by both pages; `src/lib/listing/format.ts` — `sentenceCase()` so Odoo's all-capital
  category names read "Car accessories" (brand names/acronyms are untouched).
- `src/pages/Shop.tsx` — filter groups: Vehicle (segmented), Category type (chips), Availability
  (segmented + On sale chip), Brand (search + chips), Price range (preset chips + min/max inputs), Model
  name, Colours (mock catalog only). Left-aligned heading with "N products · Showing results for …".
  The old collapsible accordion, slider and sidebar toggle button were replaced. "Reset all" also clears
  the search text. The Filters toolbar button opens the drawer below `lg` and shows/hides the sidebar from
  `lg` up; hidden sidebar → 4 product columns instead of 3. Mobile drawer keeps the same groups.
- `src/pages/CarModelPage.tsx` — same layout with client-side filters (Brand chips with counts,
  Availability, Price) plus sort and grid/list; remounts per car via `key={slug}` so filters reset.
- Removed the in-page search bar (and its strings); search remains in the site header (`/shop?q=`).

## Interfaces / data

No data/API changes. New i18n keys under `shop` (`resetAll`, `showMore`, `showLess`, `anyPrice`,
`priceUnder`, `priceBetween`, `priceAbove`, `customRange` (unused), `hideFilters`). Hindi/Gujarati strings
are my translations — have a native speaker check.

## Dependencies

None.

## Testing / verification

- `tsc` clean; oxlint: one pre-existing `set-state-in-effect` warning in `useModelProducts`.
- Playwright (headless Chromium): Shop at 1366×900 — no in-page search box, Filters card present, 3 columns;
  after "Hide filters" the card is gone and the grid has 4 columns; the toolbar Filter button reopens it.
  Shop and car page at 390×844 — no horizontal overflow, Filters drawer opens/closes; car page has no
  in-page search; no page errors. Screenshots reviewed.
- Not tested: tablet widths (768–1023px), keyboard-only use, the Hindi/Gujarati layouts, filter combinations
  against live data beyond a smoke test.

## Known issues / follow-ups

- Odoo category names include typos (e.g. "Treding bikr acc", "Newley") — they are shown as stored; fix in Odoo.
- The Filters card hides on desktop only; below `lg` the drawer is always used.
- `shop.customRange` string is defined but not used.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-22 | Claude | Initial version: redesigned Shop + car pages from the Framer reference; removed in-page search; added hide-filters toggle and mobile toolbar |
