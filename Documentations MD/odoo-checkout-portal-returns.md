# Odoo Checkout Handoff / Customer Portal / Returns & Exchanges — Capability Audit

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Odoo-backed customer checkout, account, orders, returns/exchanges, and policy pages |
| File           | `Documentations MD/odoo-checkout-portal-returns.md` |
| Branch         | figma |
| Owner          | Claude |
| Status         | **Phase I implemented and deployed live.** Architecture confirmed by the user (React/Supabase checkout kept; Odoo-hosted checkout handoff explicitly rejected). Guest + authenticated checkout, address management, My Orders (merged Delite + legacy Odoo), Order Detail, return/exchange REQUEST capture, and policy pages are built and deployed. Automated return/exchange fulfillment (writing directly to Odoo inventory) was deliberately **not** attempted this pass — see "Return/exchange automation decision" below. |
| Created        | 2026-09-30 |
| Last updated   | 2026-09-30 |

## Summary

Phase I of this doc was a capability audit (below, preserved as-is) that answered one question:
can this project safely hand off checkout to Odoo's own hosted `website_sale` checkout, or should
it keep the existing React/Supabase checkout and use Odoo purely as the backend of record? The
audit found strong evidence this Odoo instance is Odoo Online (SaaS) hosting (no custom
server-side code possible) and that it is very likely the client's real, already-live store (real
`deliteauto.com` website, 82 real customers, 6 real portal users, an already-`enabled` live
Razorpay provider) — recommending the React/Supabase checkout be kept, with Odoo extended as the
backend-of-record.

**The user confirmed this architecture as final** and gave a full implementation spec. This
section of the doc (everything below "Implementation — Phase I") records what was actually built:
a durable Supabase-user ↔ Odoo-partner identity mapping, guest checkout (no password created),
authenticated-checkout prefill, Odoo-backed address management (no competing Supabase address
book), a merged My Orders view (Delite-tracked orders + legacy pre-React Odoo orders under the
same partner), a real Order Detail page (real line items, delivery/tracking state, return
eligibility), return/exchange **request** capture (not automated fulfillment — see below), and
policy pages/config/checkout-acceptance. One payment authority remains: the live Odoo-side
Razorpay provider was never touched; this project's own separate Razorpay integration
(`delite-payments.md`) is the only payment path this checkout uses.

## Why

The requested end-state (React storefront → signed handoff → Odoo-hosted checkout → Odoo payment →
Odoo portal/orders/returns) is a real, coherent architecture other Odoo-backed storefronts use. But
building it on an assumption of hosting/custom-code capability that turns out to be wrong would be
exactly the "guess instead of verify" mistake this project has repeatedly caught and fixed in every
earlier Odoo-integration phase (see `odoo-schema-report.md`, `odoo-real-catalog.md`). The explicit
instruction was to audit first and stop for a decision — this doc is that audit.

## How this was produced

A new, read-only, `x-internal-token`-gated diagnostic Edge Function,
`supabase/functions/odoo-checkout-capability-audit/index.ts` (same trust model as
`odoo-schema`/`odoo-write-check`/`odoo-catalog-classify` — fails closed, never writes, never
returns secrets, never samples `res.partner`/`sale.order` record data, only existence/counts for
those two). Deployed and run once against the live instance; every finding below is its real
output, not inferred from documentation. Re-run:
```
curl -X POST https://zafjmlwbolgdattfdgch.supabase.co/functions/v1/odoo-checkout-capability-audit \
  -H "Authorization: Bearer <publishable-key>" -H "x-internal-token: <INTERNAL_DIAGNOSTICS_TOKEN>"
```

## Audit findings

### Installed apps/modules (395 installed total)

| Module | Installed | Notes |
|---|---|---|
| `website` | ✅ | Website builder |
| `website_sale` | ✅ | eCommerce — native `/shop` checkout flow exists on this instance |
| `portal` | ✅ | Customer Portal |
| `payment` | ✅ | Payment Engine |
| `delivery` | ✅ | Delivery Costs |
| `stock` | ✅ | Inventory (needed for delivery/returns) |
| `account` / `account_accountant` | ✅ | Invoicing |
| `sale` / `sale_management` / `sale_stock` | ✅ | Sales + Sales-Warehouse bridge |
| `helpdesk` / `helpdesk_sale` | ❌ **Not installed** | No native after-sales "Return for Exchange" ticket flow (spec §33) available on this instance |

### Hosting / custom-addon capability — the critical constraint

**No tool available to this session can directly ask "what is the hosting plan."** Two independent,
real signals both point the same direction:

1. **`saas_website` is an installed module.** This is an Odoo-Online-(SaaS)-specific module,
   present only on Odoo's own multi-tenant SaaS hosting — not something a self-hosted or Odoo.sh
   instance would have installed.
2. **Every installed module's `author` field is Odoo/Odoo-family** (`Odoo S.A.`, `Odoo`, `odoo`,
   `OpenERP SA` — the last is Odoo's own pre-2014 legacy company name, still used as the author
   string on some of its own older-lineage modules). **Zero installed modules show any third-party
   or unrecognized author** — i.e., no evidence any custom code has ever been installed on this
   instance, which is exactly what "cannot install custom code" would look like from outside.

**Conclusion: custom addon/controller installation on this instance should be treated as NOT
available.** Odoo Online (SaaS) is a documented, hard platform restriction — custom Python
modules/controllers require Odoo.sh or on-premise hosting, neither of which this evidence
supports. This is the single fact that decides the architecture question below — verified as
carefully as external inspection allows, but **not 100% certain without asking whoever manages
this Odoo subscription directly** (their own billing/hosting page would confirm it outright; this
session has no access to that).

### ⚠️ This is very likely the client's real, currently-live store — not a sandbox

- `website` record: `{ id: 1, name: "DELITE AUTO", domain: "https://www.deliteauto.com" }` — a
  real production domain, the same one `productImages.ts`'s doc comment already cites as "the
  client's existing catalog."
- `res.partner`: **117 total, 82 customer-ranked** — real customer records, not test data.
- `res.users` with `share = true` (portal users): **6** — real customers already have live Odoo
  portal logins today.
- `payment.provider`: a real **Razorpay** provider, `code: "razorpay"`, **`state: "enabled"`**
  (live/production — not `"test"`). A separate, oddly-named `"DELITE MOTORS RAZORPAY"` provider
  exists at `state: "test"` with `code: "none"` (looks like an incomplete/abandoned manual setup,
  not a working provider). `"Cash on Delivery"` and `"Pay on Site"` are also real and `enabled`.

**Implication**: this Odoo instance most plausibly already powers (or very recently powered) the
client's actual live `deliteauto.com` storefront with real payments enabled, independent of this
React rebuild project. Any action here — a checkout handoff, a test order, a return, touching the
already-`enabled` Razorpay provider — has to be treated as touching a real production system with
real customers, not a scratch environment. (This also reframes something worth flagging, not
fixing here: `delite-accounts-orders-reviews-admin.md`'s prior test order, visible in this
session's own Payments/Orders screenshots as `"Claude Test Order - DELETE ME"` — already a real row
in this real database, tagged for deletion but not yet deleted. Worth confirming its cleanup
status with whoever administers the real Odoo account.)

### Native checkout flow

`website_sale` is installed (native `/shop` → cart → address → delivery → payment → confirmation
flow exists), but **not driven live this session** — the spec explicitly said not to make
production test purchases, and given the finding above (this may be the client's real live store),
that instruction is doubly correct. Module presence is real, verified evidence that the flow
exists; the exact route/step names were not re-clicked-through live.

### Customer account / signup mode

`ir.config_parameter`:
- `auth_signup.invitation_scope` = `"b2c"` — **open signup**, not invitation-only. Consistent with
  the target: customers aren't blocked from checking out by an Odoo-side account requirement.
- `auth_signup.reset_password` = `"True"` — self-service password reset is enabled on the Odoo
  side too (irrelevant to Delite's own auth, since Supabase remains the site identity per the
  architecture decision below, but confirms the setting isn't locked down in a way that would
  complicate a future portal-account flow either).

### Delivery

Only **2** `delivery.carrier` records: `"Standard delivery"` (`fixed` pricing) and `"Pick up in
store"` (`in_store`). No third-party carrier integration (no Shiprocket/Delhivery/etc. module) —
tracking, if ever shown, would be manually entered per-shipment, not fetched from a carrier API.

### Delivery tracking fields

`stock.picking` has `carrier_tracking_ref`, `carrier_tracking_url`, and `carrier_id` — the data
model supports a tracking link when one is entered, but nothing here confirms anyone currently
enters one operationally (not sampled — no real picking data was read).

### Returns (native)

`stock.picking` carries real return-related fields: `return_id`, `return_ids`, `return_count`,
`is_return_picking`, `return_label_ids` — Odoo's native reverse-transfer return mechanism is
present at the data-model level, matching the documented Odoo 19 portal "Your Orders → Order →
Return" feature. **Not live-clicked-through** this session (would require a real delivered order in
this real database — declined per "do not make production test purchases", now doubly justified).

### Exchange (native)

**No Helpdesk app** → no native "Return for Exchange" ticket-based replacement workflow (spec
§33's preferred path isn't available). Any exchange flow would need to be built as a **stock
operation pair** (a return-picking for the original item + a new outgoing delivery for the
replacement) directly against `stock.picking`/`sale.order`, not through Helpdesk — a real, buildable
pattern, just not the more turnkey one the spec described as the fallback-preferred option.

### Invoicing

`account.move` exists (Invoicing/Accounting app installed) — a customer portal could plausibly
show real invoice links for delivered/invoiced orders, though this wasn't traced against a real
order this session.

## Chosen architecture (recommendation — needs your explicit sign-off, not yet acted on)

**Keep the React/Supabase checkout. Use Odoo purely as the backend system of record** for
customer/address/order/delivery/return/portal data — the spec's own explicitly-permitted fallback
when hosted checkout "cannot be safely achieved due to hosting/API/session constraints."

**Reasoning:**
1. **Custom-controller-based handoff is the architecturally correct way to do this safely**
   (spec §12: validate a signed token, resolve/create the Odoo cart, re-price server-side, redirect
   into native checkout) — and the audit found strong evidence this instance cannot run custom
   server-side code at all (SaaS hosting signal, zero non-Odoo-authored modules).
2. **Without a custom controller, there is no safe way to hand off a cart into Odoo's own checkout
   session from an external, decoupled React app.** The only alternatives are all worse: scripting
   Odoo's own web session/cookies from outside (explicitly forbidden by the spec, §13: "do not hack
   Odoo cookies externally"), or a server-created quotation + a bare payment link (loses the
   Order-Summary/Address/Delivery steps entirely, becoming a materially different, worse checkout
   than either option).
3. **This instance is very likely the client's real live store already.** Redirecting Delite's
   in-progress React customers into a website that may already be running its own real live
   storefront for the same business, with its own real customer base and its own already-enabled
   payment provider, is a business/product question (which storefront is the real one going
   forward?) that is well outside the scope of a technical architecture decision, and risky to act
   on unilaterally.
4. **The fallback architecture is largely already built and live-verified.** `create-order`/
   `finalizePaidAttempt()` already create real `sale.order` records via JSON-RPC
   (`delite-payments.md`, `delite-accounts-orders-reviews-admin.md`) — the "React checkout, Odoo as
   backend" shape isn't a new build, it's the existing system, with room to extend (customer
   mapping, order-detail/tracking read, returns) rather than replace.

**What this recommendation does NOT decide**: whether/how to reconcile this React storefront with
whatever `deliteauto.com` is currently running on this same Odoo instance. That's a real open
question for whoever owns the Odoo subscription/business relationship, not something inferable
from module lists.

## What was explicitly NOT built in the audit pass (per "STOP after the report")

At the end of the audit pass (above), nothing below existed yet. **Everything in this list was
subsequently built** in the implementation pass documented from "Implementation — Phase I" onward:
`profiles.odoo_partner_id` mapping, checkout prefill/guest-checkout, customer-facing Orders/
Order-Detail/Returns/Addresses UI, policy pages, return-eligibility logic, return/exchange Edge
Functions. Two items remain genuinely not built, by design — see "Return/exchange automation
decision" and "Known issues / follow-ups" below: a signed Odoo-hosted-checkout handoff (the
architecture decision rejected this path), and automated Odoo-side return/exchange fulfillment
(inventory-affecting writes) — return/exchange **requests** are captured and require manual Odoo
processing.

## Implementation — Phase I (customer checkout, account, orders, returns, policies)

Built after the user reviewed the audit above and gave explicit final sign-off: **keep the React
checkout; do not use Odoo-hosted checkout; do not redirect the cart into Odoo Website checkout.**
Odoo's own already-`enabled` live Razorpay provider inside the client's separate Odoo website was
never touched — this checkout's only payment authority is this project's own Razorpay integration
(`delite-payments.md`).

### Identity mapping (Supabase ↔ Odoo)

`profiles.odoo_partner_id` (new column, unique-indexed where not null) is the durable mapping. It
is **never** trusted from the client — every Edge Function that needs the caller's Odoo customer
id derives it server-side from `auth.uid()` only. Resolution logic lives in one shared module,
`supabase/functions/_shared/orders/customerIdentity.ts` (`resolveCustomer()`), used by every order-
creation and account path (`create-order`, `_shared/payments/finalize.ts`,
`admin-retry-odoo-order-sync`, `customer-addresses`):

1. Mapped fast path — `profiles.odoo_partner_id` if already set.
2. A live, exact (normalized) email search against `res.partner` (`limit: 3`): 0 matches → create;
   exactly 1 → reuse; **2+ → never guess — create a fresh contact instead** and flag
   `ambiguousMatch` for logging. This replaces the old `findOrCreatePartner()`'s unsafe `limit: 1`
   silent pick, which could have silently attached an order to the wrong existing customer.
3. Delivery address modeling: a real Odoo child `res.partner` (`type: 'delivery'`,
   `parent_id` = the customer's own partner) is found-or-created per distinct address, reusing an
   existing child with the same street/street2 rather than creating a duplicate on every repeat
   order to the same address, and — critically — **no longer overwrites the customer's own parent
   `street` field on every order**, which is what the pre-Phase-5 `findOrCreatePartner()` did.
   `sale.order.partner_invoice_id`/`partner_shipping_id` are now both written explicitly (default
   to the parent partner if delivery-address resolution has any problem — never blocks checkout
   over this).

### Guest checkout

Supabase anonymous auth was tested directly (`POST /auth/v1/signup` with an empty body — the
mechanism `supabase-js`'s `signInAnonymously()` uses) and confirmed **disabled** on this project
(`422 anonymous_provider_disabled`, no side effect, dashboard-only toggle, no tooling available to
flip it). Chose the more spec-literal path instead: `orders.user_id` is now nullable, and every
order-creation Edge Function (`create-order`, `payment-create`, `payment-verify`, `razorpay-webhook`
— the last two by dependency, since they call the same `finalize.ts`) accepts an **optional**
`Authorization` header:

- Present and valid → authenticated checkout (unchanged behavior).
- Absent → guest checkout, requires `guestEmail` (validated) and a full structured address in the
  body; no Supabase account is created, no password is set.
- Present but invalid/expired → still a hard `401` — a stale session is never silently downgraded
  to guest.

All four of those functions are deployed with `verify_jwt: false` at the platform level (a guest
request carries no valid Supabase JWT at all, so the platform-level check would reject it before
the function code ever ran) — the function body itself still does its own strict verification when
a header is present.

### Authenticated-checkout prefill + addresses (Odoo-backed only)

`Checkout.tsx` prefills from `customer-profile` (name/email/phone/default address) and
`customer-addresses` (`{action: "list"}` — saved delivery addresses) on mount when a session
exists. A radio-button saved-address selector falls back to a 5-field structured form
(line1/line2/city/state/pincode) for a new address. **No competing Supabase-only address book was
created** — Odoo remains the single address store (`customer-addresses`'s `{action: "add"}`
always derives the parent partner id server-side; the browser can never supply one). Editing/
deleting a saved address is explicitly deferred (documented in `AccountAddresses.tsx`) — add/list
only this pass.

### My Orders (merged Delite + legacy Odoo) and Order Detail

`customer-orders` returns a list merged from two sources, deduped by `odoo_sale_order_id`: orders
this app itself placed (direct Supabase read, fast path) plus any *other* real `sale.order` records
under the same mapped partner — i.e., orders placed before this customer ever had a React account,
surfaced as `source: "legacy"`. Legacy orders never show a fabricated payment state (no Delite
`payment_attempts` row exists for them — their payment authority was whatever the original
Odoo-side checkout used, never this app's Razorpay integration).

`customer-order-detail` re-verifies ownership server-side before returning anything, for **both**
id shapes it accepts:
- `orderId` (Delite-tracked): row must belong to `auth.uid()`.
- `odooSaleOrderId` (legacy): the underlying `sale.order.partner_id` must equal the caller's own
  mapped `profiles.odoo_partner_id`.

Any mismatch or non-existent id returns an identical `404` either way — never a `403` that would
confirm an id exists to an attacker probing sequential ids. Returns real line items (with
already-requested-return quantity), real address, real `sale.order`/`stock.picking` state (no
fabricated Processing/Shipped/Delivered unless the picking record actually supports it), real
carrier tracking fields when present, and payment state **only** for Delite-tracked orders (`null`
for legacy).

### Return/exchange request architecture — automation decision

The spec's own explicit escape valve: if safe automated Odoo reverse-transfer creation "cannot be
proven through external API, stop that write portion and build return REQUEST capture + admin/
Odoo manual processing as Phase 1. Never risk corrupting live inventory." That's exactly what
happened. `odoo-checkout-capability-audit` (redeployed to v2, re-run) added `auditReturnWizardSafety()`
— confirmed `stock.return.picking`/`stock.return.picking.line` are both reachable via `fields_get`
and that `product_return_moves` (the wizard's own field evidencing a `create_returns()` -style
method) exists. **But** model-reachability is not the same as safe external callability: Odoo's
return wizard is a `TransientModel` whose real behavior depends on internal Python `default_get`/
`_get_moves` context-injection logic (normally supplied by the Odoo web client clicking "Return")
that cannot be safely replicated from outside without risking an incorrect reverse stock move
against a real, live inventory. Conclusion: **do not attempt automated Odoo-side return/exchange
creation this pass.**

What was built instead: `return_requests` (new table) is a **request record only** — never
inventory-return truth. `return-request` (Edge Function) re-verifies every eligibility rule
server-side against live Odoo/Supabase data (the frontend's own display of eligibility is
convenience only, never trusted back):
1. Order belongs to the caller (`auth.uid()`).
2. The requested variant was actually a line on that order.
3. The order's delivery (`stock.picking`) is `state = 'done'` with a real `date_done`.
4. `today <= date_done + RETURNS_WINDOW_DAYS` — **delivery** date, never order/payment date.
5. Requested quantity ≤ delivered quantity minus already-requested (non-rejected) quantity for
   that exact order+variant — no double-returning more than was ever delivered.

Any failure returns a clear 4xx, never a fabricated "Requested" confirmation. A real, honest status
model backs the row: `requested → approved/rejected → completed`, with `status='requested'` **never**
labeled "Returned"/"Refunded"/"Exchange complete" anywhere in the UI — those labels are reserved for
real Odoo/payment state, which this table does not yet drive (matches the spec's own explicit rule
that a Supabase request row alone must never imply a real return/refund/exchange happened).
Approval/rejection/completion is an **admin/Odoo manual process this pass** — no admin UI for
processing requests was built (out of scope for this pass; `return_requests` already has an
`admin`/`support`-role RLS select policy for direct read access via SQL/future tooling).

**Refund is not automated.** No code in this pass issues a Razorpay refund. Per the spec: refund is
a controlled, separate operation that happens only after a return is physically received/approved
— building that trigger is explicitly future work, not attempted here.

### Policy pages, config, checkout acceptance

`RETURNS_WINDOW_DAYS`/`POLICY_VERSION` are defined identically in two places —
`supabase/functions/_shared/policy/config.ts` (Deno) and `src/lib/policy.ts` (Vite frontend) —
duplicated deliberately rather than shared, since these are two separate, non-shared build/deploy
targets in this project; each file's comment cross-references the other so a future policy change
isn't made in only one place by accident. Three new plain-English policy pages
(`src/pages/policies/{ShippingPolicy,ReturnsPolicy,PrivacyPolicy}.tsx`, via a shared `LegalLayout`)
each carry an explicit **"CLIENT POLICY REVIEW REQUIRED"** banner — these are a temporary baseline,
not the client's real confirmed legal terms. Checkout now requires an explicit acceptance checkbox
(linking Terms + Returns/Refund policy) before either COD or online payment can be submitted;
`orders.policy_version`/`policy_accepted_at` record what was actually accepted, when.

### Frontend

- `Checkout.tsx` — completely rewritten: guest vs. authenticated branches, saved-address selector,
  structured 5-field address form, policy-acceptance checkbox, passes `address`/`guestEmail`/
  `policyVersion`/`policyAccepted` through to both COD and online-payment paths.
- `OrderConfirmation.tsx` — rewritten to prefer the order summary passed via React Router
  `navigate(..., {state})` from Checkout (works identically for guests, who have no RLS-readable
  row) over an RLS-gated Supabase fetch, which now only runs as a fallback when `state` is absent
  **and** a session exists; an honest "finalizing" message otherwise (never a fabricated error).
- `src/pages/account/` (new) — `AccountLayout` (sidebar nav + sign-out), `AccountOverview` (3 recent
  orders + quick links), `AccountOrders` (full merged list), `AccountOrderDetail` (delivery status,
  line items with an inline `ReturnForm`, address, payment info — handles both a real order UUID and
  a synthetic `legacy-${odooSaleOrderId}` route param), `AccountReturns` (direct RLS-protected read
  of the caller's own `return_requests`, explicit "REQUEST only" framing), `AccountAddresses`
  (list + add), `AccountProfile` (name/phone edit; email read-only; links to the existing
  forgot-password flow for security-sensitive changes — moved here from the old `Account.tsx`,
  which is now deleted).
- `App.tsx` — `RequireAuth` removed from `/checkout` and `/order/:id` (guest-reachable); old
  `/account` route replaced with the nested `account/*` tree above; 3 new policy routes added.
- `Footer.tsx` — fixed a real pre-existing bug found along the way (Privacy Policy link pointed at
  `/terms` — no privacy page existed until this pass); added the new Shipping Policy link; My
  Orders/Returns links now point at the new real pages instead of stubs.

**i18n scope decision**: all new Phase 5 UI ships in English only (existing `en`/`hi`/`gu` keys in
`Checkout.tsx` were reused where already wired) rather than either skipping guest/returns
functionality or producing ~100+ unreviewed bulk translations presented as equally vetted as the
existing content — a pragmatic scope trade-off, not a silent gap; flagged here for a follow-up
translation pass.

### Migrations (one, additive-only)

`supabase/migrations/20260930150000_customer_mapping_guest_orders_returns.sql` — applied live.
No existing migration edited.
- `profiles.odoo_partner_id integer`, unique-indexed where not null.
- `orders.user_id` — `NOT NULL` dropped (guest orders); `orders.guest_email`/`guest_name`/
  `odoo_partner_id`/`policy_version`/`policy_accepted_at` added. `orders_user_id_fkey`'s existing
  `ON DELETE CASCADE` is safe with a nullable FK (an orphaned guest order simply has `user_id`
  remain `null`, never cascades).
- `return_requests` (new table): `order_id`/`odoo_sale_order_id`/`odoo_partner_id`/
  `odoo_variant_id`/`odoo_picking_id`/`quantity`/`type` (return|exchange)/`reason` (enum)/`note`/
  `desired_replacement_variant_id`/`status` (requested|approved|rejected|completed)/
  `odoo_return_picking_id` (nullable — populated only if/when a future pass does the manual-or-
  automated Odoo-side fulfillment). RLS: caller can `select` their own rows
  (`auth.uid() = user_id`); `owner`/`admin`/`support` roles can `select` all rows (matches this
  project's existing admin-role pattern) — no direct-client `insert`/`update` policy exists
  (writes go only through the `return-request` Edge Function's service-role client, which is where
  all the eligibility enforcement lives).

### Deployment

10 Edge Functions deployed for this phase: `create-order`, `payment-create`, `payment-verify`,
`razorpay-webhook` (redeployed — depends on the changed shared modules, code itself unchanged),
`admin-retry-odoo-order-sync` (all `verify_jwt` unchanged/`false` for the guest-reachable four,
`true` for the admin one), plus 5 brand-new functions all `verify_jwt: true`
(`customer-profile`, `customer-addresses`, `customer-orders`, `customer-order-detail`,
`return-request`). `admin-retry-email`/`review-notify`/`contact-submit` were **not** redeployed —
they only depend on the unchanged parts of `_shared/email/index.ts` (the one addition,
`sendReturnRequestReceived`, is new/unused by them). Post-deploy `get_advisors(security)` re-run:
zero new findings — the pre-existing `anon_security_definer_function_executable`/
`authenticated_security_definer_function_executable`/`auth_leaked_password_protection` findings are
all unrelated analytics RPCs and the already-known leaked-password-protection toggle, not touched
by this pass.

## Interfaces / data

- New Edge Function `odoo-checkout-capability-audit` (`x-internal-token` gated, read-only,
  kept as a re-runnable diagnostic like `odoo-schema`/`odoo-write-check`) — extended in the
  implementation pass with `auditReturnWizardSafety()`.
- New shared module `_shared/orders/customerIdentity.ts` (`resolveCustomer()`,
  `resolveDeliveryAddress()`, `formatShippingAddress()`) — the one place partner/address identity
  is resolved; replaces the old inline `findOrCreatePartner()`.
- New shared module `_shared/orders/mirrorOrder.ts` (`mirrorOrderFromAttempt()`) — factors out the
  "insert the local `orders` mirror, backfill `payment_attempts.order_id`" sequence shared by
  `create-order` and `admin-retry-odoo-order-sync`.
- New shared config `_shared/policy/config.ts` / `src/lib/policy.ts` (`RETURNS_WINDOW_DAYS`,
  `POLICY_VERSION`, `POLICY_LINKS`).
- New Edge Functions: `customer-profile`, `customer-addresses`, `customer-orders`,
  `customer-order-detail`, `return-request` (all documented in "Implementation" above).
- New table `return_requests`; new columns on `profiles`/`orders` (see "Migrations" above).

## Dependencies

Depends on the existing `_shared/odoo/client.ts` JSON-RPC client (no changes made to it), the
existing `ODOO_BASE_URL`/`ODOO_DATABASE`/`ODOO_USERNAME`/`ODOO_API_KEY`/`INTERNAL_DIAGNOSTICS_TOKEN`
Supabase secrets (no new secrets added), and this project's own separate Razorpay integration
(`delite-payments.md`) — the live Odoo-side Razorpay provider found during the audit was never
read again, configured, or touched by the implementation pass.

## Testing / verification

`npx tsc --noEmit`, `npm run lint`, and `npm run build` all ran clean after every frontend change.
All 10 Phase 5 Edge Functions were deployed live and confirmed `ACTIVE` via `list_edge_functions`
with the intended `verify_jwt` value on each. `get_advisors(security)` re-run post-deploy: no new
findings. Per the spec's explicit test-safety constraint ("no automated tests may create
uncontrolled production orders/customers/returns — this is LIVE Odoo"), **no new Playwright/E2E
tests were written against the live checkout/order/return flow this pass** — that remains a real
gap (see below), not silently skipped.

## Known issues / follow-ups

- **No automated test coverage for the new checkout/account/return flows.** The existing
  `admin-security-hardening.spec.ts` suite is unaffected and still passes, but guest checkout,
  address save, My Orders merge, Order Detail ownership enforcement, and return-request eligibility
  have only been verified by code review + the type/lint/build pipeline, not a live browser
  click-through or a mocked-Odoo-write test harness — both explicitly permitted approaches per the
  spec, neither built yet.
- **No admin UI for processing return requests** (approve/reject/mark-completed, and the manual
  Odoo-side reverse-transfer + refund that would follow an approval) — `return_requests` rows can
  currently only be read directly (RLS-permitted for `owner`/`admin`/`support`) or via SQL; building
  a proper Admin Returns queue is real, scoped follow-up work.
- **Refund is entirely unautomated** — by design this pass, per the spec's own explicit
  "refund only after return received/approved, as a separate controlled operation" rule. No trigger
  exists yet to even prompt an admin that a refund is due.
- **`"Claude Test Order - DELETE ME"`** (flagged in the audit above) was not investigated or deleted
  by this pass either — still worth confirming its cleanup status with whoever administers the real
  Odoo account.
- **i18n**: all new UI is English-only this pass (see "Frontend" above) — existing `hi`/`gu`
  translations were not extended to the new checkout/account/policy strings.
- **Address edit/delete** is deferred — `customer-addresses` only supports list/add this pass.
- Everything already listed as unresolved in the original audit (hosting-type inference, the
  `deliteauto.com` live-status question, no Helpdesk app) remains unresolved — none of it was
  re-investigated by the implementation pass.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-30 | Claude | **Implementation pass.** Following user sign-off on the architecture recommended by the audit below, built and deployed live: `profiles.odoo_partner_id` identity mapping (`resolveCustomer()`, ambiguity-safe, never trusts a client-supplied partner id), guest checkout (`orders.user_id` nullable, optional-auth pattern across `create-order`/`payment-create`/`payment-verify`), authenticated-checkout prefill + Odoo-backed address management (no competing Supabase address book), merged My Orders (Delite-tracked + legacy Odoo orders, deduped), real Order Detail (ownership re-verified server-side for both id shapes, real line items/delivery/tracking), return/exchange **request** capture with full server-side eligibility re-verification (delivery-date-based window, quantity-remaining guard) after `auditReturnWizardSafety()` found automated Odoo-side return creation cannot be proven safe against this instance's `TransientModel` wizard — refund and Odoo-side fulfillment remain explicitly manual/future work — plus policy pages/config/checkout-acceptance. One additive migration; 10 Edge Functions deployed (5 new, 5 modified); `tsc`/lint/build clean; `get_advisors` clean. No new automated tests written this pass (documented as a real gap, not silently skipped) — the live-Odoo test-safety constraint made that the more honest choice than a rushed, potentially production-order-creating suite. |
| 2026-09-30 | Claude | Initial version — Odoo checkout/portal/returns capability audit. New read-only `odoo-checkout-capability-audit` Edge Function deployed and run once. Found: `website_sale`/`portal`/`payment`/`delivery`/`stock`/`account`/`sale*` all installed; `helpdesk` not installed; strong evidence (SaaS module signature, zero non-Odoo-authored modules) that custom addon/controller installation is unavailable; a real, already-`enabled` (live) Razorpay payment provider, a real website record for `deliteauto.com`, 82 real customers and 6 real portal users — strong evidence this instance is the client's actual live store, not a sandbox. Recommended architecture: keep the React/Supabase checkout, extend Odoo's role as backend-of-record (customer mapping, order/delivery/return reads, native return records) rather than attempt a hosted-checkout handoff. No checkout/portal/returns implementation code written, per explicit instruction to stop after this report. |
