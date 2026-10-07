-- Narrow the broad profiles_select_admin RLS policy — see Documentations MD/delite-auth-security.md,
-- "2026-09-30 security cleanup pass". Previously scoped to private.is_admin() (true for EVERY admin
-- role — content/merchandising/support/analytics included), letting any admin-role account read
-- every customer's and every other admin's full profiles row directly via PostgREST. Flagged (not
-- fixed) in the prior security-hardening pass; audited and fixed here.
--
-- Audit before changing anything (see the doc for the full trail): grepped every real consumer of
-- public.profiles across src/ and supabase/functions/.
--   - Frontend: only AuthContext.tsx's loadProfile() and Account.tsx, both always .eq('id', userId)
--     for the CALLER's own id — already fully covered by the untouched profiles_select_own policy.
--   - Every admin-* Edge Function (admin-users-manage, admin-system-health, requireAdmin.ts,
--     admin-bootstrap) reads profiles via the SERVICE-ROLE client, which bypasses RLS entirely —
--     never gated by this policy regardless of its scope.
--   - admin_payments_list/admin_reviews_query (and every other admin_analytics_*/has_admin_role/
--     admin_mfa_satisfied SECURITY DEFINER function) are owned by `postgres`, confirmed via
--     pg_roles.rolbypassrls = true — their internal `join public.profiles` also bypasses RLS,
--     regardless of this policy's scope.
-- Conclusion: NOTHING currently deployed depends on the broad grant — it was pure unnecessary
-- excess privilege. Narrowed to owner/admin (the two roles with genuine full-instance purview);
-- Admin Users/Orders/Payments/Reviews/Contact Enquiries are all unaffected by construction (none of
-- their real data paths are RLS-gated on profiles in the first place).
--
-- UPDATE/INSERT/DELETE policies on profiles are untouched (profiles_update_own only, no INSERT/
-- DELETE client policy exists) — this migration is SELECT-only, per explicit instruction not to
-- loosen or touch write policies in this pass.

drop policy if exists "profiles_select_admin" on public.profiles;

create policy "profiles_select_admin" on public.profiles for select to authenticated
  using ((select private.has_admin_role(array['owner','admin']::public.admin_role[])));
