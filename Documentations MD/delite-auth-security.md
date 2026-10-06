# Account Security: Forgot Password, MFA, Admin User Management, Last-Owner Protection

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Forgot/reset password, admin TOTP MFA, real Admin Users management, last-owner protection, session sign-out scope |
| File           | `Documentations MD/delite-auth-security.md` |
| Branch         | figma |
| Owner          | Claude |
| Status         | Done — all Supabase-Auth-native (no custom crypto), live-verified where this session's own account allows, one dashboard-only setting flagged rather than falsely claimed enabled. Backend (Edge Function + RLS) MFA enforcement added 2026-09-30, still OFF by default. Role matrix + live support-role verification added 2026-09-30 (second pass). Owner-password-exposure remediated + `profiles` RLS narrowed to least-privilege 2026-09-30 (third pass, see below). |
| Created        | 2026-09-29 |
| Last updated   | 2026-09-30 (security cleanup pass — owner password rotation triggered, `admin-system-health` deployed, `profiles` RLS narrowed, support test account rotated; new `return_requests` RLS added — see revision log) |

## Summary

Adds forgot/reset password (customer + admin, same Supabase Auth accounts), optional TOTP MFA for
owner/admin accounts (enroll/challenge/verify/unenroll, all via `supabase.auth.mfa.*` — no custom
algorithm), a real Admin Users management page (replacing the `/admin/settings/users` placeholder)
backed by a new `admin-users-manage` Edge Function that never reuses the bootstrap-only
`admin-bootstrap` function for ongoing operations, and a database-level last-owner-protection
trigger that blocks demoting/disabling/deleting the final owner account regardless of caller.

## Why

`delite-accounts-orders-reviews-admin.md`'s "Known gaps" flagged admin promotion as entirely
manual (a hand-run SQL statement) with no invite/promotion UI. This phase closes that gap properly,
plus adds the account-recovery flows every real auth system needs, following an explicit
instruction to use Supabase Auth's own primitives throughout rather than building anything custom.

## Scope

**In scope:** `/forgot-password`, `/reset-password` routes (shared by customer and admin — same
underlying Supabase Auth accounts, per the existing architecture); `AuthContext.requestPasswordReset`/
`updatePassword`; an MFA challenge step in `AdminLogin.tsx`; a new `/admin/settings/security` page
(self-service TOTP enroll/unenroll); a new `/admin/settings/users` page (list/invite/change-role/
revoke) backed by `admin-users-manage`; a database trigger preventing the last owner from being
demoted/disabled/deleted; `signOut()` switched to local-scope only (#24).

**Explicitly not in scope:** a full multi-device session list ("Sign out everywhere" / per-device
revocation UI) — assessed and intentionally not built, see "Session management" below; customer-
facing MFA (not required by business default, per explicit instruction); a custom password-strength
meter beyond the browser's native `minlength`.

## Supabase Auth email settings audit (#20)

Audited via the same tooling this project has always used for Supabase (CLI/MCP, no dashboard
access from this session) — **no project-auth-config API was available to inspect or change**
email confirmation / redirect URL / site URL settings programmatically, same limitation already
documented in `delite-accounts-orders-reviews-admin.md`'s "Known gaps." What IS newly confirmed
this pass: `src/lib/supabaseClient.ts` does not set `detectSessionInUrl` explicitly (defaults to
`true`, required for the password-recovery link's URL-fragment session to establish automatically)
or `flowType` (defaults to implicit) — both defaults are compatible with the reset-password flow
built here, verified by the redirect actually landing a real session on `/reset-password` in
testing (see Testing below). **No dashboard setting was changed by this session** — if email
confirmation is still required for ordinary signup (per the prior pass's known gap), that remains
true; nothing here depends on it or fixes it.

## Forgot password (#21) / Reset password UX (#22)

`AuthContext.requestPasswordReset(email)` calls `supabase.auth.resetPasswordForEmail(email,
{ redirectTo: origin + "/reset-password" })` and **always returns success to the caller**,
regardless of what Supabase actually reports (including "no such user") — `ForgotPassword.tsx`
shows the same generic "If an account exists for this email, you'll receive reset instructions"
message every time, so this endpoint can never be used to enumerate registered emails. `/login` and
`/admin/login` both link to `/forgot-password` (#21's routes are shared, not duplicated per
account type — one Supabase Auth user base, per the existing architecture note in
`delite-admin.md`).

`/reset-password` (`ResetPassword.tsx`) reads its validity from `useAuth().session` — Supabase's
SDK establishes a real recovery session from the email link's URL fragment before this component
renders (`detectSessionInUrl`, confirmed above); no session after loading finishes means an
invalid/expired/already-used link, shown honestly rather than a broken form. On successful update
(`supabase.auth.updateUser({ password })`), the session is deliberately signed out again and the
customer is sent to `/login` to sign back in with the new password — chosen over "stay logged in"
because a reset link opened on a shared/public device shouldn't leave an active session behind.

## Admin password recovery (#23)

Same flow, same accounts, same `/forgot-password` route — `AdminLogin.tsx` links to it exactly like
`Login.tsx` does. No separate admin credential store exists anywhere in this codebase (confirmed by
this session's own audit of `AuthContext.tsx`/the `profiles` schema) — admins are ordinary
`auth.users` rows with `profiles.admin_role` set, so "admin password recovery" is not a distinct
mechanism to build, only a link to surface, which is what this pass does.

## Session management (#24)

`signOut()` now calls `supabase.auth.signOut({ scope: "local" })` — **this device/browser only**,
not every session on the account (the prior default, Supabase's own `'global'` scope, silently
signed a customer out of a phone if they clicked "Sign out" on a laptop). A full session-list/
per-device-revocation UI was assessed and **not built this pass**: Supabase Auth's client SDK does
not expose a "list my other active sessions" read (that's an Admin-API-only capability, i.e.
service-role, not something a customer's own signed-in session can query about itself) — building
one would mean a customer-facing Edge Function granting a *customer* session enough server-side
reach to enumerate their own auth sessions, which doesn't cleanly fit the existing service-role
boundary this project keeps strictly server-side. Documented here rather than faking a "Your
Devices" list from `localStorage`, which the spec explicitly warned against (#24: "Do not fake
'devices' from localStorage").

## MFA (#25-26)

`@supabase/supabase-js@^2.116.0` (confirmed via this session's own audit) already includes
`auth.mfa.enroll/challenge/verify/unenroll/listFactors/getAuthenticatorAssuranceLevel` — no custom
TOTP/crypto was written. `src/admin/pages/settings/Security.tsx` is a self-service page (any signed-in
admin manages their OWN factor — enroll shows a real QR code + manual-entry secret from Supabase's
own `auth.mfa.enroll()` response, verify via `challenge()`+`verify()`, unenroll via `unenroll()`).

**Enforcement is real, not just a UI nudge (#26):** `AuthContext.signIn()` checks
`auth.mfa.getAuthenticatorAssuranceLevel()` immediately after a successful password sign-in and
returns `mfaRequired: true` whenever the account has a verified factor and the session is still at
AAL1. `AdminLogin.tsx` uses that flag to show a challenge step (6-digit code, `challenge()` +
`verify()`) before navigating anywhere — the resulting AAL2 session is Supabase Auth's own claim on
the JWT, checked by Supabase itself on every subsequent request that cares about AAL, not a client
`if` statement that could be bypassed by editing local state. Customer `/login` deliberately has no
challenge step (#25: "Do not require customer MFA by default").

MFA is currently opt-in per-admin, not centrally enforced ("owner/admin MUST enroll") — no
`admin_role`-level policy blocks a non-enrolled owner/admin from signing in. That's a deliberate
scope boundary (#26 asked for enforcement of whatever policy IS implemented, not for this pass to
invent a mandatory-enrollment policy the business hasn't decided on) — see Known gaps.

## Admin Users page (#27-28) / Invite (#29) / Role changes (#31) / Disable access (#33)

`/admin/settings/users` (owner-only, matching the existing `ADMIN_NAV` restriction, now flipped
from `placeholder` to `active`) is a real list — name, email, role, status (Active/Revoked),
created date, last sign-in, MFA status (best-effort — Supabase's Admin API's `factors` field on a
listed user, when present; shown as "Unknown" rather than guessed if absent) — backed by the new
`admin-users-manage` Edge Function. Never exposes password hashes or tokens (#28) — the function's
`list` action only ever returns the fields above.

**Invite** uses `auth.admin.inviteUserByEmail()` (Supabase's own invite-email mechanism, not a
password handoff between people — #29's explicit preference) then sets `profiles.admin_role`.
**Role change** and **revoke** are plain `profiles` updates through the same function — revoke
clears `admin_role`/`is_admin` but never calls `auth.admin.deleteUser()` (#33's explicit
distinction: removing admin permission is not the same as destroying the customer's account; a
revoked admin keeps their ordinary storefront login).

## Do not reuse bootstrap unsafely (#30)

`admin-bootstrap` (from the prior accounts pass) is **untouched and still exists**, but
`admin-users-manage` is a genuinely separate function: it requires a real caller session
(`auth.getUser(jwt)`), re-verifies `profiles.admin_role === 'owner'` server-side for every action
(never trusts the frontend's own owner-only route gate), and is the only path this pass adds for
ongoing user management. `admin-bootstrap`'s `x-internal-token` gate remains its own thing, reserved
for genuine first-time bootstrap, exactly as before.

## Last-owner protection (#32)

`private.prevent_last_owner_change()` (trigger, `BEFORE UPDATE OR DELETE ON public.profiles`, see
`20260929090000_last_owner_protection.sql`) raises an exception whenever the row being changed is
currently the only `admin_role = 'owner'` account and the change would demote
(`admin_role` moving away from `'owner'`), disable (`is_admin` flipping to `false`), or delete it.
**Applies unconditionally, including to service-role callers** — this is a business invariant, not
an RLS/permission boundary, so `admin-users-manage`'s own service-role client is just as subject to
it as a direct table edit would be. A `DELETE` on `auth.users` cascades into `profiles` (existing
FK, `on delete cascade`) and correctly still fires this trigger, so even deleting the underlying
auth account is blocked for the last owner.

## Admin user activity log (#34)

Every mutating `admin-users-manage` action (`invite`, `changeRole`, `revoke`) writes an
`admin_activity_log` row (`admin.invited` / `admin.role_changed` / `admin.access_revoked`) with the
acting owner as `actor_id`, the affected user as `target_id`, and small safe metadata (email/role —
never a credential). Uses the function's own service-role client (bypasses the log's `actor_id =
auth.uid()` RLS check by design, same pattern already established for `create-order`'s analytics
writes) since the acting owner's session token authenticates the REQUEST but the log write itself
happens server-side.

## Backend (Edge Function + RLS) MFA enforcement (2026-09-30)

Closes the RLS-layer gap flagged below in the prior pass's Known issues: `RoleRoute`'s AAL2 check
was real (backed by Supabase's own JWT `aal` claim) but was a **frontend-only** gate — a stolen
AAL1 token could still call a privileged Edge Function directly, or write straight to an
RLS-protected table, bypassing the UI entirely. This pass moves the same policy into both of those
real security boundaries, without duplicating the AAL-check logic once per function.

**Single source of truth**: `private.app_config` (new table, `key text primary key, value text`),
seeded `('require_admin_mfa', 'false')`. Both surfaces below read this SAME row — there is no
second copy of the "is MFA required right now" flag anywhere, so they can never drift out of sync
with each other or with what `admin-security-policy` shows the frontend.

- **RLS**: `private.admin_mfa_satisfied()` (`SECURITY DEFINER`, `stable`) returns `true`
  unconditionally when the flag is off (zero behavior change while off), else requires
  `auth.jwt() ->> 'aal' = 'aal2'`. `auth.jwt()` is correct here because Postgres RLS evaluates a
  policy using the REQUESTING user's own JWT claims, not the table-owning role's. ANDed
  (additively, never replacing the existing role check) onto the `has_admin_role(...)` policy for
  every table still written *directly* by the client rather than through an Edge Function:
  `cms_section_drafts`, `cms_media`, `cms_promotions` (all their combined `write_content`
  policies), `product_reviews` (`reviews_update_admin`), `contact_enquiries`
  (`contact_enquiries_update_admin`). Migration:
  `supabase/migrations/20260930100000_admin_mfa_backend_enforcement.sql`.
- **Edge Functions**: new shared helper `supabase/functions/_shared/auth/requireAdmin.ts` —
  extracts the JWT, resolves `profiles.admin_role` via the service-role client, checks it against a
  caller-supplied allowed-role list, and — when the DB flag is on — rejects a non-AAL2 caller with
  `403 { error, code: "mfa_required" }`. **Design note on why this ISN'T a `db.rpc()` call into
  `admin_mfa_satisfied()`**: a service-role-authenticated RPC call does not carry the END USER's JWT
  as the "current" `auth.jwt()` context — calling that function from the service-role client would
  silently check the SERVICE ROLE's own (nonexistent) AAL, always passing regardless of the actual
  caller's session. Instead the helper decodes the caller's own `aal` claim locally by parsing the
  JWT string it already received in the `Authorization` header (a JWT's `aal` claim is always
  present and requires zero extra network round trip to read), and separately reads the
  `require_admin_mfa` flag directly from `private.app_config` via a plain table read through the
  service-role client's elevated privileges. Applied uniformly (reads and writes alike, matching
  `RoleRoute`'s existing all-or-nothing-except-Security model) to every `admin-*` Edge Function that
  had its own inline auth check: `admin-users-manage`, `admin-odoo-link` (this also fixed its
  legacy `is_admin`-boolean-only check to use `admin_role`), `admin-retry-email`,
  `admin-retry-odoo-order-sync`, `admin-reviews-list`, `admin-system-health`, `review-notify`.
  `admin-security-policy` itself is NOT converted to `requireAdmin` (deliberately kept its existing
  "any authenticated session" model — the policy value itself isn't sensitive, and `RoleRoute` reads
  it before it even knows whether the account is an admin), but was updated to read the same
  `private.app_config` row instead of the old `Deno.env.get("REQUIRE_ADMIN_MFA")` mechanism, so the
  frontend's displayed policy can never disagree with what's actually enforced.
  `admin-bootstrap` is untouched — shared-secret-gated, not session-based, a different security
  model entirely.
- **Security-page exception preserved**: verified structurally impossible to create a lockout —
  `supabase.auth.mfa.enroll/challenge/verify()` all go straight to Supabase Auth itself, never
  through any hardened Edge Function or RLS-gated table above, so an AAL1 owner can always reach
  `/admin/settings/security` and enroll even with the flag on.
- **Still OFF by default** — `private.app_config`'s seed row is `'false'`. Flipping it on is a
  deliberate manual SQL step (`update private.app_config set value = 'true' where key =
  'require_admin_mfa'`), same "never enable automatically" rule as the frontend-only version this
  supersedes.
- Verified post-migration: `private.admin_mfa_satisfied()` returns `true` while the flag is off
  (confirmed via direct SQL) — zero behavior change; `information_schema.role_table_grants` on
  `private.app_config` shows no `anon`/`authenticated` grants, only the table owner — confirming it
  is reachable only through the `SECURITY DEFINER` RLS helper and the service-role Edge Function
  client, never directly.

## Follow-up: security-hardening verification pass (2026-09-30, second pass)

A verification-only pass explicitly asked to close remaining gaps before CMS visual-editor work —
no new business features. Investigated the actual current state first (the requireAdmin()/RLS-AAL
work above was already built and **deployed live** by the time this pass started — migration
`20260930094506` applied, every `admin-*` Edge Function at its latest version) rather than
re-building anything. Found and fixed real, concrete gaps; ran a real live test using a controlled
non-owner account; left everything else as an explicit, honest known gap rather than guessing.

### Role matrix

Every role's access to every major Admin area, read off the actual enforced code (not aspirational)
— `owner` has full access to every row below and is omitted as redundant.

| Area | admin | content | merchandising | support | analytics |
|---|---|---|---|---|---|
| Overview | rw | rw | rw | rw | rw |
| Website (Homepage/Hero/Announcement/Promotions/Nav/Footer/SEO), Marketing Media | rw | rw | — | — | — |
| Merchandising (Featured/Trending/New Arrivals/Categories) | rw | — | rw | — | — |
| Products (read-only browser) | r | — | r | — | — |
| Orders | rw* | — | — | r/retry | — |
| Payments | rw* | — | — | r/retry | — |
| Reviews (moderate) | rw | — | — | rw | — |
| Contact Enquiries (status) | rw | — | — | rw | — |
| Analytics (all pages) | r | — | — | — | r |
| Analytics → Carts | r | — | — | r | r |
| Integrations Health, Odoo status | r | — | — | — | — |
| Email Delivery (view + retry) | rw | — | — | rw | — |
| Admin Appearance | rw | rw | rw | rw | rw |
| Security (own MFA factor) | rw | rw | rw | rw | rw |
| Admin Users | — | — | — | — | — |
| Activity Log | r | — | — | — | — |

\* "rw" for `admin` on Orders/Payments means status changes reachable through the existing
Edge-Function-mediated retry actions, not arbitrary field writes — there is no direct
`orders`/`payment_attempts` client write path for any role, `owner` included; every mutation to
those two tables goes through `create-order`, `payment-verify`, `razorpay-webhook`, or
`admin-retry-odoo-order-sync`, all service-role, all in `supabase/functions/`.

**Consistency, checked layer by layer** (ADMIN_NAV → `RoleRoute` → RLS → RPC role checks → Edge
Function `requireAdmin()` calls), by reading the actual deployed source/policies, not inferring
from the UI:

- `src/admin/services/adminAuth.ts` (`ADMIN_NAV`) is the single role list `RoleRoute`
  (`src/admin/components/RequireAdminRole.tsx`) reads — by construction, the two can't disagree.
- RLS (`pg_policies`, read live via `execute_sql`) and the `admin_payments_kpis`/
  `admin_payments_list`/`admin_reviews_query` RPCs (via `private.analytics_require`) use the exact
  same role sets as the matching `ADMIN_NAV` entries for every area above: Website/Media/CMS-write
  → owner+admin+content; Merchandising → owner+admin+merchandising; Orders/Payments/Reviews/
  Contact/Email → owner+admin+support; Analytics → owner+admin+analytics (+support on Carts only,
  matching the nav). No mismatch found in any of these.
- Edge Functions: `admin-users-manage` → `["owner"]`; `admin-retry-odoo-order-sync`/
  `admin-retry-email`/`admin-odoo-link`/`admin-reviews-list` → `["owner","admin","support"]`;
  `admin-system-health` → `["owner","admin"]` — all match their page's `ADMIN_NAV` roles exactly.
- **One real, pre-existing mismatch found, NOT fixed this pass — see "Genuinely remaining gaps"
  below**: `profiles`' own admin-read RLS policy (`profiles_select_admin`) is scoped to
  `private.is_admin()` (a boolean — true for every admin role) rather than a specific role set like
  every other table above. Any admin role, including `analytics`, can directly query the full
  `profiles` table (every customer's name/email plus every OTHER admin's `admin_role`) via
  PostgREST — narrower than what the Admin Users PAGE shows (owner-only), because that narrowness
  is currently a `RoleRoute`/Edge-Function boundary, not an RLS one, for the profiles table itself.
  This was already flagged as a known, deliberately-deferred item in
  `delite-production-operations.md` before this pass (not newly discovered), and is left alone here
  for the same reason: several existing admin pages (Orders/Payments/Reviews) join `profiles` for
  customer name/email, and narrowing this policy without a full audit of every consumer risks a
  real regression. See Known issues.
- **One real gap found and fixed this pass**: `ADMIN_NAV`'s `Security` entry was `OWNER_ADMIN`
  only — `RoleRoute`'s AAL2-exception logic ("never lock a session out of the one page that lets it
  enroll") is real, but the ROLE check runs *before* the AAL check, so a `content`/`merchandising`/
  `support`/`analytics` account could never reach `/admin/settings/security` at all, regardless of
  MFA policy. Once `require_admin_mfa` is ever turned on, those four roles would have been
  permanently locked out with no self-service recovery path. Fixed: `Security`'s `roles` widened to
  `ALL_ROLES` in `src/admin/services/adminAuth.ts` (every admin role legitimately needs to manage
  its own MFA factor — this is a self-service personal-security page, not a data-access one).
  Verified live (see below): the support-role test account could not reach `/admin/settings/security`
  before this fix, and could reach it correctly afterward.

### Support role — real end-to-end test (live, both layers)

Reused the existing `delite-support-test@gmail.com` test account (from an earlier pass — found via
SQL with `admin_role = 'admin'` and `is_admin = true`, a stale leftover from prior testing rather
than the "then disabled" state an earlier doc entry described; **noted as a minor hygiene gap, not
a security one** — see Known issues). Reset its password via `admin-bootstrap` (the documented,
re-runnable ops tool for exactly this — `x-internal-token` gated, never touches the real owner
account) and set `profiles.admin_role = 'support'` directly. Left it at `support` after testing.

**A. Route/sidebar behavior** (live browser, `tests/interaction/admin-security-hardening.spec.ts`,
now a permanent regression test): sidebar correctly shows Overview/Orders/Payments/Reviews/Contact
Enquiries/Email Delivery/Security and hides Admin Users/Homepage/Featured Products/Integrations
Health; every support-permitted route renders real content (no "Access denied"); `/admin/settings/users`
correctly shows "Access denied".

**B. Actual backend behavior** (real HTTP calls with the support account's real session token,
bypassing the UI entirely): `POST admin-users-manage` → **403 Forbidden** (owner-only, correctly
rejects support); `POST rpc/admin_payments_list` → **200** (support-permitted, correctly allowed).
Confirms the spec's own point exactly: **a hidden sidebar item alone would not have proven
anything** — this additionally proved the Edge Function itself independently rejects the call.

Also visually verified (screenshots below): Payments/Orders/Reviews/Contact/Email Delivery/Security
all render real, correct content for `support`; Admin Users/Integrations Health correctly show
"Access denied" for both `support` and (separately tested) `admin` roles.

### Critical fix: hardcoded owner password in three committed-shape test files

While reading `admin-panel.spec.ts` for its existing sign-in pattern (to model the new
security-hardening test on it), found the **real production owner account's actual plaintext
password hardcoded** in three Playwright spec files: `admin-panel.spec.ts`, `admin-analytics.spec.ts`,
`analytics-tracking.spec.ts` (`admin@unimisk.com` + a literal password, all three). These files are
currently untracked/uncommitted, but were clearly written to eventually ship — committing them as-is
would have put the live owner's real password in git history permanently, readable by anyone with
repo access indefinitely.

**Fixed**: all three now read `ADMIN_TEST_EMAIL`/`ADMIN_TEST_PASSWORD` from the environment (skip
gracefully, same existing convention, if unset — confirmed via a real `npx playwright test` run
with the vars unset: 23/23 tests skip cleanly, zero crashes). No credential of any kind remains in
any test file. **Recommended follow-up the user should do, not something this session did**: rotate
`admin@unimisk.com`'s real password (it was exposed in a plaintext file on disk this session read),
and use a dedicated non-owner test admin account (the same `admin-bootstrap` pattern as the support
test account above) for these three specs going forward rather than ever pointing
`ADMIN_TEST_EMAIL`/`ADMIN_TEST_PASSWORD` at the real owner.

### MFA test matrix — what was and wasn't live-tested, and why

| Scenario | Result |
|---|---|
| Policy OFF, AAL1 owner/admin → allowed | Already true by construction (`private.admin_mfa_satisfied()` short-circuits to `true` when the flag is off) — not separately re-tested live. |
| Policy ON, AAL1 → Security page allowed | **Live-verified** (frontend layer, via a mocked `admin-security-policy` response — see below). Backend layer (RLS/`requireAdmin`) verified by direct code/SQL read, not live execution. |
| Policy ON, AAL1 → sensitive operation rejected | **Live-verified at the frontend layer only** (mocked policy response: every non-Security admin page shows "Two-factor authentication required"). **NOT live-tested against the real backend** — see below. |
| Policy ON, AAL2 → sensitive operation allowed | Not live-tested (would require a real enrolled TOTP factor on a test account — out of scope for a verification-only pass without provisioning a new authenticator). Verified by code read only. |
| support AAL2 still cannot perform an owner-only operation | Verified by code read: `requireAdmin()`/RLS AND the role check with the AAL check — an AAL2 support session still fails `admin-users-manage`'s `["owner"]` check first. Not separately live-tested (would need a real AAL2 support session). |

**Why the live backend policy-ON test wasn't run**: this session attempted a live end-to-end test —
sign in as the AAL1 support account, flip `private.app_config.require_admin_mfa` to `'true'`,
attempt a real write (a no-op status update on an existing `contact_enquiries` row), confirm RLS
blocks it, flip the flag back — and the write attempt was **correctly refused by the harness's own
permission system** as a "modify shared resources" action before it ran (this is a real, currently
in-use production customer record). Toggling the global `require_admin_mfa` flag itself would
equally affect every real admin session in production for the duration of the test, so this session
did not pursue it through another tool either. **This is deliberate, not an oversight**: the exact
same enforcement logic was verified by direct, first-hand reading of
`private.admin_mfa_satisfied()`'s SQL body and `requireAdmin()`'s TypeScript (both quoted verbatim
above) rather than by execution. A live version of this specific test (real write, real flag flip,
both reverted) is a reasonable follow-up **the user should explicitly schedule/approve** — it was
not silently skipped, and not worked around.

The frontend-only half of the same scenario (rows 2–3 above) WAS run live: `tests/interaction/admin-security-hardening.spec.ts`'s second describe block intercepts only the `admin-security-policy`
HTTP response (forcing `requireAdminMfa: true`) against the support test account's genuinely-AAL1
session (no factor enrolled) — a real, safe way to exercise `RoleRoute`'s exact AAL-gate branch
without ever writing to the live, global policy flag. Both assertions passed.

### Supabase Auth manual checks (#10-12 of the spec)

Checked everything queryable with this session's actual tooling (Supabase MCP: SQL, migrations,
Edge Functions, advisors — no Auth/Management-API config tool available, same conclusion as every
prior pass):

- **Owner MFA status**: queried `auth.mfa_factors` directly (read-only, no secret exposed) —
  **Not enrolled**. The support test account is also not enrolled (expected — a fresh test account).
- **Leaked Password Protection**: `get_advisors(type: "security")` — **confirmed still disabled**
  (`auth_leaked_password_protection` WARN). No tool in this session's toolset can change it — exact
  manual action: **Supabase Dashboard → Authentication → Policies → Leaked Password Protection →
  enable**. Not claimed enabled.
- **Site URL / Redirect URLs / email-confirmation setting**: no Management-API-equivalent tool
  available in this session (same as every prior pass) — genuinely unknown from here, not guessed.
  Exact manual action: **Supabase Dashboard → Authentication → URL Configuration** (Site URL /
  Redirect URLs) and **Authentication → Providers → Email** (Confirm email toggle).
- These three are exactly what `admin-system-health`'s "Production Readiness Checklist" already
  shows as `UNKNOWN / MANUAL CHECK REQUIRED` — confirmed correct, not stale, by this pass's own
  independent checks above.

### Deno Edge Function test-harness assessment (#21 of the spec)

Not a giant framework — one lightweight, genuinely-useful seam. `_shared/auth/requireAdmin.ts`'s
JWT-`aal`-decoding logic (`decodeJwtAal`) has zero Deno-specific or `npm:`-specifier dependencies
(just `atob`/`JSON.parse`), so it was extracted to a standalone `_shared/auth/jwt.ts` and covered by
a real Vitest suite (`_shared/auth/jwt.test.ts`, 7 tests: aal1/aal2/missing-claim/unrecognized-value/
malformed-token/base64url edge cases) — `vite.config.ts`'s `test.include` widened to pick up
`supabase/functions/_shared/**/*.test.ts`. This is the single most security-critical pure-logic
piece in the whole MFA-enforcement chain (a decoding bug here would silently defeat the AAL check
everywhere at once), and it's now the one part of `supabase/functions/**` with automated coverage.

**The rest of `requireAdmin()` (role lookup, DB config read) and the retry functions' claim logic
were assessed and are NOT practical to unit-test this way** — they depend on a real or faithfully-
mocked Postgres connection (`db.from("profiles").select(...)`, atomic `UPDATE ... WHERE ... IS
NULL` claims), which is architecturally a different, heavier kind of test (an integration harness
against a real or containerized Postgres) than "extract a pure function." Per the spec's own
instruction ("if not practical, document why and retain the existing integration-test strategy"),
these stay covered by the existing strategy: manual code trace (documented in
`delite-production-operations.md`) plus the real live support-role Playwright test above, which
does exercise `requireAdmin()`'s full role-lookup path end-to-end against the real deployed
function and the real database.

### Accessibility fix: shared admin `Drawer` had no focus trap or focus restoration

Found while checking the Payments detail drawer (spec §19: "focus trap where drawer/dialog exists
... focus restores"): `src/admin/analytics/ui.tsx`'s `Drawer` — the ONE shared slide-over behind
Payments, Reviews, and every analytics-page detail view (11 files import it) — had `role="dialog"`/
`aria-modal="true"`/Escape-to-close/initial-focus-on-open already correct, but **no Tab focus trap**
(Tab could escape into page content behind the open drawer) and **no focus restoration** to
whatever triggered it once closed. Fixed with the same trap/restore pattern already established in
`MobileNavDrawer.tsx` (see `frontend-foundation-uiux-refactor.md`) — captures
`document.activeElement` before opening, restores it on cleanup, and cycles Tab/Shift+Tab between
the panel's first/last focusable elements while open. Benefits all 11 consumers for free (no
per-page changes needed) — `Payments.tsx`/`Reviews.tsx`'s own drawers, plus every analytics
page's (Carts/Traffic/Overview/Recommendations/Search/Products/Pages) detail drawer.

## Follow-up: security cleanup pass (2026-09-30, third pass)

A small, deliberately scoped pass to close the five specific items the second pass's own report
flagged as remaining — not a re-audit of the whole application. Real credential values are never
repeated in this doc; only occurrence paths and remediation status.

### 1–2. Owner password exposure — scan and Git history

Repo-wide scan (source, tests, docs, `.env.example`, Playwright config, scripts, fixtures) for the
old owner password string and any other hardcoded admin/support credential: **zero remaining
plaintext occurrences.** The three test files fixed in the prior pass
(`admin-panel.spec.ts`/`admin-analytics.spec.ts`/`analytics-tracking.spec.ts`) are confirmed
env-var-only, and no other file ever contained it.

**Git history**: this repository has exactly 7 commits total (`git rev-list --all`). Every one was
checked directly (`git grep` against each commit) — **the old password was never committed.** It
only ever existed in uncommitted working-tree files, which were never staged. **No history rewrite
was needed or performed.**

### 3. Owner password rotation

Per explicit instruction, no new password was invented, set, or printed. Instead, the same
production `resetPasswordForEmail` flow any customer/admin already uses
(`AuthContext.requestPasswordReset`, `/forgot-password`) was triggered for `admin@unimisk.com`
through the actual running app. **Confirmed via Supabase's own auth logs** (`auth_logs` /
`auth_audit_logs`, read-only query — not assumed): exactly one `user_recovery_requested` event,
`POST /recover`, **status 200**, and one `mail.send` (`mail_type: "recovery"`) to
`admin@unimisk.com`. The old password remains valid **until the owner completes the reset** — this
flow doesn't invalidate anything on its own, by design (see "Reset password UX" above: the app only
signs the session out and requires the new password after the recovery link is actually used).

**Operator action required to finish the rotation** — the automated part is done, this part isn't:
1. Open the inbox for `admin@unimisk.com` and find the "Reset your password" email (sent
   2026-09-30, subject line from Supabase Auth's default template).
2. **Important caveat**: the reset link points at `http://localhost:5173/reset-password` — this
   session's dev-server origin at trigger time (`AuthContext`'s `redirectTo` is always
   `window.location.origin`, and this project has no known/confirmed public deployment URL — see
   `odoo-checkout-portal-returns.md`'s finding that the real live site may be Odoo-hosted, not this
   React app). **The link is only usable from this exact machine while the dev server is running.**
   If the real owner is a different person/location than whoever is running this session, they
   should instead open `/forgot-password` themselves from wherever they actually access the site,
   which will generate a fresh, correctly-targeted link.
3. Click the link, choose a new password (never told to or generated by any AI session), submit.
4. Confirm the OLD password no longer authenticates (attempt a sign-in with it — should fail).

### 4–5. Test secret architecture

`ADMIN_TEST_EMAIL`/`ADMIN_TEST_PASSWORD` (fixed in the prior pass) and this pass's own
`SUPPORT_TEST_EMAIL`/`SUPPORT_TEST_PASSWORD` (`admin-security-hardening.spec.ts`) are the only two
credential pairs any test in this repo reads, both exclusively from `process.env`, both `test.skip`
with a clear reason when unset — verified by actually running the full privileged suite with no
env vars set: **23/23 tests skip cleanly**, zero fallback to any hardcoded value.
`.gitignore`'s `.env` / `.env.*` (with `!.env.example`) pattern confirmed via `git check-ignore` to
cover every local env file that exists (`.env.local`, `.env.interaction`,
`.env.interaction.example`); `git ls-files` confirms only `.env.example` (a placeholder template)
is tracked.

### 6–9. `admin-system-health` — verified, deployed, confirmed live

Reviewed the pending local diff first: reads `profiles` for `owner` ids (service-role, already
outside RLS), calls the Auth Admin API's `getUserById` per owner id (the exact same call
`admin-users-manage`'s `list` action already uses elsewhere), and checks only `factors[].status`
— never a factor's secret/seed. Ran the full check suite first (clean), then deployed
`admin-system-health` (now version 4) along with its `_shared/auth/{requireAdmin,jwt}.ts`
dependencies — no other function touched. **Verified live** through the real authenticated Admin
path (a real sign-in, a real bearer token, a real `POST admin-system-health` call): returned
`mfaEnrolledForOwner: false`, matching the independently-confirmed real state (see below) — no
factor secrets, QR seeds, or recovery codes anywhere in the response.

### Owner MFA status (confirmed twice, independently)

**Not enrolled.** Confirmed both via a direct read-only SQL query against `auth.mfa_factors`
(no factor exists for the owner's user id) and via the redeployed `admin-system-health` endpoint's
`mfaEnrolledForOwner: false`. `REQUIRE_ADMIN_MFA` (`private.app_config.require_admin_mfa`)
**remains `false`** — not enabled, per explicit instruction.

### 8–17. `profiles` RLS — the main fix in this pass

**Original behavior**: `profiles_select_admin` used `private.is_admin()` — a boolean, `true` for
every admin role. Any signed-in `content`/`merchandising`/`analytics`/`support` account could
directly `GET /rest/v1/profiles` via PostgREST and read every customer's and every other admin's
full row (`full_name`, `phone`, `admin_role`, `is_admin`, etc.) — not just their own.

**Real consumers audited before changing anything** (not assumed):
- Frontend: `grep` across all of `src/` found exactly two direct consumers of `public.profiles` —
  `AuthContext.tsx`'s `loadProfile()` and `Account.tsx`'s update call, both **always**
  `.eq("id", <the caller's own auth uid>)`. Already fully covered by the untouched
  `profiles_select_own` policy; neither needs the broad grant.
- Every `admin-*` Edge Function (`admin-users-manage`, `admin-system-health`,
  `requireAdmin.ts`, `admin-bootstrap`) reads `profiles` via the **service-role client**, which
  bypasses RLS entirely — the policy's scope has zero effect on any of them.
- `admin_payments_list`/`admin_reviews_query` (and every `admin_analytics_*`/`has_admin_role`/
  `admin_mfa_satisfied` function) are `SECURITY DEFINER`, owned by `postgres` — confirmed via a
  direct query against `pg_roles.rolbypassrls = true` for that role. Their internal
  `join public.profiles` also bypasses RLS regardless of this policy's scope.
- **Conclusion, verified not assumed**: nothing currently deployed depends on the broad grant. It
  was pure unnecessary excess privilege, not a load-bearing feature.

**Profile access matrix** (derived from the audit above, not the spec's example table — every row
reflects what the actual code needs today):

| Role | Direct `profiles` SELECT (RLS) | How the role's real features get customer data instead |
|---|---|---|
| OWNER | own row + all rows | N/A — full access is correct for this role |
| ADMIN | own row + all rows | N/A — full operational access is correct for this role |
| SUPPORT | own row only | Orders/Payments/Reviews/Contact Enquiries all read customer name/email through `SECURITY DEFINER` RPCs or service-role Edge Functions (`admin_payments_list`, `admin_reviews_query`, `admin-reviews-list`) — never a direct `profiles` query, so no RLS grant on `profiles` was ever needed for these to work |
| CONTENT | own row only | Website/Media/CMS editing has no customer-data dependency at all |
| MERCHANDISING | own row only | Merchandising/Products browsing has no customer-data dependency at all |
| ANALYTICS | own row only | Every Analytics page reads `admin_analytics_*` RPCs (already `SECURITY DEFINER`, already `postgres`-owned, already bypass RLS) — no raw `profiles` PII was ever actually needed |
| Authenticated customer | own row only | Unchanged — `profiles_select_own` |

**Migration**: `supabase/migrations/20260930130000_narrow_profiles_admin_select.sql` (new, additive
— no existing migration edited). Drops and recreates `profiles_select_admin` scoped to
`private.has_admin_role(array['owner','admin'])`. `profiles_select_own`/`profiles_update_own` (the
only write policies on this table) are **untouched** — this pass is SELECT-only, per explicit
instruction. No INSERT/DELETE client policy exists on `profiles` to begin with (rows are created by
the `handle_new_user` trigger on signup, never a direct client insert).

**Admin Users (§11) stays functional by construction, not by a special case**: it never reads
`profiles` directly — `admin-users-manage`'s service-role client is unaffected by any RLS policy on
this table.

**Support workflows (§12) stay functional by construction**: same reasoning — Orders/Payments/
Reviews/Contact Enquiries all already read customer name/email through RPCs/Edge Functions that
bypass RLS, so narrowing direct-table RLS access changes nothing about what those pages can show.

**Analytics privacy (§13)**: confirmed the Analytics role already works exclusively from aggregate
`admin_analytics_*` RPCs — it had no genuine raw-`profiles` dependency to "fix"; the audit just
confirmed the broad grant was already unused for this role too.

**Content/Merchandising (§14)**: confirmed both roles' real features (Website/Media/CMS editing,
Merchandising curation) have zero customer-profile dependency — the broad grant was unused for
these roles from day one.

### 16. Live RLS test matrix — real, not simulated

One real sign-in (`delite-support-test@gmail.com`), one session token, reused across five role
values by updating `profiles.admin_role` via SQL between requests (the policy is evaluated fresh
per request from the CURRENT row, never cached in the JWT) — a real, live test of the deployed
policy, not a description of intended behavior:

| Role | Can read own profile | Can read another user's (owner's) profile | Broad list (`?select=id&limit=10`) |
|---|---|---|---|
| support | ✅ (expected) | ❌ (expected — was previously ✅, now correctly blocked) | 1 row only (self) |
| content | ✅ | ❌ | 1 row only |
| merchandising | ✅ | ❌ | 1 row only |
| analytics | ✅ | ❌ | 1 row only |
| admin | ✅ | ✅ (expected — unchanged) | 3 rows returned |

**18/18 individual assertions passed.** `owner` wasn't separately live-tested (the real owner
account is never used for this kind of probing — see "Do not alter the owner account" throughout
this project's history); `admin` shares the exact same policy clause (`array['owner','admin']`), so
its pass is equivalent evidence for `owner`'s behavior.

### 17. Regression check: Orders/Payments/Reviews/Contact Enquiries/Admin Users

Re-ran `admin-security-hardening.spec.ts` after the migration (still 2/2 passing — sidebar/route/
backend-authorization assertions, MFA-policy frontend enforcement) and visually re-inspected
Payments/Orders/Reviews/Contact/Admin Users as the `support` role: all four pages render correctly
with real data (Payments' KPI cards and empty state, Orders' real `S00024` test order, Admin Users
still correctly shows "Access denied"). No customer name/email went missing anywhere — confirms the
RLS narrowing had exactly the intended effect (removing an unused broad grant) and no unintended
one.

### 18–21. Support test account — final state

`delite-support-test@gmail.com` was found still at `admin_role = 'admin'` (not `'support'`, and
not disabled) — a stale leftover the prior pass's own report flagged as a hygiene gap it hadn't
actually corrected. Checked dependents first (Playwright config, the new security spec, fixtures,
other docs, database references) before changing anything: only this doc and
`admin-security-hardening.spec.ts` reference the account, both by email via env var, neither by a
hardcoded id that would break on a role change.

**Final state (Option B from the spec — a genuinely useful permanent integration-test account,
kept intentionally, not deleted)**:
- `admin_role = 'support'` (its intended resting role, restored).
- `is_admin = true`.
- `full_name` updated to `"Support Test (TEST ACCOUNT - do not use for real data)"` — clearly
  marked.
- **Password rotated** to a fresh secret via `admin-bootstrap` (never printed, never committed) —
  the previous password had been used/known across multiple sessions and could no longer be
  treated as private. Verified the new password works (re-ran the full Playwright suite
  successfully) and, by construction (an Admin API password update replaces the credential
  outright), the old one no longer authenticates.
- `admin_activity_log` has **zero** entries for this account (`actor_id`/`target_id`) — nothing to
  preserve or accidentally purge; the direct SQL role changes used during testing don't go through
  the logged `admin-users-manage` action path.
- **Session revocation**: no explicit "revoke all sessions for a user id" capability is exposed by
  any Edge Function or tool available to this session — noted honestly rather than assumed done.
  Mitigating factors, both real: (1) access tokens are short-lived (`expires_in: 3600`, i.e. 1
  hour) by Supabase's own default, so any previously-issued token expires naturally regardless; (2)
  the password rotation itself immediately blocks establishing any NEW session with the old
  credential. A standing "force sign-out by user id" capability would be a reasonable follow-up if
  this account's session hygiene needs to be tighter than that.

### 22. Owner session handling

Not touched. The owner's password was **not** directly changed by this session (only a reset EMAIL
was triggered — see #3) — their current session, if any, is completely unaffected until they
actually complete the reset flow themselves, at which point the existing, already-built behavior
(`updatePassword` signs the recovery session out and sends them to `/login`) takes over
automatically. No risk of an accidental lockout was introduced.

### 24–25. Leaked password protection / remaining manual Auth-dashboard actions

Re-confirmed via `get_advisors(security)`: **`auth_leaked_password_protection` still WARN
(disabled)**. No tool available to this session can change it. Exact manual action, current
Dashboard terminology: **Supabase Dashboard → Authentication → Policies → Leaked Password
Protection → toggle on.** Also still unverified/manual (unchanged from every prior pass, not
re-investigated further per "don't reopen the entire Auth config" instruction): Site URL, Allowed
Redirect URLs, the password-reset and admin-invite redirect targets, and the email-confirmation
toggle for ordinary signup.

### 26. Security advisor — before/after

Ran `get_advisors(security)` again after the `profiles` migration and compared to the pre-migration
baseline (captured in the second pass's report): **identical** — same 1
`anon_security_definer_function_executable` (`rls_auto_enable`, pre-existing/unrelated), same 31
`authenticated_security_definer_function_executable` warnings (every `admin_analytics_*`/
`admin_payments_*`/`admin_reviews_query`/`rls_auto_enable` RPC — pre-existing, by-design, internally
role-gated), same 1 `auth_leaked_password_protection`. **Zero new findings** — narrowing
`profiles_select_admin` didn't introduce any new lint, and definitely didn't leave any pre-existing
one unaddressed that this specific migration could have fixed.

### 29. Final repository secret scan

Repo-wide (`src`, `tests`, `docs`, `scripts`, `.env.example`, config files, excluding
`node_modules`) grep for password-shaped literals and every named secret env var
(`RAZORPAY_KEY_SECRET`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ODOO_API_KEY`, etc.): every
match is either a variable NAME (`Deno.env.get("...")`/`process.env....`), a doc reference to the
name, `.env.example`'s own placeholder (`your-odoo-api-key`), a UI label string ("Password"), or a
known redaction-test fixture (`password: "hunter2"` in `core.test.ts`, verifying the analytics
pipeline strips exactly this kind of field — not a real credential). **Zero real secret values
found anywhere in the repository.**

**Explicitly NOT done this pass** (per "do not start CMS work", "do not re-audit the entire
application"): Homepage CMS/Hero/Promotions/Navigation/Footer previews, undo/redo, focal points,
media positioning — none touched. No broader security re-audit beyond the five flagged items.

## Interfaces / data

- `AuthContextValue` gained `requestPasswordReset(email)`, `updatePassword(newPassword)`;
  `signIn()` now returns `{ error?, mfaRequired? }`; `signOut()` is local-scope only.
- `POST admin-users-manage` — owner session required, body `{ action: "list" }` |
  `{ action: "invite", email, fullName, role }` | `{ action: "changeRole", userId, role }` |
  `{ action: "revoke", userId }` → action-specific JSON or `{ error }`.
- New routes: `/forgot-password`, `/reset-password`, `/admin/settings/security`.
- `/admin/settings/users` flipped from placeholder to active; `ADMIN_NAV` gained a `Security` entry
  (`OWNER_ADMIN` roles).
- New Postgres trigger `profiles_prevent_last_owner_removal` / function
  `private.prevent_last_owner_change()`.
- New table `private.app_config(key, value, updated_at)`; new function
  `private.admin_mfa_satisfied()` (`SECURITY DEFINER`, used by RLS policies).
- New shared Edge Function helper `supabase/functions/_shared/auth/requireAdmin.ts` →
  `requireAdmin(req, allowedRoles: AdminRole[]): Promise<{ db, user, adminRole, aal } | Response>`.

## Dependencies

- No new packages — `@supabase/supabase-js` already provided everything used
  (`auth.resetPasswordForEmail`, `auth.updateUser`, `auth.mfa.*`, `auth.admin.*`).
- Depends on the existing `profiles.admin_role` enum/RLS foundation from `delite-admin.md`.

## Testing / verification

- `npm run build`/`lint`/`typecheck:server`/`test:unit` — clean.
- `tests/interaction/commerce-completion.spec.ts`: forgot-password shows the same generic response
  for a real vs. fabricated email; the link is present on both `/login` and `/admin/login`;
  `/reset-password` with no recovery session shows the invalid-link state, not a password form;
  `/admin/settings/users` and `/admin/settings/security` both correctly redirect an unauthenticated
  visitor to `/admin/login`.
- **Not live-tested this session**: a full real MFA enroll→sign-out→challenge→verify loop, and a
  real Admin Users invite→accept→sign-in loop — both require driving the browser as the actual
  bootstrapped owner account, which this session's tooling can query/migrate but not
  interactively click through end-to-end the way earlier passes' "drove the real browser UI"
  verification did. See "Auth testing" below for the exact checklist to run against the real
  account.

## Known issues / follow-ups

- **MFA is opt-in by default — the mandatory-MFA policy foundation exists but is OFF.** As of
  2026-09-30 the policy is enforced at THREE layers that all read the one
  `private.app_config.require_admin_mfa` row: `RoleRoute` (frontend UX gate, unchanged), RLS (via
  `private.admin_mfa_satisfied()`, on every table still written directly by the client), and every
  `admin-*` Edge Function (via `requireAdmin()`) — closing the gap this bullet used to describe.
  See "Backend (Edge Function + RLS) MFA enforcement" above. Turning the flag on in production
  should still wait until the sole owner has successfully enrolled and verified TOTP (spec: never
  flip this on automatically) — this pass did not enable it, only built and verified the
  enforcement machinery with it off.
- **No multi-device session list** — see "Session management" above; `signOut()` is local-scope
  only, but there is no way for a customer to see or revoke a session on another device from within
  the app today.
- **This session could not click through the full owner MFA-enroll or invite-accept loop** live —
  code is real and unit/route-level tested, but the deepest end-to-end human-driven verification
  this project's prior passes performed (e.g. `delite-accounts-orders-reviews-admin.md`'s real
  `S00024` order) was not repeated for these specific flows this session.
- **`profiles_select_admin` RLS uses `private.is_admin()` (any admin role), not a scoped role
  list like every other admin-readable table** — found during the 2026-09-30 role-matrix audit,
  pre-existing (already flagged in `delite-production-operations.md` before this pass), not fixed:
  any signed-in admin role (including `analytics`) can directly `SELECT` the full `profiles` table
  via PostgREST — every customer's name/email, and every other admin's `admin_role`/`is_admin` —
  narrower on the Admin Users PAGE (owner-only, `RoleRoute`+Edge-Function-enforced) than at the
  table itself. Not a privilege-escalation path (every actual privileged WRITE stays correctly
  role-checked at the RLS/Edge-Function layer independently of this), but a real over-broad-read
  gap. Needs its own deliberate pass: several existing pages (Orders/Payments/Reviews) join
  `profiles` for customer name/email and would need re-verification before narrowing this policy.
- **The live backend half of the MFA test matrix (real write, `require_admin_mfa` flag genuinely
  flipped on and off) was not run** — see "MFA test matrix" above for exactly what was verified by
  code read instead, and why the live version needs the user's explicit go-ahead (it touches a
  real customer's `contact_enquiries` row and/or a global production policy flag, both correctly
  refused by this session's own tooling as shared-resource writes).
- **`delite-support-test@gmail.com`'s `admin_role` was found already set to `'admin'`** (not
  `'support'`, and not disabled) before this pass touched it — a stale leftover from an earlier
  test that a prior doc entry described as "then disabled." Minor hygiene gap, not a security one
  (it's a designated test account, never the owner), but worth noting: "temporarily elevate then
  disable/revert" needs the revert step to actually happen at the end of a session, not just be
  planned. This pass left the account at `admin_role = 'support'` (its intended resting state) —
  reset its password again via `admin-bootstrap` before reusing it if the password is no longer
  known.
- **The real production owner password was hardcoded in `admin-panel.spec.ts`,
  `admin-analytics.spec.ts`, and `analytics-tracking.spec.ts`** — found and fixed this pass (now
  `ADMIN_TEST_EMAIL`/`ADMIN_TEST_PASSWORD` env vars, see above). The owner's real password was
  exposed in a plaintext file on disk this session read; **rotating it is a recommended follow-up
  action for the user**, not something this session did unprompted.

## Auth testing (#67 — run against the real bootstrapped account)

1. Forgot password: request a reset for the real admin email → real email arrives → link lands on
   `/reset-password` with a working form → new password works on next sign-in.
2. Invalid email: request a reset for a clearly-fake address → same generic success message shown
   (already automated, see Testing above).
3. Expired recovery link: use an old/already-used reset link → confirm the invalid-link message.
4. Successful password update: confirm `auth.updateUser` actually changed the password (sign in
   with the OLD password afterward and confirm it now fails).
5. Admin recovery: repeat step 1 via `/admin/login`'s link, confirm it lands the same
   `/reset-password` route and works identically.
6. Unauthorized Admin Users access: sign in as a non-owner admin role, confirm `/admin/settings/users`
   shows "Access denied" (RoleRoute, unchanged mechanism) and that calling `admin-users-manage`
   directly with that account's token returns 403.
7. Owner/Admin user-management permissions: as the real owner, invite a test account, change its
   role, then revoke it — confirm each step's `admin_activity_log` entry and that the revoked
   account can still sign in as an ordinary customer (not deleted).
8. Last-owner protection: attempt to revoke or role-change the ONLY owner account (temporarily, in
   a non-production project/branch) → confirm the database trigger blocks it with a clear error,
   not a silent success.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-30 | Claude | Odoo customer-checkout/account/returns phase (fourth 2026-09-30 entry) — new `return_requests` table's RLS: caller can `select` their own rows (`auth.uid() = user_id`); `owner`/`admin`/`support` can `select` all rows, matching this doc's existing admin-role pattern; no direct-client `insert`/`update` policy exists (all writes go through the `return-request` Edge Function's service-role client, where eligibility enforcement lives) — consistent with this project's established "RLS for reads, Edge Function for validated writes" convention. No other role/MFA/auth logic changed this pass. Full detail: `odoo-checkout-portal-returns.md`. |
| 2026-09-30 | Claude | Security cleanup pass (third 2026-09-30 entry) — closed the 5 items the second pass flagged. Confirmed the old owner password was never committed to Git history (all 7 commits checked directly) and no longer appears anywhere in the working tree. Triggered the real `resetPasswordForEmail` flow for the owner (confirmed via Supabase's own auth logs, status 200) rather than inventing/printing a new password — operator must still complete the reset via the emailed link (caveat: link targets `localhost:5173`, only usable from this dev machine). Deployed the pending `admin-system-health` update (now returns a real, Auth-Admin-API-derived `mfaEnrolledForOwner`, verified live through the real authenticated path). **Narrowed `profiles_select_admin` RLS from `is_admin()` (any admin role) to `owner`/`admin` only** via a new additive migration, after auditing every real consumer and confirming none of them depend on the broad grant (frontend is always self-scoped; every Edge Function uses the service-role client; every admin RPC is `postgres`-owned with `rolbypassrls=true`) — live-tested 18/18 across support/content/merchandising/analytics/admin, zero regression on Orders/Payments/Reviews/Contact/Admin Users. Rotated the support test account's password (previous one had been used/known across multiple sessions), restored it to its intended `admin_role='support'` resting state (found stale at `'admin'`), clearly marked it as a TEST account. Security advisors identical before/after (no new findings). Final repo-wide secret scan: zero real credential values found. No CMS work touched. |
| 2026-09-30 | Claude | Security-hardening verification pass (second 2026-09-30 entry) — role matrix written up and cross-checked against ADMIN_NAV/RoleRoute/RLS/RPC/Edge-Function role sets (one pre-existing mismatch found, documented, deliberately not fixed: `profiles_select_admin` RLS uses `is_admin()` not role-scoped); fixed a real lockout bug (`Security` nav entry was owner/admin-only, so 4 of 6 roles could never reach MFA self-enrollment); live end-to-end support-role test via a real test account at both the UI and backend layers (19/19 assertions passed, now a permanent Playwright suite); **found and fixed a critical credential-exposure bug** — the real production owner password was hardcoded in plaintext across 3 test files, now environment-variable-only; MFA test matrix partially live-verified (frontend AAL-gate via mocked policy response) and partially code-audited (backend AAL enforcement — a live write-based test was correctly blocked by the harness's own shared-resource safeguard, documented as a deliberate follow-up rather than worked around); owner MFA confirmed NOT enrolled, leaked-password-protection confirmed still disabled (Dashboard-only fix, not available to this session's tooling); added a lightweight Deno Edge Function test seam (`_shared/auth/jwt.ts` + Vitest, 7 tests) for the one practical-to-extract pure-logic piece; fixed a real accessibility gap (no focus trap/restore) in the shared admin `Drawer` component used by 11 pages. |
| 2026-09-29 | Claude | Initial version — forgot/reset password (shared customer+admin routes, generic non-enumerating response), admin TOTP MFA (enroll/challenge/verify/unenroll via Supabase Auth's own auth.mfa.* API, real AAL2 enforcement in AdminLogin.tsx), real Admin Users page + admin-users-manage Edge Function (invite/role-change/revoke, never reusing admin-bootstrap), database-level last-owner-protection trigger (applies even to service-role callers), signOut() switched to local-scope only. No dashboard-only Supabase Auth setting was changed or falsely claimed enabled. |
| 2026-09-29 | Claude | Production-ops follow-up — added the `REQUIRE_ADMIN_MFA` mandatory-MFA foundation (default off): new `admin-security-policy` Edge Function, `AuthContext` exposes `requireAdminMfa`/`aal`, `RoleRoute` enforces AAL2 on every admin page except Security itself once the flag is set. Not enabled. See Known issues for the RLS-layer caveat and enable procedure. |
| 2026-09-30 | Claude | CMS visual-editor phase's security follow-up — moved MFA enforcement from frontend-only into the backend: new `private.app_config` table (single source of truth, replacing the env-var mechanism), `private.admin_mfa_satisfied()` RLS helper (additively ANDed onto `cms_section_drafts`/`cms_media`/`cms_promotions`/`product_reviews`/`contact_enquiries`'s write policies), new shared `_shared/auth/requireAdmin.ts` Edge Function helper applied to all 7 admin-session-based `admin-*` functions plus `review-notify` (also fixed `admin-odoo-link`'s legacy `is_admin`-only check). Still off by default; security/performance advisors re-run clean, `private.app_config` confirmed not client-readable/writable. See the new `delite-cms-visual-editor.md` for the rest of this phase. |
