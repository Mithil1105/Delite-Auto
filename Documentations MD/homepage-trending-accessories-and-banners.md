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

- **Promo banners layout (2026-10-26):** `PromoBannerPair` with CMS promotions now fills the row when there is a single promotion (previously a half-width banner next to an empty gap), shows two side by side, and lets an odd last one span the row; the call-to-action is a white pill button and a single banner gets a larger heading and bigger picture. Edit promotions at Admin → Website → Homepage → Promo banners.
- **Dummy promotion (2026-10-26):** the leftover automated-test promotion was turned into a clean placeholder promotion (same row) — heading "New arrivals for your ride", line "Explore the latest car and bike accessories.", button "Shop new arrivals" -> /shop?tag=new, a Hyundai Creta picture (uploaded to marketing-media/promo/). It makes no offer or discount claims; edit or replace it in Admin -> Website -> Homepage -> Promo banners.
- **Banner picture (2026-10-26):** the dummy promotion's picture is now a transparent cut-out cluster of real catalog accessories (Wurth brake cleaner, glass cleaner, rust off, tyre foam, NV Prime GPS box, MORO phone holder, car perfume) instead of a car — uploaded to marketing-media/promo/accessories-bunch.webp. Promo pictures are shown whole unless a crop position was saved in the admin (before, a default "cover" crop cut the art on phones).
- **Theme colours (2026-10-26):** promo banners (and the default Best Combo Deals / New Launch pair) use the brand gradient — deep navy `brand-700` to royal blue `brand-500` (same blue as the announcement bar), alternating direction — with a gold pill button like Buy Now, instead of the earlier purple. Container width matches the other home sections.
- **Feature flag:** every promotion in that admin list now has an **On / Off switch** (saves immediately; `setPromotionEnabled` in promotionsService). A promotion shows on the website only when it is Published AND On. The whole banner strip can also be hidden with the "Show on website" switch of the Promo Banners section in Admin -> Website -> Homepage.

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
| 2026-10-26 | Claude | PromoBannerPair: full-width single promotion, pill CTA, bigger heading/picture; documented the leftover E2E test promotion. |
| 2026-10-26 | Claude | Replaced the E2E test promotion with a clean dummy promotion; added the On/Off switch to the Promotions admin list. |
| 2026-10-26 | Claude | Promo banners recoloured to the brand navy/blue gradient with a gold CTA (were purple). |
| 2026-10-26 | Claude | Banner picture changed to an accessories cluster; whole picture shown unless a crop is set. |
