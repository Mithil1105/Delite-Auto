-- Granular admin roles for the Delite Admin panel (owner/admin/content/merchandising/support/
-- analytics — see Documentations MD/delite-admin.md). Purely additive: the existing
-- `profiles.is_admin` boolean and `private.is_admin()` helper are untouched, so every RLS policy
-- already built on them (orders, product_reviews) and every Edge Function checking them
-- (create-order, admin-odoo-link) keeps working unmodified. `admin_role` is the new, finer-grained
-- signal the admin sidebar/route guards and the new CMS tables use.

create type public.admin_role as enum ('owner', 'admin', 'content', 'merchandising', 'support', 'analytics');

alter table public.profiles add column admin_role public.admin_role;

-- SECURITY DEFINER so it can read profiles without recursing through RLS, same pattern as
-- private.is_admin() (20260917100817_create_profiles.sql).
create or replace function private.has_admin_role(allowed public.admin_role[])
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select p.admin_role = any(allowed) from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

revoke execute on function private.has_admin_role(public.admin_role[]) from public, anon;
grant execute on function private.has_admin_role(public.admin_role[]) to authenticated;

-- Convenience helper for the frontend to read its own role in one call alongside the rest of
-- `profiles` — no separate function needed, `admin_role` is just a normal selectable column
-- covered by the existing `profiles_select_own`/`profiles_select_admin` policies.

-- Promote the bootstrapped admin account (created via supabase/functions/admin-bootstrap,
-- Documentations MD/delite-accounts-orders-reviews-admin.md) to the top role. Keyed by the
-- already-known user id, not a guessed email — never touches auth.users, only the role column.
update public.profiles set admin_role = 'owner' where id = '99056cf3-b6e8-458d-b03e-83bfd67eaa91';
