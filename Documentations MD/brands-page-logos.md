# Brands Page Logos

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Brand logos on the Shop by Brands page (`/brands`) |
| File           | `Documentations MD/brands-page-logos.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | Done — verified in headless Chromium (desktop + mobile); not committed/deployed |
| Created        | 2026-10-22                               |
| Last updated   | 2026-10-22                               |

## Summary

The `/brands` page showed each accessory brand as a text-only card. It now shows each brand's logo
(from Odoo), with the name and product count underneath.

## Why

The user wanted brand logos instead of plain names, preferably taken from Odoo (they wrote "Urdu",
read as Odoo), because text-only cards were unattractive for customers.

## Scope

In: the real-catalog (`VITE_CATALOG_SOURCE=supabase`) branch of `Brands.tsx`.
Out: the mock-catalog branch (no logo data exists for it), the homepage "Shop by Brands" grid (that
shows vehicle makes — it already uses logos from `public/images/vehicle-brands/`), uploading or
editing logos (they are managed in Odoo).

## Implementation notes

- No new data source: all 28 Odoo brand categories already have an image in their `cover_image`
  field, and `catalog-categories` already returns it as `imageUrl` (served by `catalog-media`, same as
  the homepage category images). Checked live on 2026-10-22: all 28 return a real logo (PNG/JPEG/WebP).
- File: `src/pages/Brands.tsx` — new `BrandLogo` (white 4:3 tile, `object-contain`, lazy-loaded,
  letter-badge fallback if the image is missing or fails) and a 2/3/4-column card grid (logo, name,
  product count, arrow) with staggered scroll-reveal and hover lift. Cards still link to
  `/shop?brand=<odooId>`.

## Interfaces / data

Uses `Category.imageUrl` (already in `src/data/types.ts`). No API or schema change.

## Dependencies

Odoo brand-category `cover_image`; `catalog-media` Edge Function; `Reveal` (see site-motion-and-pdp-polish.md).

## Testing / verification

- `tsc` clean. Playwright (headless Chromium, desktop 1366×900 and mobile 390×844): 28 cards, 28 logos,
  28 loaded, 0 broken, no console errors; screenshots reviewed.

## Known issues / follow-ups

- Logo files are large (4N ≈ 1.0 MB, M TEK ≈ 1.6 MB, PV MAX ≈ 3.3 MB, MOTOMAX/Wheels Eye/Waxpol ≈ 0.8–1 MB;
  ~12 MB for all 28). They are lazy-loaded, but re-uploading smaller versions (≈400px) in Odoo would
  speed the page up. The `cover_image` field is served unresized.
- Logos with their own coloured background (JBL, MOTOMAX, Dolphin, Moco, Torq) show as coloured squares
  on the white tile; that is how they are stored in Odoo.
- The page's intro badge reads "38+ brands" (existing translation string) while Odoo currently has 28.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-22 | Claude | Initial version                          |
