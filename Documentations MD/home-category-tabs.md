# Homepage "Shop by Top Categories" tabs (Car / Bike)

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Working category tabs in the homepage "Shop by Top Categories in Car / Bike" sections |
| File           | `Documentations MD/home-category-tabs.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | Done — verified in headless Chromium against the live catalog; not committed |
| Created        | 2026-10-22                               |
| Last updated   | 2026-10-22                               |

## Summary

The tabs (Seat Covers / Dash Cams / Mats / Care, and Helmets / Covers / Saddlebags / Guards) now each show their own
real Odoo products. Before, every tab showed the same generic products.

## Why

The user reported the section "isn't functional". Real Odoo products have an empty `categorySlug`, so the old per-tab
slug filters matched nothing and every tab fell through to the same "first 8 car products" fallback.

## Scope

In: tab → product lookup when the admin has not hand-picked products for that tab; empty/loading state.
Out: admin-curated ids (unchanged, still win), the section header/layout.

## Implementation notes

- `src/hooks/useCategoryTabProducts.ts` — fetches a tab's products from `catalog-products` (Odoo category id and/or
  name searches, run sequentially because the instance rate-limits, merged, de-duplicated, products tagged only for the
  other vehicle dropped, max 12, cached per spec).
- `src/pages/Home.tsx` — `CAR_TAB_SPECS` / `BIKE_TAB_SPECS`: Seat Covers = name "seat cover"; Dash Cams = "dash cam" + "dvr";
  Mats = Odoo category 59 (CAR MATS); Care = category 17 (CAR CARE); Helmets "helmet"; Covers "bike cover"/"scooter cover";
  Saddlebags "saddle"/"tank bag"; Guards "crash guard"/"leg guard"/"bike guard". Curated ids from the admin still take priority;
  the mock catalog keeps its old slug filters.
- `HomeCategoryProductSection` shows a loading dash or the "No products in this category yet" message (`home.categoryEmpty`, en/hi/gu) instead of an empty rail.

## Interfaces / data

No schema or API change. Uses existing `catalog-products` params `q`, `category`.

## Dependencies

Live Odoo catalog. Category ids 59 / 17 are the current Odoo ids — if they change, update the specs.

## Testing / verification

Headless run on the live catalog: Seat Covers 10, Dash Cams 5, Mats 12, Care 12 products; Bike Covers 1; Helmets, Saddlebags, Guards showed the empty message.

## Known issues / follow-ups

- Odoo has no helmets/saddlebags/guards products yet, so those bike tabs are empty until added (or curated in admin).
- Odoo's "CAR CARE" category contains unrelated items (e.g. a circlip plier); fix the category in Odoo or curate that tab in the admin.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-22 | Claude | Initial version                          |
