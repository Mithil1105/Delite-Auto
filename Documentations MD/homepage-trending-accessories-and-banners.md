# Homepage: Trending Accessories section + landscape image banner slots

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | "Trending Accessories" rail and three admin-only landscape image banner spaces on the home page |
| File           | `Documentations MD/homepage-trending-accessories-and-banners.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | Done — migration applied live; verified in headless Chromium (desktop + 375px); not committed |
| Created        | 2026-10-22                               |
| Last updated   | 2026-10-22                               |

## Summary

Four new homepage sections, all manageable in Admin → Website → Homepage (reorder with the arrows/drag list, hide, edit, Save draft → Publish):
`trending-accessories` (product rail) and `image-banner-1/2/3` (empty landscape image spaces).

## Why

Client asked for a Trending Accessories section and spaces for landscape images that stay mobile-responsive without changing
their proportions, can be ordered relative to the other sections, and whose images come only from the admin.

## Scope

In: storefront blocks, admin fields/previews, seed migration. Out: adding more than three image slots from the UI (add another `image-banner-N` row + Home block if more are needed).

## Implementation notes

- `src/components/home/HomeImageBanner.tsx` — renders nothing without an image (no empty gap); otherwise `<img class="w-full h-auto">` so the picture keeps its own
  aspect ratio at every width (checked: 1.960 shown = 1.960 natural at 1280px and 375px). Optional alt text and link (site path or https). Only https / site-relative image URLs are accepted.
- Trending Accessories (`Home.tsx`): products picked in the admin (up to 8, via the product picker); with none picked it shows the live Odoo "trending" category (id 18, via `useCategoryTabProducts`);
  hidden entirely when there is nothing to show. Mock catalog: tagged trending/bestseller products.
- Admin: `SectionInspector` fields (`sectionFields`, `PRODUCT_TABS`), labels in `Homepage.tsx`, previews in `HomeSectionPreview.tsx`.
- Default positions (migration): banner 1 = 35 (under category strip), Trending Accessories = 45, banner 2 = 75, banner 3 = 95. Display order lives in `cms_section_drafts/published.display_order`; Home sorts by it.
- `useCategoryTabProducts`: `vehicle` is now optional.

## Interfaces / data

Migration `20261022180000_homepage_trending_accessories_and_image_banners.sql` (applied via `supabase db query`, history marked applied with `migration repair`
because `db push` could not reach Postgres at that moment). Content keys: banners `{image, alt, link}`; Trending Accessories `{title, ctaLabel, ctaLink, productIds[]}`.

## Dependencies

Admin media library (`AdminMediaField`), Odoo catalog (`catalog-products`), CMS publish flow.

## Testing / verification

tsc clean. Browser: Trending Accessories showed 8 products; a test image injected into banner 1 kept its ratio on desktop and mobile. The admin editor UI itself was not exercised (needs login).

## Known issues / follow-ups

- Odoo category 18 is named "TREDING BIKR ACC" and is mostly bike accessories — pick products in the admin for a mixed car/bike rail.
- No separate mobile image: one image is scaled for all screens (as requested). Use a wide image with safe margins so text stays readable on phones.
- The "Shop by Your Car" (`car-models`) section still has no CMS row, so it cannot be reordered in the admin (pre-existing).

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-22 | Claude | Initial version                          |
