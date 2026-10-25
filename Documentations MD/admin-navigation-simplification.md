# Admin Navigation Simplification

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Admin sidebar reduced from 39 items to 13; related pages combined as tabs; redundant/placeholder pages removed |
| File           | `Documentations MD/admin-navigation-simplification.md` |
| Branch         | main                                     |
| Owner          | Claude                                   |
| Status         | Done — unit-tested and checked in a browser with simulated sessions; not exercised with a real admin login; Playwright specs updated but not run |
| Created        | 2026-10-22                               |
| Last updated   | 2026-10-22                               |

## Summary

The admin sidebar had 39 entries across 8 groups, including two "Coming soon" placeholders, an Odoo
status page that duplicated Integrations Health, and ten Analytics pages with no tabs. It now has 13
entries in 7 groups. Related pages are tabs on one entry. Every page keeps its URL and its role access.

## Why

The client asked for an analysis of the admin panel, removal of redundant pages, combining pages that do
the same kind of job, and a better overall user experience.

## Scope

In: navigation structure, tab bar, removal of placeholders and the duplicate Odoo page, tests.
Not changed: the content/logic of any retained page (each tab renders the same page component as
before), role rules, URLs of retained pages, the Overview dashboard (only its links were updated).

## Implementation notes

New structure (sidebar → tabs):
- **Overview**
- **Website** — Homepage (Sections · Hero banner · Promo banners) · Deals & Offers · Header & footer
  (Announcement bar · Menu · Footer) · SEO · Media library
- **Catalog** — Product lists (Featured · Trending · New arrivals · Homepage categories) · Products
- **Sales** — Orders & payments (Orders · Payments)
- **Customers** — Reviews & messages (Reviews · Contact enquiries)
- **Analytics** — one entry; ten tabs (Overview · Traffic · Pages · Products · Carts · Conversion · Search ·
  Recommendations · Geography · Acquisition)
- **Settings** — System health (Integrations · Email delivery) · Team & security (Security · Admin users ·
  Activity log · Appearance)

Removed: `/admin/customers` and `/admin/merchandising/recommendations` ("Coming soon" placeholders;
`AdminPlaceholder.tsx` deleted) and the Odoo status page (`pages/odoo/OdooStatus.tsx` deleted — Integrations
Health and the top-bar Odoo chip already show the same). Their URLs redirect: customers → `/admin/orders`,
recommendations → `/admin/merchandising/featured`, `/admin/odoo/status` → `/admin/system/integrations`.

Code:
- `src/admin/services/adminAuth.ts` — nav config now has `tabs` per item (each tab has its own path and role
  list; an item's roles are the union). Helpers: `matchNavLocation` (URL → item/tab, longest parent match so
  detail pages like `/admin/orders/:id` resolve), `tabsForRole`, `landingPath`, `roleCanAccess` (exact tab/item
  match, unchanged semantics).
- `src/admin/components/AdminTabs.tsx` — tab bar rendered by `AdminLayout` for tabbed items (hidden when a role
  has fewer than two tabs); real links, so back button/bookmarks/role checks are unchanged; scrolls sideways on phones.
- `AdminSidebar.tsx` — one link per item (to the role's first allowed tab), active state from the current URL
  (fixes Overview being highlighted on every page), closes the mobile drawer on click, no "Soon" badges.
  `AdminTopBar.tsx` — title from the same matcher. `Overview.tsx` — links updated.
- `src/admin/services/adminAuth.test.ts` — 5 tests: role access for all 34 pages × 6 roles equals the old matrix;
  removed pages denied; ≤ 14 unique sidebar entries; URL→tab matching; per-role tabs/landing.
- `tests/interaction/admin-security-hardening.spec.ts` and `admin-panel.spec.ts` updated for the new labels/URLs.

## Interfaces / data

No data/API changes. `AdminNavItem.status` ("active"/"placeholder") was removed.

## Dependencies

None.

## Testing / verification

- `tsc` clean; oxlint clean for `src/admin`; 25 admin unit tests pass (5 new).
- Playwright with a simulated session (mocked profile/auth calls, no real login): owner sees 13 sidebar entries;
  `/admin/website/hero` shows the Homepage tabs with "Hero banner" active and Homepage highlighted; Analytics shows
  10 tabs; the three removed URLs redirect; a support user sees 6 entries and is denied `/admin/settings/users`;
  at 390px there is no horizontal overflow and the menu drawer works; no page errors.
- NOT run: the updated Playwright specs (they need real admin credentials), and pages with live data.

## Known issues / follow-ups

- The role-nav Playwright specs assume the new labels but could not be executed here; run them with test accounts.
- Further merges deliberately not made: Hero/Promotions/Deals each edit different banners (kept separate); the
  analytics pages stay separate (each has its own queries). The four "Product lists" tabs are near-identical and
  could become one page with a list switcher later.
- Admin "Appearance" is now a tab under Team & security.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-22 | Claude | Initial version                          |
