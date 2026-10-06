-- Analytics reporting, part 1: traffic / engagement / acquisition / geography / audience.
--
-- Conventions shared by every admin_analytics_* function:
--  * SECURITY DEFINER + explicit role check (private.analytics_require) as the FIRST statement.
--    Authorization is enforced here in the database, never in the browser. Anonymous callers have
--    no EXECUTE grant at all.
--  * Period semantics ("cohort by session start"): a period contains the sessions that STARTED in
--    [p_start, p_end); every page view / event / order metric is that cohort's activity. Cart
--    metrics use the cart's last activity instead (documented in delite-analytics.md).
--  * p_filters (jsonb): audience all|logged_in|anonymous, device, country, source, include_internal,
--    include_test. Test traffic and internal/staff traffic are EXCLUDED unless asked for.
--  * Timezone: buckets/labels use p_tz (default Asia/Kolkata); storage stays timestamptz/UTC.

-- ---------------------------------------------------------------------------------------------
-- Authorization + identity helpers (private schema: not exposed through the API)
-- ---------------------------------------------------------------------------------------------
create or replace function private.analytics_require(p_roles text[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.has_admin_role(p_roles::public.admin_role[]) then
    raise exception 'analytics: forbidden' using errcode = '42501';
  end if;
end;
$$;

-- Customer identity for admin views. Name/email/phone are shown in full only to owner/admin/
-- support; the analytics role sees a masked email and no name/phone (need-to-know).
create or replace function private.analytics_identity(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reveal boolean := private.has_admin_role(array['owner', 'admin', 'support']::public.admin_role[]);
  v_email text; v_name text; v_phone text;
begin
  if p_user is null then return jsonb_build_object('kind', 'anonymous'); end if;
  select u.email into v_email from auth.users u where u.id = p_user;
  select pr.full_name, pr.phone into v_name, v_phone from public.profiles pr where pr.id = p_user;
  if v_reveal then
    return jsonb_build_object('kind', 'customer', 'user_id', p_user, 'name', v_name, 'email', v_email,
                              'phone', v_phone, 'revealed', true);
  end if;
  return jsonb_build_object('kind', 'customer', 'user_id', p_user, 'name', null,
    'email', case when v_email is null then null else left(v_email, 1) || '***@' || split_part(v_email, '@', 2) end,
    'phone', null, 'revealed', false);
end;
$$;

create or replace function private.analytics_sessions_in(p_start timestamptz, p_end timestamptz, p_filters jsonb)
returns setof public.analytics_sessions
language sql
stable
security definer
set search_path = ''
as $$
  select s.*
    from public.analytics_sessions s
   where s.started_at >= p_start and s.started_at < p_end
     and (coalesce((p_filters ->> 'include_test')::boolean, false) or not s.is_test)
     and (coalesce((p_filters ->> 'include_internal')::boolean, false) or not s.is_internal)
     and (coalesce(p_filters ->> 'audience', 'all') = 'all'
          or (p_filters ->> 'audience' = 'logged_in' and s.user_id is not null)
          or (p_filters ->> 'audience' = 'anonymous' and s.user_id is null))
     and (nullif(p_filters ->> 'device', '') is null or s.device_type = p_filters ->> 'device')
     and (nullif(p_filters ->> 'country', '') is null or s.country_code = p_filters ->> 'country')
     and (nullif(p_filters ->> 'region', '') is null or s.region = p_filters ->> 'region')
     and (nullif(p_filters ->> 'source', '') is null or s.source_channel = p_filters ->> 'source')
$$;

-- One row per session in the period plus its funnel flags and purchase totals. Reused by most
-- reports so "sessions that added to cart" means exactly the same thing everywhere.
create or replace function private.analytics_facts(p_start timestamptz, p_end timestamptz, p_filters jsonb)
returns table (
  id uuid, visitor_id uuid, user_id uuid, started_at timestamptz, landing_path text, source_channel text,
  referrer_domain text, utm_source text, utm_medium text, utm_campaign text,
  device_type text, browser_family text, os_family text,
  country_code text, country_name text, region text, city text,
  is_returning_visitor boolean, page_view_count integer, event_count integer, engaged_seconds numeric,
  has_product_view boolean, has_add boolean, has_cart_view boolean, has_checkout boolean,
  has_purchase boolean, has_search boolean, orders integer, revenue numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with sess as materialized (select * from private.analytics_sessions_in(p_start, p_end, p_filters)),
  f as (
    select e.session_id,
      bool_or(e.event_name = 'product_view') as has_product_view,
      bool_or(e.event_name = 'add_to_cart') as has_add,
      bool_or(e.event_name = 'cart_viewed') as has_cart_view,
      bool_or(e.event_name = 'checkout_started') as has_checkout,
      bool_or(e.event_name = 'purchase') as has_purchase,
      bool_or(e.event_name = 'search_submitted') as has_search,
      count(*) filter (where e.event_name = 'purchase')::integer as orders,
      coalesce(sum(e.value) filter (where e.event_name = 'purchase'), 0) as revenue
    from public.analytics_events e
    where e.session_id in (select sess.id from sess)
    group by e.session_id)
  select s.id, s.visitor_id, s.user_id, s.started_at, s.landing_path, s.source_channel, s.referrer_domain,
         s.utm_source, s.utm_medium, s.utm_campaign, s.device_type, s.browser_family, s.os_family,
         s.country_code, s.country_name, s.region, s.city, s.is_returning_visitor,
         s.page_view_count, s.event_count, s.engaged_seconds,
         coalesce(f.has_product_view, false), coalesce(f.has_add, false), coalesce(f.has_cart_view, false),
         coalesce(f.has_checkout, false), coalesce(f.has_purchase, false), coalesce(f.has_search, false),
         coalesce(f.orders, 0), coalesce(f.revenue, 0)
    from sess s left join f on f.session_id = s.id
$$;

-- Carts whose last activity (or creation, p_by='created') falls in the period, with lifecycle status
-- (private.analytics_cart_status).
drop function if exists private.analytics_carts_in(timestamptz, timestamptz, jsonb);
create or replace function private.analytics_carts_in(p_start timestamptz, p_end timestamptz, p_filters jsonb, p_by text default 'activity')
returns setof private.analytics_cart_status
language sql
stable
security definer
set search_path = ''
as $$
  select c.*
    from private.analytics_cart_status c
    left join public.analytics_sessions s on s.id = coalesce(c.last_session_id, c.session_id)
   where (case when p_by = 'created' then c.created_at else c.last_activity_at end) >= p_start
     and (case when p_by = 'created' then c.created_at else c.last_activity_at end) < p_end
     and (coalesce((p_filters ->> 'include_test')::boolean, false) or not c.is_test)
     and (coalesce((p_filters ->> 'include_internal')::boolean, false) or not coalesce(s.is_internal, false))
     and (coalesce(p_filters ->> 'audience', 'all') = 'all'
          or (p_filters ->> 'audience' = 'logged_in' and c.user_id is not null)
          or (p_filters ->> 'audience' = 'anonymous' and c.user_id is null))
     and (nullif(p_filters ->> 'device', '') is null or s.device_type = p_filters ->> 'device')
     and (nullif(p_filters ->> 'country', '') is null or s.country_code = p_filters ->> 'country')
     and (nullif(p_filters ->> 'source', '') is null or s.source_channel = p_filters ->> 'source')
$$;

revoke all on function private.analytics_require(text[]) from public, anon, authenticated;
revoke all on function private.analytics_identity(uuid) from public, anon, authenticated;
revoke all on function private.analytics_sessions_in(timestamptz, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function private.analytics_facts(timestamptz, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function private.analytics_carts_in(timestamptz, timestamptz, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Overview KPIs (one period; the client calls it twice for period-over-period comparison)
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_analytics_overview(
  p_start timestamptz, p_end timestamptz, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics']);

  with facts as materialized (select * from private.analytics_facts(p_start, p_end, p_filters)),
  sess as (
    select
      count(*) as sessions,
      count(distinct visitor_id) as unique_visitors,
      count(distinct user_id) as logged_in_users,
      count(distinct visitor_id) filter (where not is_returning_visitor) as new_visitors,
      count(*) filter (where user_id is not null) as logged_in_sessions,
      count(*) filter (where has_product_view) as product_view_sessions,
      count(*) filter (where has_add) as add_sessions,
      count(*) filter (where has_cart_view) as cart_view_sessions,
      count(*) filter (where has_checkout) as checkout_sessions,
      count(*) filter (where has_purchase) as purchase_sessions,
      coalesce(sum(orders), 0) as orders,
      coalesce(sum(revenue), 0) as revenue,
      coalesce(sum(engaged_seconds), 0) as engaged_total,
      count(*) filter (where engaged_seconds > 0) as engaged_sessions,
      percentile_cont(0.5) within group (order by engaged_seconds) filter (where engaged_seconds > 0) as median_engaged,
      -- Low-engagement ("bounce") session: exactly one page view, < 10 s active time, and no
      -- tracked interaction (no cart/search/wishlist/checkout/click event).
      count(*) filter (where page_view_count <= 1 and engaged_seconds < 10 and event_count = 0) as low_engagement_sessions,
      coalesce(sum(page_view_count), 0) as session_page_views
    from facts),
  ev as (
    select
      count(*) filter (where e.event_name = 'product_view') as product_views,
      count(*) filter (where e.event_name = 'add_to_cart') as add_to_carts,
      count(*) filter (where e.event_name = 'remove_from_cart') as removes,
      count(*) filter (where e.event_name = 'checkout_started') as checkout_starts,
      count(*) filter (where e.event_name = 'wishlist_add') as wishlist_adds,
      count(*) filter (where e.event_name = 'search_submitted') as searches,
      count(*) filter (where e.event_name = 'search_zero_results') as zero_result_searches,
      count(distinct e.session_id) filter (where e.event_name = 'wishlist_add') as wishlist_sessions
    from public.analytics_events e where e.session_id in (select id from facts)),
  pv as (
    select count(*) as page_views
      from public.analytics_page_views v where v.session_id in (select id from facts)),
  ttf as (
    -- Time to first product view / first add-to-cart, from session start (sessions that had one).
    select
      percentile_cont(0.5) within group (order by extract(epoch from (fp.first_pv - f.started_at))) as median_secs_to_product,
      percentile_cont(0.5) within group (order by extract(epoch from (fa.first_add - f.started_at))) as median_secs_to_add
    from facts f
    left join lateral (select min(e.occurred_at) as first_pv from public.analytics_events e where e.session_id = f.id and e.event_name = 'product_view') fp on true
    left join lateral (select min(e.occurred_at) as first_add from public.analytics_events e where e.session_id = f.id and e.event_name = 'add_to_cart') fa on true),
  carts as (
    select
      count(*) filter (where c.status = 'abandoned') as abandoned_carts,
      coalesce(sum(c.observed_cart_value) filter (where c.status = 'abandoned'), 0) as abandoned_value,
      count(*) filter (where c.status = 'converted') as converted_carts,
      count(*) filter (where c.recovered) as recovered_carts,
      count(*) filter (where c.status = 'active') as active_carts
    from private.analytics_carts_in(p_start, p_end, p_filters) c),
  since as (
    select min(s.started_at) as first_tracked_at
      from public.analytics_sessions s
     where coalesce((p_filters ->> 'include_test')::boolean, false) or not s.is_test)
  select jsonb_build_object(
    'sessions', sess.sessions, 'unique_visitors', sess.unique_visitors, 'logged_in_users', sess.logged_in_users,
    'new_visitors', sess.new_visitors, 'returning_visitors', sess.unique_visitors - sess.new_visitors,
    'logged_in_sessions', sess.logged_in_sessions,
    'page_views', pv.page_views,
    'product_views', ev.product_views, 'add_to_carts', ev.add_to_carts, 'removes', ev.removes,
    'checkout_starts', ev.checkout_starts, 'wishlist_adds', ev.wishlist_adds,
    'searches', ev.searches, 'zero_result_searches', ev.zero_result_searches,
    'product_view_sessions', sess.product_view_sessions, 'add_sessions', sess.add_sessions,
    'cart_view_sessions', sess.cart_view_sessions, 'checkout_sessions', sess.checkout_sessions,
    'purchase_sessions', sess.purchase_sessions,
    'orders', sess.orders, 'revenue', sess.revenue,
    'avg_engaged_per_session', case when sess.sessions > 0 then round(sess.engaged_total / sess.sessions, 2) end,
    'avg_engaged_per_visitor', case when sess.unique_visitors > 0 then round(sess.engaged_total / sess.unique_visitors, 2) end,
    'median_engaged_per_session', round(sess.median_engaged::numeric, 2),
    'engaged_sessions', sess.engaged_sessions,
    'low_engagement_sessions', sess.low_engagement_sessions,
    'pages_per_session', case when sess.sessions > 0 then round(pv.page_views::numeric / sess.sessions, 2) end,
    'products_viewed_per_session', case when sess.sessions > 0 then round(ev.product_views::numeric / sess.sessions, 2) end,
    'median_secs_to_first_product', round(ttf.median_secs_to_product::numeric, 1),
    'median_secs_to_first_add', round(ttf.median_secs_to_add::numeric, 1),
    'wishlist_sessions', ev.wishlist_sessions,
    'abandoned_carts', carts.abandoned_carts, 'abandoned_value', carts.abandoned_value,
    'converted_carts', carts.converted_carts, 'recovered_carts', carts.recovered_carts, 'active_carts', carts.active_carts,
    'first_tracked_at', since.first_tracked_at)
  into res
  from sess, ev, pv, ttf, carts, since;
  return res;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Time series (hour | day | week buckets, zero-filled, in the business timezone)
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_analytics_timeseries(
  p_start timestamptz, p_end timestamptz, p_bucket text default 'day',
  p_filters jsonb default '{}'::jsonb, p_tz text default 'Asia/Kolkata')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb; v_unit text := case when p_bucket in ('hour', 'day', 'week') then p_bucket else 'day' end;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics']);
  with sess as materialized (select * from private.analytics_facts(p_start, p_end, p_filters)),
  buckets as (
    select generate_series(
      date_trunc(v_unit, p_start at time zone p_tz),
      date_trunc(v_unit, (p_end - interval '1 second') at time zone p_tz),
      ('1 ' || v_unit)::interval) as b),
  s as (
    select date_trunc(v_unit, started_at at time zone p_tz) as b, count(*) sessions,
           count(distinct visitor_id) visitors, coalesce(sum(orders), 0) orders, coalesce(sum(revenue), 0) revenue
      from sess group by 1),
  v as (
    select date_trunc(v_unit, pv.started_at at time zone p_tz) as b, count(*) page_views
      from public.analytics_page_views pv where pv.session_id in (select id from sess) group by 1)
  select coalesce(jsonb_agg(jsonb_build_object(
    'bucket', to_char(buckets.b, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'visitors', coalesce(s.visitors, 0), 'sessions', coalesce(s.sessions, 0),
    'page_views', coalesce(v.page_views, 0), 'orders', coalesce(s.orders, 0),
    'revenue', coalesce(s.revenue, 0)) order by buckets.b), '[]'::jsonb)
  into res
  from buckets left join s on s.b = buckets.b left join v on v.b = buckets.b;
  return res;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Conversion funnel: distinct SESSIONS and distinct VISITORS at each step (never event counts)
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_analytics_funnel(
  p_start timestamptz, p_end timestamptz, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics']);
  with facts as materialized (select * from private.analytics_facts(p_start, p_end, p_filters)),
  steps as (
    select
      count(*) as sessions_total, count(distinct visitor_id) as visitors_total,
      count(*) filter (where has_product_view) as sessions_product,
      count(distinct visitor_id) filter (where has_product_view) as visitors_product,
      count(*) filter (where has_add) as sessions_add,
      count(distinct visitor_id) filter (where has_add) as visitors_add,
      count(*) filter (where has_cart_view) as sessions_cart,
      count(distinct visitor_id) filter (where has_cart_view) as visitors_cart,
      count(*) filter (where has_checkout) as sessions_checkout,
      count(distinct visitor_id) filter (where has_checkout) as visitors_checkout,
      count(*) filter (where has_purchase) as sessions_purchase,
      count(distinct visitor_id) filter (where has_purchase) as visitors_purchase
    from facts),
  co as (
    select
      count(*) filter (where e.event_name = 'checkout_started') as started,
      count(*) filter (where e.event_name = 'checkout_completed') as completed_client,
      count(*) filter (where e.event_name = 'checkout_failed') as failed,
      count(*) filter (where e.event_name = 'purchase') as purchased
    from public.analytics_events e where e.session_id in (select id from facts)),
  cs as (
    select coalesce(jsonb_object_agg(step, n), '{}'::jsonb) as steps
      from (select coalesce(e.metadata ->> 'step', 'unknown') as step, count(*) as n
              from public.analytics_events e
             where e.event_name = 'checkout_step_viewed' and e.session_id in (select id from facts)
             group by 1) x)
  select jsonb_build_object(
    'steps', jsonb_build_array(
      jsonb_build_object('key', 'sessions', 'label', 'Sessions', 'sessions', steps.sessions_total, 'visitors', steps.visitors_total),
      jsonb_build_object('key', 'product', 'label', 'Product viewers', 'sessions', steps.sessions_product, 'visitors', steps.visitors_product),
      jsonb_build_object('key', 'add', 'label', 'Added to cart', 'sessions', steps.sessions_add, 'visitors', steps.visitors_add),
      jsonb_build_object('key', 'cart', 'label', 'Viewed cart', 'sessions', steps.sessions_cart, 'visitors', steps.visitors_cart),
      jsonb_build_object('key', 'checkout', 'label', 'Started checkout', 'sessions', steps.sessions_checkout, 'visitors', steps.visitors_checkout),
      jsonb_build_object('key', 'purchase', 'label', 'Purchased', 'sessions', steps.sessions_purchase, 'visitors', steps.visitors_purchase)),
    'checkout', jsonb_build_object('started', co.started, 'completed_client', co.completed_client,
                                   'failed', co.failed, 'purchased', co.purchased, 'step_views', cs.steps))
  into res from steps, co, cs;
  return res;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Pages
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_analytics_pages(
  p_start timestamptz, p_end timestamptz, p_filters jsonb default '{}'::jsonb, p_limit integer default 300)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics']);
  with sess as materialized (select id from private.analytics_sessions_in(p_start, p_end, p_filters)),
  pv as (
    select v.id, v.session_id, v.visitor_id, v.path, v.page_type, v.engaged_seconds, v.max_scroll_percent,
           v.is_entrance,
           (row_number() over (partition by v.session_id order by v.started_at desc) = 1) as is_exit
      from public.analytics_page_views v where v.session_id in (select id from sess)),
  atc as (
    select e.page_view_id, count(*) as n from public.analytics_events e
     where e.event_name = 'add_to_cart' and e.page_view_id is not null and e.session_id in (select id from sess)
     group by e.page_view_id),
  agg as (
    select pv.path, min(pv.page_type) as page_type, count(*) as views,
           count(distinct pv.visitor_id) as unique_visitors,
           round(avg(pv.engaged_seconds), 2) as avg_engaged,
           round((percentile_cont(0.5) within group (order by pv.engaged_seconds))::numeric, 2) as median_engaged,
           round(avg(pv.max_scroll_percent), 1) as avg_scroll,
           count(*) filter (where pv.is_entrance) as entrances,
           count(*) filter (where pv.is_exit) as exits,
           coalesce(sum(atc.n), 0) as add_to_carts
      from pv left join atc on atc.page_view_id = pv.id
     group by pv.path)
  select coalesce(jsonb_agg(to_jsonb(a) order by a.views desc), '[]'::jsonb)
    into res from (select * from agg order by views desc limit p_limit) a;
  return res;
end;
$$;

create or replace function public.admin_analytics_page_detail(
  p_path text, p_start timestamptz, p_end timestamptz, p_filters jsonb default '{}'::jsonb,
  p_tz text default 'Asia/Kolkata')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics']);
  with sess as materialized (select * from private.analytics_sessions_in(p_start, p_end, p_filters)),
  allpv as (
    select v.*, lead(v.path) over (partition by v.session_id order by v.started_at) as next_path,
           (row_number() over (partition by v.session_id order by v.started_at desc) = 1) as is_exit
      from public.analytics_page_views v where v.session_id in (select id from sess)),
  pv as (select * from allpv where path = p_path),
  totals as (
    select count(*) as views, count(distinct visitor_id) as unique_visitors,
           round(avg(engaged_seconds), 2) as avg_engaged,
           round((percentile_cont(0.5) within group (order by engaged_seconds))::numeric, 2) as median_engaged,
           round(avg(max_scroll_percent), 1) as avg_scroll,
           count(*) filter (where is_entrance) as entrances, count(*) filter (where is_exit) as exits
      from pv),
  daily as (
    select to_char(date_trunc('day', started_at at time zone p_tz), 'YYYY-MM-DD') as day, count(*) as views
      from pv group by 1),
  scroll as (
    select count(*) filter (where max_scroll_percent < 25) as b0, count(*) filter (where max_scroll_percent >= 25 and max_scroll_percent < 50) as b25,
           count(*) filter (where max_scroll_percent >= 50 and max_scroll_percent < 75) as b50,
           count(*) filter (where max_scroll_percent >= 75 and max_scroll_percent < 90) as b75,
           count(*) filter (where max_scroll_percent >= 90) as b90
      from pv),
  srcs as (
    select s.source_channel as k, count(*) as n from pv join sess s on s.id = pv.session_id group by 1 order by 2 desc limit 8),
  devs as (
    select coalesce(s.device_type, 'unknown') as k, count(*) as n from pv join sess s on s.id = pv.session_id group by 1 order by 2 desc),
  geos as (
    select coalesce(s.country_code, '??') as country, coalesce(s.region, 'Unknown') as region, coalesce(s.city, 'Unknown') as city, count(*) as n
      from pv join sess s on s.id = pv.session_id group by 1, 2, 3 order by 4 desc limit 10),
  nexts as (
    select coalesce(next_path, '(exit)') as k, count(*) as n from pv group by 1 order by 2 desc limit 8),
  prevs as (
    select coalesce(referrer_path, '(entrance)') as k, count(*) as n from pv group by 1 order by 2 desc limit 8)
  select jsonb_build_object(
    'path', p_path,
    'totals', (select to_jsonb(totals) from totals),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'views', views) order by day), '[]'::jsonb) from daily),
    'scroll', (select to_jsonb(scroll) from scroll),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('label', k, 'n', n)), '[]'::jsonb) from srcs),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('label', k, 'n', n)), '[]'::jsonb) from devs),
    'geography', (select coalesce(jsonb_agg(jsonb_build_object('country', country, 'region', region, 'city', city, 'n', n)), '[]'::jsonb) from geos),
    'next_pages', (select coalesce(jsonb_agg(jsonb_build_object('label', k, 'n', n)), '[]'::jsonb) from nexts),
    'previous_pages', (select coalesce(jsonb_agg(jsonb_build_object('label', k, 'n', n)), '[]'::jsonb) from prevs))
  into res;
  return res;
end;
$$;

-- Landing pages (session entrance) and exit pages (last page of the session).
create or replace function public.admin_analytics_landing_exit(
  p_start timestamptz, p_end timestamptz, p_filters jsonb default '{}'::jsonb, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics']);
  with facts as materialized (select * from private.analytics_facts(p_start, p_end, p_filters)),
  entr as (
    select coalesce((select v.path from public.analytics_page_views v where v.session_id = f.id and v.is_entrance limit 1), f.landing_path) as path, f.*
      from facts f),
  landing as (
    select path, count(*) as sessions, count(distinct visitor_id) as visitors,
           round(avg(engaged_seconds), 2) as avg_engaged,
           count(*) filter (where page_view_count <= 1 and engaged_seconds < 10 and event_count = 0) as low_engagement,
           count(*) filter (where has_add) as add_sessions,
           count(*) filter (where has_purchase) as purchase_sessions,
           coalesce(sum(revenue), 0) as revenue
      from entr group by path),
  lastpv as (
    select distinct on (v.session_id) v.session_id, v.path
      from public.analytics_page_views v where v.session_id in (select id from facts)
     order by v.session_id, v.started_at desc),
  exits as (
    select l.path, count(*) as exits, count(*) filter (where f.has_purchase) as after_purchase
      from lastpv l join facts f on f.id = l.session_id group by l.path),
  totals as (select count(*) as sessions from facts)
  select jsonb_build_object(
    'landing', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sessions desc), '[]'::jsonb)
                  from (select * from landing order by sessions desc limit p_limit) x),
    'exits', (select coalesce(jsonb_agg(to_jsonb(x) order by x.exits desc), '[]'::jsonb)
                from (select * from exits order by exits desc limit p_limit) x),
    'total_sessions', (select sessions from totals))
  into res;
  return res;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Acquisition, devices, geography, audience
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_analytics_sources(
  p_start timestamptz, p_end timestamptz, p_group text default 'channel',
  p_filters jsonb default '{}'::jsonb, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics']);
  with facts as materialized (select * from private.analytics_facts(p_start, p_end, p_filters)),
  keyed as (
    select f.*,
      case p_group
        when 'source_medium' then coalesce(f.utm_source, f.referrer_domain, '(direct)') || ' / ' || coalesce(f.utm_medium, case when f.referrer_domain is null then '(none)' else 'referral' end)
        when 'campaign' then f.utm_campaign
        when 'referrer' then f.referrer_domain
        else f.source_channel end as k
      from facts f),
  agg as (
    select k as label, count(*) as sessions, count(distinct visitor_id) as visitors,
           round(avg(engaged_seconds), 2) as avg_engaged,
           count(*) filter (where has_add) as add_sessions,
           count(*) filter (where has_checkout) as checkout_sessions,
           count(*) filter (where has_purchase) as purchase_sessions,
           coalesce(sum(orders), 0) as orders, coalesce(sum(revenue), 0) as revenue,
           min(utm_source) as utm_source, min(utm_medium) as utm_medium
      from keyed where k is not null group by k)
  select coalesce(jsonb_agg(to_jsonb(a) order by a.sessions desc), '[]'::jsonb)
    into res from (select * from agg order by sessions desc limit p_limit) a;
  return res;
end;
$$;

create or replace function public.admin_analytics_devices(
  p_start timestamptz, p_end timestamptz, p_group text default 'device', p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics']);
  with facts as materialized (select * from private.analytics_facts(p_start, p_end, p_filters)),
  keyed as (
    select f.*, coalesce(case p_group when 'browser' then f.browser_family when 'os' then f.os_family else f.device_type end, 'unknown') as k
      from facts f),
  agg as (
    select k as label, count(*) as sessions, count(distinct visitor_id) as visitors,
           round(avg(engaged_seconds), 2) as avg_engaged,
           count(*) filter (where has_add) as add_sessions,
           count(*) filter (where has_checkout) as checkout_sessions,
           count(*) filter (where has_purchase) as purchase_sessions,
           coalesce(sum(orders), 0) as orders, coalesce(sum(revenue), 0) as revenue
      from keyed group by k)
  select coalesce(jsonb_agg(to_jsonb(a) order by a.sessions desc), '[]'::jsonb) into res from agg a;
  return res;
end;
$$;

create or replace function public.admin_analytics_geography(
  p_start timestamptz, p_end timestamptz, p_level text default 'country',
  p_filters jsonb default '{}'::jsonb, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics']);
  with facts as materialized (select * from private.analytics_facts(p_start, p_end, p_filters)),
  keyed as (
    select f.*,
      case p_level when 'city' then coalesce(f.city, 'Unknown') when 'region' then coalesce(f.region, 'Unknown')
        else coalesce(f.country_name, f.country_code, 'Unknown') end as label,
      case p_level when 'city' then coalesce(f.region, '') when 'region' then coalesce(f.country_name, f.country_code, '') else '' end as parent
      from facts f),
  pvs as (
    select v.session_id, count(*) as n from public.analytics_page_views v
     where v.session_id in (select id from facts) group by v.session_id),
  agg as (
    select k.label, min(k.parent) as parent, min(k.country_code) as country_code, count(*) as sessions, count(distinct k.visitor_id) as visitors,
           coalesce(sum(pvs.n), 0) as page_views,
           count(*) filter (where k.has_add) as add_sessions,
           count(*) filter (where k.has_purchase) as purchase_sessions,
           coalesce(sum(k.orders), 0) as orders, coalesce(sum(k.revenue), 0) as revenue
      from keyed k left join pvs on pvs.session_id = k.id group by k.label)
  select coalesce(jsonb_agg(to_jsonb(a) order by a.sessions desc), '[]'::jsonb)
    into res from (select * from agg order by sessions desc limit p_limit) a;
  return res;
end;
$$;

create or replace function public.admin_analytics_audience(
  p_start timestamptz, p_end timestamptz, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics']);
  with facts as materialized (select * from private.analytics_facts(p_start, p_end, p_filters)),
  seg as (
    select
      count(*) filter (where user_id is null) as anon_sessions,
      count(*) filter (where user_id is null and has_purchase) as anon_purchase_sessions,
      count(*) filter (where user_id is not null) as user_sessions,
      count(*) filter (where user_id is not null and has_purchase) as user_purchase_sessions,
      count(*) filter (where not is_returning_visitor) as new_sessions,
      count(*) filter (where not is_returning_visitor and has_purchase) as new_purchase_sessions,
      count(*) filter (where is_returning_visitor) as returning_sessions,
      count(*) filter (where is_returning_visitor and has_purchase) as returning_purchase_sessions
    from facts),
  purchasers as (
    -- Visitors who bought in the period: how many sessions / days did it take (tracked history only).
    select f.visitor_id,
           (select count(*) from public.analytics_sessions s2 where s2.visitor_id = f.visitor_id and s2.started_at <= max(f.started_at)) as sessions_to_purchase,
           extract(epoch from (max(f.started_at) - (select min(s3.started_at) from public.analytics_sessions s3 where s3.visitor_id = f.visitor_id))) / 86400.0 as days_to_purchase
      from facts f where f.has_purchase group by f.visitor_id),
  repeat_buyers as (
    select count(*) filter (where n >= 2) as repeat_purchasers, count(*) as purchasers
      from (select coalesce(e.user_id::text, e.visitor_id::text) as who, count(*) as n
              from public.analytics_events e
             where e.event_name = 'purchase' and e.session_id in (select id from facts) group by 1) x)
  select jsonb_build_object(
    'segments', (select to_jsonb(seg) from seg),
    'purchasers', (select count(*) from purchasers),
    'avg_sessions_to_purchase', (select round(avg(sessions_to_purchase), 2) from purchasers),
    'avg_days_to_purchase', (select round(avg(days_to_purchase)::numeric, 2) from purchasers),
    'repeat_purchasers', (select repeat_purchasers from repeat_buyers))
  into res;
  return res;
end;
$$;

-- "Active recently" — sessions with activity in the last N minutes. Deliberately NOT "online now":
-- the collector only hears from a visitor when they act or a tab is hidden/left.
create or replace function public.admin_analytics_recent_activity(
  p_minutes integer default 15, p_filters jsonb default '{}'::jsonb, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics', 'support']);
  select coalesce(jsonb_agg(to_jsonb(r) order by r.last_activity_at desc), '[]'::jsonb) into res
  from (
    select s.id as session_id, s.started_at, s.last_activity_at, s.country_code, s.country_name, s.region, s.city,
           s.device_type, s.browser_family, s.source_channel, s.page_view_count, s.engaged_seconds, s.is_test,
           lp.path as last_path, c.observed_cart_value as cart_value, c.current_item_count as cart_items,
           private.analytics_identity(s.user_id) as identity
      from public.analytics_sessions s
      left join lateral (select v.path from public.analytics_page_views v where v.session_id = s.id order by v.started_at desc limit 1) lp on true
      left join lateral (select ac.observed_cart_value, ac.current_item_count from public.analytics_carts ac
                          where ac.last_session_id = s.id and ac.converted_at is null order by ac.last_activity_at desc limit 1) c on true
     where s.last_activity_at >= now() - make_interval(mins => least(greatest(p_minutes, 1), 120))
       and (coalesce((p_filters ->> 'include_test')::boolean, false) or not s.is_test)
       and (coalesce((p_filters ->> 'include_internal')::boolean, false) or not s.is_internal)
     order by s.last_activity_at desc
     limit least(p_limit, 100)) r;
  return res;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants: authenticated only (each function enforces its own role check on entry)
-- ---------------------------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in (
       'admin_analytics_overview', 'admin_analytics_timeseries', 'admin_analytics_funnel',
       'admin_analytics_pages', 'admin_analytics_page_detail', 'admin_analytics_landing_exit',
       'admin_analytics_sources', 'admin_analytics_devices', 'admin_analytics_geography',
       'admin_analytics_audience', 'admin_analytics_recent_activity')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
