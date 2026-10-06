-- Analytics v2 schema. Supersedes the thin foundation from 20260918120000_create_analytics.sql
-- (which is left untouched, as already-applied migrations must be). That foundation was verified
-- EMPTY (0 rows in all four tables, its Edge Function never deployed) before this ran; the guard
-- below aborts rather than drop anything if that ever stops being true.
--
-- Design notes (full write-up: Documentations MD/delite-analytics.md):
--  * Ingestion only via the analytics-track Edge Function -> analytics_ingest_batch() (service role).
--    No client INSERT/UPDATE/DELETE grants anywhere.
--  * Page views live in analytics_page_views (one row per SPA route view, updated in place with
--    cumulative engaged time + max scroll) — NOT duplicated as analytics_events rows.
--  * Geography is coarse only (country/region/city). The raw IP is never stored.
--  * Odoo remains the commerce source of truth; observed_* columns are HISTORICAL measurements.

do $$
begin
  if exists (select 1 from public.analytics_events)
     or exists (select 1 from public.analytics_sessions)
     or exists (select 1 from public.analytics_carts) then
    raise exception 'analytics v2 migration refuses to drop non-empty analytics tables';
  end if;
end $$;

drop trigger if exists analytics_event_count on public.analytics_events;
drop function if exists private.analytics_count_event();
drop table if exists public.analytics_cart_items;
drop table if exists public.analytics_carts;
drop table if exists public.analytics_events;
drop table if exists public.analytics_sessions;

-- ---------------------------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------------------------
create table public.analytics_sessions (
  id uuid primary key,
  visitor_id uuid not null,
  user_id uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  -- No explicit "session end" signal exists in a browser: ended_at is the end of the last
  -- observed engagement, i.e. "last time we heard the visitor was actively here".
  ended_at timestamptz,
  landing_path text not null default '/',
  referrer text,                       -- host + path only; never a query string
  referrer_domain text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  source_channel text not null default 'Direct',
  device_type text, browser_family text, os_family text,
  country_code text, country_name text, region text, city text,
  geo_attempted_at timestamptz,
  is_returning_visitor boolean not null default false,
  is_internal boolean not null default false,
  is_test boolean not null default false,
  page_view_count integer not null default 0,
  event_count integer not null default 0,
  engaged_seconds numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Page views (one row per SPA route view)
-- ---------------------------------------------------------------------------------------------
create table public.analytics_page_views (
  id uuid primary key,
  session_id uuid not null references public.analytics_sessions (id) on delete cascade,
  visitor_id uuid not null,
  user_id uuid references auth.users (id) on delete set null,
  path text not null,
  page_type text not null,
  odoo_template_id integer,
  odoo_variant_id integer,
  category_id integer,
  referrer_path text,                  -- previous in-app path, when there was one
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  engaged_seconds numeric(10, 2) not null default 0
    check (engaged_seconds between 0 and 14400),
  max_scroll_percent smallint not null default 0 check (max_scroll_percent between 0 and 100),
  is_entrance boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Events (strict taxonomy)
-- ---------------------------------------------------------------------------------------------
create table public.analytics_events (
  id uuid primary key,                 -- client-generated event_id: the dedupe key
  event_name text not null check (event_name in (
    'product_view', 'search_submitted', 'search_result_click', 'search_zero_results',
    'category_view', 'brand_view',
    'add_to_cart', 'remove_from_cart', 'cart_quantity_changed', 'cart_viewed',
    'wishlist_add', 'wishlist_remove',
    'checkout_started', 'checkout_step_viewed', 'checkout_completed', 'checkout_failed', 'purchase',
    'recommendation_impression', 'recommendation_click', 'recommendation_add_to_cart',
    'navigation_click', 'promotion_impression', 'promotion_click',
    'contact_started', 'contact_submitted')),
  occurred_at timestamptz not null default now(),
  session_id uuid not null references public.analytics_sessions (id) on delete cascade,
  visitor_id uuid not null,
  user_id uuid references auth.users (id) on delete set null,
  page_view_id uuid,
  page_path text,
  page_type text,
  odoo_template_id integer,
  odoo_variant_id integer,
  category_id integer,
  brand_id integer,
  cart_id uuid,
  order_id uuid,
  odoo_sale_order_id integer,
  quantity integer,
  value numeric(14, 2),
  currency text not null default 'INR',
  surface text,
  strategy text,
  search_query text,                   -- display value (trimmed, whitespace-collapsed)
  search_query_norm text,              -- lower-cased grouping key
  result_count integer,
  duration_ms integer,                 -- e.g. search -> result click
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (octet_length(metadata::text) <= 4096)
);

-- ---------------------------------------------------------------------------------------------
-- Carts (analytics observation record — NOT the commerce cart) + line snapshot
-- ---------------------------------------------------------------------------------------------
create table public.analytics_carts (
  id uuid primary key,
  visitor_id uuid not null,
  session_id uuid not null,            -- session the cart was created in
  last_session_id uuid,                -- most recent session that touched it
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  checkout_started_at timestamptz,
  converted_at timestamptz,
  -- Abandonment is DERIVED (see private.analytics_cart_status). abandoned_at / returned_at are
  -- only stamped when a cart that had gone quiet for >= 30 min is touched again or converts —
  -- that is what makes "recovered" attributable without a cron.
  abandoned_at timestamptz,
  returned_at timestamptz,
  order_id uuid,
  odoo_sale_order_id integer,
  current_item_count integer not null default 0,
  observed_cart_value numeric(14, 2) not null default 0,   -- HISTORICAL observed value, not a price source
  currency text not null default 'INR',
  is_test boolean not null default false
);

create table public.analytics_cart_items (
  cart_id uuid not null references public.analytics_carts (id) on delete cascade,
  odoo_template_id integer not null,
  odoo_variant_id integer not null default 0,
  quantity integer not null check (quantity >= 0),
  observed_unit_price numeric(14, 2) not null,
  observed_line_value numeric(14, 2) generated always as (quantity * observed_unit_price) stored,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (cart_id, odoo_template_id, odoo_variant_id)
);

-- Purchased lines (written only by the server-owned purchase path after Odoo confirms the order).
create table public.analytics_order_items (
  order_id uuid not null,
  odoo_sale_order_id integer,
  odoo_template_id integer not null,
  odoo_variant_id integer not null default 0,
  quantity integer not null check (quantity > 0),
  observed_unit_price numeric(14, 2) not null,
  observed_line_value numeric(14, 2) generated always as (quantity * observed_unit_price) stored,
  session_id uuid,
  visitor_id uuid,
  user_id uuid references auth.users (id) on delete set null,
  cart_id uuid,
  occurred_at timestamptz not null default now(),
  is_test boolean not null default false,
  primary key (order_id, odoo_template_id, odoo_variant_id)
);

-- Visitors the owner has marked as internal/staff (excluded from reports by default).
create table public.analytics_internal_visitors (
  visitor_id uuid primary key,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Indexes (each maps to a query in the reporting RPCs; see docs for the rationale)
-- ---------------------------------------------------------------------------------------------
create index analytics_sessions_started_idx on public.analytics_sessions (started_at desc);
create index analytics_sessions_activity_idx on public.analytics_sessions (last_activity_at desc);
create index analytics_sessions_visitor_idx on public.analytics_sessions (visitor_id, started_at desc);
create index analytics_sessions_user_idx on public.analytics_sessions (user_id, started_at desc) where user_id is not null;
create index analytics_sessions_country_idx on public.analytics_sessions (country_code, started_at desc) where country_code is not null;

create index analytics_page_views_started_idx on public.analytics_page_views (started_at desc);
create index analytics_page_views_session_idx on public.analytics_page_views (session_id, started_at);
create index analytics_page_views_path_idx on public.analytics_page_views (path, started_at desc);
create index analytics_page_views_product_idx on public.analytics_page_views (odoo_template_id, started_at desc) where odoo_template_id is not null;

create index analytics_events_time_idx on public.analytics_events (occurred_at desc);
create index analytics_events_name_time_idx on public.analytics_events (event_name, occurred_at desc);
create index analytics_events_session_idx on public.analytics_events (session_id, occurred_at);
create index analytics_events_product_idx on public.analytics_events (odoo_template_id, occurred_at desc) where odoo_template_id is not null;
create index analytics_events_user_idx on public.analytics_events (user_id, occurred_at desc) where user_id is not null;
create index analytics_events_cart_idx on public.analytics_events (cart_id, occurred_at) where cart_id is not null;
create index analytics_events_search_idx on public.analytics_events (search_query_norm, occurred_at desc) where search_query_norm is not null;
-- One purchase per real order: makes the server-owned purchase path idempotent.
create unique index analytics_events_purchase_order_uniq on public.analytics_events (order_id) where event_name = 'purchase';

create index analytics_carts_status_idx on public.analytics_carts (last_activity_at desc);
create index analytics_carts_user_idx on public.analytics_carts (user_id) where user_id is not null;
create index analytics_carts_converted_idx on public.analytics_carts (converted_at) where converted_at is not null;
create index analytics_cart_items_product_idx on public.analytics_cart_items (odoo_template_id);
create index analytics_order_items_product_idx on public.analytics_order_items (odoo_template_id, occurred_at desc);

-- ---------------------------------------------------------------------------------------------
-- Cart lifecycle status. THE official abandonment rule lives here, in exactly one place:
--   abandoned = has >= 1 item AND not converted AND no activity for >= 30 minutes
-- Derived at read time from timestamps — no cron required.
-- ---------------------------------------------------------------------------------------------
create view private.analytics_cart_status as
select c.*,
  case
    when c.converted_at is not null then 'converted'
    when c.current_item_count > 0 and c.last_activity_at <= now() - interval '30 minutes' then 'abandoned'
    when c.current_item_count > 0 then 'active'
    else 'empty'
  end as status,
  (c.converted_at is not null and c.abandoned_at is not null) as recovered
from public.analytics_carts c;

-- ---------------------------------------------------------------------------------------------
-- RLS: nothing is client-writable; only owner/admin/analytics may read raw rows directly.
-- (Dashboards use SECURITY DEFINER RPCs with their own role check — see the reporting migration.)
-- ---------------------------------------------------------------------------------------------
alter table public.analytics_sessions enable row level security;
alter table public.analytics_page_views enable row level security;
alter table public.analytics_events enable row level security;
alter table public.analytics_carts enable row level security;
alter table public.analytics_cart_items enable row level security;
alter table public.analytics_order_items enable row level security;
alter table public.analytics_internal_visitors enable row level security;

revoke all on public.analytics_sessions, public.analytics_page_views, public.analytics_events,
  public.analytics_carts, public.analytics_cart_items, public.analytics_order_items,
  public.analytics_internal_visitors from anon, authenticated;
revoke all on private.analytics_cart_status from anon, authenticated, public;

grant select on public.analytics_sessions, public.analytics_page_views, public.analytics_events,
  public.analytics_carts, public.analytics_cart_items, public.analytics_order_items,
  public.analytics_internal_visitors to authenticated;

create policy analytics_sessions_admin_read on public.analytics_sessions for select to authenticated
  using ((select private.has_admin_role(array['owner', 'admin', 'analytics']::public.admin_role[])));
create policy analytics_page_views_admin_read on public.analytics_page_views for select to authenticated
  using ((select private.has_admin_role(array['owner', 'admin', 'analytics']::public.admin_role[])));
create policy analytics_events_admin_read on public.analytics_events for select to authenticated
  using ((select private.has_admin_role(array['owner', 'admin', 'analytics']::public.admin_role[])));
create policy analytics_carts_admin_read on public.analytics_carts for select to authenticated
  using ((select private.has_admin_role(array['owner', 'admin', 'analytics']::public.admin_role[])));
create policy analytics_cart_items_admin_read on public.analytics_cart_items for select to authenticated
  using ((select private.has_admin_role(array['owner', 'admin', 'analytics']::public.admin_role[])));
create policy analytics_order_items_admin_read on public.analytics_order_items for select to authenticated
  using ((select private.has_admin_role(array['owner', 'admin', 'analytics']::public.admin_role[])));
create policy analytics_internal_visitors_admin_read on public.analytics_internal_visitors for select to authenticated
  using ((select private.has_admin_role(array['owner', 'admin']::public.admin_role[])));
