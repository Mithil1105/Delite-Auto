# Real Online Payments (Razorpay) + COD

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Razorpay online payment integration, preserving Cash on Delivery |
| File           | `Documentations MD/delite-payments.md` |
| Branch         | figma |
| Owner          | Claude |
| Status         | Code complete, live-verified in "unconfigured" mode (COD works end-to-end; online payment gracefully reports "temporarily unavailable" until real Razorpay secrets are added) — no real Razorpay test-mode payment has been run in this session, see Known gaps |
| Created        | 2026-09-29 |
| Last updated   | 2026-10-07 (see odoo-native-checkout.md — this Razorpay integration is no longer the production payment path) |

> **2026-10-07 update:** the production checkout path changed again — React now hands the cart off
> to Odoo's own native checkout, which uses Odoo's own (already-live, real) Razorpay integration,
> not this one. This `payment-create`/`payment-verify`/`razorpay-webhook` flow is no longer reached
> by any Checkout CTA in the app. Kept as LEGACY/FALLBACK, not deleted. See
> [odoo-native-checkout.md](odoo-native-checkout.md).

> **2026-10-06 update:** the `amount`/`price_unit` this flow charges and writes to Odoo now comes
> from a server-authoritative quote (`computeAuthoritativeQuote`), not raw `list_price` — and
> `payment-create` now requires a `checkoutAttemptId` (closing a prior gap where a retried "Pay
> Online" click could create two Razorpay orders). See
> [odoo-checkout-finalization.md](odoo-checkout-finalization.md) (branch `feature/odoo-checkout`,
> not yet merged/deployed) for the full architecture — this doc's description of the payment
> lifecycle (verify/webhook race protection, `checkout_snapshot`, never re-pricing after capture)
> otherwise remains accurate.

## Summary

Adds a real, server-authoritative Razorpay payment flow alongside the existing Cash on Delivery
checkout — never trusting a browser callback alone as proof of payment. A new `payment_attempts`
table tracks the full lifecycle (created → authorized → paid/failed/refunded); the real Odoo
`sale.order` is created only **after** payment is verified for online orders (COD is unchanged:
still creates the order immediately, since there's no payment step to wait for). Verification is
idempotent by construction — a fast client-side confirmation path and a webhook both call the same
claim-and-finalize function, keyed by a UNIQUE constraint on the Razorpay payment id, so neither a
race between the two nor a webhook retry can ever create two orders.

## Why

The prior checkout flow (`delite-accounts-orders-reviews-admin.md`) placed every order as
pending-payment/COD-style, with payment processing explicitly deferred as future work. This phase
builds that real payment flow, per a detailed spec insisting on: never confirming an Odoo order
before payment is verified, real webhook signature verification (not "payment_id from browser =
paid"), idempotency against retries/races, and keeping COD as a legitimate parallel method rather
than removing it.

## Scope

**In scope:** `payment_attempts` table + RLS; `payment-create` (starts an online payment),
`payment-verify` (fast client-callback verification), `razorpay-webhook` (authoritative,
signature-verified) Edge Functions; a shared idempotent `finalizePaidAttempt()`; `create-order`
refactored to share its Odoo-order-placement logic with the new online path (COD behavior
otherwise unchanged); `Checkout.tsx` payment-method selector + Razorpay Checkout.js integration;
order-status honesty on `OrderConfirmation.tsx`/Account/Admin Orders (`payment_method`/
`payment_status` shown as their own real fields, never conflated with Odoo fulfilment `status`).

**Explicitly not in scope:** refunds initiated from Delite Admin (webhook only *records* a
`refund.processed` event; issuing a refund still happens in Razorpay/Odoo directly), saved
payment methods, subscriptions, any product/price/stock write-back to Odoo (unchanged ownership
boundary), "Mark shipped"/"Mark delivered" admin actions (not built, per explicit instruction).

## Architecture

```
COD (unchanged):
  Checkout.tsx --create-order--> validate/price lines (live Odoo) --> find/create res.partner
    --> create sale.order --> insert orders (payment_method=cod, payment_status=pending)
    --> insert a matching payment_attempts row (method=cod, status=pending) for Admin visibility
    --> send order-confirmation email --> navigate to /order/:id

Online payment:
  Checkout.tsx --payment-create--> validate/price lines (live Odoo, NOT yet placed in Odoo)
    --> insert payment_attempts (status=created, checkout_snapshot = validated lines + shipping)
    --> create Razorpay Order --> return {razorpayOrderId, amount, keyId} to the browser
  Browser opens Razorpay Checkout.js with that order_id
  On success (client-side):
    Checkout.tsx --payment-verify--> verify HMAC(order_id|payment_id, key_secret) == signature
      --> finalizePaidAttempt(attemptId, paymentId)
  Razorpay's servers (independently, always, eventually):
    POST razorpay-webhook --> verify HMAC(raw_body, webhook_secret) == x-razorpay-signature header
      --> on "payment.captured" --> finalizePaidAttempt(attemptId, paymentId)

finalizePaidAttempt(attemptId, paymentId) — the ONE place a paid order is created:
  1. Atomic claim: UPDATE payment_attempts SET razorpay_payment_id=$id, status='authorized'
     WHERE id=$attemptId AND razorpay_payment_id IS NULL  -- only the first caller wins
  2. If the claim didn't happen (0 rows) -> read current state, return it as an idempotent no-op
     (covers both "webhook beat the client callback" and "webhook retried after success")
  3. Create the Odoo sale.order from the claimed row's `checkout_snapshot` (NOT re-validated —
     see "Odoo order timing" below) -> insert `orders` (payment_status=paid) -> update
     payment_attempts (status=paid, order_id, odoo_sale_order_id, paid_at)
  4. Best-effort: order-confirmation email, purchase analytics — wrapped so a failure here can
     never turn an already-successful payment+order into an error response
```

## Odoo order timing (the decision the spec asked to be explicit about)

**For online payment, the Odoo `sale.order` is created only inside `finalizePaidAttempt()`, after
payment is verified — never before, never as a draft-then-confirm.** Two real constraints drove
this over the alternative ("create a draft quotation before payment, confirm it after"):

1. `odoo-write-check` (see `delite-accounts-orders-reviews-admin.md`) only ever verified
   `sale.order.create`/`.line.create` access — it never verified a state-transition write
   (`action_confirm`, or writing `state`) is actually permitted on this Odoo instance. Building on
   an unverified write path would be exactly the "guess instead of verify" mistake this project's
   own discipline has repeatedly caught and fixed in earlier passes.
2. `checkout_snapshot` (server-validated lines + shipping, captured at `payment-create` time) is
   used AS-IS at finalize time — **not re-validated against Odoo again**, deliberately. Money has
   already been collected via Razorpay for that exact total by the time finalize runs; re-checking
   price/availability at that point could mean rejecting an order the customer already paid for,
   which is a strictly worse outcome than honoring a snapshot that's at most a few minutes stale.
   This is a considered trade-off, not an oversight — documented here so it's not "fixed" into a
   worse behavior later without re-reading this reasoning.

## Odoo failure after verified payment (#10)

If Odoo order creation throws inside `finalizePaidAttempt()` (Odoo down, rate-limited, etc.) after
the payment claim has already succeeded, the payment is never reported as failed and never
silently retried-and-forgotten: `payment_attempts.status` is set to `'paid'` (true — the money was
captured) with a new `odoo_sync_pending = true` flag, and the customer is sent a "payment
received, order finalizing" email (`sendOrderProcessingDelay`) rather than a failure message. There
is currently no automated retry/reconciliation job for `odoo_sync_pending` rows — an admin would
need to notice one (via a direct query, since no Admin UI surfaces this flag yet — see Known
gaps) and place the order in Odoo manually from the attempt's `checkout_snapshot`.

## COD vs online payment (#5)

Both are real, explicit, persisted choices — `orders.payment_method` (`'online' | 'cod'`) is set
once at order-creation time and never silently defaulted. `Checkout.tsx` shows both as a real radio
choice; COD still shows the honest "Pay in cash when your order arrives" note (only for COD orders
now — previously this note appeared unconditionally on Cart/Checkout/OrderConfirmation even though
no payment gateway existed yet, which is corrected here too).

## Payment data model

New enums `public.payment_status` (`created | pending | authorized | paid | failed | expired |
refunded`) and `public.payment_method` (`online | cod`). New table `public.payment_attempts` — see
`supabase/migrations/20260929090100_create_payment_attempts.sql` and
`20260929090600_payment_odoo_sync_pending.sql` for the exact schema. No card/payment credentials
are ever stored — only provider order/payment ids, amount, currency, and a safe failure reason.
`orders` gained `payment_method`, `payment_status`, `payment_attempt_id` (additive columns, same
migration) — `orders.status` (Odoo fulfilment) and `orders.payment_status` (payment) are
deliberately separate columns, never conflated (#47).

## Idempotency (#7)

- `payment_attempts.razorpay_order_id` and `razorpay_payment_id` are both UNIQUE — a duplicate
  insert/claim attempt fails at the database layer, not just in application logic.
- `finalizePaidAttempt()`'s atomic claim (`UPDATE ... WHERE razorpay_payment_id IS NULL`) is the
  single choke point both `payment-verify` and `razorpay-webhook` go through — whichever arrives
  first does the work; the other reads back the already-finalized state and returns success
  without re-doing anything.
- The email service's own idempotency (`email_log.idempotency_key` UNIQUE, keyed
  `order_confirmation:<order_id>`) means even if `finalizePaidAttempt()` were somehow re-entered
  for an already-paid attempt, no second confirmation email could be sent.
- `create-order` (COD) has no equivalent claim mechanism — a genuine gap carried over from before
  this phase (the original function had no idempotency key either); a double-submit is guarded
  only by `Checkout.tsx`'s own `placing` state disabling the button (#12), not a server-side
  guarantee. Flagged in Known gaps rather than silently left unaddressed.

## Payment signature verification (#8)

`payment-verify` verifies `HMAC-SHA256(razorpay_order_id|razorpay_payment_id, key_secret)` against
the client-supplied `razorpay_signature` before calling `finalizePaidAttempt()` — a mismatched
signature marks the attempt `failed` and never creates an order. `razorpay-webhook` separately
verifies `HMAC-SHA256(<raw request body>, webhook_secret)` against the `x-razorpay-signature`
header, computed over the **raw bytes** of the request (read via `req.text()` before any
`JSON.parse`) — the two verification paths use different secrets and different signed material by
design, matching Razorpay's own model, not a shortcut. Both use a constant-time string comparison
(`timingSafeEqual` in `_shared/payments/razorpay.ts`) rather than `===`, to avoid a timing side
channel. Unit-tested directly: `server/payments/razorpay.test.ts` (7 tests — valid signature
accepted, tampered/replayed/forged/empty signatures all rejected, webhook signature verified over
exact raw bytes not re-serialized JSON).

## Payment webhook (#9)

`supabase/functions/razorpay-webhook/index.ts`, `verify_jwt = false` in `supabase/config.toml`
(Razorpay's servers carry no Supabase session — authenticated purely by its own HMAC signature,
never assumed to be a signed-in user). Handles `payment.captured` (-> finalize),
`payment.failed` (-> marks the attempt `failed` with a safe reason, only if still `created` —
never overwrites an attempt that's already moved past that state), and `refund.processed` (->
marks the attempt/order `refunded`). Any other event type is acknowledged with 200 rather than
erroring, so Razorpay doesn't retry indefinitely for events this app doesn't act on. A processing
exception returns 500 deliberately, so Razorpay's own retry mechanism gets another chance.

## Checkout button safety (#12)

`Checkout.tsx`'s submit handler returns immediately if `placing` (state ≠ `"idle"`) is already
true — a double click can't trigger a second `payment-create`/`create-order` call. Three distinct
button labels ("Processing…", "Opening payment…", "Verifying payment…") make the in-flight state
visible rather than a single generic spinner.

## Payment analytics (#13)

Four new event names — `payment_method_selected`, `payment_started`, `payment_success`,
`payment_failed` — added to the existing first-party analytics taxonomy (client `EventMap` in
`src/lib/analytics/client.ts`, server `EVENT_NAMES`/`RULES` in
`supabase/functions/_shared/analytics/core.ts`, and the `analytics_events.event_name` CHECK
constraint widened via `20260929091000_analytics_payment_events.sql`). Purchase remains the
authoritative conversion event, recorded server-side only inside `finalizePaidAttempt()`/
`create-order` after a real order actually exists — these four are funnel-visibility only, never a
second source of truth for "did a sale happen." No gateway secret ever appears in event metadata
(`method` is the only field sent — `"online"`/`"cod"`).

## Admin payment visibility

`src/admin/pages/orders/Orders.tsx` shows a `PaymentBadge` (Paid / Failed / Refunded / Pending, or
`COD · <status>`) alongside the order's own Odoo fulfilment `status` — visually and semantically
distinct, per #47's explicit "do not conflate paid with fulfilled."

## Interfaces / data

- `POST payment-create` — auth required, body `{ shippingName, shippingPhone, shippingAddress,
  lines }` → `{ paymentAttemptId, razorpayOrderId, amount, currency, keyId }` or `{ error }`
  (`501` when Razorpay isn't configured).
- `POST payment-verify` — auth required, body `{ paymentAttemptId, razorpay_order_id,
  razorpay_payment_id, razorpay_signature }` → `{ paid: true, orderId, odooOrderName }` or
  `{ error }`.
- `POST razorpay-webhook` — no Supabase auth; Razorpay's own signature only.
- `public.payment_attempts` — see migration for full schema.
- `_shared/orders/placeOdooOrder.ts` — `validateAndPriceLines`, `findOrCreatePartner`,
  `createSaleOrder`, shared by `create-order` and `_shared/payments/finalize.ts`.
- `_shared/payments/razorpay.ts` — `getRazorpayConfig`, `createRazorpayOrder`,
  `verifyPaymentSignature`, `verifyWebhookSignature`.
- `_shared/payments/finalize.ts` — `finalizePaidAttempt(paymentAttemptId, razorpayPaymentId)`.

## Dependencies

- New Supabase Edge Function secrets (not yet set in this environment — see Known gaps):
  `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Never exposed via `VITE_*`
  — the frontend only ever receives `keyId` (the public key id, safe by design) inside
  `payment-create`'s response, never `KEY_SECRET`/`WEBHOOK_SECRET`.
  `ABANDONED_CART_RECOVERY_ENABLED` (unset/false by default — see
  `delite-transactional-email.md`).
- Razorpay Checkout.js loaded dynamically (`loadRazorpayScript()` in `Checkout.tsx`) only when a
  customer actually chooses online payment — never added to every page load.

## Testing / verification

- `npm run build`, `npm run lint`, `npm run typecheck:server`, `npm run test:unit` (106
  passed/1 skipped, including the 7 new signature-verification tests) — all clean.
- `tests/interaction/commerce-completion.spec.ts` — payment-method selector requires sign-in
  (unchanged `RequireAuth` behavior verified); a credentialed full online-payment walkthrough test
  exists but is `test.skip()`'d (no `DELITE_TEST_CUSTOMER_EMAIL`/`PASSWORD` provisioned in this
  environment — see Known gaps).
- Live-verified in "unconfigured" mode: `payment-create` correctly returns `{ error: "Online
  payment temporarily unavailable…" }` (501) since no real `RAZORPAY_KEY_ID`/`KEY_SECRET` exist
  yet in this project's secrets — confirmed this doesn't crash checkout, COD remains fully
  selectable and functional.
- **Not verified in this session** (no real Razorpay account/test-mode keys were available):
  a real successful payment end-to-end, an actual webhook delivery from Razorpay's servers, a real
  payment failure/cancellation from the Checkout.js widget. See Known gaps and "Test payment"
  below for exactly what to run once real test-mode keys exist.

## Known issues / follow-ups

- **No real Razorpay account/credentials exist in this environment.** `RAZORPAY_KEY_ID`/
  `KEY_SECRET`/`WEBHOOK_SECRET` are not set as Supabase secrets — online payment is code-complete
  and gracefully "temporarily unavailable" today, not live. To activate: create a Razorpay account,
  get **test-mode** keys first, `npx supabase secrets set RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=...
  --project-ref zafjmlwbolgdattfdgch`, configure a webhook in the Razorpay dashboard pointing at
  `https://zafjmlwbolgdattfdgch.supabase.co/functions/v1/razorpay-webhook` with a webhook secret,
  set `RAZORPAY_WEBHOOK_SECRET` the same way, then run the full "Test payment" checklist below
  before ever switching to live keys.
- ~~`odoo_sync_pending` has no Admin UI surface yet~~ — **resolved 2026-09-29**, see
  `Documentations MD/delite-production-operations.md` (Odoo Sync & Failures page + admin-retry
  function + richer `odoo_sync_status` state).
- ~~COD has no double-submit database-level guard~~ — **resolved 2026-09-29**, see
  `Documentations MD/delite-production-operations.md` (`checkout_attempt_id` claim, mirroring the
  Razorpay path's unique-column-claim shape).
- **No refund-initiation UI** — `razorpay-webhook` only *records* `refund.processed`; actually
  issuing a refund is done directly in Razorpay or Odoo, by design (Admin stays read-only for
  payment state, consistent with the Odoo-ownership boundary elsewhere in this project).
- **2026-09-30 follow-up**: `create-order`/`payment-create`/`payment-verify`/`razorpay-webhook` all
  redeployed as part of the Odoo customer-checkout/account/returns phase — `shippingAddress` (a
  free-text string) is now a structured `address` object (line1/line2/city/state/pincode), and all
  four functions accept guest checkout (optional `Authorization` header; guest requires
  `guestEmail`). Payment logic itself (signature verification, idempotent `finalizePaidAttempt()`,
  webhook handling) is unchanged. Full detail: `Documentations MD/odoo-checkout-portal-returns.md`.
- ~~Checkout showed "Pay Online" unconditionally, only failing after selection when Razorpay was
  unconfigured~~ — **resolved 2026-09-29**, see `Documentations MD/delite-production-operations.md`
  (new `payment-config` function; `Checkout.tsx` now hides the option and defaults to COD).

## Test payment (#65 — run once real Razorpay test-mode keys exist)

1. Successful payment: place an online order with a real Razorpay test card → webhook fires →
   order appears in `orders` with `payment_status=paid` and a real `odoo_sale_order_id`.
2. Invalid signature: manually POST to `payment-verify` with a tampered `razorpay_signature` →
   expect `400`, attempt stays `failed`, no order created (covered today by the unit tests; repeat
   against the live deployed function once keys exist).
3. Payment failure: use a Razorpay test card configured to decline → `payment.failed` webhook →
   attempt marked `failed`, no order.
4. Customer cancellation: dismiss the Razorpay Checkout modal → `ondismiss` fires → UI reverts to
   idle, no order, `checkout_failed` analytics event with `reason: "payment_cancelled"`.
5. Duplicate webhook: replay the same `payment.captured` webhook payload twice → second call must
   be a no-op (no second order, no second email) — verify via `email_log` and `orders` row counts.
6. Duplicate frontend callback: trigger `payment-verify` twice with the same payment id (simulating
   a slow network retry) → same no-op guarantee.
7. Odoo failure after paid: temporarily point `ODOO_BASE_URL` at an unreachable host, run a test
   payment → confirm `payment_attempts.status='paid'`, `odoo_sync_pending=true`, and the
   "processing delay" email was sent — then restore `ODOO_BASE_URL` and manually verify no
   duplicate order gets created if `finalizePaidAttempt` were re-triggered for that same attempt
   (it's already claimed, so it will not re-run the Odoo call — confirm this holds).
8. Order idempotency: repeat the "duplicate webhook"/"duplicate frontend callback" cases and count
   `orders` rows with that `payment_attempt_id` — must always be exactly one.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-29 | Claude | Initial version — payment_attempts data model, payment-create/payment-verify/razorpay-webhook Edge Functions, shared idempotent finalizePaidAttempt(), create-order refactored to share Odoo-order-placement logic, Checkout.tsx payment-method selector + Razorpay Checkout.js integration, order-status honesty (payment_method/payment_status shown separately from Odoo fulfilment status), 4 new analytics events, 7 unit tests for signature verification. No real Razorpay account existed in this environment — built entirely in the "gracefully unconfigured" mode already established for Odoo/Supabase elsewhere in this project; not live-tested against a real payment. |
| 2026-09-29 | Claude | Production-ops phase — resolved the two open gaps above: COD `checkout_attempt_id` claim (no more possible duplicate Odoo orders on double-submit), richer `odoo_sync_status` state + `admin-retry-odoo-order-sync` (admin-only, idempotent retry), `payment_webhook_events` table for honest webhook health. Full detail in `Documentations MD/delite-production-operations.md`. |
| 2026-09-29 | Claude | Follow-up same day — new `payment-config` function; Checkout now proactively hides "Pay Online" (defaulting to COD) when Razorpay is unconfigured, instead of only failing honestly after selection. |
| 2026-09-30 | Claude | Odoo customer-checkout/account/returns phase: `create-order`/`payment-create`/`payment-verify`/`razorpay-webhook` redeployed with structured `address` (replacing free-text `shippingAddress`) and guest-checkout support (optional auth, `guestEmail`). Payment logic itself unchanged. Full detail: `odoo-checkout-portal-returns.md`. |
| 2026-09-30 | Claude | Added the real Admin Payments ledger (`/admin/payments`) — KPI header, server-side filter/sort/search/pagination, detail drawer, prominent paid+sync-pending state, masked+copyable provider ids. Supersedes the earlier "Odoo Sync & Failures" page. Full detail in `Documentations MD/delite-production-operations.md`. |
