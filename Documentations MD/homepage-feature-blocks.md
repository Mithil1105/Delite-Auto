# Homepage feature blocks (text + picture, optionally from a blog post)

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Four reorderable home page "feature blocks": label, big heading, paragraph, button and picture side by side, with an optional product row |
| File           | `Documentations MD/homepage-feature-blocks.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | Done — migration applied live; verified in headless Chromium (desktop + 375px) with mocked content; blocks are empty (not shown) until filled; not committed |
| Created        | 2026-10-23                               |
| Last updated   | 2026-10-23 |

## Summary

Blog-style content blocks that can sit anywhere on the home page. Each block either takes its content from a **blog post** (picked in the admin) or is written directly. They appear in Admin → Website → Homepage like every other section, so staff can reorder, hide and edit them.

## Why

Client wanted blog/info style sections on the home page (like the "– Car Safety / Protect Your Car with Smarter GPS Security" block with the logo on the right and a "Trending Car Accessories" row below), managed from the admin with an order they control.

## Scope

In: 4 block slots (`feature-block-1…4`), picture left/right, background (white/grey/dark), picture fit, button, optional product row (up to 8 picked products + "See all" link). Out: more than 4 slots without a new migration row + Home entry.

## Implementation notes

- `src/components/home/HomeFeatureBlock.tsx` — storefront block. With a blog post picked (`postId`), empty fields fall back to the post: category → label, title, summary, cover picture, and a "Read article" button to `/blog/<slug>`, in the reader's language (English fallback). The post must be live; otherwise the block shows only its own fields (or nothing). Renders nothing without a heading or a picture. Only https / site-relative picture URLs and links are accepted.
- Admin: `SectionInspector.tsx` — new field kinds `select` and `post` (drop-down of blog posts, drafts marked), `FEATURE_BLOCK` field set, product picker via `PRODUCT_TABS`. Labels in `Homepage.tsx`; live preview in `HomeSectionPreview.tsx`.
- `Home.tsx` — blocks added to `DEFAULT_ORDER`. Default positions (migration `20261023100000_homepage_feature_blocks.sql`, applied; history marked applied): 47 (after Trending Accessories), 65 (after Brands), 85 (after Promo banners), 98 (before Testimonials).
- Related existing section: "Latest from the blog" (`blog-latest`, see `blog.md`) still shows the 3 newest posts automatically; feature blocks are for hand-picked/hand-written highlights.

- **On/off flag:** every Homepage section (feature blocks, banners, trending accessories, blog row, …) has a **"Show on website" switch** at the top of its edit panel (and the small eye icon in the section list — same flag). Off hides the section for visitors after you publish; the content is kept. Implemented in `Homepage.tsx` (`toggleVisible`); the storefront already skips sections whose published `visible` is false.

- **"Show as plain page content" flag (per block, off by default):** a switch in the block's edit panel. On: no background colour, no box or rounded corners around the picture and tighter spacing, so the block reads as part of the home page itself; off: the card look. Content key `plain`. The Background option applies to the card style only.
- Section order: the blog row (`blog-latest`) now sits just above the Testimonials section (display order 99; `Home.tsx` default order updated).

## Interfaces / data

Section content keys: `postId, plain (boolean), eyebrow, title, text, buttonLabel, buttonLink, image, imageAlt, imageSide (right|left), imageFit (contain|cover), background (white|grey|dark), productsTitle, productsLink, productIds[]`.

## Dependencies

Blog posts (`blog_posts`, public RLS shows only live posts), admin media library, product picker / Odoo catalog.

## Testing / verification

tsc (`-p tsconfig.app.json`) clean. Browser with mocked CMS content: block 1 (label, heading, paragraph, button, picture right, product row with "View All →") and block 2 pulling label/title/summary/cover/"Read article" from a mocked live post with the picture on the left, grey background — on desktop and mobile, no console errors. Not exercised: the admin form and the new switch in a browser (needs a real admin login).

## Known issues / follow-ups

- Text typed directly into a block is single-language (like the other home page sections); post-driven blocks use the post's English/Hindi/Gujarati text.
- The product row heading defaults to "Trending Accessories" when not set — set the heading in the admin for other topics.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-23 | Claude | Initial version                          |
| 2026-10-23 | Claude | Added a labelled "Show on website" on/off switch to the section edit panel (feature-flag style, all home sections). |
| 2026-10-23 | Claude | Added the per-block "plain page content" flag; moved the blog row above Testimonials. |
