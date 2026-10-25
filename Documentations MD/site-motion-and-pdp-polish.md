# Site Motion + Product Page Declutter

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Product-page declutter, smoother scrolling/accordion, and site-wide motion (scroll reveals, page fade-in, add-to-cart flight, press feedback) |
| File           | `Documentations MD/site-motion-and-pdp-polish.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | Done — verified in headless Chromium; not committed/deployed; scroll "glitch" not reproducible headless (see Known issues) |
| Created        | 2026-10-21                               |
| Last updated   | 2026-10-21                               |

## Summary

The product page was cluttered (Buy Now fell below the fold) and felt choppy when scrolling past the
description. It is now compact, its gallery no longer captures scroll, the description accordion
animates, and the whole storefront gets restrained motion.

## Why

User feedback on the Nexon mats page: "page looks cluttered, Buy Now is cut off, everything chaotic",
"glitches when scrolling near the description", and a request for overall animations (scrolling, adding
to cart).

## Scope

In: product page layout, gallery scroll behaviour, accordion, fake play tiles, motion system.
Out: smooth-scroll libraries (Lenis etc. — they add scroll jank risk), per-page bespoke animations,
admin panel (has its own reduced-motion rules), analytics-visible changes.

## Implementation notes

**Product page** (`src/pages/ProductDetail.tsx`)
- Quantity stepper, Add to Cart and Buy Now now share one row (stacked on phones); spacing tightened
  (container, breadcrumb, title/price/rating, variant/colour/fitment blocks); the two "money-back /
  shipping" bars became one compact two-column strip. At 1280×720 both buttons sit at y≈432–481.
- Removed the two placeholder "video" tiles in the description (the same photo twice with a fake
  play button; no video exists behind them).
- Description/Reviews/Returns/Delivery accordion: new `AccordionPanel` animates height
  (`grid-template-rows 0fr→1fr`) instead of mounting/unmounting instantly; children mount on first
  open (reviews fetch stays lazy), closed panels are `inert`.

**Gallery** (`src/components/product/ProductMediaGallery.tsx`)
- The desktop stage is no longer a nested snap-scroller (ported from Hasto). It stacks the images and
  cross-fades between them (thumbnail click, ‹ › buttons on hover, ←/→ on the rail), with a "1 / n"
  counter. This removes the most likely cause of choppy page scrolling: a scroll container under the
  pointer captures wheel/trackpad input before handing it back to the page.

**Motion system**
- `src/index.css` — `.reveal`/`.is-visible` (opacity + translate, 0.6s), `.page-in` (0.38s route
  fade), all disabled under `prefers-reduced-motion`; `.btn-pill*` get a 0.97 press scale.
- `src/components/motion/Reveal.tsx` — IntersectionObserver wrapper with optional stagger delay
  (`staggerDelay(i)`); content already on screen still animates; no-IO browsers show content directly.
- `src/pages/Home.tsx` — every section except the hero is wrapped in `Reveal`.
- Staggered reveals on product grids (`Shop.tsx` desktop + mobile lists, `CarModelPage.tsx`), car tiles
  (`CarModelGrid.tsx`) and the PDP's related/trust sections; product cards lift 2px on hover.
- `src/components/Layout.tsx` — page content wrapped in `<div key={pathname} className="page-in">`
  (pathname only, so shop filter/query changes don't replay it).
- `src/lib/motion/flyToCart.ts` — on every real Add to Cart (not Buy Now) a copy of the product image
  arcs to the header cart icon (Web Animations API, 720 ms), then the icon pops. Source = the clicked
  card's image or the PDP's visible gallery image (found via `window.event`/focus, so no call site
  changed); target = `[data-cart-target]` on the header cart link. `CartContext.addToCart` calls it and
  holds the desktop cart drawer back ~600 ms so it doesn't cover the icon mid-flight. Skipped under
  reduced motion; silently no-ops if the image or icon isn't found.
- `data-product-card` added to `ProductCard` roots, `data-pdp-gallery` to the PDP gallery column.

## Interfaces / data

`flyToCart(): boolean`, `FLY_TO_CART_MS`, `<Reveal delay as className>`, `staggerDelay(i)`. No data or
API changes.

## Dependencies

None added (framer-motion is already a dependency but was deliberately not used — CSS/WAAPI keep this
light).

## Testing / verification

- `tsc` clean; oxlint: no new warnings.
- Playwright (headless Chromium) on `/product/tata-nexon-floor-mats-4n-mats--495` at 1280×720: Add to
  Cart / Buy Now visible without scrolling; accordion height animates open (25→48px sampled) with no
  page jump; no fake play tiles; Add to Cart creates exactly one flight image, removes it afterwards,
  updates the cart count, and the drawer opens after the flight; homepage reveals count grows as
  sections are scrolled into view (a teleport straight to the footer correctly reveals nothing above
  it); no console errors. Layout-shift and frame-time probes showed no shifts and no slow frames.
- Not tested: real GPU browsers/trackpads, Safari, touch devices, reduced-motion emulation, a full
  page-by-page visual regression.

## Known issues / follow-ups

- The user's scroll "glitch" could not be reproduced in headless Chromium (0 layout shifts, 0 slow
  frames before or after). The gallery change and animated accordion address the likeliest causes; if
  it persists, capture a Chrome performance trace on the affected machine.
- Existing Playwright visual specs that screenshot the homepage may need to wait for `.reveal` to
  become `.is-visible`.
- Page fade-in replays on every route change by design.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-21 | Claude | Initial version                          |
