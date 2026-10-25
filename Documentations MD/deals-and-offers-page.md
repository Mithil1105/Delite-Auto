# Deals & Offers Page

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | `/deals` page with per-section on/off switches controlled from the admin |
| File           | `Documentations MD/deals-and-offers-page.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | Code complete and verified on the storefront; admin screen + database migration NOT yet exercised live (migration not applied) |
| Created        | 2026-10-22                               |
| Last updated   | 2026-10-22                               |

## Summary

The "Deals & Offers" menu link used to open `/shop?tag=bestseller` (a dummy-catalog-only filter that
does nothing on the real catalog). There is now a real `/deals` page made of sections the client turns
on or off, reorders and edits in Admin → Website → Deals & Offers, with the usual Save draft / Publish.

## Why

The client wanted a deals page and to stay in control of what appears on it. Odoo has no original price
(MRP) or discount data, so sections that depend on such data exist as switches that stay Off (or hide
themselves) until the data exists, rather than showing invented discounts.

## Scope

In: public page, 13 sections, master on/off, admin editor, migration, menu/footer links.
Out / not possible yet: real "% off" (needs an MRP in Odoo), coupon codes actually applying at checkout
(the message strip only *displays* a code), bundle pricing/discounts at checkout (combos show the sum of
normal prices), analytics for the page.

## Implementation notes

- **CMS page `deals`** reuses the homepage CMS tables (draft/publish, `cms_publish_page`). A section row's
  `visible` flag is the feature switch; `display_order` is its position; `content` holds its settings.
  `settings` is a required row with `{pageEnabled}` — the master switch.
- `supabase/migrations/20261022120000_deals_page_cms.sql` — seeds the page + 14 section rows (idempotent) and
  adds `public.top_rated_products(limit, min_reviews, include_seed)` (SECURITY INVOKER; ignores demo
  reviews by default).
- `src/data/dealsSections.ts` — single list of sections: label, description, defaults, editable fields.
  The storefront merges published rows over these defaults, so `/deals` works even before the migration.
- `src/lib/deals/helpers.ts` (+ `helpers.test.ts`, 11 tests) — merge/resolve, budget-band parsing, campaign
  dates, countdown, WhatsApp URL, combo sanitising.
- `src/hooks/useDealsCms.ts` — published rows, shared 60 s cache (Header/Footer use it to hide the links).
- `src/components/deals/DealsSections.tsx` + `src/pages/Deals.tsx` — the sections; each hides itself when it
  has nothing honest to show. Page redirects to `/shop` when switched off.
- `src/admin/pages/website/Deals.tsx` — admin: master switch, per-section switch (saves immediately as a
  draft), up/down reorder, expandable editor per section (text, image, date-time, product picker, Odoo
  category select, combo editor), Save draft, Publish, "View page", and a setup notice if the migration
  hasn't been run. Route `/admin/website/deals` (owner/admin/content), sidebar entry under Website.
- `Header.tsx`/`Footer.tsx` — link now `/deals`, hidden when the page is off. `src/components/brands/BrandLogo.tsx`
  extracted from Brands.tsx so the brand strip reuses it.

### Sections (default)

Message strip (Off), Top banner (On; style = coloured banner with text, or **Image only** — a full-width picture with an optional separate phone image, clickable via the button link), Timed campaign (Off), Hot picks (On, falls back to Featured Products),
On offer — Odoo category (Off), Shop by budget (On), Offers for your car (On), New arrivals (On, falls back to
New Arrivals list), Top rated (Off), Biggest savings (Off), Combo picks (Off), Shop by brand (On), WhatsApp
quote button (Off).

## Interfaces / data

CMS page slug `deals`; section keys as above. No Odoo data is stored — product sections keep Odoo ids only.

## Dependencies

Run once: `npx supabase db query --linked --file supabase/migrations/20261022120000_deals_page_cms.sql`
(migration history was repaired on 2026-10-22 — a plain `npx supabase db push` works now; see admin-reviews-update.md). Top rated also needs `product_reviews.is_seed`
(migration 20261016120000, already applied).

## Testing / verification

- `tsc` clean; oxlint clean for the new files; 11 new unit tests pass (full suite: 171 pass; 3 failures in
  `odooCheckoutHandoff.test.ts` are in untouched code).
- Playwright (headless Chromium, localhost): defaults render hero/budget/car offers/brand logos with no
  errors; menu link goes to `/deals`; with CMS responses mocked (not a real DB), hiding sections, reordering,
  message strip + copy-code button, campaign with live countdown, combo card, WhatsApp link all behaved, and
  `pageEnabled:false` redirected `/deals` to `/shop` and removed the header and footer links.
- NOT tested: the admin screen itself (needs a signed-in admin + the migration), saving/publishing against
  the real database, Top rated RPC, Biggest savings with real MRP data, Add-all-to-cart on a combo.

## Known issues / follow-ups

- Real discounts need an original price: Odoo has no MRP (`mrp` is hard-coded null in the catalog function).
  Add an Odoo field and map it in `catalog-products`; then switch "Biggest savings" on (the shop's Sale filter and
  PDP badge already work from `mrp`).
- Coupon codes shown in the message strip must also exist in the real checkout.
- Hot picks / New arrivals stay hidden until the Featured / New Arrivals lists (or their own picks) are filled in.
- The page is not wired into analytics yet.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-22 | Claude | Initial version                          |
| 2026-10-22 | Claude | Top banner: added an "Image only" style (desktop image + optional phone image + alt text, links to the button link) alongside the coloured text banner; added a select field type to the admin editor. Verified with mocked CMS data. Removing a section = switching it Off (no delete). |
