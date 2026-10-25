# Blog (articles and guides managed from the admin)

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Blog: `/blog`, `/blog/:slug`, home "Latest from our blog" section, Admin → Website → Blog |
| File           | `Documentations MD/blog.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | Done — migration applied live; storefront and admin editor verified in headless Chromium; two sample posts left as DRAFTS; not committed |
| Created        | 2026-10-22                               |
| Last updated   | 2026-10-22                               |

## Summary

Non-technical staff write and publish articles from the admin: title, summary, cover picture, category, a layout, an article built from simple blocks (heading / text / picture / photo gallery / quote), optional featured products, and English / Hindi / Gujarati versions. The storefront has a blog list, article pages and a home page section.

## Why

Client wanted blog-style content (guides, tips, info) they can write, publish and lay out themselves, with different layouts, image areas and an option to show products.

## Scope

In: everything below. Out: comments, multiple authors with logins, rich-text/HTML editing, automatic translation (see Known issues).

## Implementation notes

- Data: `blog_posts` (migration `20261022190000_blog_posts.sql`). Text fields are jsonb per language `{en,hi,gu}`; English required. Body = list of blocks per language. RLS: the public sees a post only when `status='published' AND published_at <= now()` (future date = scheduled); owner/admin/content can read/write everything. A signed-in admin opening `/blog/<slug>` of a draft sees it with a "Draft preview" banner (this is the Preview button).
- Safety: blocks are plain text/images only — no HTML. `cleanBlocks()` (`src/lib/blog.ts`, tested in `blog.test.ts`) drops unknown blocks and only allows https / site-relative image URLs when reading.
- Layouts: Standard, Big banner (hero), Side by side (split), Photo story (gallery, wider page). "Show products under this article" (per post, up to 8 via the product picker) renders a product rail after the article.
- Language: the reader's language is used when that version exists, otherwise English (`pickText`, `pickBody`). In the editor, a "Copy the English text here" button pre-fills Hindi/Gujarati for hand translation. UI labels are in en/hi/gu (`blog.*`).
- Files: `src/lib/blog.ts`, `src/services/blog/blogService.ts`, `src/components/blog/Blog.tsx` (card + block renderer), `src/pages/Blog.tsx`, `src/pages/BlogPost.tsx`, `src/components/home/HomeBlogLatest.tsx`, `src/hooks/{useBlogPosts,usePageMeta}.ts`, admin `src/admin/pages/website/{BlogList,BlogEditor}.tsx` + `src/admin/components/BlogBlockEditor.tsx`.
- Home: `blog-latest` section (row seeded at order 105) — reorder/hide/edit heading in Admin → Website → Homepage; shows the 3 newest live posts and renders nothing if there are none. Footer Quick Links has a "Blog" link.
- Admin nav: Website → Blog (owner/admin/content).

## Interfaces / data

Table `blog_posts` (see migration). Activity log actions: `blog.draft_saved`, `blog.published`, `blog.deleted`.

## Dependencies

Admin media library (cover/pictures), `AdminProductPicker` + Odoo catalog (featured products), CMS homepage sections, `useSiteChrome`-style CMS not needed.

## Testing / verification

- Real type check: `npx tsc --noEmit -p tsconfig.app.json` (NOT `-p .` — the root tsconfig has `files: []` and checks nothing). Clean.
- Unit: `blog.test.ts` (block sanitising, language fallback, slug, reading time, scheduling) — passes.
- Browser (storefront, with sample posts temporarily published): list + featured card, hero and split layouts, Hindi title/body and English fallback, missing-post page, featured products row, home section; no console errors. Sample posts were then set back to draft.
- Browser (admin, simulated owner session with mocked REST): create post → slug auto from title, add text/heading/quote blocks, Big banner layout, products toggle, Hindi tab "copy English", Publish → correct payload (status, published_at, layout, per-language title/body, created_by), empty-title validation.

## Known issues / follow-ups

- **No automatic translation** (no API key available). Hindi/Gujarati must be written/pasted by staff, otherwise visitors see English. A "Translate" button backed by an edge function can be added once a Claude/Google key exists.
- The two seeded sample posts are drafts (English only); edit and publish or delete them.
- Cover/picture uploads use the existing media library; there is no crop tool — pictures are shown at their own proportions (cards crop to 16:9).
- The blog has no admin-editable SEO title/description per post: the title and summary are used.

## Published content

- **"Protect Your Car with Smarter GPS Security"** (`/blog/protect-your-car-with-smarter-gps-security`, category Car Safety, Side-by-side layout, 8 GPS trackers as featured products) — written in English, Hindi and Gujarati, published 2026-10-23, and shown on the home page in **Feature Block 1** (see `homepage-feature-blocks.md`). The Phoenix Secure logo was cropped from the client screenshot and uploaded to the `marketing-media` bucket (`blog/phoenix-secure.webp`, also added to the media library) — replace it with the original logo file when available. The body text is generic copy based on the client's headline; check it before it is promoted. With only one published post, the "Latest from our blog" row shows the same post a second time — switch that section off (or publish more posts).

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-22 | Claude | Initial version                          |
| 2026-10-23 | Claude | Published the GPS Security post (en/hi/gu) and put it on the home page via Feature Block 1. |
