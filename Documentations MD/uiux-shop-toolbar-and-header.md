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

- Home hero CTA text "Shop Accessories" → "Shop Now" in all views (`Hero.tsx`, admin editor hints,
  `hero.cta` i18n). On phones the arrow is hidden and padding tightened so the label fits inside the
  pill and fully covers the baked-in button pixels (it previously overflowed at 375px).

- Hero "Shop Now" pill made fully responsive (2026-10-14): it is now sized from the rendered
  image scale at every width/zoom (label, arrow, gap, blur, border all scale; label floored at 9px;
  arrow dropped when too narrow; invisible hit area padded to 44px). Pill top sits 10 image-px under
  the baked tagline so it can never cover it. For an admin-uploaded hero image (live CMS case) the
  pill's height follows 6.5% of the hero height (20–72px), centered on the admin's `buttonPosition`
  and clamped inside the hero; the custom image is only switched to after it has fully loaded
  (previously a mis-sized pill sat beside the default art's baked button while it downloaded).
  Header tightened at 1024px (nav/search gaps) — it overflowed the viewport by ~100px there.

- PDP buy box (2026-10-16): "Pay with" → "Buy Now"; the "More Payment Options" text is replaced by
  `PaymentMethods` badges (UPI, Cards, Net Banking, Cash on Delivery — generic icons, no third-party
  logos, matching what checkout really supports); Share moved from the bottom of the buy box to a
  round icon directly under the wishlist heart (uses `navigator.share`, falls back to copying the
  link with a "Link copied" hint); the variant selector label now follows Odoo's attribute name —
  a colour attribute shows colour chips labelled "Select Colour" (swatch dot when the value is a
  valid CSS colour), another single attribute shows "Select <attribute>", and the generic/free-text
  "Model" case keeps "Select Car Variant". Colour-chip mode is code-verified only: no live product
  with a colour attribute was available to screenshot.

- PDP promise strips (2026-10-16): the 30-day money-back and 2–3-day shipping lines are now two
  full-width strips under the payment badges (replacing the chip row that sat above the accordion;
  the COD/UPI/cards chip was dropped as it duplicates the payment badges).

- Hero "extended background" model (2026-10-16, replaces the crop/anchor attempts above on explicit
  request): the WHOLE photo is always shown (`contain`-style fit, never cropped, zoomed or moved) and
  any leftover space on the sides / top is filled by a blurred, scaled copy of the same photo, with
  the fitted photo's touching edges soft-faded for a seamless join. Wordmark, car, tagline and the
  Shop Now pill are therefore always visible and the wordmark can never run into the nav. The pill
  is placed in the photo's own coordinates (default art: over the baked button; uploaded photo: at
  the admin's `buttonPosition`, now % of the PHOTO) at full proportional size on every screen.
  Side effect: the admin's per-device focal point/zoom for the hero image no longer affects the
  storefront (nothing is cropped). Verified at 14 viewports 320px→2560px (+ portrait): pill below
  the tagline everywhere, wordmark below the nav, no horizontal scroll.

- Favicon (2026-10-22): the placeholder `favicon.svg` is replaced by the Delite logo — the full
  "Delite" wordmark from `public/images/brand/delite-logo.png` on a white rounded square, as
  `favicon.ico` (16/32/48), `favicon-32.png`, `favicon-192.png` and a full-bleed white
  `apple-touch-icon.png` (180).
  Linked from `index.html`. The source logo is only 215×94px, so the 192/180 icons are upscaled —
  swap in a higher-res logo and regenerate for crisper large icons.

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
| 2026-10-22 | Claude | Delite logo set as favicon (ico/png/apple-touch), old favicon.svg removed |
| 2026-10-16 | Claude | Hero rebuilt as fit-whole-photo + extended blurred background (no crop); pill placed in photo coordinates |
| 2026-10-16 | Claude | PDP: Buy Now text, payment badges, share under wishlist, attribute-aware variant label/colour chips |
| 2026-10-14 | Claude | Hero Shop Now pill fully responsive (default + CMS image), preload-before-switch, header 1024px overflow fix |
| 2026-10-11 | Claude | Hero CTA renamed "Shop Now" everywhere; mobile pill no longer overflows |
| 2026-10-10 | Claude | PDP details tabs → accordion + quick-facts chips; header specs re-run (12/12) |
