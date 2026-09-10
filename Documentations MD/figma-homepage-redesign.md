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
| Last updated   | 2026-09-08                              |

> **Note (2026-09-09):** The layout/spacing primitives, `ProductArt`→`ProductMedia`/
> `ProductPlaceholder` split, Header chevron removal, and Home.tsx semantic tab fixes referenced
> in this file's Known-issues section below have been superseded by
> [frontend-foundation-uiux-refactor.md](frontend-foundation-uiux-refactor.md). This file is kept
> as a historical record of the original homepage rebuild.

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
- Real car-OEM logos (Audi, BMW, Hyundai...) → monochrome initial-in-circle wordmark badges.
- Testimonial people photos → initials-in-circle avatars, not stock photos of named people.

These were deliberate calls (no Figma MCP/API access was available — confirmed via `WebFetch`,
which only returned the SPA shell for the file URL) and are safe to revisit if the user supplies
exported assets later.

**2026-09-08 follow-up — Hero/Shop-by-Cars-Bikes now use real photography, not stand-ins:**
the Figma mock's hero shows a *fan of real accessory-product photos* (seat covers, saddlebags)
overlapping the vehicles, plus a full-bleed diagonal "Shop by Cars / Shop by Bikes" banner. The
first pass at this (2026-09-08) used Pixabay stock vehicle photos (`car.png` = a BMW convertible,
`bike.png` = a rider on a sport bike) for the vehicles and CSS/icon "swatches" for the accessory
fan. The user flagged this as not matching the reference (see `Hero.tsx` git history) — no
Figma export access exists for the exact assets, so:
- Searched Pixabay/Pexels for isolated seat-cover/accessory product photos — none exist as free
  stock (those are proprietary catalog photography, not generic stock subjects).
- Found `public/images/products/*.png` (44 real, alpha-cut catalog photos). **Correction — this
  was initially mis-documented here as "never wired into the site" / "no `image` field so no code
  path exists"; that's wrong.** `src/lib/productImages.ts` (product-id → photo) and
  `src/lib/categoryImages.ts` (category-slug → representative photo) already map most of these
  into `ProductArt.tsx`, which is used by `ProductCard`, `HomeProductCard` and `ProductDetail` —
  real photos already render for 37 of 39 catalog products, composited over a themed gradient
  tile (see `README.md`). Only `CategoryIconStrip.tsx` genuinely doesn't use them yet (hardcoded
  Lucide icons, despite `categoryImages.ts` already covering `seat-covers`/`floor-mats`/
  `audio-dashcams`/`bike-guards`). What *is* still true: none of these photos are the specific
  hero-composition assets needed (an orange Creta, a multi-bike cluster, saddlebags) — the two
  seat-cover photos below were reused as themselves (they already back real seat-cover products),
  not "unused assets discovered."
- Repurposed four of them (via `sharp().trim()` to crop transparent margins, same technique as the
  original hero images) as new hero assets: `seat-black.png` (from `products/442.png`, the real
  photo behind the "Dolphin Orbit Seat Cover — Hyundai Creta" catalog entry), `seat-grey.png`
  (from `products/508.png`, backing "…— Mahindra XUV700"), `pillow-black.png` (from
  `products/117.png`, a 4N Mats headrest-pillow pair). `Hero.tsx`'s `AccessoryCluster` fans these
  as real `<img>`s instead of the old CSS/icon `SeatFan`.
- Replaced `bike.png` itself: swapped the Pixabay rider-on-a-sport-bike photo for
  `products/10.png` (a real, riderless Honda-style scooter from the same catalog) — a closer
  match to the reference's plain-scooter framing and more appropriate for an accessories storefront
  than a person in full leathers. This file is shared by both `Hero.tsx` and the
  `Home.tsx` "Shop by Bikes" panel, so both picked up the change automatically.
- `car.png` is unchanged (still the Pixabay BMW convertible) — no equivalent real SUV photo exists
  in `public/images/products/`. Swapping it for a closer match (e.g. an actual Creta/XUV silhouette)
  is a safe follow-up if the user sources one.
- **Caveat carried forward, not resolved:** `seat-black.png`/`seat-grey.png` still carry a visible
  tiled "Dolphin Accessories" watermark baked into the source photo (it's the *supplier's* catalog
  watermark, not Delite's own branding). Removing it would need real photo editing/inpainting,
  which wasn't attempted. Flagged to the user; revisit if it reads as unpolished in the hero.

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
- `public/images/hero/`: `car.png`, `bike.png` (both trimmed with `sharp().trim()` to remove
  transparent-margin padding baked into the source photos — `bike.png` was later replaced
  entirely, see Summary), plus new `seat-black.png`, `seat-grey.png`, `pillow-black.png`
  (real catalog photos copied in from `public/images/products/`, trimmed the same way).
  **Correction:** `public/images/products/*.png` (44 files) are NOT otherwise unused — see the
  correction note in Summary above. `src/lib/productImages.ts`/`categoryImages.ts` already map
  most of them into `ProductArt`, which real product cards site-wide already render through.

**2026-09-08 follow-up — Hero/Shop-by-Cars-Bikes layout:**
- `Hero.tsx`: `AccessoryCluster` (replaces the old `SeatFan`) fans real `<img>` product photos
  (see Summary above) at the base of the car/bike images via absolute positioning + per-image
  `rotate`/`translateY`/`drop-shadow`.
- `Home.tsx`: the "Shop by Cars" / "Shop by Bikes" block was rebuilt from two separate
  `rounded-2xl` cards (each with its own `clipPath`, sitting in a padded `container-page` grid
  with a gap between them) into one full-bleed section — a single `grid` row with no
  `container-page` wrapper, only the left ("Shop by Cars") column has a `clipPath` (`polygon(0 0,
  100% 0, 82% 100%, 0 100%)`), and because the two columns sit flush with no gap, that diagonal
  reveals the white column directly behind it — producing one continuous diagonal seam instead of
  two independent card shapes. Each column also got `overflow-hidden` plus an explicit
  `max-h-[…]` (not just `max-w-[…]`) on its vehicle image, and a blurred ellipse `div` behind it,
  after the vehicle images were initially overflowing the panel's bottom edge on narrower
  viewports (height was previously driven only by width-scaled image size) and reading as
  "floating" with no ground contact.

## Dependencies

None added to the project. Playwright was installed temporarily (`npm install --no-save
playwright`, both on 2026-09-07 and again on 2026-09-08) purely to screenshot/smoke-test the dev
server during these sessions — it was not saved to `package.json` and isn't part of the app.

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
- 2026-09-08: re-screenshotted the Hero and Shop-by-Cars/Bikes section at multiple viewport
  widths (1440/1200/900px) after each round of changes to confirm the vehicle images no longer
  overflow their panel at narrow widths, and to check the real accessory-photo composition.

## Known issues / follow-ups

- Shop, Product Detail, About, Cart, Terms and Refund Policy pages still use the old dark theme
  — a deliberate scope cut, not an oversight. Restyling them to match is the natural next step.
- Real car-OEM logos and testimonial photos are still stand-ins (see Summary); swap them for real
  exports if/when the user provides them.
- `car.png` (hero SUV) is still a Pixabay stock photo (a BMW convertible), not a real catalog
  photo — no equivalent SUV exists in `public/images/products/`. `bike.png` was upgraded to a
  real catalog photo (see Summary).
- `seat-black.png`/`seat-grey.png` carry a visible "Dolphin Accessories" supplier watermark
  baked into the source photo — not removed (would need real photo editing). Flagged to the user.
- `CategoryIconStrip.tsx` still renders hardcoded Lucide icons instead of real photos, even
  though `categoryImages.ts` already has real photos for 4 of its 7 categories
  (`seat-covers`, `floor-mats`, `audio-dashcams`, `bike-guards`) sitting unused right there.
  Genuine, low-effort follow-up (unlike the corrected claims above).
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
| 2026-09-08 | Claude | Rebuilt "Shop by Cars/Bikes" into one full-bleed diagonal banner (was two separate rounded cards); fixed vehicle images overflowing the panel + added grounded drop-shadows |
| 2026-09-08 | Claude | Replaced the Hero's fabricated icon/color-swatch accessory fan and the CSS-diagonal cards with real product photography from `public/images/products/`; swapped the rider-on-a-bike stock photo for a real riderless scooter photo |
| 2026-09-08 | Claude | Correction: `src/lib/productImages.ts`/`categoryImages.ts` already wire most catalog photos into `ProductArt` site-wide — earlier entries above claiming those 44 photos were "unused" / that `Product` has "no code path" to a real image were wrong; only `CategoryIconStrip.tsx` genuinely doesn't use them yet |
