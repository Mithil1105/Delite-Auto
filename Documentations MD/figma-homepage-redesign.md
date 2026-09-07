# Figma Homepage Redesign

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Figma homepage redesign                 |
| File           | `Documentations MD/figma-homepage-redesign.md` |
| Branch         | figma                                   |
| Owner          | Claude (pairing with the user)          |
| Status         | Done (Home page + global chrome) — other pages are a known follow-up |
| Created        | 2026-09-07                              |
| Last updated   | 2026-09-07                              |

## Summary

Rebuilt the Home page, and the global `Header`/`Footer` chrome, to match a Figma prototype the
user shared as screenshots (white body, navy hero, yellow CTA, rounded-pill tabs/buttons, red
sale pricing, carousels with category-toggle pills, 4-column dark footer with two store
addresses). The rest of the site (Shop, Product Detail, About, Cart, Terms, Refund Policy) keeps
its original dark/orange-accent visual language for now.

## Why

The user is starting a from-scratch visual redesign of the Delite Auto site, tracked on a
`main → hasti → features → figma` branch chain, and asked for an exact rebuild of a Figma
homepage prototype (proto link + 5 full-page screenshots). The existing homepage used a
completely different design system, so this was a full rebuild rather than an incremental tweak.

## Scope

**In scope:** `Home.tsx` end to end, plus `Header.tsx` and `Footer.tsx` (shared chrome, so
restyling them globally was the only option that made sense — see Implementation notes).

**Not in scope / explicitly deferred:** Shop, Product Detail, About, Cart, Terms and Refund
Policy pages keep their current dark-theme body content. The new design tokens were added
*additively* (existing `accent`/`charcoal`/`steel` Tailwind colors and `.btn-*` classes are
untouched) specifically so those pages keep rendering correctly until they get their own pass.

**Known content substitutions (no source assets available):**
- Hero car/bike photography → stylized icon-on-gradient composition, not literal photos.
- Real car-OEM logos (Audi, BMW, Hyundai...) → monochrome initial-in-circle wordmark badges.
- Testimonial people photos → initials-in-circle avatars, not stock photos of named people.

These were deliberate calls (no Figma MCP/API access was available — confirmed via `WebFetch`,
which only returned the SPA shell for the file URL) and are safe to revisit if the user supplies
exported assets later.

## Implementation notes

**Design tokens** (`tailwind.config.js`, `src/index.css`) — additive: new `brand` (navy),
`gold`, `sale` (red), `lavender` color scales, `grain-navy`/`grid-navy` background images, and
new pill-shaped CSS primitives (`.btn-pill*`, `.pill-tab*`) alongside the existing `.btn-*`
classes.

**New home-scoped components** under `src/components/home/` (kept separate from the shared
`ProductCard`/`TrustStrip`/`TestimonialsSection` so other pages are unaffected):
`PillTabs`, `HomeProductCard`, `CategoryIconStrip`, `VehicleBrandGrid`, `PromoBannerPair`,
`TestimonialCarousel`, `GetInTouchBox`, `TrustBadgesRow`. `Rail`/`RailItem` (existing scroll-rail
component) is reused for every carousel; `RailItem` gained an optional `className` prop
(previously hardcoded width) so the category-icon strip could use a narrower item width.

**Rebuilt globally:** `Hero.tsx`, `Header.tsx`, `Footer.tsx` — these are single shared instances
(no other page reads their old i18n keys), so their content was replaced rather than duplicated
under new keys.

**Data additions** (`src/data/`) — additive:
- `types.ts`: `Product` gained optional `rating`, `reviewCount`, `colors`; new `VehicleBrand`
  type; `Testimonial` gained optional `productLabel`.
- `products.ts`: backfilled those optional fields on products featured on Home; added 5 helmet
  products (`p49`–`p53`) and 4 saddlebag products (`p54`–`p57`) since those categories didn't
  exist before, plus one dedicated dashcam product (`p58`) for the "Dash Cams" tab.
- `categories.ts`: added `helmets`, `saddlebags` categories (bike). **Important:** every entry
  here must have a matching `categories.<slug>` entry in all three i18n files — see the bug in
  Testing below.
- New `vehicleBrands.ts`: OEM car/bike makes for "Shop by Brands" — distinct from the existing
  `brands.ts` (accessory brands like Dolphin/Wurth, still used by Shop's brand filter).
- `brands.ts`: added `studds`, `vega` (helmet brands) for the new helmet products.
- `site.ts`: added `locations` (two store addresses, for the new footer).

**i18n** (`src/i18n/en.ts`, `hi.ts`, `gu.ts`) — the `nav`, `header`, `hero`, `trust`, `home`, and
`footer` namespaces were rewritten (not additively — confirmed via grep that each is exclusive
to the component being replaced). All three languages were updated in lockstep since `hi.ts`/
`gu.ts` are typed as `Translations = typeof en`, so a mismatch fails `tsc -b`.

## Interfaces / data

- `Product.rating?: number`, `Product.reviewCount?: number`, `Product.colors?: string[]`
- `VehicleBrand { slug, name, vehicle: "car" | "bike" }` — see `vehicleBrandsFor(vehicle)`
- `Testimonial.productLabel?: string`
- `site.locations: { name, address }[]`
- `RailItem` now accepts an optional `className` (default unchanged: `"w-[240px] sm:w-[260px]"`)

## Dependencies

None added to the project. Playwright was installed temporarily (`npm install --no-save
playwright`) purely to screenshot/smoke-test the dev server during this session — it was not
saved to `package.json` and isn't part of the app.

## Testing / verification

- `npm run build` (`tsc -b && vite build`) — passes clean.
- `npm run lint` (oxlint) — no new warnings.
- Headless Chromium (Playwright) navigated to `/`, `/shop`, `/shop?vehicle=bike`, a product
  detail page, `/about`, `/brands`, `/contact`, `/cart`, `/terms`, `/refund-policy` and asserted
  no `pageerror`s.
  - First pass caught a real bug: `/shop` and `/shop?vehicle=bike` threw `Cannot read properties
    of undefined (reading 'name')` because the two new categories (`helmets`, `saddlebags`) were
    added to `categories.ts` without matching `categories.helmets`/`categories.saddlebags`
    entries in `en.ts`/`hi.ts`/`gu.ts` — `Shop.tsx` indexes that dict without an optional-chain
    fallback. Fixed by adding the missing i18n entries to all three language files; re-verified
    clean.
- Full-page and hero-only screenshots taken and visually compared against the 5 Figma
  screenshots the user provided.

## Known issues / follow-ups

- Shop, Product Detail, About, Cart, Terms and Refund Policy pages still use the old dark theme
  — a deliberate scope cut, not an oversight. Restyling them to match is the natural next step.
- The two "missing asset" substitutions above (hero imagery, OEM logos) are stand-ins; swap them
  for real exports if/when the user provides them.
- `/shop?tag=bestseller` / `/shop?tag=new` links (promo banners, header "Deals & Offers", footer
  "Deals & Offers") degrade gracefully today — `Shop.tsx` doesn't read a `tag` query param yet,
  so they land on the unfiltered catalog rather than 404ing. Wiring that filter up would make
  those links actually filter.
- Header's dropdown chevrons (Cars/Bikes/Shop by Brands/Our Store) are visual only — no mega-menu
  content yet, per the approved plan.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-07 | Claude | Initial rebuild of Home + Header/Footer to match the Figma prototype screenshots |
