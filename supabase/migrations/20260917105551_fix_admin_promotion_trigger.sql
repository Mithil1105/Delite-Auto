-- Real bug, found via live testing (2026-09-17): `private.prevent_self_admin_promotion()`
-- (20260917100817_create_profiles.sql) was meant to stop a REGULAR USER from setting their own
-- `is_admin` via a normal profile update, by resetting it to the old value unless
-- `private.is_admin()` is true for the calling session. But `private.is_admin()` reads
-- `(select auth.uid())`, which is NULL for a service-role connection (no end-user JWT at all) —
-- so the trigger also silently reverted `admin-bootstrap`'s own legitimate service-role upsert,
-- and the very first admin account (created via that function) ended up with `is_admin: false`
-- despite the function reporting success. Fixed by exempting `service_role` explicitly via
-- `auth.role()` (Supabase's standard JWT-role helper) — a service-role write is already fully
-- trusted (it bypasses RLS entirely by design), so this isn't a new privilege, just correcting the
-- trigger to stop blocking a caller it was never meant to restrict in the first place.

create or replace function private.prevent_self_admin_promotion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if not private.is_admin() then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;
