# Product page buy box: stacked buttons, payment logos, rotating promise strip

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | PDP buy box redesign + admin-editable rotating promise strip |
| File           | `Documentations MD/pdp-buy-box-and-trust-strip.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | Done — verified in headless Chromium (desktop + 375px); migration applied; not committed |
| Created        | 2026-10-22                               |
| Last updated   | 2026-10-22 |

## Summary

Under the variant picker the buttons are now stacked: a compact quantity stepper, full-width Add to Cart, full-width
Buy Now with the accepted-payment logos (UPI, Visa, Mastercard, Cash on Delivery) fanned inside its right end (like the
Hasto storefront). The "Secure payments" label and the UPI/Cards/Net Banking/COD boxes were removed. The two promises
(30-day money-back, shipping in 2–3 days) are one strip whose messages rotate; the admin edits them.

## Why

Client request on the product page screenshot: smaller quantity control above the buttons, Buy Now under Add to Cart,
remove the payment boxes/"Secure payments", merge the two promises into one rotating, admin-editable strip, and put payment logos on Buy Now.

## Scope

In: `ProductDetail.tsx` buy area, `PaymentMethods.tsx` (now the logo stack), `TrustStrip.tsx`, admin page, migration.
Out: checkout, Delivery & Payment accordion copy.

## Implementation notes

- `src/components/product/PaymentMethods.tsx` — logo stack from `public/images/payments/{upi,visa,mastercard}.png`, `cod.jpg`
  (copied from the Hasto project; trademarked artwork, not redrawn). Falls back to text if a file fails. Below 381px the stack drops under the button.
- `src/components/product/TrustStrip.tsx` — presentational `TrustStrip` (rotates every `intervalMs`, pauses on hover, shows all messages
  statically with reduced motion) and `ProductTrustStrip` (reads the published `pdp-trust-strip` section via `useSiteChromeCms`; falls back to the two i18n promises).
- Admin: Website → Header & footer → **Product strip** (`src/admin/pages/website/TrustStrip.tsx`, route `/admin/website/trust-strip`, roles owner/admin/content):
  messages (add/remove/reorder, icon), seconds per message, icons on/off, show/hide, draft → publish with live preview.
- `index.css` — `.strip-rotate-in` animation (respects reduced motion).

## Interfaces / data

Migration `20261022170000_pdp_trust_strip_section.sql` (applied) adds a `pdp-trust-strip` row to the `site-chrome` CMS page,
seeded with the two previous messages. Content shape: `{ items: [{id,text,icon}], intervalMs, showIcons }` + the section's `visible`.

## Dependencies

CMS tables (`cms_sections`, drafts/published), `publishPage("site-chrome")`.

## Testing / verification

tsc clean; admin tests pass (25). Browser: strip text cycled money-back → shipping, no "Secure payments", logos on Buy Now (desktop) / under it (375px).
Admin editor itself was not exercised in a browser (needs an admin login).

## Known issues / follow-ups

- Translations: admin-entered messages are single-language (the built-in fallbacks are still translated).
- The strip text is stored as typed; the earlier `product.securePayments`/`payNetBanking` i18n keys are now unused.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-22 | Claude | Initial version                          |
| 2026-10-22 | Claude | Prices are now black and smaller site-wide (product page text-xl, product cards 15px; were red). The "Write a Review" link on the product page is dark grey. |
