# Sale prices from Odoo (struck-through old price, red new price)

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Sale pricing display (H&M style) driven by Odoo's "Compare to Price" |
| File           | `Documentations MD/sale-prices.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | Done — functions deployed; styling verified in headless Chromium with a mocked sale price; no product in Odoo is on sale yet; not committed |
| Created        | 2026-10-22                               |
| Last updated   | 2026-10-22                               |

## Summary

When a product in Odoo has a **Compare to Price** (`compare_list_price`) higher than its selling price (`list_price`), the storefront shows the new price in red, the old price struck through in black, and (on the product page) the existing "SAVE n%" badge. With no compare price, the price is shown in plain black as before.

## Why

Client request: show sale items fetched from Odoo H&M-style — old price cut, new price in red.

## Scope

In: catalog functions, product cards, product page. Out: pricelist-rule discounts (see follow-ups), cart/checkout price display (they use the real selling price, unchanged).

## Implementation notes

- `supabase/functions/_shared/odoo/fetch.ts` — `searchTemplates()` reads `product.template` and adds `compare_list_price` only if `fields_get` says the field exists (cached per isolate), retrying without it if that read fails. `catalog-products` and `catalog-product-detail` use it (both redeployed).
- `catalog.ts` `normalizeProduct` — `mrp` = `compare_list_price` when it is a number greater than `list_price`, else `null`.
- `ProductCard.tsx` / `ProductDetail.tsx` — sale: red bold new price + black struck old price; otherwise black price. The Shop "On sale" filter already keys off `mrp`.

## Interfaces / data

No schema change. API field `mrp` (already in the DTO) is now filled. Odoo: Website → product → **Compare to Price**.

## Dependencies

Odoo `product.template.compare_list_price` (confirmed present on this instance via a temporary probe function, since removed).

## Testing / verification

Live scan of all 356 products: none currently have a compare price, so nothing shows as on sale yet. Browser check with a mocked `mrp`: shop cards show red new / black struck old; product page shows red price, struck old price and "SAVE 29%".

## Known issues / follow-ups

- To put an item on sale, the client sets "Compare to Price" (the higher, old price) on the product in Odoo and keeps the normal Sales Price as the new price.
- Odoo 18 also has pricelist rules (`pricelist_rule_ids`); discounts defined only as pricelist rules are not read. Supporting them needs a per-product pricelist price lookup — say if the client uses pricelists for sales.
- A variant whose own price differs from the template price compares the template's old price with the selected variant's price (strike only shows if old > current).

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-22 | Claude | Initial version                          |
