# Admin Reviews Update + Migration History Repair

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Admin Reviews page brought up to date (half stars, demo reviews, counts, sorting); migration history repaired |
| File           | `Documentations MD/admin-reviews-update.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | Done — migration applied and function deployed live; page verified with a simulated admin session and a stand-in for the function; not opened with a real admin login |
| Created        | 2026-10-22                               |
| Last updated   | 2026-10-22                               |

## Summary

Admin → Reviews & messages → Reviews was written before ratings became half-star values and before ~26,000
demo reviews were seeded. It now understands both, shows counts, and can sort. Separately, the Supabase
migration history table was out of step with reality; it is repaired, so `supabase db push` works again.

## Why

The client asked for the admin review page to be made up to date, and for all pending migrations to be run.

## Scope

In: the Reviews admin page, `admin_reviews_query` RPC, `admin-reviews-list` Edge Function, history repair.
Not changed: how reviews are submitted/shown publicly; no bulk "delete demo reviews" action was added (the
SQL `delete from public.product_reviews where is_seed;` still does it).

## Implementation notes

What was stale and how it is fixed:
- **Half-star ratings** (3.5): stars showed 4 full stars and the rating filter only offered whole numbers (and
  the RPC took `integer`). Now `src/components/ui/StarRating.tsx` draws half stars; the filter offers 5 … 1 in
  0.5 steps; the RPC takes `numeric`.
- **Demo reviews** (`product_reviews.is_seed`): they flooded every list as "Unknown customer". Now the RPC takes
  `p_source` (`real` default | `demo` | `all`), rows carry `is_seed` + `reviewer_name`, the page has a
  Customer reviews / Demo reviews / Both switch, a "Demo" badge and an explanatory banner. Approving/rejecting a
  demo review never triggers the customer "review approved" email (no account); real reviews still do.
- **Counts**: the RPC returns per-status counts for the chosen source and the real/demo split; the page shows them
  on the status tabs (a non-zero "Needs review" is highlighted).
- **Sorting + search**: newest/oldest/highest/lowest; search also matches the published reviewer name. Pending
  defaults to oldest first.
- **Errors**: moderation now reports failures (it previously ignored them) and confirms success with a toast.
- Files: `supabase/migrations/20261022150000_admin_reviews_query_half_stars_and_demo.sql` (drops the old integer
  signature to avoid an ambiguous overload, creates the new one, grants); `supabase/functions/admin-reviews-list/
  index.ts` (passes `source`/`sort`, returns `counts`; deployed as the next version); `src/admin/pages/reviews/
  Reviews.tsx` (rebuilt).

Migration status (found 2026-10-22):
- All 14 migrations the history table called "pending" (13 older ones + this one) were already applied in effect
  (checked object by object: columns, tables, functions, policies, storage buckets). The history table also held 10
  entries with different timestamps (same changes applied another way) that had no local file — which is why
  `db push` refused to run.
- Repaired with `supabase migration repair`: the 14 local-only versions marked **applied**, the 10 orphan remote
  versions marked **reverted** (bookkeeping only — no tables, data or policies were touched).
- Result: `supabase db push --dry-run` → "Remote database is up to date"; 42 local migration files = 42 recorded,
  0 mismatches. From now on a normal `npx supabase db push` applies only genuinely new files.

## Interfaces / data

`admin_reviews_query(p_status, p_rating_min numeric, p_rating_max numeric, p_start, p_end, p_search, p_sort,
p_limit, p_offset, p_source)` → `{ rows, total, counts: {pending, approved, rejected, all, real, demo} }`.
Edge function body gains optional `source` and the `sort` values `highest|lowest`.

## Dependencies

Requires `product_reviews.is_seed` / `reviewer_name` (already applied).

## Testing / verification

- Applied live; tested the RPC as an owner via SQL: counts {real 3 — pending 2, rejected 1; demo 26,038}, the 3.5
  filter returned 2,592 demo rows with `rating` 3.5, rows include `is_seed`/`reviewer_name`.
- Playwright with a simulated admin session and a mocked `admin-reviews-list`: first request is
  `{status: pending, source: real, sort: oldest}`; tab badges render; a 3.5 row has the accessible name "3.5 out of
  5 stars"; Demo switch sends `source: demo`, shows the banner and Demo badge; rating filter sends 3.5/3.5;
  approving a demo review sends no `review-notify`, approving a real one does; no page errors.
- `tsc`/oxlint clean. NOT tested: a real signed-in admin, the deployed function end-to-end, phone layout of this
  page, the review-notify email itself.

## Known issues / follow-ups

- The previously deployed function (version 3) ignored `source`; after this deploy the page and function agree. If
  the function is ever rolled back, the page would still work but could not show demo reviews.
- **Fix (2026-10-22):** the page showed "Couldn't load reviews" because `admin-reviews-list` called the RPC with the
  service-role client from `requireAdmin`; the RPC re-checks the caller with `auth.uid()` (NULL for service role) and
  raised "forbidden", returned as HTTP 502. The function now runs the RPC with a client carrying the signed-in admin's own
  JWT (anon key + Authorization header). Redeployed. Not yet confirmed with a real owner session from here — reload
  `/admin/reviews`; if it still fails, the browser console now logs the function's error body.
- Two real reviews are currently waiting in the queue (pending), one is rejected.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-22 | Claude | Initial version                          |
| 2026-10-22 | Claude | Fixed "Couldn't load reviews": RPC now runs with the admin's JWT instead of service role (auth.uid() was NULL → forbidden → 502); page logs the real error body. |
