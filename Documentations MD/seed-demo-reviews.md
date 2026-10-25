# Seeded Demo Reviews

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Seeded demo product reviews (+ half-star rating support) |
| File           | `Documentations MD/seed-demo-reviews.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | In Progress — code and generator done and dry-run verified; NOT yet applied to the live project (Odoo catalog was unreachable, so the real product list could not be fetched) |
| Created        | 2026-10-16                               |
| Last updated   | 2026-10-16                               |

## Summary

Adds a generator script that creates 40–130 human-sounding demo reviews for every product in the
live Odoo catalog, plus the schema and UI changes needed to store and display a 3.5-star rating.

## Why

The user asked for dummy reviews on all products: per-product review counts of 40–60 (30% of
products), 70–90 (65%) and ~125 (5%); star mix of 70% 5-star, 20% 4-star, 10% 3.5-star; human-like
text, with punctuation slips in some reviews and grammar errors in about 2%.

## Scope

In scope: migration, generator script, half-star display and breakdown bucketing.
Not in scope: the 59 static mock-catalog products (`src/data/products.ts`) — they have no Odoo id
and the PDP Reviews tab shows "no reviews yet" for them; their static `rating`/`reviewCount` are
untouched. Review photos are not seeded. Real customer submit flow (whole-star form) unchanged.

## Implementation notes

- File: `supabase/migrations/20261016120000_product_reviews_seed_support.sql` — `rating` smallint →
  `numeric(2,1)` with a half-step check; `user_id` nullable (seed rows have no auth user; admin RPCs
  already left-join `auth.users`/`profiles`); new `is_seed boolean` + partial index.
- File: `scripts/seed-demo-reviews.mjs` — fetches template ids from `catalog-products` (pages of 60,
  the function's max), assigns count tiers, builds reviews from composable sentence pools, writes
  `seed-demo-reviews.sql`. Deterministic PRNG, so re-runs reproduce the same data; the SQL deletes
  existing `is_seed` rows first. The `BEFORE INSERT` trigger forces `pending`, so the SQL ends with
  an update to `approved`. Exact per-product split: round(70%) 5★, round(20%) 4★, rest 3.5★. ~10% of
  reviews get a punctuation slip, ~2% get an ungrammatical closing sentence. Reviewer names are
  Indian first name (+ surname or initial); ~60% flagged `verified_purchase`; dates spread over the
  last 365 days. `--ids a,b,c` bypasses the catalog fetch; `--apply` runs the SQL via the Supabase CLI.
- File: `src/hooks/useProductReviews.ts` — breakdown buckets by `Math.floor(rating)` so 3.5 counts in
  the "3 star" bar.
- File: `src/components/product/ReviewsSection.tsx` — star filter uses the same floor; per-review
  stars render a half star for x.5 ratings.

## Interfaces / data

`product_reviews.rating` is now `numeric(2,1)` (PostgREST returns it as a JSON number). Removal:
`delete from public.product_reviews where is_seed;`

## Dependencies

Requires the Odoo catalog to be reachable for the default (no `--ids`) run.

## Testing / verification

- `tsc -p tsconfig.app.json --noEmit` clean.
- Dry run with 100 fake ids: 7,354 reviews; tiers 30 / 65 / 5 products; rating split 70.0% / 20.1% /
  9.9%; sampled text read naturally.
- NOT yet run against the live database or viewed in the browser.

## Known issues / follow-ups

- Apply: `supabase db push`, then `node scripts/seed-demo-reviews.mjs --apply` once `catalog-products`
  responds (it returned "Catalog temporarily unavailable" on 2026-10-16).
- Text comes from fixed sentence pools, so wording repeats across products at this volume.
- These are fabricated reviews flagged `is_seed`. Showing them to real shoppers as genuine customer
  feedback is misleading (and prohibited for Indian e-commerce sellers by the CCPA/consumer-protection
  rules on fake reviews); intended for demo/staging use, or remove before launch.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-16 | Claude | Initial version: migration, generator, half-star UI; not yet applied |
