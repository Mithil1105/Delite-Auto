# Production Readiness, Admin Operations & Failure Recovery

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Production readiness + admin operations + failure recovery |
| File           | `Documentations MD/delite-production-operations.md` |
| Branch         | figma |
| Owner          | Claude |
| Status         | Done — migrations applied and Edge Functions deployed to the live project on 2026-09-29 (several items still depend on live provider secrets / manual dashboard steps — see Known issues) |
| Created        | 2026-09-29 |
| Last updated   | 2026-10-06 (admin-retry-odoo-order-sync / admin-retry-email updated for the new quote pipeline — see below) |

> **2026-10-06 update:** `admin-retry-odoo-order-sync`'s `createSaleOrder()` call and
> `admin-retry-email`'s line-item reconstruction both depended on the pre-quote-pipeline
> `checkout_snapshot`/`createSaleOrder` shape and would have broken against new `payment_attempts`
> rows once the quote pipeline shipped. Both were fixed with backward-compatible handling (prefer
> the new `quoteLines`; fall back to re-quoting/re-reading for any legacy row that predates this
> change). See [odoo-checkout-finalization.md](odoo-checkout-finalization.md) (branch
> `feature/odoo-checkout`, not yet merged/deployed) §15 and §24.

## Summary

Gives the store owner a way to **see** when something goes wrong (payment stuck, Odoo sync
failed, email failed, contact enquiry piling up) and **safely recover** from it, without reading
Edge Function logs. Adds COD duplicate-submit protection, an admin-only idempotent Odoo retry
path, an admin email-retry path, a contact-notification email, an Admin Integrations/health page,
and reconciles a real RLS inconsistency (`is_admin()` vs `has_admin_role()`).

## P1 operational gaps follow-up (2026-09-30)

A second pass closed the remaining highest-value operational gaps identified against this same
codebase: a real Admin **Payments** ledger (KPIs + server-side filter/sort/search/pagination +
detail drawer), real Reviews **history** (previously pending-only), and Integrations Health
polish (real health-state wording, an operational-issue attention list). This section documents
only the delta — everything above this section is unchanged.

**New: Admin Payments (`/admin/payments`)** — the one canonical view of `payment_attempts`,
superseding the narrower "Odoo Sync & Failures" page from the first pass (that route now
redirects here). Server-side via two new SQL functions (`public.admin_payments_kpis`,
`public.admin_payments_list` — migration `20260930090000_admin_payments_and_reviews_reporting.sql`),
following the exact `admin_analytics_*` convention already established in this codebase
(`SECURITY DEFINER`, `search_path = ''`, an explicit role check as the first statement — reusing
`private.analytics_require()` verbatim rather than duplicating it under a new name, since it's a
generic role-check helper despite its name). KPI header (Total Attempts / Paid / Pending / Failed
/ Refunded / COD / Paid-Awaiting-Sync — the last one deliberately NOT period-scoped, since it's a
live backlog, not a historical count). Filters: date range, status, method, Odoo sync state;
search across customer name/email, `orders.odoo_order_name`, and both Razorpay ids. Sort: newest/
oldest/amount high→low/amount low→high. Server-side pagination (`X–Y of Z`). Detail drawer shows
every field the spec asked for (never the raw `checkout_snapshot` JSON) and renders the
`paid + odoo_sync_pending` combination as a distinct, prominent "Payment received — Odoo sync
pending" state — never "Failed" — with an explicit warning against refunding/retrying the
payment by mistake. Provider ids are masked (`abcd…wxyz`) with click-to-copy for the full value.
Retry (calling the existing `admin-retry-odoo-order-sync`, now also open to `support` — see
below) is available inline in the table and in the drawer.

**New: Reviews history (`/admin/reviews`)** — Pending/Approved/Rejected/All tabs; previously only
pending reviews were visible in Admin at all (moderated reviews disappeared). Server-side via a
new `public.admin_reviews_query` SQL function (same migration) plus a new `admin-reviews-list`
Edge Function wrapper — the wrapper exists *only* because product-name resolution requires a live
Odoo JSON-RPC call, which Postgres can't do; the SQL function itself handles all filtering
(status/rating/date/search across review text + resolved customer name/email — never fabricated
"search by product name" since that would need to persist Odoo product names as a second source
of truth, explicitly avoided), sorting, and pagination. "Moderated by"/"moderated at" are derived
from the existing `admin_activity_log` (`action = 'review.moderated'`) rather than adding new
columns — no migration needed for that part. Moderation itself (approve/reject) is completely
unchanged: still a direct RLS-gated client update, still logged once per action.

**Widened: `admin-retry-odoo-order-sync`** now also allows `support` (previously `owner`/`admin`
only) — matches the Orders page's existing access level; support already has legitimate order
visibility, so retrying a stuck sync for an order they can already see is consistent, not a scope
expansion.

**Integrations Health** (renamed from "Integrations" for consistency with the requested sidebar
label): `admin-system-health` now returns an `issues` array (`{ key, label, href, count, oldest,
latest }`) — paid-awaiting-sync, failed emails (24h), payment failures (24h), failed
contact-notification emails — rendered as a compact "Attention" panel at the top of the page
(never hundreds of raw rows; "All systems operational" when the array is empty). Razorpay/Resend
status badges now distinguish **Not configured** / **Configured — no `<evidence>` recorded yet** /
**Healthy** — "Healthy" requires real stored evidence (a verified payment, a successful send),
never just an env var's presence.

**Nav changes** (`src/admin/services/adminAuth.ts`): added **Payments** under Commerce/Insights
(roles: owner/admin/support); renamed **Integrations** → **Integrations Health**; removed the
**Odoo Sync & Failures** nav entry (its route now redirects to `/admin/payments`, which fully
supersedes it — filtering Payments by Odoo sync state covers the same workflow, plus everything
else). **Orders** gained amount-based sort (`Total high → low` / `Total low → high`) alongside the
existing newest/oldest.

**Role/RLS consistency re-verified**: `payment_attempts`/`product_reviews` reads for the new pages
go through `private.analytics_require`/`has_admin_role(['owner','admin','support'])` inside the
SECURITY DEFINER functions themselves — the same role set already gating the Orders/Reviews nav
items and RLS policies from the first pass, so sidebar visibility, route guards, RLS, and these
new Edge Functions/RPCs all agree. Not independently re-tested against a live `support`-role
account in this session (see Known issues).

## Why

Payments (`delite-payments.md`), transactional email (`delite-transactional-email.md`), and the
admin panel (`delite-admin.md`) were all previously built and are code-complete, but a genuine gap
remained: when something fails *after* a customer-facing success (payment collected but Odoo sync
fails; order placed but confirmation email fails; enquiry saved but no one is notified), that
failure existed only in `payment_attempts`/`email_log` rows or console logs — nothing in the UI
surfaced it, and nothing let an admin safely retry it. Separately, COD had no server-side
protection against a double-click/network-retry creating two real Odoo orders — the online
Razorpay path already solved this via a unique-column claim, COD never got the same treatment.

## Scope

**Included:**
- COD duplicate-submit protection via a client-generated `checkout_attempt_id`, claimed atomically
  server-side before any Odoo write.
- Richer Odoo-sync operational state (`odoo_sync_status`: pending/syncing/synced/failed,
  `retry_count`, `last_retry_at`, `last_sync_error_safe`, `syncing_since` claim-lock) on
  `payment_attempts`, populated by both the COD and Razorpay paths.
- `admin-retry-odoo-order-sync` — admin-only, idempotent, browser supplies only the attempt id.
- `admin-retry-email` — admin-only retry for genuinely failed Delite-owned transactional emails
  (`order_confirmation`, `order_processing_delay`, `review_approved`), via a new `retry_of`/
  `attempt_number` model on `email_log` — never bypasses the original idempotency key.
- `payment_webhook_events` — one row per Razorpay webhook invocation (success or failure), so
  "last webhook received" / "recent failure count" is real evidence, not an inference.
- `admin-system-health` — Razorpay/Resend/Analytics/Supabase status + a production-readiness
  checklist, all evidence-based (env presence + real rows), never inferred from a secret's shape.
- New Admin pages: **Integrations** (`/admin/system/integrations`), **Odoo Sync & Failures**
  (`/admin/system/odoo-sync`), **Email Delivery** (`/admin/system/email`), **Order Detail**
  (`/admin/orders/:id`). Orders list gained search/filters/pagination. Overview gained an
  "Attention Required" card.
- Contact-enquiry internal notification email (`sendContactNotification`, optional
  `CONTACT_NOTIFICATION_EMAIL`), idempotent per enquiry, never blocks the enquiry save.
- RLS reconciliation migration: `payment_attempts`/`email_log`/`orders`/`product_reviews` SELECT
  (and `product_reviews` UPDATE) policies moved from `private.is_admin()` to
  `private.has_admin_role(['owner','admin','support'])`, with a safety backfill for any
  `is_admin=true, admin_role=null` account (from `admin-bootstrap`).
- Fixed a real pre-existing bug found while building this: `sendOrderProcessingDelay` was writing
  a payment-attempt id into `email_log.order_id`, which has an FK to `orders.id` — that insert
  would fail every time (silently, since the caller never re-checked). Fixed to leave `order_id`
  null for that email type.

**Added in a follow-up pass the same day** (both were explicitly deferred in the first pass, then
built once the user confirmed they wanted to continue):
- **Mandatory-MFA policy foundation** — `REQUIRE_ADMIN_MFA` env var, read via a new
  `admin-security-policy` Edge Function, enforced in `RoleRoute` (every admin page except Security
  itself is blocked until AAL2 once the flag is on). Default off — see
  `delite-auth-security.md`'s Known issues for the enable procedure and its one real caveat
  (route-guard-only enforcement, not yet also enforced at the RLS layer).
- **Proactive Online Payment gating** — new `payment-config` Edge Function (`{
  onlinePaymentConfigured: boolean }`, no secrets); `Checkout.tsx` now hides the "Pay Online"
  option entirely (not just failing honestly after selection) when Razorpay isn't configured, and
  defaults to COD. See `delite-payments.md`.

**Explicitly NOT included this pass** (matches the user's own scoping instructions):
- No fake multi-device session list — the Supabase client SDK has no self-service "list my
  sessions" read; documented as a known limitation, not worked around with `localStorage`/user-agent
  guessing.
- No Odoo fulfilment writes (ship/deliver/stock/price/refund) — Odoo remains the operational
  source of truth for fulfilment.
- No generic job queue — everything above is plain Postgres (claims via unique columns/atomic
  `UPDATE ... WHERE ... IS NULL`) + Edge Functions.
- Supabase Auth email-confirmation setting, leaked-password protection, and auth redirect URLs
  remain dashboard-managed/manual — the Integrations checklist honestly reports these as
  "Unknown / manual check required" rather than guessing.

## Implementation notes

- `supabase/migrations/20260929100000_payment_cod_idempotency_and_retry_state.sql` —
  `payment_attempts.checkout_attempt_id` (unique), retry/state columns, backfill, and a unique
  index on `orders.payment_attempt_id` (defence in depth against a duplicate order mirror).
- `supabase/migrations/20260929100100_create_payment_webhook_events.sql` — new table, admin-select
  RLS via `has_admin_role`.
- `supabase/migrations/20260929100200_email_log_retry_columns.sql` — `retry_of`/`attempt_number`.
- `supabase/migrations/20260929100300_reconcile_admin_role_rls.sql` — the RLS reconciliation
  described above, with the `admin_role` backfill safety step first.
- `supabase/functions/create-order/index.ts` — rewritten COD flow: validate → atomic claim (insert
  on `checkout_attempt_id`, unique-constraint conflict handling) → three resolved-state branches
  (already-has-order / already-has-Odoo-id-but-no-order / neither, with a bounded poll then a
  retry-claim) → winner path creates the Odoo order and immediately persists
  `odoo_sale_order_id`/`odoo_sync_status='synced'` **before** the `orders` insert (so a crash
  between those two steps is recoverable, not silently duplicated) → on Odoo failure, the claimed
  row is marked `failed`/`odoo_sync_pending=true` (previously: no row was written at all, so a
  failed COD Odoo-create was invisible to Admin).
- `supabase/functions/_shared/orders/mirrorOrder.ts` (new) — the "insert `orders`, backfill
  `payment_attempts.order_id`" step, factored out of `create-order` so `admin-retry-odoo-order-sync`
  can reuse it exactly. `_shared/payments/finalize.ts` deliberately keeps its own inline copy
  (the one proven, already-shipped Razorpay path) — untouched except for the two small
  `odoo_sync_status` writes described below.
- `supabase/functions/_shared/orders/placeOdooOrder.ts` — added `fetchSaleOrder()` (re-reads an
  already-created sale.order's name/total without creating a new one — the resume/no-duplicate
  path for both COD and the retry function).
- `supabase/functions/_shared/payments/finalize.ts` — two small additions: writes
  `odoo_sync_status`/`last_sync_error_safe` alongside the existing `odoo_sync_pending` writes, and
  `odoo_sync_status='synced'` on success. No change to its core claim/create logic.
- `supabase/functions/admin-retry-odoo-order-sync/index.ts` (new) — auth via
  `profiles.admin_role in ('owner','admin')` (same pattern as `admin-users-manage`/
  `admin-odoo-link`, not a DB RPC — those helper functions live in the `private` schema and aren't
  PostgREST-exposed). Body is `{ paymentAttemptId }` only. Claims via `syncing_since` (atomic
  `UPDATE ... WHERE odoo_sync_pending=true AND syncing_since IS NULL`), re-checks for an existing
  `odoo_sale_order_id`/`order_id` before ever calling Odoo, re-validates the stored
  `checkout_snapshot` live against Odoo before creating.
- `supabase/functions/admin-retry-email/index.ts` (new) — only retries
  `order_confirmation`/`order_processing_delay`/`review_approved`, only when `status='failed'`.
  Reconstructs the original email's data from `orders`/`payment_attempts`/`product_reviews` (the
  entity id is parsed from the original `idempotency_key`, e.g. `order_confirmation:<uuid>`) and
  re-sends through the same typed `_shared/email/index.ts` function with a new
  `:retry<N>`-suffixed idempotency key — never a raw-HTML passthrough, never touches Supabase
  Auth emails (they never appear in `email_log`).
- `supabase/functions/admin-system-health/index.ts` (new) — evidence-based status only.
- `supabase/functions/razorpay-webhook/index.ts` — now writes one `payment_webhook_events` row per
  invocation (all four event branches + the catch block).
- `supabase/functions/_shared/email/index.ts` — added `sendContactNotification()` and an optional
  `retry?: { of, attempt }` param on the three retryable send functions (changes only the
  idempotency key and the new `retry_of`/`attempt_number` fields written to `email_log` — the
  automatic call sites, unchanged, still get the original key).
- `supabase/functions/contact-submit/index.ts` — calls `sendContactNotification` after the enquiry
  insert succeeds, in its own `try/catch` (never affects the `{ok:true}` response).
- Frontend: `src/admin/pages/system/{Integrations,OdooSyncAndFailures,EmailDelivery}.tsx`,
  `src/admin/pages/orders/OrderDetail.tsx` (new); `Orders.tsx` (filters/pagination/row-click);
  `Overview.tsx` (Attention Required card); `adminAuth.ts`/`App.tsx` (nav + routes);
  `Checkout.tsx` (`checkoutAttemptId` generated once per mount via `crypto.randomUUID()`, sent
  with the COD submission).

## Interfaces / data

- `payment_attempts` new columns: `checkout_attempt_id uuid unique`, `retry_count int`,
  `last_retry_at timestamptz`, `last_sync_error_safe text`, `syncing_since timestamptz`,
  `odoo_sync_status text` (`not_applicable|pending|syncing|synced|failed`).
- `email_log` new columns: `retry_of uuid`, `attempt_number int`.
- New table `payment_webhook_events(id, provider, event_type, payment_attempt_id, success,
  safe_error, received_at)`.
- `create-order` request body now requires `checkoutAttemptId: string` (uuid).
- New Edge Functions: `admin-retry-odoo-order-sync`, `admin-retry-email`, `admin-system-health`.
- New env vars (all optional/gracefully-degraded): `PAYMENT_ENVIRONMENT` (`test`|`live`, explicit —
  never inferred), `CONTACT_NOTIFICATION_EMAIL`.

## Dependencies

Depends on the existing Razorpay/Resend/Odoo/RLS-role infrastructure documented in
`delite-payments.md`, `delite-transactional-email.md`, and `delite-admin.md`. No new npm packages.

## Testing / verification

- `npm run lint`, `npm run build` (includes `tsc -b`), `npm run typecheck:server`,
  `npm run test:unit` — all clean (106 tests passed, pre-existing warnings only, no new ones of a
  new class). Supabase Edge Functions (Deno) are not covered by `typecheck:server` (scoped to
  `server/**`/`api/**` only) or by the Vitest suite — this is a **known gap**, not a claim of
  coverage; see Known issues.
- Manual/mental trace of the required scenarios (not run against a live Supabase project in this
  session — no destructive migration/deploy was applied without confirmation, see Known issues):
  - COD double-submit with the same `checkout_attempt_id`: first request wins the claim and
    creates one Odoo order; a second concurrent/retried request either replays the same result
    (order already mirrored), resumes the mirror (Odoo id exists, order row missing), or —
    for the rare true-race window — polls briefly then returns a `409 { retryable: true }` the
    client can safely resubmit (same id, so still convergent to one order).
  - Odoo retry: first click on a `syncing_since IS NULL` row wins the claim; a second click while
    the first is in flight gets `409 "already in progress"`; after success, the row has
    `odoo_sale_order_id` **and** `order_id` set, so a third click is a pure no-op — never a second
    Odoo order.
  - Email retry: only a `status='failed'` row of a retryable type can be retried; the retry writes
    a **new** `email_log` row (`retry_of`/`attempt_number`), leaving the original row intact.
  - Contact notification failure: `sendContactNotification` is wrapped in `try/catch` in
    `contact-submit`, after the `contact_enquiries` insert already succeeded — a Resend outage
    cannot turn a successful submission into an error response.

## Follow-up: security-hardening verification pass (2026-09-30)

Verification-only pass across the whole Admin surface — role matrix, live support-role test, and
MFA-policy verification are documented in full in `delite-auth-security.md` (this doc's Payments/
Orders/Reviews/Email-Delivery pages were the ones live-tested and screenshotted as the `support`
role: all rendered correctly, KPI cards/filters/table stayed readable and non-overflowing at
1440/1024/820px, no raw `checkout_snapshot` visible in the Payments detail drawer). Two items land
here specifically:

- **Fixed a real accessibility gap in the shared admin `Drawer`** (`src/admin/analytics/ui.tsx`) —
  used by Payments' and Reviews' detail drawers among 11 total consumers. Had `role="dialog"`/
  `aria-modal`/Escape/initial-focus already correct, but no Tab focus trap and no focus restoration
  on close. Fixed with the same pattern `MobileNavDrawer.tsx` already established — benefits every
  consumer (Payments, Reviews, every analytics page's detail drawer) for free.
- **Resolved the "Deno edge functions have no automated test coverage" gap below, partially** — see
  `delite-auth-security.md`'s "Deno Edge Function test-harness assessment": the one genuinely
  pure-logic piece (`requireAdmin()`'s JWT `aal` decoding) now has real Vitest coverage via a new
  dependency-free `_shared/auth/jwt.ts` module; the DB-dependent parts (role lookup, retry claim
  logic) remain covered by manual trace + live Playwright only, assessed as impractical to unit-test
  without a heavier Postgres-backed integration harness — not attempted, per the spec's own
  "if not practical, document why" instruction.

Full `npm run lint`/`build`/`typecheck:server`/`test:unit` (113 passed) clean; re-ran
`get_advisors(security)` — no new findings beyond the pre-existing, already-documented
`leaked_password_protection` WARN and the expected `SECURITY DEFINER`-callable-by-`authenticated`
WARNs every `admin_*`/`analytics_*` RPC already showed (internally role-gated, by design).

## Follow-up: security cleanup pass (2026-09-30)

Full detail in `delite-auth-security.md` — this doc's own two items:

- **`admin-system-health` deployed** (was written locally in the prior pass, never shipped): now
  returns a real `mfaEnrolledForOwner` (Auth-Admin-API-derived) instead of a hardcoded `"unknown"`.
  Verified live through the real authenticated Admin path. No other function touched.
- **`profiles_select_admin` RLS narrowed** from any-admin-role (`is_admin()`) to `owner`/`admin`
  only — audited every real consumer first (none of Orders/Payments/Reviews/Contact/Admin Users
  depend on it; all already read customer data through service-role Edge Functions or
  `postgres`-owned `SECURITY DEFINER` RPCs, both of which bypass RLS regardless). Zero regression,
  confirmed live for all five roles and all five pages this doc covers.

## Known issues / follow-ups

- **Deployed 2026-09-29**, after explicit user confirmation (this phase touches payments, RLS, and
  admin auth): all 4 migrations applied to the live project (`zafjmlwbolgdattfdgch`) and
  `create-order`, `razorpay-webhook`, `payment-verify`, `contact-submit` redeployed with their
  updated shared modules; `admin-retry-odoo-order-sync`, `admin-retry-email`, `admin-system-health`
  deployed as new functions. `payment-create`, `admin-odoo-link`, `review-notify`,
  `admin-users-manage` were left untouched (unaffected by this phase's changes — see Implementation
  notes). Post-deploy `get_advisors` (security + performance) showed no new findings from this
  phase's migrations — only pre-existing ones (analytics RPC `SECURITY DEFINER` exposure,
  unindexed FKs, multiple-permissive-policy INFO/WARNs, and one that's newly *actionable*: leaked-
  password protection is confirmed **disabled** on this project — enable it via Supabase Dashboard
  → Authentication → Policies → Leaked Password Protection; not something this session's tools can
  toggle).
- ~~Mandatory-MFA policy foundation (`REQUIRE_ADMIN_MFA`) is not built~~ — **resolved (follow-up
  pass, 2026-09-29)**, see `delite-auth-security.md`. Still off by default; still route-guard-only
  enforcement, not yet also enforced at the RLS layer.
- **Multi-device session management remains unavailable** — the Supabase client SDK has no
  self-service session-listing/revocation call; would require the Admin Auth API from a trusted
  server context. Documented, not faked.
- ~~Online-payment visibility when Razorpay is unconfigured~~ — **resolved (follow-up pass,
  2026-09-29)**: new `payment-config` function + `Checkout.tsx` now hides "Pay Online" entirely
  when unconfigured, defaulting to COD, instead of only failing honestly after selection. See
  `delite-payments.md`.
- **`admin-system-health`'s `authRedirectUrls`/`leakedPasswordProtection`/`mfaEnrolledForOwner`
  checklist fields are hardcoded `"unknown"`** — these require either Supabase project-level
  Management API access or the Admin Auth API's per-user MFA-factor listing, neither exercised in
  this pass; the checklist is honest about this rather than guessing.
- **Deno edge functions have no automated test coverage in this repo** (Vitest/tsc scope is
  `server/**`/`api/**`/`src/**` only) — the new `create-order` idempotency logic, retry functions,
  and `admin-system-health` were verified by careful manual trace of the code paths, not by an
  automated test run. A `deno test` harness for `supabase/functions/**` would be a reasonable
  follow-up.
- **RLS reconciliation only covers `payment_attempts`/`email_log`/`orders`/`product_reviews`** —
  `profiles`' own admin-select policy is intentionally left on `is_admin()` (out of scope; a
  distinct owner/admin-user-management concern that needs its own deliberate review).
- **P1 follow-up (2026-09-30) deployed the same way**: the new migration
  (`admin_payments_and_reviews_reporting`) and the `admin-reviews-list`/updated
  `admin-retry-odoo-order-sync`/`admin-system-health` functions were applied/deployed directly
  (this session already had standing confirmation from the same conversation to deploy this class
  of change). Both new RPCs were smoke-tested directly against real project data before frontend
  wiring (`admin_reviews_query` returned a real existing test review correctly joined to its
  submitter's profile name; `admin_payments_list`'s query shape validated against the live,
  currently-empty `payment_attempts` table). `get_advisors` re-run afterward: no new class of
  finding — the three new `SECURITY DEFINER` RPCs show the same expected/by-design "authenticated
  can execute" WARN every existing `admin_analytics_*` function already shows (internally
  role-gated), not a new issue.
- **No live click-through test of the `support` role against the new Payments/Reviews pages** —
  the role check is enforced identically to the already-verified Orders/Reviews pattern
  (`private.has_admin_role(['owner','admin','support'])` / `analytics_require`), but this specific
  session did not create a temporary support account and click through Payments/Reviews with it to
  confirm end-to-end (matches the equivalent caveat already recorded in
  `delite-auth-security.md` for the first pass's flows).
- **No Playwright coverage or screenshots were produced for the new Payments/Reviews/Integrations
  Health pages** — verified via `npm run build`/`lint`/`typecheck:server`/`test:unit` (all clean)
  and direct SQL smoke tests of the new RPCs, not a driven browser session. Stated plainly rather
  than implied as done.
- **Product-name search on the Reviews page is intentionally not supported** — searching by
  product name would require mirroring Odoo product names into Postgres as a second source of
  truth, which this project deliberately avoids elsewhere (product stays Odoo-owned). Search
  covers review text and customer name/email; the product name shown is always resolved fresh from
  Odoo for display.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-30 | Claude | Security cleanup pass — deployed the pending `admin-system-health` update (real owner-MFA status, verified live) and narrowed `profiles_select_admin` RLS to owner/admin only (audited every consumer first, zero regression on this doc's own pages). Full detail in `delite-auth-security.md`. |
| 2026-09-29 | Claude | Initial version — see Summary/Scope/Implementation notes above. |
| 2026-09-30 | Claude | P1 operational gaps follow-up — new Admin Payments ledger (`admin_payments_kpis`/`admin_payments_list` RPCs, KPI header, filters/sort/search/pagination, detail drawer, prominent paid+sync-pending state, masked+copyable provider ids), Reviews history (`admin_reviews_query` RPC + `admin-reviews-list` wrapper for Odoo product-name resolution, Pending/Approved/Rejected/All tabs, search/rating/date filters, pagination, moderated-by/at from admin_activity_log), Integrations Health rename + real health-state wording (Not configured/Configured-unverified/Healthy) + operational-issue attention list, `admin-retry-odoo-order-sync` widened to include `support`, Orders gained amount sort, "Odoo Sync & Failures" page retired in favor of Payments. Migration applied, all affected functions deployed, advisors clean. Build/lint/typecheck:server/unit (106 passed) clean; no Playwright/screenshots/live support-role click-through this pass — stated explicitly in Known issues. |
