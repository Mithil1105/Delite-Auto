# Homepage Section Editing and Admin Appearance

## Metadata

| Field | Value |
|---|---|
| Feature name | Homepage section editors and switchable Admin appearance |
| File | `Documentations MD/homepage-editor-and-admin-appearance.md` |
| Branch | figma |
| Owner | Codex |
| Status | In Progress |
| Created | 2026-09-18 |
| Last updated | 2026-09-18 |

## Summary

Every homepage section now links to a content editor or its existing merchandising/promotion editor. Admin Settings lets an administrator switch between the improved Legacy appearance and a Glass iOS appearance; the choice is stored locally for that browser.

## Why

The previous Homepage screen could reorder and hide sections but displayed “Content editor coming soon” for most of them. The user requested section-level copy and media controls modeled after Hasto’s small editors, along with more readable analytics and an optional glass appearance.

## Scope

The section editors cover headings, CTA copy and internal links, vehicle split headings/images, brand badge names, testimonials, contact copy, and Odoo product selection for each Car/Bike category tab. Existing Promotions and Merchandising editors remain the controls for promotional banners, category icons, and Featured/Trending/New Arrivals rails. The appearance option changes Admin only. It does not alter the customer storefront theme.

## Implementation notes

- `src/admin/pages/website/HomeSectionEditor.tsx` — generic field editor over the existing homepage draft JSON; save and publish retain existing CMS role checks and publication flow.
- `src/admin/pages/website/Homepage.tsx` — all 11 section rows now offer a content editor route, with Hero keeping its dedicated editor.
- `src/pages/Home.tsx`, `src/components/home/VehicleShopSplit.tsx`, `GetInTouchBox.tsx`, `TestimonialCarousel.tsx` — published content drives text and selected media; missing content falls back to the existing design.
- Top-category product selections store Odoo template IDs only and resolve live with `useMerchandisedProducts`; an empty selection retains the existing automatic rail.
- `src/admin/appearance/AdminAppearance.tsx`, `src/admin/pages/settings/Appearance.tsx`, `src/admin/layouts/AdminLayout.tsx`, `src/index.css` — scoped appearance preference and glass surface styling.
- `src/admin/pages/analytics/Analytics.tsx` — clearer metric cards, previous-period comparison, daily page-view trend, conversion funnel, and ranked bars.

## Interfaces / data

Homepage fields are stored inside the existing `cms_section_drafts.content` JSON object and become public only through the existing `cms_publish_page` operation. Internal CTA links are constrained to site-relative paths at render time. Admin appearance uses the `delite-admin-appearance` localStorage key with `glass` and `legacy` values; all Admin roles can access the setting.

## Dependencies

Existing CMS tables, publication RPC, Admin roles, and analytics event tables. No new package or migration is needed for this UI change.

## Testing / verification

`npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, `npm run lint`, and `npm run test:unit` passed. Lint retains warnings from existing components; 39 existing unit tests passed and 1 live integration test was skipped. A signed-in browser visual check is still pending.

## Known issues / follow-ups

Image fields currently accept a URL rather than uploading in the section editor; the existing Media library can supply URLs. Analytics still relies on capped client queries, so very large periods need server aggregates. Current analytics collection and geographic gaps remain as described in `delite-analytics.md`.

## Revision log

| Date | Author | Change |
|---|---|---|
| 2026-09-18 | Codex | Initial section editors, appearance switch, and analytics presentation improvements. |
| 2026-09-18 | Codex | Added category tab copy fields, expanded appearance access to all Admin roles, and completed build/lint/unit checks. |
| 2026-09-18 | Codex | Added per-tab Odoo product pickers to both Top Categories sections. |
| 2026-09-18 | Codex | Added editable Car/Bike brand badge names and tab copy. |
