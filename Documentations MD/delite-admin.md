# Delite Admin Panel Foundation + CMS System

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Delite Admin panel foundation: roles, layout, CMS/draft-publish, media, read-only product browser, activity log |
| File           | `Documentations MD/delite-admin.md` |
| Branch         | figma |
| Owner          | Claude |
| Status         | Phase 1 + Phase 2 done and live-verified. Analytics foundation and Carts reporting are in progress; Customers/Visitors, Contact inbox, Settings/Admin Users, and merchandising Recommendations remain placeholders. |
| Created        | 2026-09-18 |
| Last updated   | 2026-10-02 (CMS visual-editor undo/redo + unsaved-changes-dialog fixes — see delite-cms-visual-editor.md; Admin Users, Contact Enquiries inbox, media-delete safety resolved — see the corresponding Documentations MD/delite-*.md files; production-ops phase added System group pages + Order Detail + RLS reconciliation, then a P1 follow-up added Payments + Reviews history + Integrations Health — see delite-production-operations.md; security-hardening verification pass replaced this doc's stale role table with a pointer to the current, live-verified matrix in delite-auth-security.md and fixed a real Security-page lockout bug; security cleanup pass narrowed `profiles`' own admin-read RLS policy from any-admin-role to owner/admin only, closing the over-broad-PII-read gap the verification pass had flagged but not yet fixed — see that file) |

## Summary

A real, protected `/admin` application — separate shell, separate login, role-based access —
covering: admin auth + roles, `AdminLayout` (sidebar/topbar), an Overview page backed entirely by
real data, a normalized CMS schema with a real draft/publish model, full website CMS editors
(Homepage shell, Hero, Announcement, Promotions, Navigation, Footer, SEO), merchandising editors
(Featured/Trending/New Arrivals/Homepage Categories with Odoo-ID-only persistence), a Marketing
Media library on Supabase Storage, a read-only Odoo product browser, and an admin activity log.
**Published CMS content now drives the live storefront** (`Home.tsx`, `Header`, `Footer`, page
SEO) with safe fallback to the pre-existing hardcoded defaults when nothing is published yet.
Remaining spec modules (Analytics, Customers, etc.) are real routes with honest "Coming soon"
placeholders — never fake-functional stubs.

## Why

The storefront already has a real Odoo catalog and a minimal admin (`/admin` orders list,
`/admin/reviews` moderation, gated by one `is_admin` boolean). The user asked for a genuine
internal operating system, following a detailed 66-section brief that is itself explicitly phased
("Do not attempt every analytics module in one pass") and names a concrete first-implementation
scope. This pass builds exactly that scope, with the full architecture (roles, RLS, draft/publish)
correct from the start so later phases (Merchandising, Analytics, etc.) can build on it without
rework.

## The one rule that shapes every decision here

**Odoo owns sellable-item data. Delite CMS owns how the website presents/merchandises/promotes
content.** CMS never copies a commerce field (name, price, SKU, stock, images) — where it needs to
reference a product, it stores the Odoo id only, resolved live at render/read time through the
existing `catalogService`. This is directly testable — see `src/admin/services/cms.boundary.test.ts`.

## Scope

**Built this pass** (spec section 63, items 1–12):
1. `/admin/login` — dedicated admin sign-in, separate from customer `/login`.
2. Protected `/admin` shell (`RequireAdminRole`).
3. Roles/permissions foundation — DB enum + RLS helper + a single frontend nav/role config.
4. `AdminLayout` (sidebar + topbar + `<Outlet/>`).
5. Sidebar + topbar, per the spec's grouped structure (+ one deliberate addition, see below).
6. Overview page — every widget backed by a real query; explicit "Not available yet" where no
   real data source exists (never a fabricated number).
7. CMS data architecture — 5 tables + 1 publish RPC, migrated, RLS'd, seeded from the real
   `Home.tsx` section list.
8. Homepage CMS shell — section list (reorder/visibility) + Hero + Announcement Bar editors
   (the two sections with real, detailed field specs; everything else shows "Content editor
   coming soon" but still supports order/visibility).
9. Save Draft / Publish architecture — generic, atomic (one Postgres function per publish).
10. Marketing Media foundation — Supabase Storage bucket + library page (upload/list/delete/copy
    URL). Focal-point/crop deliberately not built (nothing consumes it yet).
11. Read-only Odoo product browser — reuses the existing `catalogService`, zero new Odoo-read
    surface.
12. Activity Log foundation — table + page + a hook wired into every real write action.

**Built in Phase 2** (website + merchandising CMS + storefront wiring):
1. Promotions, Navigation, Footer, SEO admin editors (draft/publish, real-component preview where applicable).
2. Featured / Trending / New Arrivals / Homepage Categories merchandising editors — Odoo-ID-only persistence via `AdminProductPicker` / `AdminCategoryPicker`.
3. Public read policies on published CMS tables + `cms_promotions` table (migrations `20260918084540`–`20260918084545`).
4. Storefront hooks/services: `publishedCmsService`, `useHomepageCms`, `useSiteChromeCms`, `useSeoCms`, `useMerchandisingCms`, `usePromotions`, `SeoHead`.
5. Live wiring: `Home.tsx` (section order/visibility + merchandising rails), `Header`/`Footer`/`AnnouncementBar`, Shop/Brands/About/Contact SEO.
6. `catalog-products` Edge Function `ids=` lookup for merchandising resolution (deployed).
7. Category icon strip centering fix (`Rail.centerWhenFits`) — see `frontend-foundation-uiux-refactor.md`.

**Explicitly deferred** (matches the spec's own later phases — every corresponding sidebar item
is a real route rendering `AdminPlaceholder`, not hidden and not faked): Recommendations config,
Customers/Carts/Visitors, all four Analytics dashboards, Contact Enquiries inbox, Settings/Admin
Users management UI beyond what roles already enforce.

**Deliberate, flagged deviation from the given sidebar list**: the spec's sidebar has no "Orders"
entry, but a working, real Orders admin page already existed. Removing it to match the spec
exactly would have broken existing functionality for no reason. Kept, placed under
Commerce / Insights (next to Customers/Carts, where it thematically belongs).

**Also explicitly not built** (per spec section 61, unconditionally): any product creation/price
editing/inventory editing/variant editing/gallery editing/category creation/fitment editing/order
fulfilment editing inside Delite Admin. All of that stays in Odoo, full stop.

## Roles & permissions

Postgres enum `public.admin_role`: `owner`, `admin`, `content`, `merchandising`, `support`,
`analytics`. Stored as a new, nullable `profiles.admin_role` column — purely additive; the
pre-existing `profiles.is_admin` boolean and `private.is_admin()` helper are untouched, so
`orders`/`product_reviews` RLS and the `create-order`/`admin-odoo-link` Edge Functions keep
working exactly as before.

`private.has_admin_role(role[])` (SECURITY DEFINER, same pattern as `private.is_admin()`) is the
one function every new RLS policy calls — never a duplicated role check.

**Single source of truth for permissions**: `src/admin/services/adminAuth.ts`'s `ADMIN_NAV`
config — one array of `{ path, roles, status }` that both the sidebar (which items render) and
every route (`RoleRoute`, per-page) read. There is no second, hand-maintained permissions list to
drift out of sync.

**Least-privilege table**: this doc's Phase-1 version listed a table here, since superseded by the
Admin surface's growth (Payments/Reviews-history/Email Delivery/Security/Admin Users all shipped
after Phase 1). The current, verified-against-live-code role matrix — every role × every module,
cross-checked against `ADMIN_NAV`/`RoleRoute`/RLS/RPC role checks/Edge Function `requireAdmin()`
calls, with the one real mismatch found flagged rather than hidden — now lives in
`delite-auth-security.md`'s "Role matrix" section (added in the 2026-09-30 security-hardening
verification pass) rather than being duplicated here as a second, driftable copy.

**Enforcement is real on multiple layers**, not just UI:
- **UI**: `RoleRoute` denies page content (sidebar/topbar stay visible so a partially-privileged
  admin can still navigate) — verified live (Phase 1, repeated in the 2026-09-30 pass with a
  `support`-role account): a correctly filtered sidebar and a real "Access denied" panel on a
  direct URL hit to a role-restricted page.
- **RLS**: every CMS table's policy calls `private.has_admin_role(...)` directly — a route guard
  bypass (e.g. calling the Supabase REST API directly) still hits the same Postgres enforcement.
  Confirmed via `pg_policies`: every `cms_*` table policy is scoped to `{authenticated}` only, zero
  `anon`/public write policies anywhere. Since 2026-09-30, the tables still written directly by the
  client (not through an Edge Function) additionally AND the role check with
  `private.admin_mfa_satisfied()` (off by default) — see `delite-auth-security.md`.
- **Edge Functions**: every `admin-*` function that mutates data (Admin Users, retry-Odoo-sync,
  retry-email, Odoo-link) uses the shared `_shared/auth/requireAdmin.ts` helper, which re-derives
  role and AAL from the caller's own JWT server-side rather than trusting anything the browser
  sends — verified live 2026-09-30 with real HTTP calls from a `support`-role session:
  `admin-users-manage` correctly returned 403, a role-permitted RPC correctly returned 200.

## Authentication

Real Supabase Auth — the same session mechanism the customer-facing `/login` already uses
(`useAuth().signIn`), not a parallel system. `/admin/login` is a separate page/route purely for
UX (different branding, different redirect target); the underlying account is the same
`auth.users`/`profiles` row as everywhere else in the app. Whether a signed-in account actually
has admin access is a completely separate check (`profiles.admin_role`), enforced identically for
both `/login` and `/admin/login` sign-ins.

**Becoming an admin**: `supabase/functions/admin-bootstrap` (existing, from the prior accounts
pass) creates or promotes a user as pre-confirmed via Supabase's Admin Auth API, then this pass's
migration sets their `admin_role`. No hardcoded credentials anywhere in the codebase — the
bootstrapped account's email/password were supplied by the user directly to the function call at
runtime, never written to any file.

## AdminLayout / sidebar / topbar

`src/admin/layouts/AdminLayout.tsx` — sidebar + topbar + `<Outlet/>`, using the storefront's own
design tokens (`bg-paper`/`ink`/`line`/`steel`/`card-surface`/`.btn-*` from `index.css`) — no new
visual language invented, matching the "visually restrained, not a generic SaaS kit" brief.

`AdminSidebar.tsx` — grouped per the spec, active-route highlight, role-filtered. Desktop: full
sidebar, collapsible to an icon rail via the topbar toggle. Tablet/mobile: hidden by default,
opens as a drawer overlay from the topbar's menu button.

`AdminTopBar.tsx` — page title (derived from the current route via `adminAuth.ts`), a live Odoo
connection badge (calls the existing `odoo-health` function — real status, not decorative),
account dropdown with sign-out.

## Overview page

Every widget is a real query — no invented `+32%`/`₹12.8L`-style numbers:
- **Website**: real count of homepage sections + how many are visible, real last-publish
  timestamp from `cms_publications`.
- **Odoo**: live `odoo-health` call (configured/reachable/authenticated/version).
- **Commerce**: real `orders` row count.
- **Behaviour**: explicit "Not available yet" — no visitor/cart tracking tables exist.
- **Operations**: real pending-review count, real recent `admin_activity_log` entries.

## CMS data architecture

Five tables (`cms_pages`, `cms_sections`, `cms_section_drafts`, `cms_section_published`,
`cms_publications`) + one Postgres function (`cms_publish_page`). See migrations
`20260917112634_create_cms_schema.sql`, `20260917112736_seed_site_chrome_page.sql`,
`20260917113039_cms_publish_page_function.sql`.

- `cms_sections` is the structural registry (what sections exist, in what order they were
  registered) — seeded with the real 11 sections read directly off `Home.tsx` (not invented):
  `hero`, `vehicle-shop-split`, `category-strip`, `trending`, `perfect-vehicle`, `brands`,
  `top-categories-car`, `promo-banners`, `top-categories-bike`, `testimonials`, `get-in-touch`.
  `hero` is `is_required = true` (its visibility toggle is disabled in the UI).
- The Announcement Bar (`Header.tsx`) is global site chrome, not a homepage section — modeled as
  its own single-section `site-chrome` page rather than shoehorned into the homepage's ordering.
- `cms_section_drafts` is what the editor UI reads/writes live. `cms_section_published` is only
  ever written by `cms_publish_page()` — never directly editable. Phase 2 added anon/authenticated
  SELECT on `cms_pages`, `cms_sections`, and `cms_section_published` so the public storefront can
  read published content only (`20260918084540_add_public_cms_read_policies.sql`). Draft rows
  remain admin-only.
- `cms_publish_page(slug, note?)` is `SECURITY INVOKER` (not `DEFINER`) on purpose — it copies
  every section's current draft to `cms_section_published` and logs one `cms_publications` row,
  all inside the CALLING user's own RLS context, so a `support`/`analytics`/`merchandising` caller
  genuinely cannot publish (real RLS `INSERT`/`UPDATE` denial), not just a UI-hidden button.

`src/admin/services/cmsService.ts` is the one file that knows these tables — mirrors the existing
`catalogService`/`AuthContext` service-boundary convention.

## Draft / publish, verified live

Real end-to-end test performed in this session (not just typechecked): typed a new heading into
the Hero editor via real keyboard input → "Save Draft" enabled → saved (toast confirmed) → the
live preview (the actual `<Hero/>` component, fed the draft as props) immediately showed the new
text → clicked Publish → confirmed via a direct database read that `cms_section_published.content`
now contains the published heading with a real `published_at` timestamp. The same loop was
verified for the Homepage section list's own publish action.

## Live preview — real component reuse

Both `Hero.tsx` and `AnnouncementBar.tsx` (extracted from `Header.tsx`) now accept optional
content-override props, defaulting to today's i18n copy/links when omitted — **additive only**:
the live storefront's own `<Hero />` / `<AnnouncementBar />` calls pass no props and render
identically to before this change. The admin editors' live preview panels pass the in-progress
draft as props to these same real components, exactly matching spec section 52 ("do not create an
entirely separate fake homepage renderer"). Hero's imagery (car/bike photography + the accessory
photo cluster) is a fixed multi-image composition in code, not a single swappable banner field, so
it's deliberately not made CMS-editable this pass — only the real text/CTA fields are.

## Marketing Media

Supabase Storage bucket `marketing-media` (public read — these become plain `<img src>` URLs,
same reasoning already applied to `catalog-media`'s proxy; admin-role-gated write via storage
RLS policies) + `cms_media` (the searchable index Storage alone doesn't give you). Upload
validates MIME type (JPG/JPEG/PNG/WebP only) and size (8MB cap) both client-side and via the
bucket's own constraints. Drag-and-drop and file-picker both supported; grid view with copy-URL
and remove.

## Read-only Odoo product browser

`/admin/products` reuses `catalogService.getProductsPage()` — the exact same paginated/filtered
endpoint the storefront Shop page already uses. No new Odoo-read surface was created. Row actions
are `Preview` (opens the real PDP) and `Open in Odoo ↗` (via `admin-odoo-link`, whose model
allowlist was extended from `sale.order`-only to also include `product.template` — link-building
only, never a write). Merchandising selection is on the dedicated `/admin/merchandising/*` editors — this browser
remains read-only preview + Open in Odoo only, per spec sections 11/56's explicit "no product
CRUD, ever."

## Activity Log

`admin_activity_log` — append-only (no UPDATE/DELETE RLS policy exists at all: an audit log
admins can edit isn't an audit log). `useActivityLog()`'s `logActivity()` is called after: draft
saved, page published, section reordered, section visibility changed, media uploaded/removed,
review moderated. RLS requires `actor_id = auth.uid()` on insert — one admin can never log an
entry impersonating another.

## Security review (spec section 60)

- ✅ No Odoo secrets in the browser bundle (grepped `dist/`, zero matches — same check as every
  prior Odoo pass).
- ✅ No service-role key in the browser bundle (grepped, zero matches).
- ✅ No admin-only write endpoint is publicly writable — every CMS table policy is
  `{authenticated}`-scoped, verified via `pg_policies`; `cms_publish_page()` is `SECURITY INVOKER`
  so it can't be used to bypass those policies.
- ✅ RLS enabled on all 10 tables (`profiles`, `orders`, `product_reviews`, and the 7 new tables) —
  verified via `list_tables`.
- ✅ Role checks are server-side (RLS), not just UI — see "Roles & permissions" above.
- ✅ Draft CMS content is never publicly readable — no `anon`/public SELECT policy on any `cms_*`
  table.
- ✅ Internal Odoo diagnostics (`odoo-schema`, `odoo-write-check`, `admin-bootstrap`) remain
  `x-internal-token`-gated, fail closed.
- ✅ Activity log cannot expose secrets — `logActivity()`'s metadata is always caller-supplied,
  small, non-credential values (ids/labels), never anything from `process.env`/`Deno.env`.
- ✅ File uploads restricted — MIME allowlist + size cap, both client- and storage-policy-side.
- ✅ No arbitrary HTML/script injection surface was added — every CMS field renders as plain text
  props into existing components, never `dangerouslySetInnerHTML`.
- ⚠️ Pre-existing, not introduced by this pass, worth flagging anyway: Supabase's "Leaked Password
  Protection" is disabled project-wide (`get_advisors` finding) — a project auth setting, not
  something reachable via any tool available in this session.

## Storefront CMS wiring (Phase 2)

The public site reads **published** CMS only — never drafts — via `src/services/cms/publishedCmsService.ts`
and the hooks under `src/hooks/use*Cms.ts`. Fallback behaviour: if a section/page has never been
published (or published content is empty), the storefront keeps its pre-existing hardcoded/i18n
defaults so the site never goes blank mid-migration. Once published CMS data exists for a surface,
CMS wins.

Key wiring:
- **Homepage** — section order + visibility from `homepage` CMS page; Hero props; merchandising
  rails (Featured/Trending/New Arrivals via Odoo id lookup); category strip via CMS category selections.
- **Header** — announcement bar + navigation from `site-chrome` / `navigation` CMS sections.
- **Footer** — structured columns/contact/social from `footer` CMS section.
- **SEO** — `SeoHead` on Home, Shop, Brands, About, Contact from `seo` CMS page.
- **Promotions** — `PromoBannerPair` reads published `cms_promotions` rows.

Merchandising rails store `{ productIds: number[] }` or `{ categorySelections: [...] }` only.
Product/category names, prices, and images are always resolved live from `catalogService` at render
time — verified by `cms.boundary.test.ts`.

## Testing / verification

- `npm run lint`, `npm run build`, `npm run typecheck:server`, `npm run test:unit` (39 passed, 1
  skipped) — all clean.
- `src/admin/services/cms.boundary.test.ts` (5 tests) — Odoo/CMS ownership boundary regression:
  Hero/Announcement/Promotions shapes never carry commerce fields; merchandising + category contracts
  lock Odoo-ID-only persistence.
- `tests/interaction/admin-panel.spec.ts` (8 Playwright tests, all passing against the real
  bootstrapped admin account and live Odoo/CMS data with Vite `--mode interaction`): login → Overview,
  Homepage publish + live section hide/show, Hero save/preview/publish, read-only product browser,
  Activity Log, Odoo status (no secret leak), Trending merchandising draft-vs-published storefront
  integration.
- `tests/interaction/category-icon-strip.spec.ts` (6 Playwright tests) — category strip centers when
  content fits, scrolls from start when it doesn't, hover does not break circle geometry.
- **Live-verified beyond the automated suite** (same discipline as every prior pass): role-based
  sidebar filtering and route-level denial for a `support`-role test account (created, verified,
  then disabled); a real publish confirmed via direct database read, not just a UI toast.
- Full existing regression suite re-run (`real-catalog`, `shop-catalog`, `auth-gating`,
  `product-image` — 12 tests) — all still passing, zero regression from touching
  `App.tsx`/`AuthContext.tsx`/`Hero.tsx`/`Header.tsx`.

## Route structure

```
/admin/login                          — dedicated admin sign-in
/admin                                 — Overview (RequireAdminRole session gate + RoleRoute)
/admin/website/homepage                — Homepage CMS shell (reorder/visibility/publish)
/admin/website/hero                    — Hero editor (real)
/admin/website/announcement            — Announcement Bar editor (real)
/admin/website/{promotions,navigation,footer,seo}   — real editors (Phase 2)
/admin/media                           — Marketing Media library (real)
/admin/merchandising/{featured,trending,new-arrivals,categories} — real (Phase 2)
/admin/merchandising/recommendations   — placeholder
/admin/products                        — read-only Odoo product browser (real)
/admin/orders                          — real (relocated, unchanged logic, now shows payment status, search/filters/sort/pagination — see delite-payments.md)
/admin/payments                        — real (Admin Payments ledger — KPIs, filters/sort/search/pagination, detail drawer — see delite-production-operations.md)
/admin/customers                       — placeholder
/admin/analytics/*                     — real, 10 pages (see delite-analytics.md; this table wasn't kept current after that pass — Carts/Visitors moved under Analytics, no longer separate placeholders)
/admin/reviews                         — real (relocated; now Pending/Approved/Rejected/All history tabs + search/rating/date filters + pagination + detail drawer, sends a review-approved email — see delite-transactional-email.md and delite-production-operations.md)
/admin/contact                         — real (Contact Enquiries inbox — see delite-contact-and-admin-media.md)
/admin/odoo/status                     — real Odoo connection status
/admin/settings                        — real (Admin Appearance — relabeled, see delite-contact-and-admin-media.md)
/admin/settings/users                  — real (Admin Users — see delite-auth-security.md)
/admin/settings/security               — real (admin MFA enrollment — see delite-auth-security.md)
/admin/settings/activity               — Activity Log (real, gained filters/pagination/CSV export — see delite-contact-and-admin-media.md)
/admin/system/integrations             — real, sidebar label "Integrations Health" (Odoo/Razorpay/Resend/Analytics health + operational-issue attention list + readiness checklist — see delite-production-operations.md)
/admin/system/odoo-sync                — retired 2026-09-30, redirects to /admin/payments (fully superseded by the Payments ledger's Odoo-sync-state filter)
/admin/system/email                    — real (Email Delivery — see delite-production-operations.md)
/admin/orders/:id                      — real (Order Detail — see delite-production-operations.md)
```

## Future modules (explicitly out of scope)

Recommendations config UI, Customers dashboard, promotion scheduling (enabled/disabled only
today). Each deferred item is a real route rendering `AdminPlaceholder` — swapping in a real page
later is a drop-in replacement in `App.tsx`, no route restructuring needed.

## Known gaps

- **General signup email confirmation** (carried over from the prior accounts pass) still requires
  a dashboard toggle the user needs to flip themselves.
- **RLS reconciliation (2026-09-29):** `payment_attempts`/`email_log`/`orders`/`product_reviews`'
  admin-select policies were on the legacy `private.is_admin()` boolean while newer tables
  (`contact_enquiries`, CMS, analytics) used the granular `private.has_admin_role()`. Reconciled
  onto `has_admin_role(['owner','admin','support'])`, with a safety backfill for any
  `is_admin=true, admin_role=null` account. `profiles`' own admin-select policy is intentionally
  left on `is_admin()` for now — a distinct concern, not touched this pass. See
  `Documentations MD/delite-production-operations.md`.
- **Promotion scheduling** (start/end dates with deterministic Live/Scheduled/Expired states) was
  explicitly optional in the Phase 2 spec — only enabled/disabled is implemented.
- **Media deletion safety** — resolved 2026-09-29, see `Documentations MD/delite-contact-and-admin-media.md`.
- **Admin Users management UI** — resolved 2026-09-29, see `Documentations MD/delite-auth-security.md`.
- **Contact Enquiries inbox** — resolved 2026-09-29, see `Documentations MD/delite-contact-and-admin-media.md`.
- **Homepage/Navigation/Footer/Promotions editors had no real visual preview, no Desktop/Tablet/
  Mobile toggle, no undo/redo, no unsaved-navigation warning, no image focal-point/zoom** —
  resolved 2026-09-29, see `Documentations MD/delite-admin-editor-parity.md`. One real gap remains
  from that pass: Add/Duplicate Section (an architectural blocker — see that doc's Known gaps).
- ~~Orders had no search/filters/sort/pagination/detail; Reviews showed pending only, moderated
  reviews disappeared~~ — **resolved 2026-09-30**, see `Documentations MD/delite-production-operations.md`.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-02 | Claude | CMS visual-editor undo/redo and unsaved-changes-dialog fixes (re-audit pass against a near-duplicate spec) — full detail in `delite-cms-visual-editor.md`. |
| 2026-09-30 | Claude | Security cleanup pass — narrowed `profiles_select_admin` RLS from any-admin-role (`is_admin()`) to `owner`/`admin` only, closing the over-broad customer/admin-PII read the prior pass's audit had flagged. Also rotated the exposed owner password (via the real reset-email flow, not a new invented one), deployed the pending `admin-system-health` update, and rotated the support test account's credentials. Full detail in `delite-auth-security.md`. |
| 2026-09-30 | Claude | Security-hardening verification pass — replaced this doc's stale Phase-1 role table with a pointer to the current, live-verified role matrix in `delite-auth-security.md`; fixed a real bug found during that audit (`Security` nav entry was owner/admin-only, permanently locking 4 of 6 roles out of MFA self-enrollment once the mandatory-MFA policy is ever turned on); live-tested a `support`-role account against both the UI and the real backend (Edge Functions/RLS), not just the sidebar. Full detail in `delite-auth-security.md`. |
| 2026-09-29 | Claude | Admin Users (real page + admin-users-manage Edge Function), Security (admin MFA), Contact Enquiries inbox, media-delete reference safety + AdminMediaPicker, Activity Log filters/pagination/export, "Admin Appearance" label — resolving several items from Known gaps. Part of a larger phase; full details split across delite-payments.md, delite-auth-security.md, delite-transactional-email.md, delite-contact-and-admin-media.md. |
| 2026-09-29 | Claude | Production-ops phase — added System group nav items (Integrations, Odoo Sync & Failures, Email Delivery), Order Detail page, Orders list filters/pagination, Overview "Attention Required" card, RLS reconciliation (`is_admin()` → `has_admin_role()` for payment_attempts/email_log/orders/product_reviews). Full detail in `Documentations MD/delite-production-operations.md`. |
| 2026-09-30 | Claude | P1 operational gaps follow-up — added Payments nav item (Commerce/Insights), renamed Integrations → Integrations Health, retired the Odoo Sync & Failures nav item/route (redirects to Payments), rebuilt Reviews with history tabs/search/filters/pagination/detail, added Orders amount sort. Full detail in `Documentations MD/delite-production-operations.md`. |
| 2026-09-19 | Codex | Expanded Announcement Bar editing after comparing Hasto's strip controls: multiple reorderable messages, optional icons and links, rotation interval, show-icons toggle, Delite color presets, custom hex colors, contrast advice, and a draft preview. Existing single-message CMS records still render; the expanded fields live in the same site-chrome JSON content, so no migration is needed. Publishing now requires saving changed announcement drafts first. Build verified; signed-in browser check remains pending. |
| 2026-09-19 | Codex | Corrected the stale Hero editor note that said publishing was not wired to the storefront. |
| 2026-09-18 | Codex | Moved desktop sidebar collapse/expand into the blue sidebar header, put Back in the white top bar, and removed the extra desktop sidebar scrollbar so the page uses the far-right browser scrollbar. Mobile drawer remains independently scrollable. |
| 2026-09-18 | Codex | Connected four Analytics sidebar routes to initial first-party reporting; see delite-analytics.md for scope and remaining gaps. |
| 2026-09-21 | Claude | Analytics group rebuilt and expanded to ten pages (Overview, Traffic, Pages, Products, Carts, Conversion, Search, Recommendations, Geography, Acquisition); Carts and Visitors moved under Analytics with redirects from the old routes; `support` may open Carts. Details in delite-analytics.md. |
| 2026-09-18 | Codex | Added section-level homepage editing and switchable Glass/Legacy Admin appearance; see homepage-editor-and-admin-appearance.md. |
| 2026-09-18 | Cursor | Phase 2 completion pass: fixed homepage merchandising fallback (curated ids no longer fall back to tag-based products while resolving or after publish), Playwright interaction mode (`.env.interaction` + Vite `--mode interaction`), trending admin test robustness, removed stale ProductBrowser merchandising placeholder icons, deployed `catalog-products` with `ids=` lookup, updated this doc + index. All 8 admin-panel + 6 category-icon-strip interaction tests passing. |
| 2026-09-18 | Claude | Initial version — Delite Admin panel foundation: admin_role enum + RLS helper (additive to existing is_admin), AdminLayout/sidebar/topbar, Overview (real data only), 5-table CMS schema + atomic publish RPC seeded from real Home.tsx sections, Homepage CMS shell + Hero/Announcement editors with live preview reusing the real Hero/AnnouncementBar components (both made additively prop-overridable, live storefront unaffected), Marketing Media library on Supabase Storage, read-only Odoo product browser (admin-odoo-link extended to product.template), Activity Log. Relocated existing Orders/Reviews admin pages under the new shell, unchanged logic. Live-verified end-to-end with the real bootstrapped admin account: login, draft save/publish (confirmed via DB read), role-based access control (verified with a temporary support-role account), zero regression on the existing storefront/auth Playwright suite. |
