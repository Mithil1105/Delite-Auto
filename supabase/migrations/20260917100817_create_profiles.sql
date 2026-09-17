-- profiles: one row per auth.users row, auto-created via a trigger. is_admin gates access to the
-- Delite admin panel — never settable by the user themselves (see the prevent-self-promotion
-- trigger below). See Documentations MD/delite-accounts-orders-reviews-admin.md.

create schema if not exists private;
comment on schema private is 'Internal helper functions (SECURITY DEFINER) not exposed via the API — see supabase-postgres-best-practices RLS guidance.';

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- SECURITY DEFINER so it can read profiles without recursing through the RLS policies defined
-- below (a policy on `profiles` that queried `profiles` directly under RLS would deadlock/recurse).
-- Kept in the `private` schema and not granted to `anon` — only `authenticated` callers (via a
-- policy) can invoke it, and it always re-checks the CALLING user's own id internally.
create or replace function private.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using ((select private.is_admin()));

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- A non-admin can update their own row (full_name/phone), but never their own is_admin flag —
-- this trigger silently resets it back to the pre-update value unless the ACTING session is
-- already an admin (checked server-side via private.is_admin(), never trusted from the payload).
create or replace function private.prevent_self_admin_promotion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_self_admin_promotion
  before update on public.profiles
  for each row
  execute function private.prevent_self_admin_promotion();

-- Auto-creates the matching profiles row whenever a new auth.users row is created (Supabase's
-- standard pattern) — the app never has to remember to do this itself after signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
