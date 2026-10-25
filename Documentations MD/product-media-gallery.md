# Product Image Gallery (ported from Hasto)

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Product detail image gallery — thumbnail rail, scrolling viewer, zoom viewer, mobile swipe |
| File           | `Documentations MD/product-media-gallery.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | Done — verified in headless Chromium (desktop + mobile); not committed/deployed |
| Created        | 2026-10-21                               |
| Last updated   | 2026-10-21                               |

## Summary

The product page's image area (one large photo + a row of small thumbnails) now behaves like the
Hasto storefront's gallery (`C:\Users\hasti\full stach\hasto`, `ProductMediaGallery.tsx`,
`MediaLightbox.tsx`): a vertical thumbnail rail with an active-position dot, a viewer you flip through (it was a nested scroller at first — see revision log), click-to-zoom in a full-screen viewer, and a swipe carousel on mobile.

## Why

The user asked for the product page's image preview and scrolling to work "like Hasto" (their own
Hasto by Hasti storefront), pointing at the Nexon floor-mats page.

## Scope

In: desktop rail + scrolling viewer, mobile carousel + thumbnail strip, full-screen zoom viewer,
sticky gallery column on desktop. Out: Hasto's video autoplay logic, external (embedded) video, and
variant-photo jumping — Odoo products here only have images, and variants don't carry their own photos.
Hasto's visual style (square corners, olive accents) was not copied; this uses Delite's rounded
cards and brand colours.

## Implementation notes

- File: `src/components/product/ProductMediaGallery.tsx` — new. Desktop (`md+`): thumbnail rail on
  the left (active dot, arrows only when the rail overflows, roving tab stop + arrow/Home/End keys)
  beside a viewport that is its own `snap-y snap-proximity` scroller. No wheel listener and default
  overscroll, so the first/last image hands scrolling back to the page (no scroll trap). The active
  slide is tracked with an IntersectionObserver rooted on the viewport. Frame is square, capped at
  `100dvh − 200px` (min 320px) so a whole image fits without page scroll; the rail is absolutely
  positioned inside its column so it takes its height from the viewer. Mobile: horizontal snap-x
  carousel + thumbnail strip with dots. `fallback` renders the existing icon placeholder when a
  product has no images. Video entries (type "video") render with native controls.
- File: `src/components/product/MediaLightbox.tsx` — new. Portalled full-screen viewer: wheel /
  double-click / pinch / button zoom (1–4×), drag-pan, swipe, prev/next, ←/→/Esc, focus trap and
  focus restore, body scroll lock, thumbnail strip.
- File: `src/pages/ProductDetail.tsx` — gallery block replaced; `activeImage` state and the
  `galleryImages` list removed (`heroImage` kept, now the first image, for the video tab's thumbnail).
  Gallery column is `lg:sticky` below the header (`--header-height`) so it stays beside the info
  column while reading. `key={product.id}` remounts the gallery per product.

## Interfaces / data

`<ProductMediaGallery media={product.media} productName fallback />` — `media` is the existing
`ProductMedia[]` (`id, type, src, alt, thumbnail?`), capped at 9 images.

## Dependencies

None new (lucide-react, clsx already in use).

## Testing / verification

- `tsc -p tsconfig.app.json --noEmit` clean; oxlint: no new warnings (two `set-state-in-effect`
  warnings in ProductDetail.tsx pre-date this change).
- Playwright (headless Chromium, localhost:5176) on `/product/tata-nexon-floor-mats-4n-mats--495`
  (2 images): thumbnails render, clicking thumbnail 2 makes it the current one, clicking the image opens
  the viewer, ←/Esc work (counter 2/2 → 1/2, then closed), no console errors; mobile (390px) shows the
  carousel + strip. Screenshots reviewed. Not tested: pinch zoom on a real touch device, products with
  more than ~5 images (rail arrows), reduced-motion.

## Known issues / follow-ups

- The one-time "Scroll to view more" pill can sit over text printed on a product photo until the
  first scroll.
- Single-image products show no rail/strip (by design) but the image still opens the zoom viewer.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-21 | Claude | Initial version                          |
| 2026-10-21 | Claude | Desktop stage changed from a nested snap-scroller to a cross-fading single stage with ‹ › buttons and a counter, because a scroll container under the pointer captured page scrolling (see site-motion-and-pdp-polish.md). Rail, zoom viewer and mobile carousel unchanged. |
