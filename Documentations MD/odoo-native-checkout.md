# Odoo-Native Checkout — Investigation & Handoff Feasibility

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | React storefront → Odoo native checkout handoff (Hasto/Shopify-style) |
| File           | `Documentations MD/odoo-native-checkout.md` |
| Branch         | `feature/odoo-checkout` |
| Owner          | Claude (this pass) |
| Status         | **Investigation phase — no handoff code written, no Odoo writes performed.** Blocked on real stop conditions (DNS/Cloudflare access, Odoo admin/Website Builder access) — see §7 |
| Created        | 2026-10-06 |
| Last updated   | 2026-10-06 |

## 1. Confirmed: the real production site is already Odoo

`https://www.deliteauto.com` is a live, real, **Odoo Online (SaaS)** website — confirmed two independent ways:
- `<meta name="generator" content="Odoo">`, `#wrapwrap`/`.oe_structure` DOM structure.
- A script tag loading `download.odoo.com/js/plausi_saas.js` — Odoo's own SaaS-plan-specific script, not present on self-hosted/Odoo.sh instances.

This is a **different, separate property** from this repo's React app (currently only running locally / linked to a Vercel project, not yet serving `deliteauto.com`). Same real business, same real address/branding in both.

## 2. Native checkout routes — all confirmed live by actually navigating them

| Step | Route | Notes |
|---|---|---|
| Shop | `/shop` | Real catalog, same products as the Odoo catalog our Supabase Edge Functions already read |
| Cart | `/shop/cart` | "Order \| Address \| Payment" breadcrumb, Subtotal/Taxes/Total, discount-code field |
| Address | `/shop/address` | Structured fields: name/email/phone/company/VAT/street/apartment/city/zip/country(dropdown)/state(dropdown) — India preselected, Gujarat=588/Maharashtra=597 confirmed in the dropdown, matching our own earlier diagnostic exactly |
| Delivery | within `/shop/checkout` | "Standard delivery — Free", matches `delivery.carrier.fixed_price: 0` found earlier |
| Payment | `/shop/payment` | **Card / Netbanking / UPI — this is Razorpay**, live, real, already presented to real customers today |
| Portal | `/my` | Redirects to `/web/login?redirect=/my` — real login gate, no guest portal browsing |

**I stopped at the payment method selection screen — no "Pay now" click, no payment, no order.** One side effect: submitting the address step with test data likely created a `res.partner` named "Test Audit User" (fake email) and an abandoned cart in Odoo — harmless, but worth cleaning up later.

## 3. Custom Odoo controllers/modules: confirmed NOT available

Reconfirmed via the SaaS-script evidence above, consistent with the prior session's `odoo-checkout-capability-audit` finding (`customModuleEvidence`: only Odoo-authored platform modules — `html_builder`, `html_editor`, `saas_website` — zero third-party/custom modules installed). **Ruled out as a path.**

## 4. The critical question: can a server-created cart become the browser's active Odoo cart? — NO, disproven empirically

This was explicitly flagged as the thing to prove, not assume. Three real tests were run against the live site:

**Test 1 — plain GET navigation with query params** (`/shop/<product>?product_id=11&add_qty=2`, then checked `/shop/cart`): **cart stayed empty.** Stock Odoo does not process add-to-cart params on a page-load GET.

**Test 2 — real cross-origin HTML `<form method="post" action="https://www.deliteauto.com/shop/cart/add">`**, submitted via genuine top-level navigation from a different origin (not a fetch — an actual `form.submit()`, exactly how Option A describes "normal top-level navigation/form submission"): resulted in **`415 Unsupported Media Type`**, with Odoo's own error text:
> "Request inferred type is compatible with \['http'\] but '/shop/cart/add' is type='jsonrpc'. Please verify the Content-Type request header and try again."

This is decisive: Odoo 19's `/shop/cart/add` controller is declared `type='jsonrpc'` — it **only** accepts `Content-Type: application/json` with a JSON-RPC 2.0 envelope (confirmed shape, captured from the live site's own same-origin "Add to Cart" call):
```json
{"jsonrpc": "2.0", "id": N, "params": {"product_id": 524, "add_qty": 1, ...}}
```
A classic HTML form (`application/x-www-form-urlencoded`) **cannot** send this. **Option A's simplest form (plain form-post navigation) does not work against this route, full stop.**

**Test 3 — direct cross-origin `fetch()`** with the correct JSON-RPC body/Content-Type, `credentials: 'include'`, from a different origin: **`TypeError: Failed to fetch`** — the browser's own CORS enforcement blocked it (no `Access-Control-Allow-Origin` from Odoo for this route; Odoo's website controllers are not designed for cross-origin API consumption the way our own Supabase functions deliberately are).

**Conclusion:** there is no stock, zero-custom-code mechanism for a *browser-side* cross-origin call (form or fetch) to populate the Odoo website cart. And since cookies can only be set by the domain that issues them, a *server-side* (Supabase Edge Function) call to Odoo's cart API would establish a session known only to our backend — there is no supported way to transplant that session into the end customer's actual browser without the browser itself making a request that Odoo responds to directly. Manually passing a `session_id` is exactly the cookie-forging/session-fixation pattern explicitly prohibited.

## 5. The one remaining credible path — not yet verified, needs your access

Odoo's Website Builder supports an **"Embed Code"** building block (a stock snippet across all Odoo editions, including Online/SaaS, for embedding raw HTML/`<script>` — this is a *content-level* customization, not a Python module, and is how Odoo sites normally add things like chat widgets or GA/Pixel scripts). This site currently has **zero** third-party scripts/pixels in use (checked — no GA, no Meta Pixel, no CSP header restricting script execution), so I can't point at an existing example on this exact site, but it's a standard, available building block.

**The idea:** a dedicated Website Page (e.g. `shop.deliteauto.com/checkout/handoff`) containing a small embedded `<script>` that:
1. Reads `product_id`/`qty` pairs from its own URL query string (e.g. `?items=524:2,11:1`).
2. Calls `fetch('/shop/cart/add', ...)` — **same-origin now** (the script executes as part of an Odoo-served page), so neither the Content-Type restriction nor CORS applies; Odoo's own valid CSRF/session context is naturally present.
3. Repeats for each line.
4. Redirects to `/shop/checkout`.

This stays entirely within Odoo's own already-working JSON-RPC route and Odoo's own session — no forged cookies, no custom Python, no session manipulation. **I cannot verify this is actually available/create this page myself — it requires your Odoo Website Editor access.** See §7.

## 6. Subdomain/domain architecture — confirmed via live read-only query

Queried the `website` model directly (read-only `search_read`, no write):
```json
{"id": 1, "name": "DELITE AUTO", "domain": "https://www.deliteauto.com", "company_id": [1, "DELITE AUTO"], ...}
```
**There is exactly one Website record, and `domain` is a single free-text field — not a list.** `shop.deliteauto.com` is not currently recognized by Odoo at all. Three real options, none DNS-free:

| Option | What it requires | Risk to the live site |
|---|---|---|
| **A. Change the existing website's `domain` field** to `shop.deliteauto.com` | One field write | **High — this is the live production site's canonical domain; changing it risks the current customer-facing checkout. Not recommended, and you explicitly said not to touch it.** |
| **B. Create a second Website record** (Odoo's native Multi-Website feature) bound to `shop.deliteauto.com`, sharing the same company/products | A `website` record creation + likely Website Settings configuration | Low, if done correctly — doesn't touch the existing record — but is a real Odoo configuration change that needs your explicit approval and is best done via the Settings UI, not a blind API write |
| **C. DNS/reverse-proxy** (Cloudflare) pointing `shop.deliteauto.com` at Odoo's hosting + registering the alias in Odoo | DNS/Cloudflare access + an Odoo-side domain/alias setting | Depends on exact mechanism; needs your DNS access either way |

**I did not change anything.** This needs your decision + access either way (see §7).

## 7. What I need from you (exact stop points)

1. **Odoo Website Editor access** — to check whether "Embed Code" (or equivalent custom-HTML page content) is available, and ideally to create the one handoff page described in §5. If you can grant me access or walk through it with me, tell me: go to **Website app → (top-left) Edit/+New → Page**, and check whether the block/snippet library includes something called **"Embed Code"** or **"Custom Code"** when you drag a new section onto a blank page. A screenshot of that snippet picker is enough — it's not sensitive.
2. **A decision on Option A/B/C in §6** — my recommendation is **B (a second Website record for `shop.deliteauto.com`)**, since it's the only one that doesn't touch the live site's existing domain and doesn't require DNS access from me. But creating it is a real Odoo configuration change — I will not do this without your explicit go-ahead, and ideally you or I do it together via **Settings → Website → Manage Websites → New**.
3. If you'd rather I not pursue the Embed-Code-page idea at all (e.g. if it turns out not to be available, or you're uncomfortable with it), tell me and I'll stop investigating Option A/B entirely and we can talk about Option C (keep/extend the custom checkout already built on this branch, now explicitly reclassified as the **production** path rather than a stopgap) or a different handoff design.

## 8. Existing custom checkout code — status

Per your instruction, nothing has been removed. Classification pending the outcome of §7:

| Code | Current classification |
|---|---|
| `checkout-quote`, pricelist evaluator, tax calculator, `create-order`, `payment-create`, `payment-verify`, `razorpay-webhook`, `payment_attempts`, `Checkout.tsx` | **KEEP / FALLBACK** — fully built, tested, deployed, working (see `odoo-checkout-finalization.md`). Not touched this pass. Becomes the production path if §7's native-handoff investigation concludes it isn't feasible; otherwise becomes a documented fallback. |

## 9. Odoo records touched during this investigation

- One abandoned cart (`sale.order`, state `draft`) for "Maruti Suzuki Baleno Floor Mats", qty 1.
- One likely new `res.partner` named "Test Audit User" (fake email `test-audit-donotuse@example.com`), created when the `/shop/address` step was submitted with test data.
- No payment, no confirmed order, no stock/inventory change, no product/customer/payment-provider configuration changed.

## 10. Tests performed

All read-only or safely-reversible (abandoned cart only): live navigation through shop→cart→address→delivery→payment; cross-origin form-POST test (`example.com` → `deliteauto.com`); cross-origin `fetch()` test; `website` model read via the existing `odoo-schema` diagnostic (extended this pass to include it, deployed, read-only).

## 12. Phase 6 — Embed Code capability CONFIRMED by user; cart update/remove contract confirmed live

**Update 2026-10-06 (later same day):** the user confirmed interactively (via their own Odoo Website Editor access) that **"Embed Code" is available** under Blocks → Inner Content, as a page-specific, upgrade-safe mechanism — exactly the one this doc recommended. Theme-wide "Code Injection" and the raw HTML/QWeb "HTML/CSS Editor" are both available too, but deliberately **not used** (page-specific Embed Code is the safest, most isolated option, per the user's own explicit decision).

**Native cart update/remove route — confirmed live via Network inspection (not guessed):**
Using the real cart UI as a public guest (add → increase qty → remove), captured:
- `POST /shop/cart/add` `{jsonrpc:"2.0", id, params:{product_id, add_qty}}` → adds a new line or increments an existing one for that product. Response includes `line_id`, `quantity`, `cart_quantity`, `amount`, `minor_amount`, `warning`.
- `POST /shop/cart/update` `{jsonrpc:"2.0", id, params:{line_id, quantity}}` → **sets** an existing line's quantity directly by its `line_id` (not `product_id`). Clicking the real "Remove from cart" link fires this exact same route — confirmed **`quantity: 0` removes the line entirely** (the cart went to "Your cart is empty!" immediately after).

This answers Phase 6G cleanly: the handoff script reads the current cart's line ids via a same-origin `fetch('/shop/cart')` + DOM parse (no dedicated JSON "list cart" endpoint exists — the cart page is server-rendered HTML only), then calls `/shop/cart/update` with `quantity:0` for each existing line before adding the React cart's real lines. This uses Odoo's own supported route — no direct `sale.order`/`sale.order.line` manipulation.

**I do not have (and will not use, even if offered — this is a live production system, not a local dev host) Odoo admin/login credentials, so I cannot open the Website Editor or create the page myself.** The complete, ready-to-paste Embed Code script implementing Steps 2–11 (single-product manual test button, fragment-payload multi-line test, sequential add, cart-clear-before-add, failure UX with Try Again/Return to Store, no auto-redirect during testing) is at [odoo-checkout-handoff-embed-code.html](odoo-checkout-handoff-embed-code.html) in this same folder.

**What I need from you:**
1. Create a new, unlisted Website page — suggested name "Checkout Handoff Test", suggested URL `/checkout/handoff-test`. Don't add it to navigation/footer; mark it unindexed if that option exists.
2. Drag an "Embed Code" block onto it and paste in the full contents of `odoo-checkout-handoff-embed-code.html`.
3. Publish the page (it needs to be reachable for me to test it — I can't preview an unpublished admin-only page without logging in).
4. Tell me the exact URL once it's live, and I'll run Steps 3–10 myself via my own browser (no login needed to view a published page).

## 13. (Historical, superseded by §12) Phase 6A — Embed Code capability: inconclusive without interactive access

Attempted a read-only, non-interactive proxy for this question: searched `ir.ui.view` (type `qweb`) for any view whose `arch_db` contains the substring `<script` (id/name/key only — never full page content). Result: **41 matches**, but every one sampled is a **stock Odoo module template** (`website.layout`, `website_sale.website_sale_layout`, `im_livechat.external_loader`, `web.frontend_layout`, etc.) — normal built-in script usage by already-installed apps. Inconclusive on its own — **resolved by the user directly confirming "Embed Code" availability, see §12.**

## 15. Phase "build it" — React side fully implemented and verified live

**Status: this is now the production checkout path.** No Checkout CTA in the app uses the old
custom checkout anymore.

**Files added:**
- `src/lib/odooCheckoutHandoff.ts` — builds, validates, and encodes the handoff payload from the
  real React cart. Resolves a missing variant id via `catalogService.getProductBySlug()` when a
  cart line only has a template id (the common case today — no cart UI collects an explicit
  variant choice for single-variant products yet). **Fails visibly** (never guesses) when a
  product has zero or multiple real Odoo variants and none was explicitly selected. Merges
  duplicate `productId` entries, caps quantity at 50/line and 20 distinct lines.
- `src/lib/odooCheckoutHandoff.test.ts` — 14 unit tests (payload creation, variant resolution,
  duplicate merge, invalid identity/quantity, max line count, fragment round-trip, no price/tax/
  discount/shipping/total ever present).
- `src/pages/CheckoutRedirect.tsx` — replaces `Checkout.tsx` at the `/checkout` route. Non-empty
  cart → builds the handoff URL and navigates; empty cart → `<Navigate to="/cart" />`; failure →
  "We couldn't prepare your checkout" + Try Again / View Cart.
- `tests/interaction/odoo-checkout-handoff.spec.ts` — 4 Playwright tests, **all passing against
  the real `catalogService`/live Odoo catalog** (not mocked): Cart page Checkout, Cart drawer
  Checkout, `/checkout` with a cart, `/checkout` with an empty cart. Verified the real browser
  navigates to `https://www.deliteauto.com/checkout-handoff-test#<payload>` with a correctly
  validated, price-free payload. Deliberately does not block/intercept the resulting request (a
  single harmless GET; the target page doesn't exist yet in Odoo so it currently 404s, same as any
  not-yet-created URL) — `window.location.assign()` triggers a real top-level navigation that
  neither a `window.location` property stub nor Playwright's `page.route()` reliably intercepted
  for this case, so the tests observe the browser's own address bar via `waitForURL` instead.

**Files changed:**
- `src/pages/Cart.tsx`, `src/components/cart/CartDrawerSummary.tsx` — Checkout buttons now call
  `buildOdooHandoffUrl()` and `window.location.assign()` (a real cross-domain full-page navigation,
  deliberately not React Router) instead of navigating to `/checkout`. Both show "Preparing secure
  checkout…" while the payload is built and a customer-safe error inline on failure, cart
  preserved either way.
- `src/App.tsx` — `/checkout` now renders `CheckoutRedirect`, not `Checkout`. The old `Checkout`
  import is commented out (not deleted) with an explicit LEGACY/FALLBACK note.
- `.env.local` / `.env.example` — new `VITE_ODOO_CHECKOUT_BASE_URL` (currently
  `https://www.deliteauto.com`; becomes `https://shop.deliteauto.com` later — only this value
  changes, no code).
- `Documentations MD/odoo-checkout-handoff-embed-code.html` — flipped `AUTO_REDIRECT_ON_SUCCESS`
  to `true` (production mode — redirects to `/shop/checkout` automatically once all lines are
  added, no manual click), added "View Cart" to the failure actions, and changed the payload shape
  it parses from tuple arrays (`[productId, qty]`, the earlier proof-of-concept shape) to the
  **object shape** `React` actually sends (`{productTemplateId, productId, quantity}`) — these two
  sides must agree exactly on wire format.

**What's NOT done:** the actual Odoo page at `/checkout-handoff-test` still needs to be created —
I don't have Odoo admin/Website Editor access to do this myself (see §12). The React side is fully
built, tested, and verified to navigate to the right URL with the right payload; the Odoo side
(pasting the Embed Code script in) is still the one manual step pending on your end. Until that
page exists, a real customer clicking Checkout reaches a 404 on Odoo's side instead of a working
cart — **this needs to happen before this goes live for real customers.**

## 14. Revision log

| Date       | Author | Change                                                        |
|------------|--------|----------------------------------------------------------------|
| 2026-10-07 | Claude | Built the React side of the handoff end to end (odooCheckoutHandoff.ts, CheckoutRedirect.tsx, Cart.tsx/CartDrawerSummary.tsx wiring) and verified it live with real Playwright tests against the real catalog/live Odoo data — the browser genuinely navigates to the correct `https://www.deliteauto.com/checkout-handoff-test#<payload>` URL with a correctly-validated, price-free payload from all 4 entry points. Updated the Embed Code script to production mode (auto-redirect on success) and fixed a payload-shape mismatch (object lines, not the earlier tuple-array proof-of-concept shape). The one remaining manual step is creating the actual Odoo page — not done, no admin access. See §15. |
| 2026-10-06 | Claude | Phase 6: user confirmed "Embed Code" (page-specific, Blocks → Inner Content) is available in the live Website Editor, and deliberately chose it over theme-wide Code Injection and the raw HTML/QWeb editor. Confirmed the native cart update/remove contract live via Network inspection while using the real guest cart (`POST /shop/cart/update {line_id, quantity}`, confirmed `quantity:0` removes a line — this is what the real "Remove from cart" link does). Wrote the complete Embed Code script (`odoo-checkout-handoff-embed-code.html`) implementing the single-product manual test, fragment-payload multi-line test, sequential cart-clear-then-add, and Try-Again/Return-to-Store failure UX — no auto-redirect during testing. Could not create the Odoo page myself (no admin/login access, and won't use one even if offered — live production system, not a local dev host); asked the user to create the page, paste the script in, publish it, and share the URL. |
| 2026-10-06 | Claude | Phase 6A: added a read-only ir.ui.view script-embedding probe to odoo-schema (deployed) — found 41 matches, all stock Odoo module templates, inconclusive for the actual question. Stopped per the explicit instruction for this one item. |
| 2026-10-06 | Claude | Initial version. Confirmed the real production site is Odoo Online; mapped all native checkout routes live; empirically disproved both candidate browser-side cart-handoff mechanisms (form-POST → 415, fetch → CORS block); confirmed via live `website` model read that subdomain support needs either modifying the live domain (risky) or a new Website record (real config change) or DNS (needs access); identified Embed-Code Website Page as the one remaining credible path, pending Odoo Website Editor access. No code written, no Odoo writes performed beyond the diagnostic's own read-only queries and one harmless abandoned test cart/contact from live navigation testing.
