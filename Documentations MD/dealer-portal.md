# Exclusive Dealer Portal (B2B)

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Invitation-only B2B dealer portal (`dealers.deliteauto.com`) + "Dealers" section in the existing Delite Admin |
| File           | `Documentations MD/dealer-portal.md` |
| Branch         | `jay/feature/dealer-portal-b2b` (local; push to `Mithil1105/Delite-Auto` pending repository write access) |
| Owner          | Claude (for Jay) |
| Status         | **Code complete for all spec phases (1–4).** Live Supabase has migrations 1–2 and the *first* versions of `admin-dealers` / `dealer-portal`. The completion migration `20261029090000`, the redeploy of three functions, the second Vercel project and the live-Odoo price proof are **not yet done** — see "Must do before pilot". |
| Created        | 2026-10-27 |
| Last updated   | 2026-11-23 |

## Summary

A private B2B portal where Delite-invited dealers sign in, see **only** the products assigned to them at
their own fixed prices (with optional volume tiers), build a cart, and place a purchase request that
becomes a **draft quotation in Odoo** for Delite staff to confirm. Delite manages everything (dealers,
commercial terms, branding, assignments, prices, tiers, CSV import, invites, team users, announcements,
orders, reconciliation, audit, rollout) from a **Dealers** section in the existing admin. The public
storefront and its Odoo checkout are untouched.

Source spec: `Delite_Exclusive_Dealer_Portal_Specification.md` (v1.0, 21 Oct 2026).

## Why

Dealer price lists were communicated and entered by hand. The spec's goals: private catalogue per dealer,
contract pricing enforced **on the server** (never trusting the browser), quick admin workflows, and data
that stays consistent with Odoo (product master, tax, orders).

## Scope

**Built (all spec phases):**
- **Phase 1** — dealer/user/branding/entitlement/price/audit schema; admin Dealers section (list, add,
  setup stepper, Catalogue & Pricing grid, Branding with preview, Access/invite, Orders, Activity); dealer
  app (landing with FAQ/contact, login with throttle, invite-accept, forgot/reset, dashboard, scoped
  catalogue, product page).
- **Phase 2** — server-side cart, quote with price-change acknowledgement, idempotent order placement, Odoo
  draft quotation with automatic retry, own-order history/detail, status sync from Odoo, order email.
- **Phase 3** — CSV import (preview + commit), bulk assign/remove, bulk % adjust, copy from another dealer,
  time-bound prices, preview-as-dealer, price history + restore, bulk suspend, optimistic locking.
- **Phase 4** — reorder; **volume tiers** (`min_quantity` per price rule); **commercial terms** per dealer
  (request-order vs PO-required, shipping policy as-agreed/free/flat, payment-terms text, credit limit
  enforced against open orders, pilot flag); **team users** (owner + buyers, owner-managed); **account
  offers** shown on the dashboard; **spend insights** (90 days); **printable order / PDF** (browser
  "Save as PDF"); category filter and in-stock signal in the catalogue; product URL slugs.
- **Per-dealer address** (`<slug>.dealers.deliteauto.com`) — each dealer can have its own branded landing page
  and sign-in on its own subdomain. Admin sets the address on the dealer form (Overview → "Dealer portal
  address"; unique, 3–30 chars, reserved words blocked). The landing page shows only branding (name, logo, cover,
  accent colour, tagline, welcome text) via the one unauthenticated action `public.brand`; an unknown, draft,
  suspended or archived dealer address returns the same safe 404. The browser tags every dealer-portal call with
  the address it came from and the server refuses a sign-in that belongs to another dealer (audited as
  `security.denied / wrong_portal`). Invite and reset emails link to the dealer's own address.
- **Autosave** — the setup form of a *draft* dealer saves itself 1.5 s after the last edit (optimistic-lock stamp
  kept locally, so typing is never interrupted).
- **Security/ops** — real **session revocation** (`dealer_revoke_sessions` + `sessions_revoked_before`
  checked against the JWT `iat`); admin "sign everyone out"; **rollout flag** `off | pilot | on`
  (owner-only); `dealer_manager` role scoped by `dealer_admin_grants` (dealers + separate pricing
  permission); security alert banner (refused sign-ins / cross-tenant attempts in 24 h); **Odoo
  reconciliation** report; host-scoped CSP and security headers for `dealers.deliteauto.com` in `vercel.json`;
  login throttling + honeypot; password policy (≥10 chars, letter + number).

**Deliberately not built:** live online payment for dealers (v1 is request-order); automatic Odoo
confirmation of quotations; Odoo pricelists as the price master (see decisions).

## Implementation notes

**Architecture — one engine, three adapters.** All business rules live in
`supabase/functions/_shared/dealer/engine.ts` behind ports (`ports.ts`): `DealerRepo`, `OdooPort`,
`AuthPort`, `NotifierPort`. The engine is pure TypeScript, so the same code runs in (1) the Edge Functions
against Postgres + Odoo and (2) Vitest against in-memory fakes (`memory.ts`, test-only).

- `engine.ts` — capability-checked admin actions and dealer actions. The dealer API **never reads a
  `dealerId` from the payload**; identity comes from `resolveSession(authUserId, requestId, tokenIssuedAt)`,
  which also enforces disabled users, rollout mode and revoked sessions.
- `pricing.ts` — integer-paise helpers, `resolveActiveRule` (tier-aware: highest tier ≤ quantity, **no
  public-price fallback**), `planPublish` (a draft whose start is already past is "effective now"), readiness.
- `quote.ts` — price + tax from the dealer rule and real Odoo `account.tax` rows; exclusive and inclusive
  contract prices; unsupported tax shapes fail closed; SHA-256 fingerprint of the quote (includes the tier).
- `csv.ts` — RFC-4180 parser; columns `sku,price,tax,moq,multiple,tier,start,end,note` (`tier` = from-quantity,
  default 1).
- `supabaseRepo.ts`, `odooPort.ts`, `deps.ts` — Deno-only production adapters.
- Edge Functions: `admin-dealers` (via `requireAdmin()` incl. MFA policy; roles owner/admin/support/
  dealer_manager, further narrowed by engine capabilities and grants) and `dealer-portal` (verified Supabase
  session → `dealer_users`; the single unauthenticated action is `public.brand`, rate-limited per IP). Explicit CORS allow-list, `Cache-Control: private, no-store`, request ids,
  structured errors, per-isolate rate limiting.
- Migrations: `20261028090000_dealer_portal_foundation.sql`, `20261028090100_dealer_portal_purchase.sql`,
  `20261029090000_dealer_portal_completion.sql` (**all applied live**) and `20261123090000_dealer_portal_slug.sql`
  (per-dealer address; **not yet applied**). Rollbacks in `supabase/rollbacks/`. RLS on with no client policies; GiST
  exclusion constraint prevents overlapping active prices *per tier*; `dealer_apply_price_plan` /
  `dealer_insert_order` are atomic; `dealer_audit_log` is append-only.

**Frontend.** Dealer SPA is a separate entry (`dealer.html` → `src/dealer/main.tsx`); dev serves it at
`/dealer/*`; production builds with `npm run build:dealer` for a second Vercel project. Admin pages live in
`src/admin/pages/dealers/*` and appear as a tabbed **Dealers** nav entry (Dealers, Dealer orders). There is no
mock/demo mode; everything runs through the real admin and Edge Functions.

**Decisions taken (change if the business disagrees):**
1. Dealer prices are mastered in the **Delite database**, not Odoo pricelists (Odoo SaaS cannot run custom
   modules and rate-limits). Odoo only receives the final price per order line.
2. Purchase flow = **request order** → draft `sale.order` in Odoo (never auto-confirmed).
3. **Tax basis is per price rule** (exclusive/inclusive); tax from the variant's real Odoo taxes. This
   instance currently computes ₹0 tax because products have no GST configured in Odoo — that is a data task
   for the client, not a portal rule.
4. **Entitlement is per exact variant**, separate from price (default deny).
5. A dealer cannot be invited until every visible + orderable assigned product has a published price
   (the minimum-quantity-1 tier).
6. **Volume tiers** are additional price rules with `min_quantity > 1`; the dealer's cart uses the tier
   reached by the line quantity, and the quote shows the tier table.
7. **"Catalogue manager" is the existing `merchandising` role** for the storefront; it gets *no* dealer
   access. Dealer administration is `owner`/`admin` (full), `support` (read-only) and the new
   `dealer_manager` (only the dealers granted to them; pricing only if explicitly granted).
8. **Rollout** is a database flag `dealer_portal_mode` (default `pilot`): `off` blocks everyone, `pilot` lets
   only dealers marked *Pilot* in, `on` lets every active dealer in. Only an owner can change it.
9. **Credit limit** is checked against the dealer's open (non-cancelled, non-completed) orders at order
   time; exceeding it returns `CREDIT_LIMIT` and the order is not placed.
10. **Failed Odoo syncs retry automatically** (1, 2, 4 … 60 min, up to 12 tries) whenever orders are read,
    and admins can retry by hand; **Reconcile** compares recent orders to Odoo.
11. Currency is fixed at INR; the form shows it read-only.
12. Sessions use Supabase's browser tokens (not httpOnly cookies) — mitigated by the CSP, short JWT
    lifetime and server-side revocation.

## Interfaces / data

- `POST /functions/v1/{admin-dealers|dealer-portal}` body `{ "action": "<name>", "payload": { ... } }`.
  Errors: `{ error: { code, message, details? } }` with 401/403/404/409/422/429/503.
- Admin actions: `dealers.{list,get,create,update,branding,setStatus,bulkSuspend,invite,addUser,setUserStatus,
  sendReset,revokeSessions}`, `offers.{save,delete}`, `catalog.{searchMaster,get,assign,unassign,updateAccess}`,
  `prices.{saveDraft,discardDraft,removeTier,applyToVariants,publish,history,revert,bulkAdjust,copyFrom,
  importPreview,importCommit}`, `preview.catalog`, `orders.{list,get,retrySync,reconcile}`, `audit.list`,
  `security.summary`, `portal.{getMode,setMode}`, `roles.{listManagers,setGrant}`.
- Dealer actions: `me`, `catalog.{list,get,categories}`, `insights`, `cart.*`, `orders.{place,list,get,reorder}`,
  `account.{get,update}` (owner), `team.{list,invite,setStatus}` (owner).
- Tables: `dealers`, `dealer_users`, `dealer_branding`, `dealer_product_access`, `dealer_price_rules`,
  `dealer_audit_log`, `dealer_cart_items`, `dealer_orders`, `dealer_order_items`, **`dealer_offers`**,
  **`dealer_admin_grants`** (+ `private.app_config` key `dealer_portal_mode`). Money is integer **paise**.
- Lifecycle: `draft → invited → active ⇄ suspended → archived`; orders: `pending_sync → quotation →
  confirmed → completed / cancelled`, mirrored from Odoo.

## Dependencies

Per-dealer addresses need: frontend env `VITE_DEALER_BASE_DOMAIN` (default `dealers.deliteauto.com`); secret
`DEALER_PORTAL_BASE_DOMAIN` (same value, so invite/reset links use the dealer's own address); a wildcard domain
`*.dealers.deliteauto.com` on the dealer Vercel project (wildcard domains require Vercel nameservers or a
DNS `CNAME *.dealers` record per Vercel's instructions); and the Supabase Auth redirect URL
`https://*.dealers.deliteauto.com/**`. Local testing: `http://<slug>.localhost:5173/dealer` (browsers resolve
`*.localhost` to your machine).

Supabase Edge Function secrets (server-only): `DEALER_PORTAL_URL` (invite/reset redirect; default
`https://dealers.deliteauto.com`), `DEALER_ALLOWED_ORIGINS`, plus existing `ODOO_*`, `SUPABASE_*`,
`RESEND_API_KEY`. Supabase Auth must allow `<portal>/invite/accept` and `<portal>/reset-password`
(local: `http://localhost:5173/dealer/...`). Extension `btree_gist`. No new npm packages.

Scripts: `npm run dealer:odoo-proof -- --variant <id> --price <₹> --confirm-write [--cleanup]` (Phase-0 proof,
writes a tagged partner + a **draft** quotation to Odoo; dry-run by default) and
`node scripts/dealer-load-test.mjs` (read-only latency smoke test; needs a real dealer user).

## Testing / verification

- `npx vitest run supabase/functions/_shared/dealer` → **94 tests pass** (22 pricing/quote/CSV unit, 40 end-to-end
  scenarios, 27 completion scenarios and 5 portal-address scenarios (slug rules, uniqueness, public brand leaks nothing, wrong-portal refusal, invite link): tiers, terms, credit limit, team users, session revocation, rollout
  modes, dealer-manager scoping, automatic retry, reconcile, categories, offers, insights, security summary).
- Whole suite: 296 pass; the only failures are the 3 pre-existing `odooCheckoutHandoff` tests that need
  `VITE_ODOO_CHECKOUT_BASE_URL` (unrelated to this work). `npx tsc -b` clean; `npx oxlint` warnings only;
  `npm run build` and `npm run build:dealer` succeed.
- Live (earlier, first deploy): created a test dealer (ZZT-2040) in the real admin, assigned products,
  published prices, previewed as dealer, audit trail confirmed. The completion changes have **not** been run
  live because they depend on the unapplied migration.
- The Phase-0 Odoo price proof, load test and migration rollback test are written but **not run**.

## Known issues / follow-ups

**Must do before pilot:**
1. Apply `20261123090000_dealer_portal_slug.sql` and redeploy `dealer-portal` + `admin-dealers` (the first three
   migrations and functions are already live). Then add the wildcard domain/DNS and the env/secret above.
2. Set the secret `DEALER_PORTAL_URL`; add the Auth redirect URLs; configure Resend SMTP for invite/reset mail.
3. Run the Phase-0 proof (needs explicit approval — it writes to the live Odoo) and check totals/tax.
4. Create the second Vercel project (build `npm run build:dealer`, output `dist`), attach
   `dealers.deliteauto.com`, roll out: internal dealer → 2–3 pilots (`Pilot only` mode) → `On`.
5. Have the client configure GST on products in Odoo; confirm the shipping policy per dealer.
6. Product images use the public `catalog-media` proxy (public by id): if a dealer-exclusive product is not
   published on the public site, add access control there first.
7. Change the admin password that was shared in chat while testing; archive the test dealer ZZT-2040.

**Other gaps:** rate limiting is per warm isolate (add a WAF rule for distributed abuse); no Playwright spec for
the dealer flow; English only; accessibility was reviewed in code (labels, roles, keyboard menus) but an
automated axe run has not been done.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-27 | Claude | Initial version: Phases 1–3 + reorder built and verified locally; deployment and live-Odoo proof pending. |
| 2026-10-28 | Claude | Removed the mock/demo backend and `/mock-admin`; the Dealers section runs only in the real admin. Migrations 1–2 and first function versions deployed to the live project. |
| 2026-11-23 | Claude | Per-dealer subdomain: own branded landing + sign-in at `<slug>.dealers.deliteauto.com`, slug field and uniqueness in admin, public `public.brand` action (branding only), server refusal of cross-portal sign-ins, invite/reset links on the dealer's address, wildcard CSP host rule, autosave for draft dealers; 94 engine tests. Migration `20261123090000` written, not yet applied. |
| 2026-10-29 | Claude | Completion pass for the whole spec: volume tiers, commercial terms, credit limit, team users, session revocation, rollout flag, `dealer_manager` role + grants, offers, insights, print/PDF, automatic Odoo retry + reconcile, security alert, CSP headers, richer landing/auth, full admin UI for all of it; 89 engine tests. Completion migration, function redeploy, Odoo proof and Vercel project still pending. |
