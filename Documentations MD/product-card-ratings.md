# Review stars on product cards

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Real review average and count on every product card |
| File           | `Documentations MD/product-card-ratings.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | Done — migration applied live; verified in headless Chromium on the real shop and home pages; not committed |
| Created        | 2026-10-25                               |
| Last updated   | 2026-10-25                               |

## Summary

Product cards everywhere (shop grid, home rails, deals, car pages, related products, blog product rows) now show the product's real star average and review count, e.g. "★ 4.7 (89)", instead of "No Reviews".

## Why

Client report: reviews only showed on the product page. The card read `product.rating` / `product.reviewCount`, which only the built-in mock catalog has; products from Odoo never got those fields, and the reviews live in Supabase (`product_reviews`), which only the product page queried.

## Scope

In: default product card. Out: the compact cart-recommendation card (it has no rating line by design), the product page itself (unchanged; it reads the reviews directly).

## Implementation notes

- Migration `20261025100000_product_review_stats.sql`: `public.product_review_stats(p_ids integer[])` returns `(odoo_template_id, review_count, average)` for approved reviews only. `SECURITY INVOKER` so row-level security still applies; id list capped at 200; uses the existing `(odoo_template_id, status)` index. Granted to anon + authenticated.
- `src/lib/reviews/reviewStats.ts`: `useReviewStat(odooId)` — every card asks for its own product, requests are collected for ~40 ms and sent as ONE rpc call, results are cached for 5 minutes and shared by all cards. Failures are not cached (retried on the next render). Products with no approved reviews show the old "No Reviews" line.
- `ProductCard.tsx`: uses the fetched stat, falling back to the mock catalog's built-in rating.

## Interfaces / data

RPC `product_review_stats`. No table changes. The average is rounded to 2 decimals in SQL and shown with 1 decimal, so a card matches the product page header.

## Dependencies

`product_reviews` (approved rows are publicly readable by design), `supabase` client.

## Testing / verification

tsc clean. Anonymous call to the RPC returns the right numbers. Real shop page: 18 of 18 cards show real stars (0 "No Reviews"), a single rpc request for the whole page; real home page: 42 of 42 cards; no console errors. Newly approved reviews appear on cards within 5 minutes (or on reload).

## Known issues / follow-ups

- The demo (seeded) reviews count like real ones, as they do on the product page.
- Cards in a long list that load later (infinite scroll/"show more") trigger a further batched call for the new products only.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-25 | Claude | Initial version                          |
