# Exclusive Dealer Portal (B2B)

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Invitation-only B2B dealer portal (`dealers.deliteauto.com`) + "Dealers" section in the existing Delite Admin |
| File           | `Documentations MD/dealer-portal.md` |
| Branch         | none — this folder is not a git repository, so the work is uncommitted in the working tree (see Known issues) |
| Owner          | Claude |
| Status         | Phases 1–3 + the reorder part of Phase 4 **code complete and wired into the real admin** (62 engine tests, typecheck, lint, both production builds). **Not deployed:** migrations not applied, Edge Functions not deployed, second Vercel project/domain not created, and the Odoo price-preservation proof (Phase 0) has **not** been run against the live Odoo. |
| Created        | 2026-10-27 |
| Last updated   | 2026-10-27 |

## Summary

A private B2B portal where Delite-invited dealers sign in, see **only** the products assigned to them at
their own fixed prices, build a cart, and place a purchase request that becomes a **draft quotation in
Odoo** for Delite staff to confirm. Delite manages everything (dealers, branding, assignments, prices,
CSV import, invites, orders, audit) from a new **Dealers** section in the existing admin. The public
storefront and its Odoo checkout are untouched.

Source spec: `Delite_Exclusive_Dealer_Portal_Specification.md` (v1.0, 21 Oct 2026).

## Why

Dealer price lists were communicated and entered by hand. The spec's goals: private catalogue per dealer,
contract pricing enforced **on the server** (never trusting the browser), quick admin workflows, and
data that stays consistent with Odoo (product master, tax, orders).

## Scope

**In scope (built):**
- Phase 1 — dealer/user/branding/entitlement/price/audit schema; admin Dealers section (list, add, 4-step
  setup, Catalogue & Pricing grid, Branding with preview, Access/invite, Orders, Activity); dealer app
  (landing, login, invite-accept, forgot/reset, dashboard, assignment-scoped catalogue, product page).
- Phase 2 — server-side cart, quote with price-change acknowledgement, idempotent order placement, Odoo
  draft-quotation creation with retry, own-order history/detail, order-status sync from Odoo, order email.
- Phase 3 — CSV import (preview + commit, skip-invalid), bulk assign/remove, bulk % adjust (confirmed),
  copy from another dealer, time-bound prices, preview-as-dealer (read-only, shows drafts), price history +
  restore (audited), bulk suspend, optimistic locking on dealer edits.
- Phase 4 (partial) — one-click **reorder** from a past order.

**Not in scope / deliberately deferred:** multiple users per dealer, volume tiers, credit limits/payment
terms, PDF quotes, spend insights (rest of Phase 4); a `dealer_manager` admin role (see Known issues);
live online payment for dealers (v1 is request-order only); per-dealer shipping policy (shipping shows
"as agreed", ₹0); persisting carts across devices beyond the server cart table (done) / saved lists.

## Implementation notes

**Architecture — one engine, three adapters.** All business rules live in
`supabase/functions/_shared/dealer/engine.ts` behind ports (`ports.ts`): `DealerRepo`, `OdooPort`,
`AuthPort`, `NotifierPort`. The engine is pure TypeScript (no Deno/Node/browser APIs), so the *same code*
runs in (1) the Edge Functions against Postgres + Odoo, (2) Vitest against in-memory fakes
(`memory.ts`) (test-only).

- `engine.ts` — admin actions (capability-checked: `dealers.view/manage`, `pricing.manage`,
  `orders.view/manage`) and dealer actions. The dealer-facing API **never reads a `dealerId` from the
  payload**; identity comes from `resolveSession(authUserId)` (via `dealer_users`).
- `pricing.ts` — integer-paise helpers, `resolveActiveRule` (active dealer+variant price in force, **no
  public-price fallback**), `planPublish` (publish planner: an "effective now" draft — including one
  whose start is already in the past — expires the overlapping live price; a scheduled overlapping one is
  a conflict), readiness check.
- `quote.ts` — `buildDealerQuote` / `computeLineMoney`: price + tax from the dealer rule and **real Odoo
  `account.tax` rows**; supports exclusive and inclusive contract prices (inclusive keeps line total exactly
  at the agreed price); unsupported tax shapes fail closed; SHA-256 fingerprint of the quote.
- `csv.ts` — RFC-4180 parser + price-CSV validation (`sku,price,tax,moq,multiple,start,end,note`).
- `supabaseRepo.ts`, `odooPort.ts`, `deps.ts` — Deno-only production adapters (never imported by the
  browser bundle or Vitest). `odooPort.ts` reuses `catalog.ts`/`fetch.ts` normalizers and the existing
  `CATALOG_ELIGIBILITY_DOMAIN`, so a product archived/unpublished in Odoo is not purchasable by a dealer.
- Edge Functions: `admin-dealers` (auth via the existing `requireAdmin()` incl. server-side MFA policy;
  roles owner/admin/support — support is read-only via the engine's capability table) and `dealer-portal`
  (verified Supabase session → `dealer_users`). Both: explicit CORS allow-list (never `*`),
  `Cache-Control: private, no-store`, request ids, structured errors, per-isolate rate limiting.
- Migrations: `20261028090000_dealer_portal_foundation.sql`, `20261028090100_dealer_portal_purchase.sql`.
  RLS **on with no policies** and table privileges revoked → clients can never touch `dealer_*` tables
  directly. Price windows can't overlap (GiST exclusion constraint, backstop to the TS planner).
  `dealer_apply_price_plan` / `dealer_insert_order` are atomic SQL functions. `dealer_audit_log` is
  append-only (trigger).

**Frontend.**
- Dealer SPA is a **separate entry** (`dealer.html` → `src/dealer/main.tsx`), not part of the storefront
  bundle. Dev: served at `/dealer/*` of the same dev server (Vite plugin in `vite.config.ts`).
  Production: `npm run build:dealer` (`scripts/build-dealer.mjs` → `APP_TARGET=dealer vite build`) emits a
  dealer-only `dist/index.html` for a **second Vercel project** on `dealers.deliteauto.com`. A normal
  `npm run build` contains no dealer-SPA code (verified).
- Dealer app: `DealerAuth.tsx` (lightweight Supabase session, **no** storefront AuthProvider),
  `DealerShell.tsx` (guard → `/login?returnTo=` with an open-redirect-safe validator, branded sidebar/topbar,
  mobile drawer, route-progress bar, blocking states for no-access/suspended), pages in `src/dealer/pages/`.
- Admin: `src/admin/pages/dealers/*`; nav group added to `ADMIN_NAV` (`src/admin/services/adminAuth.ts`);
  routes in `src/App.tsx` (lazy). Roles: owner/admin/support see the section; writes are enforced
  server-side by capability (owner/admin only).
- **No mock/demo mode.** An earlier iteration had an in-browser demo backend and a `/mock-admin` harness; both
  were removed on 2026-10-28 at the owner's request. Everything now runs through the real admin (`/admin/dealers`)
  and the real Edge Functions.

**Key decisions (recommended defaults from the planning pass — change if the business disagrees):**
1. Dealer prices are mastered in the **Delite database**, not Odoo pricelists (Odoo SaaS can't run custom
   modules and rate-limits; avoids dual masters). Odoo only receives the final price per order line.
2. Purchase flow = **request order**: placed order → draft `sale.order` in Odoo (never auto-confirmed).
   The existing Odoo-native checkout handoff is **not** used for dealers (it drops negotiated prices).
3. Tax basis is **per price rule** (`exclusive`/`inclusive`), tax computed from the variant's real Odoo taxes.
4. One owner user per dealer in v1 (table shape allows more).
5. A dealer can't be invited until every visible+orderable assigned product has a *published* price.
6. Entitlement is per exact **variant**; entitlement and price are separate records.

## Interfaces / data

- Edge Function request: `POST /functions/v1/{admin-dealers|dealer-portal}` body
  `{ "action": "<name>", "payload": { ... } }`. Errors: `{ error: { code, message, details? } }` with
  401/403/404/409/422/429/503 (`DealerError` codes in `errors.ts`).
- Admin actions: `dealers.{list,get,create,update,branding,setStatus,bulkSuspend,invite}`,
  `catalog.{searchMaster,get,assign,unassign,updateAccess}`,
  `prices.{saveDraft,discardDraft,publish,history,revert,bulkAdjust,copyFrom,importPreview,importCommit}`,
  `preview.catalog`, `orders.{list,get,retrySync}`, `audit.list`.
- Dealer actions: `me`, `catalog.{list,get}`, `cart.{get,setItem,acknowledge,removeInvalid,clear}`,
  `orders.{place,list,get,reorder}`, `account.{get,update}`.
- Tables: `dealers`, `dealer_users`, `dealer_branding`, `dealer_product_access`, `dealer_price_rules`,
  `dealer_audit_log`, `dealer_cart_items`, `dealer_orders`, `dealer_order_items` (+ sequence
  `dealer_order_number_seq`). Money is integer **paise**.
- Dealer lifecycle: `draft → invited → active ⇄ suspended → archived`. First successful dealer sign-in moves
  `invited → active`. Suspension is enforced on every request (no token outlives it).
- Order status: `pending_sync` (stored, Odoo not yet created — retryable by admin) → `quotation`
  → `confirmed` → `completed` / `cancelled`, mirrored from Odoo `sale.order.state` when the order is read.

## Dependencies

New env (Supabase Edge Function secrets, server-only): `DEALER_PORTAL_URL` (invite/reset redirect, default
`https://dealers.deliteauto.com`), `DEALER_ALLOWED_ORIGINS` (extra CORS origins, e.g. Vercel previews).
Existing: `ODOO_*`, `SUPABASE_*`, `RESEND_API_KEY` (order email). Supabase Auth must allow the redirect URLs
`<portal>/invite/accept` and `<portal>/reset-password`. Postgres extension `btree_gist` (enabled in the
migration). No new npm packages.

## Testing / verification

Run (all from `Delite-Auto-main/`):
- `npx vitest run supabase/functions/_shared/dealer` → **62 tests pass**: 22 unit (pricing, planner, tax,
  quote, CSV) + 40 end-to-end engine scenarios covering tenant isolation (search/direct URL/cart/order IDOR,
  smuggled price ignored, non-dealer 403), lifecycle, invite readiness gate, publish/overlap/scheduling,
  idempotent ordering, price-change acknowledgement, Odoo outage → `pending_sync` → admin retry, status sync,
  GST-inclusive totals, CSV import, bulk adjust, copy, revert, reorder, permissions, audit.
- `npx tsc -b` clean; `npx oxlint` exit 0 (warnings only, same classes as existing code);
  `npm run build` and `npm run build:dealer` succeed; the storefront bundle has no dealer SPA code and the
  dealer production bundle is a separate, dealer-only build.
- Deno-only files were type-checked with a throw-away tsconfig + `Deno` shim (`strict: true`) — clean. They
  have **not** been executed (no Deno/Docker/Supabase CLI in this environment).
- An earlier UI walk-through (done against the since-removed demo backend, same engine) covered: wrong-password
  error, branded dashboard, assignment-scoped catalogue, per-dealer prices, MOQ/pack stepper, price edit →
  draft → publish, cart "old → new" acknowledgement, order placement with snapshot, cross-dealer "not found",
  immediate suspension, CSV import with row errors, invite, mobile 375px. **It must be re-done against the real
  backend once deployed** (see "Must do before pilot").
- A bug found by that walk-through and fixed: a plain price edit carried the live price's (past) start
  date and would have conflicted with it at publish — `planPublish` now treats a past start as "effective
  now" (regression test added).

## Known issues / follow-ups

**Must do before pilot (nothing below has been done):**
1. **Phase 0 proof against live Odoo** — create a dealer partner + draft `sale.order` with an explicit
   `price_unit` (different from `list_price`) via `OdooDealerPort.createQuotation` against a tagged test
   partner and confirm Odoo keeps the exact price and computes the expected tax/total. The instance appears
   to be the client's live production store, so get explicit approval before any write.
2. Apply the two migrations to the Supabase project; deploy `admin-dealers` and `dealer-portal`; set the
   secrets above; add the Auth redirect URLs; configure SMTP (Supabase's default mailer is rate-limited — use
   Resend SMTP) for invite/reset mails.
3. Create the second Vercel project (build command `npm run build:dealer`, output `dist`), attach
   `dealers.deliteauto.com` (+ a protected staging domain), roll out behind a flag: internal dealer → 2–3 pilots.
4. **Decide tax basis/GST** with the client — Odoo's tax calculation currently yields ₹0 on this instance, so
   totals will show ₹0 tax until products carry GST in Odoo. Also decide dealer shipping policy.
5. **Product images** come via the public `catalog-media` proxy (public by id). If any dealer-exclusive product
   is *not* published on the public site, add access control there before onboarding dealers.

**Other gaps:** no git repo here (init/commit/branch per the spec's "feature branch" rule); no
`dealer_manager` role yet (adding one means extending the `admin_role` enum + three TS role lists, then one
entry in `ROLE_CAPABILITIES`); rate limiting is per warm isolate only (add an edge/WAF rule for distributed
abuse); sessions use Supabase's localStorage tokens rather than httpOnly cookies (acceptable for v1, revisit);
no Playwright spec for the dealer flow (browsers not installed here — the engine suite + manual UI run cover
it); no dealer-facing i18n (English only); admin support role can view but the UI shows write buttons that the
server will refuse (UX polish); rest of Phase 4 not built.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-27 | Claude | Initial version: Phases 1–3 + reorder built and verified locally; deployment and live-Odoo proof pending. |
| 2026-10-28 | Claude | Removed the mock/demo backend, `/mock-admin` harness, `.env.dealermock` and `dev:dealer-demo` script at the owner's request; the Dealers section now runs only in the real admin. |
