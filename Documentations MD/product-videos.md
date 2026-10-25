# Product Videos (Odoo video links → on-site player)

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Odoo product videos (YouTube/Vimeo links) shown in the product gallery and playable on the site |
| File           | `Documentations MD/product-videos.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | Done — backend deployed live and verified against the real catalog; storefront verified in a browser with a stand-in video entry (not with the real live video in a real YouTube player); not committed |
| Created        | 2026-10-22                               |
| Last updated   | 2026-10-22                               |

## Summary

Staff attach a "Video URL" (a YouTube link) to a product's media in Odoo; Odoo's own storefront opens it in a
YouTube-style player. Our React storefront ignored that field, so those gallery entries came through as broken
pictures and the videos could not be opened. They now appear in the product gallery as a video thumbnail that
plays on the page, with a "Watch on YouTube" link that opens it on YouTube.

## Why

The client's Odoo products carry videos via Odoo's video-embed field and wanted them to open on YouTube or
play as a preview inside the website.

## Scope

In: reading `product.image.video_url`, link parsing (YouTube, Vimeo; anything else = link only), gallery
thumbnail/poster, inline player, YouTube link, zoom-viewer support. Not changed: uploading/editing videos (done in
Odoo), product cards/listings (still show the primary photo), analytics, uploaded video *files* (the existing
`type: "video"` file path is unchanged).

## Implementation notes

Backend (Supabase Edge, `catalog-product-detail` redeployed):
- `supabase/functions/_shared/odoo/video.ts` (+ `video.test.ts`, 19 tests) — `parseVideoUrl()` turns what staff
  pasted (watch / youtu.be / embed / shorts / live / scheme-less / `t=` start times / Vimeo incl. unlisted hash)
  into `{provider, videoId, watchUrl, embedUrl, thumbnailUrl}`. Hosts are matched exactly (look-alike domains and
  `javascript:`/`data:` URLs are rejected or become a plain link), IDs must match strict patterns, and embed/
  thumbnail URLs are rebuilt from the validated id. YouTube uses `youtube-nocookie.com`; Vimeo uses `dnt=1`.
- `fetch.ts` — gallery read now includes `video_url`, but only after a one-time `fields_get` shows the field exists
  (an unknown field would make the whole read fail); if the read ever errors it retries without it, so galleries
  can never be taken down by this. `catalog.ts` — a gallery entry with a valid video link becomes a media item with
  a `video` object and the YouTube thumbnail as its picture.

Storefront:
- `src/data/types.ts` (`ProductVideo`, `ProductMedia.video`), `supabaseCatalogService.ts` (maps video entries to
  `type: "video"`).
- `src/components/product/EmbeddedVideo.tsx` — poster + Play button; nothing is loaded from YouTube until Play is
  pressed (speed + no tracking cookies before consent-by-click); Play mounts a sandbox-friendly iframe
  (autoplay, fullscreen allowed, `strict-origin-when-cross-origin`); moving to another image unmounts it (stops
  playback); "Watch on YouTube ↗" always opens the video in a new tab (`rel="noopener noreferrer"`); links we can't
  embed get a "Watch video" link only.
- `ProductMediaGallery.tsx` — video thumbnails get a play badge; desktop stage and mobile carousel render
  `EmbeddedVideo` for video entries. `MediaLightbox.tsx` — a video slide shows the player.

## Interfaces / data

Catalog media item: `{ id, url, alt, video?: { provider, videoId?, watchUrl, embedUrl?, thumbnailUrl? } }`.
No database change.

## Dependencies

Odoo website_sale's `product.image.video_url`. No new packages; no CSP/headers exist that would block frames.

## Testing / verification

- 19 parser unit tests pass; full suite otherwise unchanged (3 pre-existing failures in checkout-handoff tests).
- Live scan of all 356 products through the deployed function: 268 have extra gallery images and **26 have a video
  — all YouTube, all embeddable** (the 11 Würth products' product videos, the 3 "set of 3" bike kits, and 12 ALP
  car-mat products sharing one video). A normal product (Nexon mats) is unaffected.
- Playwright (headless Chromium) on a real product page with a YouTube + a non-embeddable video entry injected into
  the live response (YouTube thumbnail/player stubbed): 4 thumbnails, 2 with play badges; poster before Play; Play
  creates an iframe on `www.youtube-nocookie.com` with `autoplay=1` and fullscreen allowed; the "Watch on YouTube"
  link is `https://www.youtube.com/watch?v=…` with `target=_blank rel=noopener noreferrer`; switching to a photo
  removes the iframe, returning shows the poster again; the non-embeddable video has a link and no Play button;
  at 390px no horizontal overflow and the video plays; no page errors.
- After the videos-first change: on the real live product "WURTH RUST OFF (350 ML)" (no stand-ins) the video is the first, selected thumbnail; Play loads the real YouTube player (`youtube-nocookie.com/embed/S-MswP5G9jg`) and it plays inline; the YouTube link is correct; no page errors.
- NOT tested: Vimeo in the browser, the zoom-viewer video slide, Safari/iOS
  inline-play behaviour, keyboard/screen-reader pass.

## Known issues / follow-ups

- Videos are shown first in the gallery (client choice, 2026-10-22) — `src/lib/media/videosFirst.ts`, applied in
  `supabaseCatalogService.ts`; photos keep Odoo's order after them.
- Product cards show a small "video" badge (top-left of the image) when the product has a gallery video: `catalog-products`
  does one extra batched `product.image` read (ids only, `video_url != false`, `fetchTemplateIdsWithVideo`) and returns
  `hasVideo` → `Product.hasVideo` → `ProductCard`. Best-effort: if that lookup fails nobody gets a badge, the list still loads.
  Live check: 15 of the first 60 products flagged. Odoo `embed_code` is ignored (the URL is used).
- Anyone can pause/unmute freely; there is no analytics event for video plays yet.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-22 | Claude | Initial version                          |
| 2026-10-22 | Claude | Product cards show a video badge for products with videos (hasVideo from catalog-products, redeployed). |
| 2026-10-22 | Claude | Product videos now sort first in the gallery (videosFirst + 3 tests); verified with a real live product and the real YouTube player. |
