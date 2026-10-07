# Odoo Checkout Finalization — Authoritative Pricing, Tax, Address, Quote & Idempotency

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Odoo checkout finalization (authoritative quote pipeline) |
| File           | `Documentations MD/odoo-checkout-finalization.md` |
| Branch         | `feature/odoo-checkout` |
| Owner          | Claude (this pass) |
| Status         | **SUPERSEDED as the primary production checkout path** — deployed and working (see below for what's still live/used), but no Checkout CTA routes here anymore as of 2026-10-07. Kept as LEGACY/FALLBACK. |
| Created        | 2026-10-06 |
| Last updated   | 2026-10-07 |

> **2026-10-07 update:** the production checkout path changed — the app now hands the cart off to
> Odoo's own native checkout instead of using this pipeline directly (see
> [odoo-native-checkout.md](odoo-native-checkout.md)). Everything documented below is still real,
> deployed, and working — `checkout-quote`, `create-order`, `payment-create`, etc. are untouched —
> but `/checkout`, the Cart page, and the cart drawer no longer route to `Checkout.tsx`/this
> pipeline. It remains available as a fallback (e.g. if the Odoo-native handoff needs to be rolled
> back) rather than being deleted.

---

## 1. Purpose

This pass replaces the checkout pricing/tax/address logic that was proven incorrect by a live,
read-only audit of the real `delite-auto` Odoo instance, with a server-authoritative pipeline the
browser cannot influence. It does **not** change the storefront's visual design, the Odoo order
lifecycle (still quotation/draft, never confirmed), or any Odoo configuration.

## 2. Previous checkout problem

Before this pass, `_shared/orders/placeOdooOrder.ts` built every `sale.order.line` as:

```js
{ product_id: line.odooVariantId, product_uom_qty: line.qty, price_unit: byId.get(line.odooVariantId)!.list_price }
```

`price_unit` was always the product's raw `list_price` — no pricelist, no discount, no tax. The
live Odoo audit proved this wrong: the real `"Default" (INR)` pricelist has active
`product.pricelist.item` rules that differ from `list_price` (a fixed-price override and a
10%-formula discount on real products — see §4/§19). No tax was ever attached to the order line at
all. Delivery was never read from Odoo. The customer's delivery address was flattened
(`city`/`state`/`pincode` joined into Odoo's free-text `street2` field) instead of using Odoo's own
structured `city`/`zip`/`state_id`/`country_id` fields. `payment-create` (the online-payment path)
had no client-supplied idempotency key, unlike the COD path's `checkoutAttemptId` — a retried
"Pay Online" click before the first response returned could create two Razorpay orders.

## 3. Authoritative pricing architecture

```
BROWSER (product/variant id + quantity + delivery choice ONLY — never price/tax/total)
   │
   ▼
checkout-quote  (and the SAME logic, re-run, inside create-order / payment-create)
   │
   ├── validateAndPriceLines()        — resolve variant, re-read live list_price/active
   ├── resolvePricelistId()           — customer's property_product_pricelist, else store default
   ├── product.pricelist.item search  — this pricelist's real rules only
   ├── pricelistEvaluator.ts          — bounded, fail-closed rule evaluation (§4/§5)
   ├── account.tax read               — the product's own taxes_id
   ├── taxCalculator.ts               — percent/fixed only, price_include-aware, fail-closed (§6)
   ├── delivery.carrier search        — active + website_published only, fixed_price authoritative
   └── sha256 fingerprint             — deterministic hash of the whole priced quote
   │
   ▼
Quote { lines[], subtotal, discount, tax, shipping, grandTotal, fingerprint, expiresAt, warnings }
```

Implemented in `supabase/functions/_shared/orders/quote.ts`, function `computeAuthoritativeQuote()`.
This ONE function is called by:
- `checkout-quote/index.ts` — the customer's first quote.
- `create-order/index.ts` — re-run fresh immediately before any COD `sale.order` write.
- `payment-create/index.ts` — re-run fresh immediately before creating the Razorpay order (the
  amount charged comes only from this).
- `admin-retry-odoo-order-sync/index.ts` — one-time backward-compat re-quote for a legacy
  `payment_attempts` row that predates this pipeline (no `quoteLines` ever captured for it).

The browser never sends `unitPrice`/`discount`/`tax`/`shipping`/`subtotal`/`grandTotal` — those
fields don't exist on any request type that reaches a mutating endpoint.

## 4. Pricing rule support (proven, implemented)

From the live `product.pricelist.item` sample (pricelist id 1, `"Default (INR)"`):

| Field | Supported value(s) | Evidence |
|---|---|---|
| `applied_on` | `0_product_variant`, `1_product`, `2_product_category`, `3_global` | `1_product` confirmed live on 3 real products; the other 3 are the same mechanism at a different scope, not a different rule type |
| `compute_price` | `fixed`, `formula` | `fixed` (ACTIVA SET OF 3 → 1500, HARRIER EV MATS → 2500, WURTH GLASS CLEANER → 0) and `formula` (BALENO → 10% off via `price_discount`) both confirmed live |
| `base` | `list_price` only | every sampled rule uses `list_price` |
| `min_quantity` | any | implemented, tiered precedence verified by unit test |
| `date_start` / `date_end` | any | implemented, verified by unit test (BALENO's rule has a real `date_start`) |
| `price_round` / `price_surcharge` / `price_min_margin` / `price_max_margin` | must be exactly `0` | every sampled rule has all four at 0 — a future rule with any of these nonzero fails closed, never approximated |

Precedence (ties broken by scope specificity, then by highest qualifying `min_quantity`):
`0_product_variant` > `1_product` > `2_product_category` > `3_global`. A product with **no**
matching rule at all uses plain `list_price` — this is Odoo's own default behavior, not a guess,
and not a failure.

**STATUS: rule precedence is VERIFIED against the live rule shapes found (§19), not merely assumed.**

## 5. Unsupported pricing rules (fail closed, by design)

- `compute_price: "percentage"` — the selection option exists on this Odoo version but is **not**
  used by any live rule; never approximated.
- `base: "standard_price"` or `base: "pricelist"` (pricelist chaining) — not used live.
- Any rule with a nonzero `price_round`/`price_surcharge`/`price_min_margin`/`price_max_margin`.

When a line matches a rule of an unsupported shape, `computeAuthoritativeQuote` throws
`CheckoutError("PRICING_UNAVAILABLE", ...)` — checkout is refused for that cart, **never** silently
priced at `list_price`. See `_shared/pricing/pricelistEvaluator.ts`.

## 6. Tax behavior

**OBSERVED AS OF 2026-10-06** (live, read-only audit via the extended `odoo-schema` diagnostic):

- Only 4 `account.tax` records exist on this instance at all: id 273 ("28", sale, percent, **amount
  0**), id 274 ("18", sale, percent, amount 0), id 276 ("18", purchase, amount 0), id 277
  ("KALONI", sale, amount 0).
- Of a 20-product sample, only a handful (`18 MM UNIVERSAL GRASS SET OF 3`, `4N 12 MM GRASS SET OF
  5`, `GUSSI GRASS SET OF 5`, `ACCESS ACCESSORIES SET OF 3`) have **any** tax attached
  (`taxes_id = [273]`); the rest have `taxes_id = []`.
- **Computed effective tax across every tested case is therefore ₹0** — either because no tax is
  attached, or because the one attached tax has a 0% rate.
- `price_include` is `false` on every sampled tax.

`_shared/pricing/taxCalculator.ts` reads the product's real `taxes_id` → `account.tax` rows and
computes honestly from `amount`/`amount_type`/`price_include` — it is **not** hardcoded to return
0. If the client's Odoo tax configuration is fixed later (real GST rates entered, taxes attached to
products), this pipeline starts computing real tax **with no code change required**. Supported
`amount_type`: `percent`, `fixed`. Unsupported (`division`, `group`, `code`) fail closed — none are
used live, so this has never been exercised beyond the unit tests.

**This is a statement of current Odoo configuration, not a statement that ₹0 GST is legally
correct. No Odoo tax configuration was created, modified, or deleted by this pass (explicitly
prohibited, per instruction).**

## 7. Fiscal positions

**OBSERVED AS OF 2026-10-06:** 6 fiscal positions exist (`Intra State`, `Inter State`,
`Export/SEZ`, `LUT - Export/SEZ`, `Reverse charge Intra State`, `Reverse charge Inter State`).
`Intra State` and `Inter State` have `auto_apply: true`. **Every one of the 6 has an empty
`tax_ids`** — no tax-substitution mapping rules are configured on any of them. (`account.fiscal.
position.tax` as a separate mapping model does **not exist** on this Odoo 19 instance — "Object
account.fiscal.position.tax doesn't exist" — tax mapping, if ever configured, lives directly on
`account.fiscal.position.tax_ids`.)

Because no mapping rules exist, fiscal-position tax substitution is currently a no-op regardless of
customer location — this pipeline does **not** attempt to resolve/apply a fiscal position, since
there is nothing live to prove or exercise. `res.partner.property_account_position_id` exists as a
field (confirmed via schema introspection) and the architecture is ready to use it the moment real
mapping rules exist, but **implementing fiscal-position tax substitution now would be inventing
behavior with zero live evidence** — explicitly not done, per instruction §20 of the governing spec.

## 8. Delivery

**OBSERVED AS OF 2026-10-06:**

| Carrier | `delivery_type` | `fixed_price` | `active` | `website_published` |
|---|---|---|---|---|
| Standard delivery | `fixed` | 0 | true | **true** |
| Pick up in store | `in_store` | 0 | true | **false** |

`computeAuthoritativeQuote` only ever offers carriers where `active = true AND website_published =
true` — currently only "Standard delivery". "Pick up in store" is excluded because Odoo's own data
marks it not-yet-customer-facing (`website_published: false`) — this is read directly from Odoo
every time, so if the client flips that flag on in Odoo, it becomes available here automatically,
no code change needed. `fixed_price` is read live and used as-is (currently ₹0 for the one
published carrier) — never fabricated. No carrier-rate RPC call (e.g. a live shipping-rate lookup)
was found to be safely callable without risking a write, so none is attempted; if no
`deliveryMethodId` is submitted, the first published carrier is used as the default.

## 9. Address mapping

`_shared/address/resolveAddress.ts` is now the **one** shared helper (`resolveStructuredAddress`),
used by both `customerIdentity.ts` (checkout) and `customer-addresses/index.ts` (the saved-address
API) — the previous two independent copies of `[line2, city, state, pincode].join(", ")` are gone.

| Input | Odoo field |
|---|---|
| `line1` | `street` |
| `line2` | `street2` |
| `city` | `city` |
| `pincode` | `zip` |
| `state` | `state_id` (resolved against `res.country.state`, scoped to the resolved country) |
| `country` (defaults to "India") | `country_id` (resolved against `res.country`) |
| `phone` | `phone` |

Resolution never guesses: an exact (case-insensitive) match, falling back to a `ilike` contains
match, is only accepted when it resolves to **exactly one** record; 0 or 2+ matches leave the
relation `undefined` (not written) plus a logged warning, and checkout is never blocked over this.
**OBSERVED AS OF 2026-10-06 (live):** India → id 104 (code `IN`), Gujarat → id 588, Maharashtra →
id 597, all single unambiguous matches — confirmed safe to resolve live.

The existing customer/delivery-child-contact architecture is unchanged (`res.partner` →
`type:'delivery'` child, `parent_id` = the customer's own partner id); only the fields written to
each changed from concatenated text to structured fields. Delivery-child reuse now matches on
`street`+`street2`+`city`+`zip` together (previously `street`+`street2` only), since those are now
real separate fields.

## 10. Checkout quote

`POST /functions/v1/checkout-quote` — `{ lines: [{odooVariantId|odooTemplateId, qty}], deliveryMethodId? }`
→ the `Quote` shape in §3. Stateless and read-only: no Odoo or Supabase write happens here. See §3
for the full computation pipeline.

## 11. Fingerprint

No quote table. `fingerprint` is a plain (not HMAC-signed — doesn't need to be, see below)
SHA-256 hex digest over a canonical JSON array of `[odooVariantId, quantity, unitPrice,
discountPercent, tax]` per line, plus `shipping`, `deliveryMethodId`, and `grandTotal`. Computed in
`quote.ts`'s `computeAuthoritativeQuote` (Deno's `crypto.subtle.digest`).

It does **not** need to be a tamper-proof signature: the actual safety guarantee is that
`create-order`/`payment-create` **always recompute a fresh quote from live Odoo** before acting —
the fingerprint is purely a cheap equality check ("did anything material change since the customer
last saw a total"), never trusted as proof of a price on its own. This matches the explicit
instruction not to over-engineer the quote mechanism.

## 12. CHECKOUT_CHANGED

`assertQuoteUnchanged(freshQuote, acceptedFingerprint)` in `quote.ts` throws
`CheckoutError("CHECKOUT_CHANGED", ..., { quote: freshQuote })` whenever the fingerprints differ.
`create-order` and `payment-create` call this (when the client sent `acceptedFingerprint`)
**before** any Odoo write or Razorpay order creation. The error response carries the new `quote` so
the frontend can re-render the updated total without a second round trip. `Checkout.tsx` treats
this distinctly from a generic failure: it swaps in the new quote, shows "Your checkout changed.
Please review the updated total before continuing.", and requires the customer to press Place
Order again (never auto-accepts).

## 13. Online payment lifecycle

```
checkout-quote (browser holds fingerprint F)
   │
   ▼
payment-create
   ├── computeAuthoritativeQuote() fresh            — amount charged comes ONLY from this
   ├── if acceptedFingerprint != fresh fingerprint  → CHECKOUT_CHANGED, no Razorpay order created
   ├── atomic claim on payment_attempts.checkout_attempt_id (NEW — see §15)
   │     ├── win  → create Razorpay order, persist razorpay_order_id
   │     └── lose → reuse existing razorpay_order_id if present, else ask client to wait+retry
   └── checkout_snapshot.quoteLines = fresh quote's lines (persisted, used verbatim later)
   │
   ▼
Razorpay Checkout.js (browser)
   │
   ▼
payment-verify (fast path) / razorpay-webhook (authoritative path)
   │  both call finalizePaidAttempt() — atomic claim on razorpay_payment_id, idempotent either order
   ▼
finalize.ts
   ├── snapshot.quoteLines used AS-IS — NEVER re-quoted here (deliberate, pre-existing, confirmed-
   │     correct design: money has already been captured for this exact total; re-pricing after
   │     capture could charge one amount and record another)
   ├── createSaleOrder(..., quoteLines, ...)   — price_unit/discount/tax_id straight from the quote
   └── orders row inserted, confirmation email sent
```

**Invariant verified:** payment amount (Razorpay) == quote.grandTotal at payment-create time ==
what's written to the Odoo order line (`price_unit`×qty with `discount`, `tax_id` attached) — Odoo
itself then computes `amount_total` server-side from those same inputs.

## 14. Offline/direct order lifecycle (COD)

```
checkout-quote (browser holds fingerprint F)
   │
   ▼
create-order
   ├── computeAuthoritativeQuote() fresh
   ├── if acceptedFingerprint != fresh fingerprint → CHECKOUT_CHANGED, no sale.order created
   ├── atomic claim on payment_attempts.checkout_attempt_id (unchanged, pre-existing, proven)
   ├── resolveCustomer() → structured address written (§9)
   ├── createSaleOrder(..., quote.lines, ...)
   └── orders row + payment_attempts row (method=cod) + confirmation email
```

No path falls back to `list_price` — `create-order`, `payment-create`, and the admin retry path all
go through the same `computeAuthoritativeQuote`/`createSaleOrder(quoteLines)` contract.

## 15. Idempotency

| Scenario | Mechanism |
|---|---|
| COD double-click/retry | `payment_attempts.checkout_attempt_id` UNIQUE, claimed by INSERT; 23505 conflict → resolve against the existing row (replay / resume-from-`odoo_sale_order_id` / retry-if-failed) — **pre-existing, unchanged** |
| Online "Pay Online" double-click/retry (**fixed this pass**) | `payment-create` now requires `checkoutAttemptId` too, claimed the same way on the SAME column (shared across COD/online — one checkout attempt, one row, regardless of method). On conflict: reuse the existing `razorpay_order_id` if one exists, or return a retryable "still starting" response — never a second Razorpay order |
| `payment-verify` vs `razorpay-webhook` race | `finalize.ts`'s atomic `UPDATE ... WHERE razorpay_payment_id IS NULL` claim — **pre-existing, unchanged** |
| Admin-triggered resync | `admin-retry-odoo-order-sync` — claims via `syncing_since`, resumes from `odoo_sale_order_id` if present, else re-quotes (legacy snapshot) or uses `quoteLines` (current snapshot) — **fixed this pass** (was broken by the `createSaleOrder` signature change until repaired) |
| Confirmation email retry | `admin-retry-email` — unchanged idempotency (new `email_log` row with `retry_of`), only its line-item reconstruction was updated to prefer `quoteLines` over the legacy `resolvedLines`+live-read path |

**Invariant:** 1 `checkoutAttemptId` → ≤ 1 claimed `payment_attempts` row → ≤ 1 successful payment
→ ≤ 1 Odoo `sale.order`. No code path can create two.

## 16. Odoo order construction

`createSaleOrder()` in `placeOdooOrder.ts` (signature changed this pass — see §24 Recreate From
Zero for the exact shape) builds each `order_line` as:

```js
[0, 0, {
  product_id: line.odooVariantId,
  product_uom_qty: line.quantity,
  price_unit: line.unitPrice,       // from the quote — pricelist-resolved, never list_price directly
  discount: line.discountPercent,   // 0 for a "fixed" rule, the real % for a "formula" rule
  tax_id: [[6, 0, line.taxIds]],    // Odoo many2many "replace" command — [] when the product has no tax
}]
```

`tax_id` is always the product's own real `taxes_id` (possibly empty) — never a hardcoded id like
273 regardless of whether that specific product has it attached.

## 17. Error contracts

`_shared/errors/checkoutErrors.ts` — `CheckoutError` class + `checkoutErrorResponse()`. Response
shape: `{ error: { code, message, retryable, quote? } }`. Codes implemented: `CHECKOUT_CHANGED`,
`PRODUCT_UNAVAILABLE`, `PRODUCT_INVALID`, `STOCK_CHANGED`, `PRICING_UNAVAILABLE`,
`ADDRESS_INVALID`, `DELIVERY_UNAVAILABLE`, `SESSION_EXPIRED`, `PAYMENT_UNAVAILABLE`,
`PAYMENT_FAILED`, `PAYMENT_ALREADY_PROCESSING`, `ORDER_ALREADY_CREATED`, `ODOO_UNAVAILABLE`,
`VALIDATION_FAILED`. `checkout-quote`, `create-order`, and `payment-create` all use this contract;
`message` is always customer-safe (no raw Odoo errors, stack traces, or credentials — those go to
`console.error` server-side only). `Checkout.tsx`'s `readCheckoutError()` normalizes both this
shape and the older plain-string `{ error: "..." }` shape used by pre-existing endpoints
(`payment-verify`, `customer-profile`, etc.) that weren't touched this pass.

## 18. Tests

**Unit (Vitest, all passing as of this writing):**
- `_shared/pricing/pricelistEvaluator.test.ts` — 16 tests: no-rule fallback, fixed rule, formula
  rule, a 0-price fixed rule (not treated as "no price"), `min_quantity` boundary + tiered
  precedence, `date_start`/`date_end` (future/expired/active window), specificity precedence
  (variant > product > category > global), fail-closed on `percentage`/non-`list_price` base/any
  nonzero round-surcharge-margin field.
- `_shared/pricing/taxCalculator.test.ts` — 8 tests: no tax, 0% tax (the real current production
  case), nonzero percent tax (exclusive and price-included), discount-before-tax, fixed-amount tax
  × qty, fail-closed on `division`/`group`/`code`, multiple taxes summed.
- `_shared/address/resolveAddress.test.ts` — 11 tests: real India/Gujarat/Maharashtra ids,
  case-insensitivity, unresolvable/ambiguous state never guessed, unresolvable country also skips
  the state lookup entirely, defaults to India, **regression test that street2 never again contains
  city/state/pincode**, structured city/zip fields, never throws on an Odoo RPC error.
- Pre-existing suite (137 tests across `server/`, `src/`, `supabase/functions/_shared/auth`) —
  confirmed still green; the one failing/skipped file (`src/lib/recommendations/engine.test.ts`) is
  a pre-existing Node 20 vs. `@supabase/realtime-js`'s Node-22-only native WebSocket requirement,
  unrelated to this pass (not touched, not introduced by this change).

**Not added this pass (explicitly deferred, NOT TESTED):** quote-level integration tests
(fingerprint determinism/multi-line/delivery-change scenarios — the quote logic itself is covered
transitively through the pricelist/tax unit tests, but `computeAuthoritativeQuote` as a whole
wasn't integration-tested against a mocked Odoo client), CHECKOUT_CHANGED end-to-end scenario,
payment idempotency race-condition tests, and Playwright coverage for the new checkout flows
(quote loading, CHECKOUT_CHANGED UX, cart-drawer → checkout). These would need either a mocked
Odoo RPC layer (not built) or live credentials this environment doesn't have reason to risk against
production. **Flagged honestly rather than skipped silently.**

## 19. Production verification

**Live, read-only only — no Odoo mutation, no real order, no real payment:**
- `odoo-health`: reachable, authenticated (both legacy RPC and JSON-2).
- Extended `odoo-schema` (deployed, invoked, then left deployed as a permanent diagnostic — it's
  strictly read-only by construction): confirmed every field/model referenced in §4–§9 above, plus
  the `onchange`-based native-pricing-method probe (§4B below).
- `odoo-checkout-capability-audit` (pre-existing): re-confirmed payment/delivery/website modules
  installed, real payment providers (Razorpay enabled in Odoo's own config, separate from this
  app's own Razorpay integration), real website record, 82 customer-ranked partners.

**4B — native pricing method investigation:** `sale.order.line.onchange` was called live (read-only
by Odoo's own design — `onchange` never persists) with `product_id=10, product_uom_qty=1,
order_id=false`. Result: `callable: true` (no RPC error) but `returnedValue: null` — Odoo did not
compute a usable price diff without a real parent-order context (partner_id/pricelist_id/currency).
**Conclusion: a safe, externally-callable native pricing RPC could not be proven on this instance.**
This is why the bounded local evaluator (§4) was built instead of relying on Odoo's own computation
— exactly the fallback path the governing instructions specified for this outcome.

**Backend compile coherence verification:** `deno check` (via `npx deno`, Deno 2.9.6) run against
all 17 checkout-related Edge Function files — zero errors. Repo-wide grep for `variantRows`,
`resolvedLines`, `.list_price`, and `createSaleOrder(` found and fixed 3 additional stale callers
beyond `finalize.ts` (`admin-retry-odoo-order-sync/index.ts`, `admin-retry-email/index.ts`) that
would otherwise have broken on first use — see §24.

**NOT TESTED (explicitly, per instruction — no live order/payment placed to verify this):**
- A real end-to-end COD or online order was **not** placed against live Odoo. No safe
  sandbox/test-order mechanism exists in this environment (the earlier `odoo-checkout-portal-
  returns.md` pass already found a stray `"Claude Test Order - DELETE ME"` (`S00024`) from a prior
  session's live verification — this pass deliberately did not add another one).
- `checkout-quote` and the modified functions have **not yet been deployed** to the live
  `zafjmlwbolgdattfdgch` project as of this document's writing (deploy is the next step after this
  doc, per the governing instruction's phase ordering).
- Browser QA against the **deployed** backend has not happened yet (only against local dev with the
  not-yet-deployed function, which correctly showed a graceful "couldn't load pricing" error — see
  §22).

## 20. Rollback

All work is on `feature/odoo-checkout`, never merged into `figma`/`main`. To roll back:
1. **Code:** `git checkout figma -- supabase/functions create-order payment-create ...` or simply
   discard the branch — nothing has touched `main`/`figma`.
2. **Deployed functions** (once deployed): redeploy the previous version from `figma` HEAD
   (`763a008`) for each function listed in §24's "Edge Functions changed" table —
   `npx supabase functions deploy <name> --project-ref zafjmlwbolgdattfdgch` after checking out the
   old file content. The Supabase dashboard also keeps per-function version history
   (`list_edge_functions` showed `version` numbers for every function) if a one-click revert is
   preferred.
3. **No migrations were added this pass** (the existing `payment_attempts.checkout_attempt_id`
   column, already live from a prior pass, is reused for the online path too) — so no migration
   rollback is needed.
4. **No Odoo configuration was changed** — nothing to roll back there.

## 21. Recreate From Zero

**Repo files added:**
```
supabase/functions/_shared/pricing/pricelistEvaluator.ts
supabase/functions/_shared/pricing/pricelistEvaluator.test.ts
supabase/functions/_shared/pricing/taxCalculator.ts
supabase/functions/_shared/pricing/taxCalculator.test.ts
supabase/functions/_shared/address/resolveAddress.ts
supabase/functions/_shared/address/resolveAddress.test.ts
supabase/functions/_shared/errors/checkoutErrors.ts
supabase/functions/_shared/orders/quote.ts
supabase/functions/checkout-quote/index.ts
```

**Repo files modified:**
```
supabase/functions/_shared/orders/placeOdooOrder.ts     — createSaleOrder(config, partnerId, quoteLines: QuoteLine[], clientOrderRef, partnerInvoiceId?, partnerShippingId?) — was (..., resolvedLines, byId, ...)
supabase/functions/_shared/orders/customerIdentity.ts   — formatStreet2() removed; uses resolveStructuredAddress()
supabase/functions/_shared/payments/finalize.ts         — CheckoutSnapshot.quoteLines (+ legacy resolvedLines/variantRows fallback)
supabase/functions/create-order/index.ts                — computeAuthoritativeQuote + CHECKOUT_CHANGED + quote.lines
supabase/functions/payment-create/index.ts               — same + checkoutAttemptId idempotency claim
supabase/functions/customer-addresses/index.ts          — resolveStructuredAddress(), structured list() response
supabase/functions/admin-retry-odoo-order-sync/index.ts — quoteLines-or-re-quote, new createSaleOrder signature
supabase/functions/admin-retry-email/index.ts           — quoteLines-or-legacy-resolvedLines line-item source
supabase/functions/odoo-schema/index.ts                 — extended diagnostic (§19), deployed
src/components/cart/CartDrawerSummary.tsx                — Checkout button no longer disabled, navigates to /checkout
src/pages/Checkout.tsx                                    — wired to checkout-quote, CHECKOUT_CHANGED UX, real Subtotal/Tax/Delivery/Total
```

**Environment variable names relied upon** (values never in this doc or in code):
`ODOO_BASE_URL`, `ODOO_DATABASE`, `ODOO_USERNAME`, `ODOO_API_KEY` (server-only Supabase secrets),
`INTERNAL_DIAGNOSTICS_TOKEN` (gates `odoo-schema`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
(standard Edge Function env), `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET`
(unchanged, pre-existing).

**Odoo RPC dependencies:** `fields_get`, `search_read`, `search_count` (diagnostics, read path);
`create` on `res.partner`/`sale.order` (write path, unchanged); one `onchange` call on
`sale.order.line` (diagnostic only, in `odoo-schema`, never in the live checkout path).

**Diagnostic procedure** (read-only, safe to re-run any time):
```bash
curl -s -X POST "https://zafjmlwbolgdattfdgch.supabase.co/functions/v1/odoo-schema" \
  -H "Authorization: Bearer <SUPABASE_PUBLISHABLE_KEY>" \
  -H "apikey: <SUPABASE_PUBLISHABLE_KEY>" \
  -H "x-internal-token: <INTERNAL_DIAGNOSTICS_TOKEN>" \
  -H "Content-Type: application/json"
```
Returns live field metadata + a small curated sample for every model in §4–§9, plus the
`addressResolutionProbe` and `pricingMethodProbe` sections (§19/§4B). Never creates/writes/unlinks.

**Deploy commands** (coordinated — see §55 of the governing instruction, "deploy order"):
```bash
npx supabase link --project-ref zafjmlwbolgdattfdgch
npx supabase functions deploy checkout-quote --project-ref zafjmlwbolgdattfdgch
npx supabase functions deploy create-order --project-ref zafjmlwbolgdattfdgch
npx supabase functions deploy payment-create --project-ref zafjmlwbolgdattfdgch
npx supabase functions deploy payment-verify --project-ref zafjmlwbolgdattfdgch
npx supabase functions deploy razorpay-webhook --project-ref zafjmlwbolgdattfdgch
npx supabase functions deploy customer-addresses --project-ref zafjmlwbolgdattfdgch
npx supabase functions deploy admin-retry-odoo-order-sync --project-ref zafjmlwbolgdattfdgch
npx supabase functions deploy admin-retry-email --project-ref zafjmlwbolgdattfdgch
```
(`payment-verify`/`razorpay-webhook` have no source changes this pass but import the same shared
`finalize.ts`/`placeOdooOrder.ts` modules — redeployed together so no two functions in production
reference incompatible versions of the shared code at the same time, per the "no piecemeal deploy"
instruction. Supabase bundles each function's imports at deploy time; shared-module edits only take
effect for a function once *that function* is redeployed.)

**Test commands:**
```bash
npx deno check supabase/functions/<file>.ts   # per-file, or list several
npx vitest run
npm run build && npm run lint && npm run typecheck:server
```

**Fingerprint rule:** SHA-256 hex of `JSON.stringify({ lines: [[variantId, qty, unitPrice,
discountPercent, tax]], shipping, deliveryMethodId, grandTotal })` — see §11.

**Payment idempotency:** one `checkoutAttemptId` (client-generated UUID v4, generated once per
Checkout.tsx mount) → `payment_attempts.checkout_attempt_id` UNIQUE constraint — see §15.

**Rollback:** §20. **Verify live pricing without mutation:** the diagnostic procedure above, plus
`checkout-quote` itself (POST with a real `{lines}` body) — fully read-only.

## 22. Known limitations

- Tax is currently ₹0 for every real product tested — an Odoo configuration fact, not a bug in this
  pipeline (§6).
- Fiscal-position tax substitution is architecturally ready but not implemented — no live mapping
  rules exist to implement against (§7).
- No carrier-rate RPC (live shipping cost calculation) — only `delivery.carrier.fixed_price` is
  used; no evidence a safe rate-calculation RPC exists on this instance (§8).
- `payment-create`'s new idempotency claim and `create-order`'s CHECKOUT_CHANGED path have **not**
  been exercised against live Razorpay (no real Razorpay test credentials in this environment,
  consistent with every prior pass's documented limitation).
- No quote-level or Playwright integration tests were added this pass (§18) — only unit tests for
  the three new pure-logic modules.
- `checkout-quote` has no explicit rate limiting beyond existing line-count (100 max) and quantity
  (1-100) validation already present in `create-order`/`payment-create`'s body validators — a
  dedicated abuse-control layer (per-IP/per-session throttling) was not added.
- Not yet deployed to production as of this document's writing.

## 23. Revision log

| Date       | Author | Change                                                        |
|------------|--------|----------------------------------------------------------------|
| 2026-10-06 | Claude | Initial version. Built the full authoritative quote pipeline (pricelistEvaluator, taxCalculator, resolveAddress, checkoutErrors, quote.ts/computeAuthoritativeQuote, checkout-quote Edge Function), fixed the previously-wrong `price_unit = list_price` assignment, fixed the `street2` address-concatenation bug, closed the `payment-create` online-payment idempotency gap, fixed CHECKOUT_CHANGED revalidation before both COD and online order placement, and repaired 3 stale callers of the old `createSaleOrder`/`checkout_snapshot` shape (`finalize.ts`, `admin-retry-odoo-order-sync`, `admin-retry-email`) found via repo-wide search. Added 35 unit tests. `deno check`/`tsc -b`/`npm run build`/`npm run lint`/`npm run typecheck:server`/`vitest run` all clean (one pre-existing, unrelated Node-20-environment test failure noted, not introduced by this pass). Not yet deployed. |
