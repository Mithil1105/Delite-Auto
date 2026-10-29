-- Dealer portal (B2B) — completion pass: commercial terms, volume tiers, team users, real session
-- revocation, rollout flag, dealer offers, dealer-manager role. See Documentations MD/dealer-portal.md.
-- Additive only (new columns with defaults, new tables, one new enum value). Rollback:
-- supabase/rollbacks/20261029_dealer_portal_completion_down.sql

-- 1. New admin role for "routine dealer administration" (spec §2). Granting dealers/pricing scope
--    lives in dealer_admin_grants below; the role alone grants nothing.
alter type public.admin_role add value if not exists 'dealer_manager';

-- 2. Per-dealer commercial terms (spec §3.2 step 6, §20: payment/PO method, shipping, credit).
alter table public.dealers
  add column purchase_method text not null default 'request_order' check (purchase_method in ('request_order', 'po_required')),
  add column shipping_policy text not null default 'as_agreed' check (shipping_policy in ('as_agreed', 'free', 'flat')),
  add column flat_shipping_paise bigint not null default 0 check (flat_shipping_paise >= 0),
  add column payment_terms text,
  add column credit_limit_paise bigint check (credit_limit_paise is null or credit_limit_paise > 0),
  -- Rollout (spec §12): with the portal mode set to 'pilot', only pilot dealers can sign in.
  add column is_pilot boolean not null default false;

-- 3. Team users (spec §2 "Dealer staff"): an owner plus buyers. Real session revocation: tokens issued
--    before sessions_revoked_before are rejected by the dealer-portal function.
alter table public.dealer_users drop constraint dealer_users_role_check;
alter table public.dealer_users
  add constraint dealer_users_role_check check (role in ('owner', 'buyer')),
  add column sessions_revoked_before timestamptz;

-- 4. Volume tiers (spec Phase 4): several ACTIVE rules per dealer+variant, one per minimum-quantity
--    tier. Overlap is still rejected, but only within the same tier.
alter table public.dealer_price_rules add column min_quantity integer not null default 1 check (min_quantity >= 1);
alter table public.dealer_price_rules drop constraint dealer_price_rules_no_overlap;
alter table public.dealer_price_rules add constraint dealer_price_rules_no_overlap exclude using gist (
  dealer_id with =,
  odoo_variant_id with =,
  min_quantity with =,
  tstzrange(coalesce(starts_at, '-infinity'::timestamptz), coalesce(ends_at, 'infinity'::timestamptz)) with &&
) where (status = 'active');

-- 5. Account-specific offers shown on the dealer dashboard (spec Phase 4).
create table public.dealer_offers (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text check (body is null or char_length(body) <= 600),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index dealer_offers_dealer_idx on public.dealer_offers (dealer_id);

-- 6. Which dealers a `dealer_manager` may administer, and whether they may change prices.
create table public.dealer_admin_grants (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  -- NULL = every dealer; otherwise only these dealers.
  dealer_ids uuid[],
  can_manage_pricing boolean not null default false,
  granted_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 7. Portal rollout switch: off | pilot | on (spec §12). Starts in pilot.
insert into private.app_config (key, value) values ('dealer_portal_mode', 'pilot') on conflict (key) do nothing;

-- 8. Real revocation of a dealer user's Supabase sessions (spec FR-01 "session revoke"). Deleting the
--    session and refresh-token rows stops token refresh at once; the dealer-portal function also rejects
--    any access token issued before sessions_revoked_before. Service-role only.
create or replace function public.dealer_revoke_sessions(p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from auth.refresh_tokens where user_id = any (select u::text from unnest(p_user_ids) as u);
  delete from auth.sessions where user_id = any (p_user_ids);
  get diagnostics removed = row_count;
  update public.dealer_users set sessions_revoked_before = now() where auth_user_id = any (p_user_ids);
  return removed;
end;
$$;

revoke execute on function public.dealer_revoke_sessions(uuid[]) from public, anon, authenticated;

alter table public.dealer_offers enable row level security;
alter table public.dealer_admin_grants enable row level security;
revoke all on public.dealer_offers, public.dealer_admin_grants from anon, authenticated;
