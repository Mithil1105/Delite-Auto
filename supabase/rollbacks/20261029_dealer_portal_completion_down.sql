-- Rollback for 20261029090000_dealer_portal_completion.sql (spec §16 item 14: tested rollback).
-- Run it, then (only if it was recorded) delete the history row:
--   delete from supabase_migrations.schema_migrations where version = '20261029090000';
-- NOT reversible: the 'dealer_manager' value added to public.admin_role (Postgres cannot drop an enum
-- value). It is inert once no profile uses it and no policy mentions it.

drop function if exists public.dealer_revoke_sessions(uuid[]);
drop table if exists public.dealer_admin_grants;
drop table if exists public.dealer_offers;
delete from private.app_config where key = 'dealer_portal_mode';

-- Volume tiers: only safe while no dealer has more than one active tier per variant.
alter table public.dealer_price_rules drop constraint if exists dealer_price_rules_no_overlap;
delete from public.dealer_price_rules where min_quantity > 1;
alter table public.dealer_price_rules drop column if exists min_quantity;
alter table public.dealer_price_rules add constraint dealer_price_rules_no_overlap exclude using gist (
  dealer_id with =,
  odoo_variant_id with =,
  tstzrange(coalesce(starts_at, '-infinity'::timestamptz), coalesce(ends_at, 'infinity'::timestamptz)) with &&
) where (status = 'active');

-- Team users: buyers are removed (the owner remains) before the owner-only constraint is restored.
delete from public.dealer_users where role = 'buyer';
alter table public.dealer_users drop column if exists sessions_revoked_before;
alter table public.dealer_users drop constraint if exists dealer_users_role_check;
alter table public.dealer_users add constraint dealer_users_role_check check (role in ('owner'));

alter table public.dealers
  drop column if exists purchase_method,
  drop column if exists shipping_policy,
  drop column if exists flat_shipping_paise,
  drop column if exists payment_terms,
  drop column if exists credit_limit_paise,
  drop column if exists is_pilot;
