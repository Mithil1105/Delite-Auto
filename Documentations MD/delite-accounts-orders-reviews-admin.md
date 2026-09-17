# Real Accounts, Orders into Odoo, Reviews, and Admin Panel

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Real Supabase Auth accounts, checkout → real Odoo sale.order, product reviews, admin panel |
| File           | `Documentations MD/delite-accounts-orders-reviews-admin.md` |
| Branch         | figma |
| Owner          | Claude |
| Status         | Built and mostly verified live — see "Known gaps" for the one blocked verification step |
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
- **Becoming the first admin is a one-off manual SQL step**, not something this pass can do itself
  (no email to guess): after a real signup, run in the Supabase SQL editor —
  `update public.profiles set is_admin = true where id = (select id from auth.users where email = '<their email>');`

## Interfaces / data

- `POST create-order` — body `{ shippingName, shippingPhone, shippingAddress, lines: [{
  odooVariantId?, odooTemplateId?, qty }] }`, `Authorization: Bearer <user session token>` →
  `{ orderId, odooOrderName }` or `{ error }`.
- `POST admin-odoo-link` — body `{ model: "sale.order", id }`, admin session required →
  `{ url }` or `{ error }`.
- `POST odoo-write-check` (diagnostic, `x-internal-token` gated, kept re-runnable) →
  per-model `check_access_rights` results + `canPlaceRealOrders`.
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
- **Not performed — blocked, see "Known gaps"**: a full signed-in click-through (real review
  submission → real moderation → real checkout producing a real Odoo `sale.order` → admin
  visibility). This is the one piece of the plan's own verification section that couldn't be
  completed in this session.

## Known gaps

- **Full signed-in flow untested live, and why**: this Supabase project requires email
  confirmation before a session is issued. A real signup was performed (confirming the
  `profiles` trigger works), but completing sign-in needs either a real inbox to click the
  confirmation link, or flipping `email_confirmed_at` directly in `auth.users` — which this
  session correctly refused to do (a direct write to Supabase's own auth schema was blocked by
  the harness's own security classifier as a "security weaken" action, and no attempt was made to
  route around that block). **What this means concretely**: the review-submission form, the
  checkout form actually reaching `create-order`, and the admin moderation UI are all built,
  type-checked, and (for checkout) proven mechanically correct via `odoo-write-check`'s real
  permission confirmation — but nobody has clicked through them signed in yet. **To close this**:
  either sign up once with a real email you can confirm (fastest), or temporarily disable "Confirm
  email" in Supabase Auth settings for easier iteration, then re-test — after which the one test
  order placed should be cancelled/deleted in Odoo (it will be a real `sale.order`).
- **Bundle size**: adding `@supabase/supabase-js` pushed the main JS chunk to ~696KB (from
  ~438KB), past Vite's default 500KB warning threshold. Not a build error, not addressed in this
  pass (would need route-level code-splitting) — flagged rather than ignored.
- **Admin promotion is manual** (documented SQL, above) — no invite/promotion UI exists.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-17 | Claude | Initial version — real Supabase Auth accounts (profiles table + trigger), checkout producing real Odoo sale.order via a new create-order Edge Function (write access verified first via odoo-write-check), a moderated product-review system (product_reviews table, ReviewsSection component, real PDP aggregate), and an admin panel (order list with server-built "Open in Odoo" links, review moderation queue). Payment processing explicitly out of scope per user confirmation. Found and fixed one real security-advisor finding (handle_new_user RPC exposure) and one real UI bug (unlabelled form inputs breaking both accessibility and testability). Full signed-in flow verification blocked by this Supabase project's email-confirmation requirement — documented as a known gap rather than worked around. |
