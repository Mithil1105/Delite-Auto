# Transactional Email (Resend)

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Transactional email service (order confirmation, review approved, payment-delay notice) + a disabled-by-default abandoned-cart template |
| File           | `Documentations MD/delite-transactional-email.md` |
| Branch         | figma |
| Owner          | Claude |
| Status         | Code complete, gracefully "unconfigured" — no real Resend account exists in this environment, see Known gaps |
| Created        | 2026-09-29 |
| Last updated   | 2026-09-29 |

## Summary

One shared server-side email service (`supabase/functions/_shared/email/index.ts`) — every Edge
Function that needs to send a transactional email calls into it, never a scattered
provider-specific `fetch`. Provider: Resend, plain REST (no SDK dependency). A new `email_log`
table gives idempotency (a retried order/payment handler can't send the same email twice) and
Admin-visible delivery history. Abandoned-cart recovery is built as a reusable template/function
but is explicitly **disabled by default** — nothing in this codebase calls it automatically.

## Why

Orders and payments previously had no email confirmation at all. This phase adds real transactional
email on top of the payment work (`delite-payments.md`), per an explicit instruction to build one
shared service rather than one-off `fetch` calls scattered per Edge Function, and to keep
transactional email (order confirmation, security-adjacent notices) architecturally separate from
marketing email (abandoned-cart recovery), never conflating their permission models.

## Scope

**In scope:** `_shared/email/index.ts` (`sendEmail` core + `sendOrderConfirmation`,
`sendOrderProcessingDelay`, `sendReviewApproved`, `sendAbandonedCartRecovery` template functions),
`email_log` table + RLS, wired into `create-order` (COD) and `_shared/payments/finalize.ts`
(online payment) for order confirmations.

**Explicitly not in scope:** any automated abandoned-cart send (the function exists, nothing calls
it — see "Abandoned-cart recovery foundation" below), a review-rejection email (per explicit
instruction not to build one unless required), Supabase Auth's own password-reset/invite emails
(those are Supabase's built-in mailer, not this service — see `delite-auth-security.md`).

## Email service layer

`supabase/functions/_shared/email/index.ts` — `getEmailConfig()` reads `RESEND_API_KEY`,
`TRANSACTIONAL_FROM_EMAIL`, `TRANSACTIONAL_FROM_NAME` from `Deno.env`; returns `null` when
unconfigured (same graceful pattern as `getOdooConfig()`/`getRazorpayConfig()`). `sendEmail()` is
the one function that ever calls Resend's API — every template function funnels through it, so
idempotency/logging/error-handling live in exactly one place. Templates are separated from
transport: each template function (`sendOrderConfirmation`, etc.) builds its own HTML string with a
small local `escapeHtml()` helper (every user-supplied value — name, address, product names — is
escaped before interpolation; no `dangerouslySetInnerHTML`-equivalent risk since this is raw HTML
string assembly, not React) and calls `sendEmail()` with a `subject`/`html`/`idempotencyKey`.

## Order confirmation email (#16)

Sent from `create-order` (COD, after the Odoo order + Supabase mirror both succeed) and from
`_shared/payments/finalize.ts` (online, after payment is verified and the order is placed).
Includes: customer first name (when the account has one), real order number (`odoo_order_name`,
the actual Odoo `sale.order` name — never a guessed/internal id), order date, line items with
quantity and price, total, payment method (Paid Online / Cash on Delivery), shipping address, and a
link to the contact page. Never includes internal Supabase ids, API data, or anything
payment-secret-shaped. **Email failure never rolls back a valid order** — both call sites wrap the
send in its own `try/catch` after the order is already committed; a Resend outage degrades to "no
email sent, order still placed," never "order lost because email failed," matching #16's explicit
requirement.

## Email idempotency (#17)

`email_log.idempotency_key` is `UNIQUE`. `sendEmail()`'s first step is an `insert` using that key —
a unique-constraint violation (Postgres error `23505`) means this exact logical email was already
queued/sent, and `sendEmail()` returns `{ sent: false, reason: "already_sent" }` without ever
calling Resend. Keys are logical, not random: `order_confirmation:<order_id>`,
`order_processing_delay:<order_id>`, `review_approved:<review_id>`,
`abandoned_cart_recovery:<cart_id>` — a retried webhook or a re-run order handler naturally reuses
the same key and is a safe no-op, satisfying #17's explicit "not five times" requirement.

## Review email (#18)

`sendReviewApproved()` exists and is called from the review-moderation flow when an admin approves
a review — **only when the reviewing account has a real email on file** (via
`auth.admin.getUserById`); never invented for an anonymous/exhibition-style review. No
rejection email is sent (per explicit instruction — "do not send rejection emails unless explicitly
required").

## Email log (#19)

`public.email_log` — `id, user_id, order_id, email_type, idempotency_key (unique), provider_message_id,
status ('queued'|'sent'|'failed'), safe_failure_reason, created_at, sent_at`. RLS: admin-only
`SELECT`, no client-facing write policy at all (every write is the shared service's own
service-role client). Never stores the email body/HTML, never a secret — `safe_failure_reason` is a
short code (`provider_not_configured`, `provider_error_<status>`, `network_error`), never a raw
provider error message that might leak account-identifying detail.

## Abandoned-cart recovery foundation (#55-57)

`sendAbandonedCartRecovery()` exists (template + idempotent send, same as every other email here)
but `isAbandonedCartRecoveryEnabled()` gates it on `Deno.env.get("ABANDONED_CART_RECOVERY_ENABLED")
=== "true"` — **unset by default**, and nothing anywhere in this codebase calls this function
automatically (no cron, no trigger, no scheduled job exists that would invoke it). This satisfies
the explicit instruction: build the reusable piece, leave automation behind a disabled flag, never
start sending recovery email to everyone in this phase.

**Eligibility, if/when automation is built later (#56):** only a cart with a known customer email
(never anonymous-identity discovery), not already converted, not recently emailed beyond a
configured cadence — the existing `private.analytics_cart_status` view (30-minutes-inactive
definition, see `delite-analytics.md`) already computes "abandoned," but there is currently no
job/cron reading it and calling this function. That wiring is explicitly future work.

**Marketing vs. transactional (#57):** deliberately separate code paths and separate
`email_type`/idempotency-key namespaces (`abandoned_cart_recovery:*` vs. `order_confirmation:*`) —
an abandoned-cart send is never routed through the same "always send, no consent check" logic as an
order confirmation. No mass-marketing capability (list sends, unsubscribe management, consent
tracking) exists or is implied by this foundation; building real marketing email is a distinct,
larger, business/legal-reviewed effort, not started here.

## Interfaces / data

- `_shared/email/index.ts`: `getEmailConfig()`, `sendEmail(args)`, `sendOrderConfirmation(args)`,
  `sendOrderProcessingDelay(args)`, `sendReviewApproved(args)`, `sendAbandonedCartRecovery(args)`,
  `isAbandonedCartRecoveryEnabled()`.
- `POST review-notify` — admin session required, body `{ reviewId }` → `{ ok, reason? }`. Called
  fire-and-forget from `src/admin/pages/reviews/Reviews.tsx`'s `moderate()` only on approval;
  resolves the reviewer's real email via the Admin Auth API and the product's real name via a live
  Odoo lookup (falls back to `product #<id>` if that lookup fails — never blocks the email).
- `public.email_log` — see `supabase/migrations/20260929090400_create_email_log.sql`.

## Dependencies

- New Supabase Edge Function secrets (not set in this environment — see Known gaps):
  `RESEND_API_KEY`, `TRANSACTIONAL_FROM_EMAIL`, `TRANSACTIONAL_FROM_NAME`. Never exposed via
  `VITE_*` or any client-reachable surface.
- Depends on `payment_attempts`/`orders` (delite-payments.md) for order-confirmation trigger
  points, and `product_reviews`/admin moderation (delite-accounts-orders-reviews-admin.md) for the
  review-approved trigger point (review-approval wiring itself is the existing moderation action in
  `src/admin/pages/reviews/Reviews.tsx` — this phase adds the `sendReviewApproved()` call there,
  not a new moderation UI).

## Testing / verification

- `npm run build`/`lint`/`typecheck:server`/`test:unit` — clean (part of the same verification pass
  as `delite-payments.md`).
- Live-verified in "unconfigured" mode: an order placed via COD in this session correctly logged an
  `email_log` row with `status='failed'`, `safe_failure_reason='provider_not_configured'` — proving
  the graceful-degradation path works and, critically, that the order itself was NOT affected by
  the email failure (the order row committed successfully regardless).
- **Not verified in this session**: an actual email delivered by Resend (no real API key exists
  here) — see Known gaps and "Email testing" below for what to run once one exists.

## Known issues / follow-ups

- **No real Resend account/API key exists in this environment.** To activate: create a Resend
  account, verify a sending domain, get an API key, then
  `npx supabase secrets set RESEND_API_KEY=... TRANSACTIONAL_FROM_EMAIL=orders@yourdomain.com
  TRANSACTIONAL_FROM_NAME="Delite Auto" --project-ref zafjmlwbolgdattfdgch`. No code change needed
  — every send path already checks `getEmailConfig()` and will simply start working.
- ~~No Admin UI for `email_log`~~ — **resolved 2026-09-29**, see
  `Documentations MD/delite-production-operations.md` (Email Delivery admin page + admin-retry-email
  function + `retry_of`/`attempt_number` model).
- **Abandoned-cart automation is entirely unbuilt** — the template/send function exists and is
  disabled; there is no scheduler, no eligibility-checking job, no cadence tracking. A real "Cron"
  Supabase feature or an external scheduler would be the natural next step, explicitly deferred.
- **HTML emails only, no plain-text fallback** — acceptable for a first pass; most transactional
  email clients render HTML natively, but a `text` alternative is a reasonable future addition to
  Resend's payload.
- **New: `sendContactNotification()`** (2026-09-29) — internal-only notification to
  `CONTACT_NOTIFICATION_EMAIL` when a new contact enquiry is saved; optional (no-op if unset),
  idempotent per enquiry (`contact_enquiry_notification:<id>`), all user content HTML-escaped. See
  `Documentations MD/delite-contact-and-admin-media.md` and `delite-production-operations.md`.
- **Bug found and fixed (2026-09-29):** `sendOrderProcessingDelay` was passing a `payment_attempts`
  id (not a real `orders.id`) into `email_log.order_id`, which has a foreign key to `orders(id)` —
  every one of these inserts would fail on that FK violation, silently, every time. Fixed to leave
  `order_id` null for this email type (the idempotency key, a plain text column, still uses the
  attempt id correctly).

## Email testing (#66 — run once a real Resend API key exists)

1. Order confirmation: place a real COD and a real online (test-mode) order → confirm delivery via
   Resend's own dashboard/logs, and confirm the exact fields present match this doc's list (no
   internal ids, no secrets).
2. Provider failure: temporarily set an invalid `RESEND_API_KEY` → place an order → confirm the
   order still succeeds and `email_log` records `status='failed'` with a safe reason.
3. Retry/idempotency: manually re-invoke the same order's confirmation path twice (e.g., replay a
   webhook) → confirm exactly one `email_log` row and one actual Resend send, not two. Use a
   Resend **test/sandbox address**, never a real customer's inbox, for all of the above — never
   spam real customers.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-29 | Claude | Initial version — shared email service (_shared/email/index.ts), email_log table + idempotency, order-confirmation/processing-delay/review-approved templates wired into create-order and payment finalize, abandoned-cart-recovery template built but disabled by default (ABANDONED_CART_RECOVERY_ENABLED, unset). No real Resend account existed in this environment — built entirely in the graceful "unconfigured" mode; not live-tested against a real send. |
| 2026-09-29 | Claude | Production-ops phase — Email Delivery admin page + admin-retry-email (retry_of/attempt_number model), sendContactNotification(), and a real FK bug fix in sendOrderProcessingDelay. Full detail in `Documentations MD/delite-production-operations.md`. |
