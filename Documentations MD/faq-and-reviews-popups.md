# FAQ page, product-page FAQ block, and reviews pop-up

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | `/faq` page, "Frequently asked questions" block on product pages, reviews "See all" pop-up with filters |
| File           | `Documentations MD/faq-and-reviews-popups.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | Done — verified in headless Chromium (desktop + 375px); not committed |
| Created        | 2026-10-22                               |
| Last updated   | 2026-10-22                               |

## Summary

- `/faq`: searchable FAQ page with category chips. The footer "FAQs" quick link now goes to it (it used to go to /contact).
- Product page: below the product tabs, a "Frequently asked questions" block shows the top 6 questions; "View all questions" opens a pop-up with all of them (search + categories) and a link to the full page.
- Product reviews: the Reviews tab shows only the 2 newest reviews. "See all N reviews" (or clicking a star bar) opens a pop-up with every review and filters: star rating, with photos, verified purchase only, sort (newest/oldest/highest/lowest), 15 at a time with "Show more".

## Why

Client request: a FAQ page linked from the site, a short FAQ section under the reviews with a "view all" pop-up, and reviews trimmed to the first two with a pop-up for the rest.

## Scope

In: the pages/components below. Out: admin editing of FAQs (content is in code), translating FAQ answers (English only; interface labels are en/hi/gu).

## Implementation notes

- `src/data/faqs.ts` — **placeholder (dummy) Q&A** (14 items, 6 categories; `popular` ones feed the product page). Replace with real policies before launch.
- `src/components/faq/Faq.tsx` — `FaqList` (one open at a time, animated), `FaqBrowser` (search + chips), `ProductFaq`. `src/pages/Faq.tsx`, route `faq` in `App.tsx`, `SeoHead` route key `faq`.
- `src/components/ui/Dialog.tsx` — new reusable pop-up (portal, Esc/backdrop close, focus trap + restore, scroll lock, bottom sheet on phones). `src/components/ui/AccordionPanel.tsx` — moved out of `ProductDetail.tsx` so FAQs reuse it.
- `src/components/product/ReviewsDialog.tsx` — `ReviewCard`, `ReviewPhotoStrip`, `ReviewsDialog`; `ReviewsSection.tsx` now shows `INLINE_REVIEWS = 2` and opens the dialog.
- i18n: new `faq.*` and extra `reviews.*` keys in en/hi/gu.

## Interfaces / data

No database or API change; reviews still come from `useProductReviews` (approved reviews, newest first).

## Dependencies

None new.

## Testing / verification

tsc clean. Browser on a real product (56 reviews): 2 inline, dialog "All reviews (56)", 4★ filter → 11, 4★ + photos → 0, Clear filters, Show more 15→30, Esc closes; product FAQ shows 6 rows, pop-up 14, /faq page renders, footer link present; no console errors.

- **Update (same day):** the "Write a review" form no longer sits open under the reviews — a "Write a review" button opens it in a pop-up. The rating summary is Myntra-style: a large average (green ≥4, lime ≥3, orange ≥2, red below) with "N Ratings" and one thick bar per star level coloured dark green (5) → light green (4) → yellow (3) → orange (2) → red (1); clicking a bar opens all reviews filtered to it. The product-page section headings (Feature details, Reviews, …) are larger (20/22px).

## Known issues / follow-ups

- FAQ answers are dummy text and English only; making them editable (and auto-translated) in the admin would fit the planned blog/CMS work.
- If the footer links were customised in Admin → Footer and published, that published list still wins over the new default link.
- Filters stay pinned at the top of the reviews pop-up on tablets/desktops only (on phones they scroll with the list to save space).

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-22 | Claude | Initial version                          |
| 2026-10-22 | Claude | Review UI: write-review moved into a pop-up, Myntra-style colour-graded rating summary, larger accordion headings. |
| 2026-10-22 | Claude | Reviews section now shows a same-size loading placeholder instead of only the Write-a-review button while reviews load (fixes the pop-in). |
