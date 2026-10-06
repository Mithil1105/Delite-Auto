-- First-party analytics. Ingestion is exclusively through analytics-track with a server key.
create table public.analytics_sessions (
  id uuid primary key, visitor_id uuid not null, user_id uuid references auth.users(id),
  started_at timestamptz not null default now(), last_activity_at timestamptz not null default now(),
  landing_path text not null, referrer_domain text, utm_source text, utm_medium text,
  utm_campaign text, utm_content text, utm_term text,
  device_type text, browser_family text, os_family text,
  country_code text, region text, city text,
  page_view_count integer not null default 0, event_count integer not null default 0
);
create table public.analytics_events (
  id uuid primary key, event_name text not null check (event_name in (
    'page_view','page_engagement','product_view','search_submitted','search_zero_results','search_result_click',
    'add_to_cart','remove_from_cart','cart_quantity_changed','cart_viewed',
    'wishlist_add','wishlist_remove','checkout_started','checkout_completed','checkout_failed',
    'purchase','recommendation_impression','recommendation_click','recommendation_add_to_cart','cart_snapshot')),
  occurred_at timestamptz not null default now(), session_id uuid not null references public.analytics_sessions(id),
  visitor_id uuid not null, user_id uuid references auth.users(id), page_view_id uuid,
  page_path text, page_type text, odoo_template_id integer, odoo_variant_id integer,
  quantity integer, value numeric(14,2), currency text not null default 'INR',
  surface text, strategy text, search_query text, engaged_seconds numeric(10,2),
  max_scroll_percent smallint, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (octet_length(metadata::text) <= 8192),
  check (engaged_seconds is null or engaged_seconds between 0 and 1800),
  check (max_scroll_percent is null or max_scroll_percent between 0 and 100)
);
create table public.analytics_carts (
  id uuid primary key, visitor_id uuid not null, session_id uuid not null,
  user_id uuid references auth.users(id), created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(), checkout_started_at timestamptz,
  converted_at timestamptz, order_id uuid, current_item_count integer not null default 0,
  observed_cart_value numeric(14,2) not null default 0, currency text not null default 'INR'
);
create table public.analytics_cart_items (
  cart_id uuid not null references public.analytics_carts(id) on delete cascade,
  odoo_template_id integer not null, odoo_variant_id integer not null default 0,
  quantity integer not null check (quantity >= 0), observed_unit_price numeric(14,2) not null,
  updated_at timestamptz not null default now(),
  primary key (cart_id, odoo_template_id, odoo_variant_id)
);
create index analytics_events_time_idx on public.analytics_events (occurred_at desc);
create index analytics_events_name_time_idx on public.analytics_events (event_name, occurred_at desc);
create index analytics_events_product_idx on public.analytics_events (odoo_template_id, occurred_at desc) where odoo_template_id is not null;
create index analytics_events_session_idx on public.analytics_events (session_id, occurred_at);
create index analytics_sessions_visitor_idx on public.analytics_sessions (visitor_id, started_at desc);
create index analytics_carts_inactive_idx on public.analytics_carts (last_activity_at) where converted_at is null and current_item_count > 0;
create function private.analytics_count_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.analytics_sessions set event_count = event_count + 1,
    page_view_count = page_view_count + case when new.event_name = 'page_view' then 1 else 0 end,
    last_activity_at = greatest(last_activity_at, new.occurred_at)
  where id = new.session_id;
  return new;
end;
$$;
revoke execute on function private.analytics_count_event() from public, anon, authenticated;
create trigger analytics_event_count after insert on public.analytics_events
for each row execute function private.analytics_count_event();
alter table public.analytics_sessions enable row level security;
alter table public.analytics_events enable row level security;
alter table public.analytics_carts enable row level security;
alter table public.analytics_cart_items enable row level security;
revoke all on public.analytics_sessions, public.analytics_events, public.analytics_carts, public.analytics_cart_items from anon, authenticated;
grant select on public.analytics_sessions, public.analytics_events, public.analytics_carts, public.analytics_cart_items to authenticated;
create policy analytics_admin_read on public.analytics_sessions for select to authenticated using
  ((select private.has_admin_role(array['owner','admin','analytics']::public.admin_role[])));
create policy analytics_events_admin_read on public.analytics_events for select to authenticated using
  ((select private.has_admin_role(array['owner','admin','analytics']::public.admin_role[])));
create policy analytics_carts_admin_read on public.analytics_carts for select to authenticated using
  ((select private.has_admin_role(array['owner','admin','analytics']::public.admin_role[])));
create policy analytics_cart_items_admin_read on public.analytics_cart_items for select to authenticated using
  ((select private.has_admin_role(array['owner','admin','analytics']::public.admin_role[])));
