# Real Accounts, Orders into Odoo, Reviews, and Admin Panel

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Real Supabase Auth accounts, checkout → real Odoo sale.order, product reviews, admin panel |
| File           | `Documentations MD/delite-accounts-orders-reviews-admin.md` |
| Branch         | figma |
| Owner          | Claude |
| Status         | Done — full signed-in flow verified live end-to-end (login, checkout → real Odoo order, review submission, admin moderation) |
| Created        | 2026-09-17 |
| Last updated   | 2026-09-17 |

## Summary

Replaces the last four frontend-only stubs in the storefront with real backend logic: Supabase
Auth accounts (with a `profiles` table), a checkout flow that places a genuine Odoo `sale.order`
(no payment processing — confirmed out of scope), a real moderated product-review system, and a
`/admin` panel to view orders and moderate reviews. Everything sits on top of the already-real
Odoo catalog integration (`Documentations MD/odoo-real-catalog.md`) — this pass adds the backend
for the customer/business side (who's buying, what they ordered, what they said about it), not the
catalog itself.

## Why

Prior sessions built a fully real, live-verified Odoo product catalog, but every customer-facing
action past "browse" was fake: `Cart.tsx`'s checkout button was `disabled` ("Demo checkout — no
payment is processed"), there was no way to sign in, and the PDP's "Reviews" tab only ever showed a
static placeholder number. The user asked for all of this to be real, with proper tracked
migrations — not ad hoc — while explicitly keeping payment processing out of scope (no gateway
exists anywhere in this repo or session; provisioning one is a separate task) and keeping Odoo as
the system of record for orders (a placed order becomes a real `sale.order`, not a Delite-only
record disconnected from the business's actual order management).

## Scope

**In scope:**
- Three new Postgres tables (`profiles`, `orders`, `product_reviews`), as tracked migrations under
  `supabase/migrations/`, with RLS on every table.
- Supabase Auth (email/password) wired into the frontend via `@supabase/supabase-js` (the first use
  of that package in this repo — every prior Edge Function call was a raw `fetch`).
- A real checkout flow: `create-order` Edge Function creates a genuine Odoo `res.partner` +
  `sale.order`, then mirrors a thin summary row into Supabase `orders`.
- A real, moderated review system: any signed-in user can submit a review (lands `pending`); it's
  only publicly visible once an admin approves it.
- A `/admin` panel (orders list with "Open in Odoo" links, review moderation queue).
- A one-off Odoo write-permission diagnostic (`odoo-write-check`), run before `create-order` was
  built, following the same "verify before build" discipline as every prior Odoo pass in this repo.

**Explicitly not in scope:**
- **Payment processing** — confirmed with the user. No gateway (Razorpay/Stripe/etc.) exists
  anywhere in this repo or session. Orders are placed pending-payment, honestly labelled
  ("Pay on Delivery"), never marked paid.
- **Order status sync back from Odoo** (paid/shipped/delivered reflecting into the Supabase mirror)
  — would need polling or an Odoo-side webhook, neither set up. `orders.status` stays `'placed'`.
- **Saved address book** — checkout captures shipping details directly on the order, not a
  reusable address entity.
- **Catalog CRUD in admin** — Odoo remains the only place product data is written, unchanged from
  every prior instruction in this project. Admin only reads/links out to Odoo.
- OAuth sign-in providers (Google, etc.) — email/password only, since no provider is configured.

## Implementation notes

### Database (`supabase/migrations/`)

- `20260917100817_create_profiles.sql` — `profiles` table (`id` = `auth.users.id`, `full_name`,
  `phone`, `is_admin`), a `private.is_admin()` `SECURITY DEFINER` helper (avoids RLS
  self-recursion on `profiles`), a trigger that blocks a non-admin from setting their own
  `is_admin` even via a normal profile-update payload, and a `handle_new_user()` trigger on
  `auth.users` that auto-creates the matching `profiles` row on signup.
- `20260917100819_create_orders.sql` — `orders` table, a thin mirror of real Odoo `sale.order`
  records. RLS allows only `SELECT` (own rows, or all rows for admins) — **no client-facing
  INSERT/UPDATE policy exists at all**; the only writer is `create-order`'s service-role client,
  so a forged client-side order is impossible by construction, not just discouraged.
- `20260917100820_create_product_reviews.sql` — `product_reviews` table, keyed by
  `odoo_template_id` (a real `product.template` id, not a mock-catalog slug). A `BEFORE INSERT`
  trigger forces `status = 'pending'` regardless of what the client sends, so a review can never
  self-approve. One review per user per product (`unique (odoo_template_id, user_id)`).
- `20260917101014_lock_down_trigger_functions.sql` — a follow-up fix from `get_advisors`
  (security lints), run immediately after the first three migrations: `handle_new_user()` is a
  trigger function that doesn't need to be directly callable, but living in the `public` schema
  meant PostgREST auto-exposed it as an RPC endpoint. Revoked. The advisor's other finding
  (`public.rls_auto_enable()`) is a pre-existing Supabase-platform-managed event trigger, not
  something this codebase created — left untouched.
- Applied via `npx supabase db push --project-ref zafjmlwbolgdattfdgch` (same CLI already proven
  working in this repo for `functions deploy`).

### Auth (`src/lib/supabaseClient.ts`, `src/context/AuthContext.tsx`)

- `supabase` is `null` (not a thrown error) when `VITE_SUPABASE_URL`/
  `VITE_SUPABASE_PUBLISHABLE_KEY` aren't set — every consumer checks `isSupabaseConfigured`/
  `configured` and shows "Accounts aren't set up yet" rather than crashing. Same defensive pattern
  `supabaseCatalogService.ts` already used for its own env vars.
- `AuthContext` mirrors `CartContext.tsx`'s existing provider conventions (`useCallback`-wrapped
  actions, a `useX()` hook that throws outside its provider).
- `Header.tsx`'s account button existed as a dead, unwired `<button>` before this pass (no
  `onClick`, not even a `<Link>`) — now a real `<Link>` to `/login` or `/account`.

### Checkout → real Odoo orders (`supabase/functions/create-order/`)

- **Write access was verified before this was built**, not assumed: `odoo-write-check` (a small,
  re-runnable diagnostic, same pattern as `odoo-catalog-classify`) confirmed
  `res.partner.create`/`.write` and `sale.order.create`/`sale.order.line.create` via Odoo's own
  `check_access_rights` (non-mutating — never an actual test write). Result:
  `canPlaceRealOrders: true`. Every Edge Function before this one was read-only.
- `create-order` requires the **caller's own session token** (not the anon key) — the frontend
  calls it via `supabase.functions.invoke()`, which attaches it automatically. The function
  verifies it with a service-role Supabase client (`adminClient.auth.getUser(jwt)`).
- **Re-validates every cart line against live Odoo** — price, and whether the product is still
  `active` — before creating anything. Never trusts a client-sent price, the same principle
  already applied to catalog/stock elsewhere in this project.
- **Variant resolution**: `CartLine.variantId` is already `String(odooVariantId)` for a real
  product (see `odoo-real-catalog.md`, "Cart identity") — no lookup needed when present. A line
  added without going through the PDP's variant selector (e.g. a future quick-add path) only
  carries `odooTemplateId`; `create-order` resolves it to the template's real `product.product` id
  server-side (Odoo always has ≥1 `product.product` per template). A template resolving to more
  than one variant here would mean a genuine multi-variant product reached checkout without a
  selection — treated as an error, never guessed around, since the PDP already gates Add to Cart
  on a real selection for those.
- Finds-or-creates a `res.partner` by phone/email, creates the `sale.order`, then inserts the
  Supabase `orders` mirror row. If the Odoo order succeeds but the mirror insert fails, the
  response says so honestly (`warning: "order_placed_history_sync_failed"`) rather than reporting
  a failed order that actually went through.
- Sequential Odoo calls with small delays between them — this instance rate-limits (HTTP 429)
  under concurrent load, the same issue documented and fixed the same way in every prior
  multi-call Edge Function in this repo (`odoo-schema`, `catalog-products`, etc.).
- `Cart.tsx`'s checkout button is no longer `disabled` — it navigates to `/checkout` (gated by
  `RequireAuth`).

### Reviews (`src/hooks/useProductReviews.ts`, `src/components/product/ReviewsSection.tsx`)

- Direct `@supabase/supabase-js` calls from React (RLS-enforced) — no Edge Function needed, since
  no Odoo secret is involved in a review.
- `ProductDetail.tsx`'s header rating summary and "Reviews" tab now use a real aggregate
  (`avg(rating)`/`count`) when `product.odooId` is set; the local mock catalog's static
  `rating`/`reviewCount` fields keep driving the same UI unchanged (the hook no-ops when there's
  no Odoo id).

### Admin (`src/pages/admin/`, `supabase/functions/admin-odoo-link/`)

- `/admin` and `/admin/reviews`, gated by `RequireAdmin` (signed in AND `profile.is_admin`) — a UX
  guard only; the real security is the RLS admin policies from the migrations above.
- **"Open in Odoo" deliberately doesn't expose `ODOO_BASE_URL` to the browser** — a new
  `admin-odoo-link` Edge Function (same caller-session + `profiles.is_admin` check as
  `create-order`) builds the URL server-side and returns only the finished link, per
  `server/odoo/adminLink.ts`'s own original design note (never built until now). Model is
  allowlisted (`sale.order` only). URL scheme is `/odoo/<model>/<id>` — confirmed correct for this
  instance (`19.0+e`, the "modern" scheme is for 17.0+), not guessed.
- **Becoming an admin**: a new `admin-bootstrap` Edge Function (`x-internal-token` gated, same
  pattern as `odoo-write-check`) creates or promotes a user as a PRE-CONFIRMED admin via
  Supabase's own Admin Auth API (`auth.admin.createUser`/`updateUserById` with
  `email_confirm: true`) — bypasses this project's email-confirmation requirement for that one
  account without touching the project-wide setting. Superseded the original plan's "run one SQL
  UPDATE by hand" note — this is the real mechanism now, kept re-runnable (idempotent: re-running
  with the same email resets that user's password / re-confirms them rather than erroring).
  No credentials are ever hardcoded in the function or logged; call it with the desired
  email/password directly, e.g.:
  ```
  curl -X POST https://<ref>.supabase.co/functions/v1/admin-bootstrap \
    -H "Authorization: Bearer <publishable-key>" -H "x-internal-token: <INTERNAL_DIAGNOSTICS_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"email":"...","password":"...","fullName":"..."}'
  ```

## Interfaces / data

- `POST create-order` — body `{ shippingName, shippingPhone, shippingAddress, lines: [{
  odooVariantId?, odooTemplateId?, qty }] }`, `Authorization: Bearer <user session token>` →
  `{ orderId, odooOrderName }` or `{ error }`.
- `POST admin-odoo-link` — body `{ model: "sale.order", id }`, admin session required →
  `{ url }` or `{ error }`.
- `POST odoo-write-check` (diagnostic, `x-internal-token` gated, kept re-runnable) →
  per-model `check_access_rights` results + `canPlaceRealOrders`.
- `POST admin-bootstrap` (ops tool, `x-internal-token` gated, kept re-runnable) — body
  `{ email, password, fullName? }` → `{ ok, userId, email, isAdmin }` or `{ error }`. See
  "Admin" above.
- `public.profiles` / `public.orders` / `public.product_reviews` — see migrations for full schema.
- `ProductVariant`/`Product` gained no new fields for this pass — `odooId`/variant `id` (already
  `String(odooVariantId)`) were already sufficient.

## Dependencies

- `@supabase/supabase-js` (new — only new npm package this pass added).
- `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` — already present from the catalog work,
  now also used for Auth/reviews directly from the frontend.
- Odoo write access (`res.partner`, `sale.order`, `sale.order.line`) — verified present via
  `odoo-write-check`, not assumed.

## Testing / verification

- `npm run lint`, `npm run build`, `npm run typecheck:server`, `npm run test:unit` (34 passed, 1
  skipped) — all clean.
- **Real, live verification performed:**
  - `odoo-write-check` run against the live instance: `res.partner` create/write, `sale.order`
    create, `sale.order.line` create all confirmed `true`.
  - Migrations applied to the real Supabase project (`npx supabase db push`); `list_tables`
    confirmed all three tables exist with RLS enabled and the expected columns/FKs.
  - `get_advisors(type: "security")` run immediately after — found and fixed one real gap
    (`handle_new_user()` unnecessarily RPC-exposed); re-ran clean except for the pre-existing,
    not-ours `rls_auto_enable` event trigger.
  - A real signup via the Auth REST API confirmed the `handle_new_user` trigger fires — a
    `profiles` row was genuinely created for the new user (verified by a direct read query).
  - `tests/interaction/auth-gating.spec.ts` (new, 6 tests, all passing): unauthenticated
    `/checkout`/`/account`/`/admin` redirect to `/login` with the right `returnTo`, `/login`/
    `/signup` render real labelled forms, the header account link points to `/login` when signed
    out.
  - `tests/interaction/real-catalog.spec.ts` + `shop-catalog.spec.ts` re-run after all of this
    (Header/ProductDetail/Cart were all touched) — still 5/5 passing, no regression.
  - Production bundle re-grepped for `ODOO_API_KEY`/`ODOO_USERNAME`/`ODOO_DATABASE`/
    `SUPABASE_SERVICE_ROLE` — zero matches.
- **Full signed-in flow — completed after `admin-bootstrap` unblocked it** (see "Known gaps" for
  the earlier session's block and how it was resolved): a real admin account was bootstrapped and
  used to drive the actual browser UI end to end —
  1. Signed in via the real `/login` form → landed on `/account`.
  2. Added a real product to cart, completed `/checkout` with real shipping details → a genuine
     Odoo `sale.order` was created (**`S00024`**, ₹1,200) and the order-confirmation page showed
     the real order number.
  3. Submitted a real review via the PDP's "Write a Review" form → showed "pending approval"
     immediately (never publicly visible pre-approval).
  4. `/admin` showed the real order (`S00024`) with a working "Open in Odoo" link;
     `/admin/reviews` showed the pending review.
  5. Clicked "Reject" on the review in `/admin/reviews` → confirmed it left the pending queue
     (also served as test-data cleanup for the review).
  - **One real gap found by this live test, fixed**: `private.prevent_self_admin_promotion()`'s
    trigger reset `is_admin` back to its old value for ANY caller that wasn't already an admin —
    including `admin-bootstrap`'s own service-role upsert, since `auth.uid()` is `NULL` for a
    service-role connection (no end-user JWT). The very first bootstrap call reported
    `{ ok: true, isAdmin: true }` but the row silently stayed `is_admin: false` — caught only by
    re-reading the row after the call, not by trusting the function's own response. Fixed in
    `20260917105551_fix_admin_promotion_trigger.sql` by exempting `auth.role() = 'service_role'`
    explicitly (already-fully-trusted by definition — not a new privilege, just correcting the
    trigger to stop blocking a caller it was never meant to restrict).
  - **Test order left in Odoo**: `S00024` ("Claude Test Order - DELETE ME") is a real order in
    your Odoo instance — cancel or delete it there when convenient; this session has no confirmed
    `unlink`/cancel permission on `sale.order` (only `create` was verified), so it wasn't removed
    automatically.

## Known gaps

- **General (non-admin) signup still requires email confirmation** — this is a Supabase project
  setting (Authentication → Sign In / Providers → Email → "Confirm email"), not something
  reachable via any Supabase MCP/CLI tool available in this session (no project-auth-config API
  was exposed here, only the Postgres/Edge-Function/migration surfaces). **To let ordinary
  customers sign up and immediately use the account** (not just the bootstrapped admin), turn that
  toggle off in the Supabase dashboard yourself. `admin-bootstrap` is unaffected either way — it
  bypasses this per-account via the Admin Auth API, not the project setting.
- **`admin-bootstrap` is a real, standing capability** — a valid `x-internal-token` can create or
  reset the password of any admin account. Same trust model as `odoo-schema`/`odoo-write-check`
  (fails closed if `INTERNAL_DIAGNOSTICS_TOKEN` is unset), but worth knowing this one can write,
  not just read — keep that token as carefully as an admin password, because it effectively is
  one.
- **Bundle size**: adding `@supabase/supabase-js` pushed the main JS chunk to ~696KB (from
  ~438KB), past Vite's default 500KB warning threshold. Not a build error, not addressed in this
  pass (would need route-level code-splitting) — flagged rather than ignored.
- **Admin promotion is manual** (documented SQL, above) — no invite/promotion UI exists.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-17 | Claude | Initial version — real Supabase Auth accounts (profiles table + trigger), checkout producing real Odoo sale.order via a new create-order Edge Function (write access verified first via odoo-write-check), a moderated product-review system (product_reviews table, ReviewsSection component, real PDP aggregate), and an admin panel (order list with server-built "Open in Odoo" links, review moderation queue). Payment processing explicitly out of scope per user confirmation. Found and fixed one real security-advisor finding (handle_new_user RPC exposure) and one real UI bug (unlabelled form inputs breaking both accessibility and testability). Full signed-in flow verification blocked by this Supabase project's email-confirmation requirement — documented as a known gap rather than worked around. |
| 2026-09-17 | Claude | Added `admin-bootstrap` Edge Function to create/promote a pre-confirmed admin account via Supabase's Admin Auth API, unblocking full live verification without touching the project-wide email-confirmation setting. Used it to bootstrap the real admin account and then drove the entire signed-in flow through the actual browser UI: login → add to cart → checkout (real Odoo order `S00024` created) → order confirmation → review submission (pending) → admin orders/reviews views → reject review. Found and fixed one real bug surfaced by this test: `prevent_self_admin_promotion`'s trigger was also blocking `admin-bootstrap`'s own service-role writes (`auth.uid()` is NULL for service-role, so `private.is_admin()` read false) — the first bootstrap call reported success but silently left `is_admin: false`, caught only by re-reading the row, not by trusting the function's response. Fixed by exempting `auth.role() = 'service_role'` explicitly. General (non-admin) signup still needs the project's "Confirm email" toggle turned off manually — no config-API tool for that was available in this session. |
