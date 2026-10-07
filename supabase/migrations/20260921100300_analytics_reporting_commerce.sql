-- Analytics reporting, part 2: products / carts / search / recommendations / journeys / insights /
-- maintenance. Same conventions as part 1 (SECURITY DEFINER + role check first; cohort-by-session-
-- start periods; cart metrics by last activity; test + internal traffic excluded by default).
--
-- Role matrix (documented in delite-analytics.md):
--   aggregates ............ owner, admin, analytics
--   cart lists / journeys .. owner, admin, analytics, support   (need-to-know for follow-up)
--   customer identity ...... full name/email/phone only for owner, admin, support (masked otherwise)
--   customer journey ....... owner, admin, support
--   maintenance ............ owner, admin (test-data purge / internal visitors); owner (retention purge)

-- ---------------------------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_analytics_products(
  p_start timestamptz, p_end timestamptz, p_filters jsonb default '{}'::jsonb, p_limit integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics']);
  with sess as materialized (select id, visitor_id from private.analytics_sessions_in(p_start, p_end, p_filters)),
  ev as (
    select e.* from public.analytics_events e
     where e.session_id in (select id from sess) and e.odoo_template_id is not null),
  ev_agg as (
    select odoo_template_id as t,
      count(*) filter (where event_name = 'product_view') as views,
      count(distinct visitor_id) filter (where event_name = 'product_view') as unique_viewers,
      count(distinct session_id) filter (where event_name = 'product_view') as view_sessions,
      count(*) filter (where event_name = 'add_to_cart') as adds,
      coalesce(sum(quantity) filter (where event_name = 'add_to_cart'), 0) as units_added,
      count(distinct session_id) filter (where event_name = 'add_to_cart') as add_sessions,
      count(*) filter (where event_name = 'remove_from_cart') as removes,
      count(*) filter (where event_name = 'wishlist_add') as wishlist_adds,
      count(*) filter (where event_name = 'recommendation_impression') as rec_impressions,
      count(*) filter (where event_name = 'recommendation_click') as rec_clicks,
      count(*) filter (where event_name = 'recommendation_add_to_cart') as rec_adds
    from ev group by odoo_template_id),
  cart_agg as (
    select ci.odoo_template_id as t,
      count(distinct c.id) filter (where c.checkout_started_at is not null) as checkout_carts,
      count(distinct c.id) filter (where c.status = 'abandoned') as abandoned_carts,
      coalesce(sum(ci.observed_line_value) filter (where c.status = 'abandoned'), 0) as abandoned_value
    from private.analytics_carts_in(p_start, p_end, p_filters) c
    join public.analytics_cart_items ci on ci.cart_id = c.id and ci.removed_at is null
    group by ci.odoo_template_id),
  ord_agg as (
    select oi.odoo_template_id as t, count(distinct oi.order_id) as orders, sum(oi.quantity) as units_sold,
           coalesce(sum(oi.observed_line_value), 0) as revenue
      from public.analytics_order_items oi where oi.session_id in (select id from sess) group by oi.odoo_template_id),
  keys as (select t from ev_agg union select t from cart_agg union select t from ord_agg)
  select coalesce(jsonb_agg(to_jsonb(r) order by r.views desc, r.adds desc), '[]'::jsonb) into res
  from (
    select k.t as odoo_template_id,
      coalesce(e.views, 0) as views, coalesce(e.unique_viewers, 0) as unique_viewers, coalesce(e.view_sessions, 0) as view_sessions,
      coalesce(e.adds, 0) as adds, coalesce(e.units_added, 0) as units_added, coalesce(e.add_sessions, 0) as add_sessions,
      coalesce(e.removes, 0) as removes, coalesce(e.wishlist_adds, 0) as wishlist_adds,
      coalesce(c.checkout_carts, 0) as checkout_carts, coalesce(c.abandoned_carts, 0) as abandoned_carts,
      coalesce(c.abandoned_value, 0) as abandoned_value,
      coalesce(o.orders, 0) as orders, coalesce(o.units_sold, 0) as units_sold, coalesce(o.revenue, 0) as revenue,
      coalesce(e.rec_impressions, 0) as rec_impressions, coalesce(e.rec_clicks, 0) as rec_clicks, coalesce(e.rec_adds, 0) as rec_adds
    from keys k
    left join ev_agg e on e.t = k.t left join cart_agg c on c.t = k.t left join ord_agg o on o.t = k.t
    order by coalesce(e.views, 0) desc, coalesce(e.adds, 0) desc
    limit p_limit) r;
  return res;
end;
$$;

create or replace function public.admin_analytics_product_detail(
  p_template_id integer, p_start timestamptz, p_end timestamptz, p_filters jsonb default '{}'::jsonb,
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
  ev as (select e.* from public.analytics_events e where e.session_id in (select id from sess) and e.odoo_template_id = p_template_id),
  funnel as (
    select count(distinct session_id) filter (where event_name = 'product_view') as view_sessions,
           count(*) filter (where event_name = 'product_view') as views,
           count(distinct visitor_id) filter (where event_name = 'product_view') as unique_viewers,
           count(distinct session_id) filter (where event_name = 'add_to_cart') as add_sessions,
           count(*) filter (where event_name = 'add_to_cart') as adds,
           count(*) filter (where event_name = 'remove_from_cart') as removes
      from ev),
  cart_stats as (
    select count(distinct c.id) filter (where c.checkout_started_at is not null) as checkout_carts,
           count(distinct c.id) filter (where c.status = 'abandoned') as abandoned_carts,
           count(distinct c.id) as carts
      from private.analytics_carts_in(p_start, p_end, p_filters) c
      join public.analytics_cart_items ci on ci.cart_id = c.id and ci.removed_at is null and ci.odoo_template_id = p_template_id),
  orders as (
    select count(distinct oi.order_id) as orders, coalesce(sum(oi.observed_line_value), 0) as revenue, coalesce(sum(oi.quantity), 0) as units
      from public.analytics_order_items oi where oi.session_id in (select id from sess) and oi.odoo_template_id = p_template_id),
  viewers as (select distinct session_id from ev where event_name = 'product_view'),
  srcs as (select s.source_channel as label, count(*) as n from sess s where s.id in (select session_id from viewers) group by 1 order by 2 desc limit 8),
  devs as (select coalesce(s.device_type, 'unknown') as label, count(*) as n from sess s where s.id in (select session_id from viewers) group by 1 order by 2 desc),
  geos as (select coalesce(s.country_name, 'Unknown') as country, coalesce(s.region, 'Unknown') as region, coalesce(s.city, 'Unknown') as city, count(*) as n
             from sess s where s.id in (select session_id from viewers) group by 1, 2, 3 order by 4 desc limit 10),
  recs as (
    select coalesce(surface, 'unknown') as surface, coalesce(strategy, 'unknown') as strategy,
           count(*) filter (where event_name = 'recommendation_impression') as impressions,
           count(*) filter (where event_name = 'recommendation_click') as clicks,
           count(*) filter (where event_name = 'recommendation_add_to_cart') as adds
      from ev where event_name like 'recommendation_%' group by 1, 2),
  cocart as (
    select ci2.odoo_template_id as t, count(distinct ci2.cart_id) as carts
      from public.analytics_cart_items ci
      join private.analytics_carts_in(p_start, p_end, p_filters) c on c.id = ci.cart_id
      join public.analytics_cart_items ci2 on ci2.cart_id = ci.cart_id and ci2.odoo_template_id <> ci.odoo_template_id and ci2.removed_at is null
     where ci.odoo_template_id = p_template_id and ci.removed_at is null
     group by ci2.odoo_template_id order by 2 desc limit 8),
  pdp as (
    select round(avg(v.engaged_seconds), 2) as avg_engaged,
           round((percentile_cont(0.5) within group (order by v.engaged_seconds))::numeric, 2) as median_engaged,
           round(avg(v.max_scroll_percent), 1) as avg_scroll, count(*) as page_views
      from public.analytics_page_views v where v.session_id in (select id from sess) and v.odoo_template_id = p_template_id),
  daily as (
    select to_char(date_trunc('day', occurred_at at time zone p_tz), 'YYYY-MM-DD') as day,
           count(*) filter (where event_name = 'product_view') as views, count(*) filter (where event_name = 'add_to_cart') as adds
      from ev group by 1)
  select jsonb_build_object(
    'odoo_template_id', p_template_id,
    'funnel', (select to_jsonb(funnel) || to_jsonb(cart_stats) || to_jsonb(orders) from funnel, cart_stats, orders),
    'pdp', (select to_jsonb(pdp) from pdp),
    'sources', (select coalesce(jsonb_agg(to_jsonb(srcs)), '[]'::jsonb) from srcs),
    'devices', (select coalesce(jsonb_agg(to_jsonb(devs)), '[]'::jsonb) from devs),
    'geography', (select coalesce(jsonb_agg(to_jsonb(geos)), '[]'::jsonb) from geos),
    'recommendations', (select coalesce(jsonb_agg(to_jsonb(recs)), '[]'::jsonb) from recs),
    'co_carted', (select coalesce(jsonb_agg(jsonb_build_object('odoo_template_id', t, 'carts', carts)), '[]'::jsonb) from cocart),
    'daily', (select coalesce(jsonb_agg(to_jsonb(daily) order by day), '[]'::jsonb) from daily))
  into res;
  return res;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Carts
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_analytics_carts_summary(
  p_start timestamptz, p_end timestamptz, p_filters jsonb default '{}'::jsonb, p_tz text default 'Asia/Kolkata')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics', 'support']);
  with c as materialized (select * from private.analytics_carts_in(p_start, p_end, p_filters)),
  created as (select count(*) as n from private.analytics_carts_in(p_start, p_end, p_filters, 'created') x where x.current_item_count > 0 or x.converted_at is not null),
  k as (
    select
      count(*) filter (where status = 'active') as active,
      count(*) filter (where status = 'abandoned') as abandoned,
      count(*) filter (where status = 'converted') as converted,
      count(*) filter (where recovered) as recovered,
      coalesce(sum(observed_cart_value) filter (where status = 'abandoned'), 0) as abandoned_value,
      round(avg(observed_cart_value) filter (where status in ('abandoned', 'converted', 'active')), 2) as avg_cart_value,
      round(avg(observed_cart_value) filter (where status = 'abandoned'), 2) as avg_abandoned_value,
      round(avg(current_item_count) filter (where current_item_count > 0), 2) as avg_items,
      count(*) filter (where status = 'abandoned' and checkout_started_at is not null) as abandoned_after_checkout,
      count(*) filter (where status = 'abandoned' and now() - last_activity_at < interval '6 hours') as age_30m_6h,
      count(*) filter (where status = 'abandoned' and now() - last_activity_at >= interval '6 hours' and now() - last_activity_at < interval '24 hours') as age_6h_24h,
      count(*) filter (where status = 'abandoned' and now() - last_activity_at >= interval '24 hours' and now() - last_activity_at < interval '3 days') as age_1d_3d,
      count(*) filter (where status = 'abandoned' and now() - last_activity_at >= interval '3 days') as age_3d_plus
    from c),
  daily as (
    select to_char(date_trunc('day', last_activity_at at time zone p_tz), 'YYYY-MM-DD') as day,
           count(*) filter (where status = 'abandoned') as abandoned,
           coalesce(sum(observed_cart_value) filter (where status = 'abandoned'), 0) as abandoned_value,
           count(*) filter (where status = 'converted') as converted
      from c group by 1)
  select jsonb_build_object(
    'created', (select n from created),
    'kpis', (select to_jsonb(k) from k),
    'daily', (select coalesce(jsonb_agg(to_jsonb(daily) order by day), '[]'::jsonb) from daily))
  into res;
  return res;
end;
$$;

create or replace function public.admin_analytics_abandoned_carts(
  p_start timestamptz, p_end timestamptz, p_filters jsonb default '{}'::jsonb,
  p_status text default 'abandoned', p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb; v_total integer;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics', 'support']);
  select count(*) into v_total
    from private.analytics_carts_in(p_start, p_end, p_filters) c
   where (p_status = 'abandoned' and c.status = 'abandoned') or (p_status = 'recovered' and c.recovered)
      or (p_status = 'all' and c.status in ('abandoned', 'converted', 'active'));

  select jsonb_build_object('total', v_total, 'rows', coalesce(jsonb_agg(to_jsonb(r) order by r.last_activity_at desc), '[]'::jsonb))
    into res
  from (
    select c.id as cart_id, c.status, c.recovered, c.last_activity_at, c.abandoned_at, c.converted_at,
           round(extract(epoch from (now() - c.last_activity_at)) / 60.0) as minutes_since,
           c.current_item_count as item_count, c.observed_cart_value as cart_value,
           (c.checkout_started_at is not null) as checkout_started, c.visitor_id,
           private.analytics_identity(c.user_id) as identity,
           s.country_name, s.region, s.city, s.device_type, s.source_channel,
           s.engaged_seconds as session_engaged_seconds, s.page_view_count as session_page_views,
           (select v.path from public.analytics_page_views v where v.session_id = s.id order by v.started_at desc limit 1) as last_path,
           (select coalesce(jsonb_agg(jsonb_build_object('odoo_template_id', ci.odoo_template_id, 'quantity', ci.quantity, 'unit_price', ci.observed_unit_price)), '[]'::jsonb)
              from (select * from public.analytics_cart_items x where x.cart_id = c.id and x.removed_at is null order by x.observed_line_value desc limit 4) ci) as items
      from private.analytics_carts_in(p_start, p_end, p_filters) c
      left join public.analytics_sessions s on s.id = coalesce(c.last_session_id, c.session_id)
     where (p_status = 'abandoned' and c.status = 'abandoned') or (p_status = 'recovered' and c.recovered)
        or (p_status = 'all' and c.status in ('abandoned', 'converted', 'active'))
     order by c.last_activity_at desc
     limit least(p_limit, 200) offset greatest(p_offset, 0)) r;
  return res;
end;
$$;

create or replace function public.admin_analytics_cart_detail(p_cart_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics', 'support']);
  with c as (select * from private.analytics_cart_status where id = p_cart_id),
  sids as (
    select distinct sid from (
      select e.session_id as sid from public.analytics_events e where e.cart_id = p_cart_id
      union select session_id from c union select last_session_id from c where last_session_id is not null) x where sid is not null),
  sess as (select s.* from public.analytics_sessions s where s.id in (select sid from sids)),
  tl as (
    select v.started_at as at, 'page_view' as kind, v.path as label, v.engaged_seconds as engaged, null::integer as template_id,
           null::integer as qty, null::numeric as value, v.max_scroll_percent as scroll, v.session_id
      from public.analytics_page_views v where v.session_id in (select sid from sids)
    union all
    select e.occurred_at, e.event_name, coalesce(e.search_query, e.surface, e.page_path), null, e.odoo_template_id,
           e.quantity, e.value, null, e.session_id
      from public.analytics_events e where e.session_id in (select sid from sids)
    order by 1 limit 400)
  select jsonb_build_object(
    'cart', (select to_jsonb(c) - 'visitor_id' from c),
    'visitor_id', (select visitor_id from c),
    'identity', (select private.analytics_identity(user_id) from c),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('odoo_template_id', ci.odoo_template_id, 'odoo_variant_id', ci.odoo_variant_id,
                'quantity', ci.quantity, 'observed_unit_price', ci.observed_unit_price, 'observed_line_value', ci.observed_line_value,
                'removed', ci.removed_at is not null) order by ci.added_at), '[]'::jsonb)
                from public.analytics_cart_items ci where ci.cart_id = p_cart_id),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'started_at', started_at, 'landing_path', landing_path,
                'source_channel', source_channel, 'referrer_domain', referrer_domain, 'utm_campaign', utm_campaign, 'device_type', device_type,
                'browser_family', browser_family, 'country_name', country_name, 'region', region, 'city', city,
                'engaged_seconds', engaged_seconds, 'page_view_count', page_view_count) order by started_at), '[]'::jsonb) from sess),
    'timeline', (select coalesce(jsonb_agg(to_jsonb(tl) order by at), '[]'::jsonb) from tl))
  into res;
  if res -> 'cart' is null or res -> 'cart' = 'null'::jsonb then return null; end if;
  return res;
end;
$$;

create or replace function public.admin_analytics_cart_pairs(
  p_start timestamptz, p_end timestamptz, p_filters jsonb default '{}'::jsonb,
  p_min integer default 2, p_limit integer default 30)
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
  citems as (
    select distinct ci.cart_id, ci.odoo_template_id
      from private.analytics_carts_in(p_start, p_end, p_filters, 'created') c
      join public.analytics_cart_items ci on ci.cart_id = c.id and ci.removed_at is null),
  cpairs as (
    select a.odoo_template_id as a, b.odoo_template_id as b, count(*) as carts
      from citems a join citems b on a.cart_id = b.cart_id and a.odoo_template_id < b.odoo_template_id
     group by 1, 2 having count(*) >= p_min order by 3 desc limit p_limit),
  oitems as (
    select distinct oi.order_id, oi.odoo_template_id from public.analytics_order_items oi where oi.session_id in (select id from sess)),
  opairs as (
    select a.odoo_template_id as a, b.odoo_template_id as b, count(*) as orders
      from oitems a join oitems b on a.order_id = b.order_id and a.odoo_template_id < b.odoo_template_id
     group by 1, 2 having count(*) >= p_min order by 3 desc limit p_limit)
  select jsonb_build_object(
    'carted_together', (select coalesce(jsonb_agg(to_jsonb(cpairs)), '[]'::jsonb) from cpairs),
    'purchased_together', (select coalesce(jsonb_agg(to_jsonb(opairs)), '[]'::jsonb) from opairs),
    'carts_with_items', (select count(distinct cart_id) from citems),
    'orders', (select count(distinct order_id) from oitems),
    'min_support', p_min)
  into res;
  return res;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_analytics_searches(
  p_start timestamptz, p_end timestamptz, p_filters jsonb default '{}'::jsonb, p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics']);
  with sess as materialized (select id, visitor_id from private.analytics_sessions_in(p_start, p_end, p_filters)),
  s as (
    select e.id, e.session_id, e.visitor_id, e.occurred_at, e.search_query, e.search_query_norm, coalesce(e.result_count, -1) as result_count,
      exists (select 1 from public.analytics_events k where k.session_id = e.session_id and k.event_name = 'search_result_click'
                and k.search_query_norm = e.search_query_norm and k.occurred_at >= e.occurred_at) as clicked,
      exists (select 1 from public.analytics_events a where a.session_id = e.session_id and a.event_name = 'add_to_cart'
                and a.occurred_at >= e.occurred_at) as added,
      exists (select 1 from public.analytics_events p where p.session_id = e.session_id and p.event_name = 'purchase'
                and p.occurred_at >= e.occurred_at) as purchased
    from public.analytics_events e
   where e.event_name = 'search_submitted' and e.session_id in (select id from sess) and e.search_query_norm is not null),
  q as (
    select search_query_norm as query, mode() within group (order by search_query) as display,
           count(*) as searches, count(distinct visitor_id) as unique_searchers,
           count(*) filter (where result_count = 0) as zero_results,
           count(*) filter (where clicked) as clicks, count(*) filter (where added) as adds, count(*) filter (where purchased) as purchases,
           max(occurred_at) as last_searched_at
      from s group by search_query_norm),
  k as (
    select count(*) as searches, count(distinct visitor_id) as unique_searchers,
           count(*) filter (where result_count = 0) as zero_results, count(*) filter (where clicked) as clicks,
           count(*) filter (where added) as adds, count(*) filter (where purchased) as purchases
      from s)
  select jsonb_build_object(
    'kpis', (select to_jsonb(k) from k),
    'queries', (select coalesce(jsonb_agg(to_jsonb(x) order by x.searches desc), '[]'::jsonb) from (select * from q order by searches desc limit p_limit) x))
  into res;
  return res;
end;
$$;

create or replace function public.admin_analytics_search_detail(
  p_query_norm text, p_start timestamptz, p_end timestamptz, p_filters jsonb default '{}'::jsonb)
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
  s as (
    select e.* from public.analytics_events e
     where e.event_name = 'search_submitted' and e.search_query_norm = lower(trim(p_query_norm)) and e.session_id in (select id from sess)),
  clicked as (
    select k.odoo_template_id as t, count(*) as n from public.analytics_events k
     where k.event_name = 'search_result_click' and k.search_query_norm = lower(trim(p_query_norm))
       and k.session_id in (select id from sess) and k.odoo_template_id is not null group by 1 order by 2 desc limit 10),
  added as (
    select a.odoo_template_id as t, count(*) as n
      from s join public.analytics_events a on a.session_id = s.session_id and a.event_name = 'add_to_cart' and a.occurred_at >= s.occurred_at
     where a.odoo_template_id is not null group by 1 order by 2 desc limit 10),
  med as (
    select round((percentile_cont(0.5) within group (order by k.duration_ms))::numeric / 1000.0, 1) as median_secs_to_click
      from public.analytics_events k where k.event_name = 'search_result_click' and k.search_query_norm = lower(trim(p_query_norm))
       and k.session_id in (select id from sess) and k.duration_ms is not null)
  select jsonb_build_object(
    'query', lower(trim(p_query_norm)), 'searches', (select count(*) from s),
    'zero_results', (select count(*) from s where result_count = 0),
    'clicked_products', (select coalesce(jsonb_agg(jsonb_build_object('odoo_template_id', t, 'n', n)), '[]'::jsonb) from clicked),
    'added_products', (select coalesce(jsonb_agg(jsonb_build_object('odoo_template_id', t, 'n', n)), '[]'::jsonb) from added),
    'median_secs_to_click', (select median_secs_to_click from med))
  into res;
  return res;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Recommendations
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_analytics_recommendations(
  p_start timestamptz, p_end timestamptz, p_group text default 'surface',
  p_filters jsonb default '{}'::jsonb, p_limit integer default 200)
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
  ev as (
    select e.* from public.analytics_events e
     where e.event_name like 'recommendation_%' and e.session_id in (select id from sess)),
  agg as (
    select case p_group when 'strategy' then coalesce(strategy, 'unknown')
                        when 'product' then odoo_template_id::text
                        else coalesce(surface, 'unknown') end as label,
           min(case when p_group = 'product' then null else coalesce(surface, 'unknown') end) as surface,
           count(*) filter (where event_name = 'recommendation_impression') as impressions,
           count(*) filter (where event_name = 'recommendation_click') as clicks,
           count(*) filter (where event_name = 'recommendation_add_to_cart') as adds
      from ev where p_group <> 'product' or odoo_template_id is not null group by 1)
  select coalesce(jsonb_agg(to_jsonb(a) order by a.impressions desc, a.clicks desc), '[]'::jsonb)
    into res from (select * from agg order by impressions desc limit p_limit) a;
  return res;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Journeys
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_analytics_session_journey(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics', 'support']);
  with s as (select * from public.analytics_sessions where id = p_session_id),
  tl as (
    select v.started_at as at, 'page_view' as kind, v.path as label, v.engaged_seconds as engaged, null::integer as template_id,
           null::integer as qty, null::numeric as value, v.max_scroll_percent as scroll
      from public.analytics_page_views v where v.session_id = p_session_id
    union all
    select e.occurred_at, e.event_name, coalesce(e.search_query, e.surface, e.page_path), null, e.odoo_template_id, e.quantity, e.value, null
      from public.analytics_events e where e.session_id = p_session_id
    order by 1 limit 500),
  cart as (
    select c.id, c.status, c.current_item_count, c.observed_cart_value, c.checkout_started_at, c.converted_at
      from private.analytics_cart_status c where c.last_session_id = p_session_id or c.session_id = p_session_id)
  select jsonb_build_object(
    'session', (select to_jsonb(s) - 'geo_attempted_at' from s),
    'identity', (select private.analytics_identity(user_id) from s),
    'timeline', (select coalesce(jsonb_agg(to_jsonb(tl) order by at), '[]'::jsonb) from tl),
    'carts', (select coalesce(jsonb_agg(to_jsonb(cart)), '[]'::jsonb) from cart))
  into res;
  if res -> 'session' is null or res -> 'session' = 'null'::jsonb then return null; end if;
  return res;
end;
$$;

create or replace function public.admin_analytics_customer_journey(p_user_id uuid, p_limit integer default 300)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  -- Person-level view: need-to-know roles only (not the analytics-only role).
  perform private.analytics_require(array['owner', 'admin', 'support']);
  with sess as (select * from public.analytics_sessions where user_id = p_user_id order by started_at desc limit 25),
  tl as (
    select * from (
      select v.started_at as at, 'page_view' as kind, v.path as label, v.engaged_seconds as engaged, null::integer as template_id,
             null::integer as qty, null::numeric as value, v.session_id
        from public.analytics_page_views v where v.session_id in (select id from sess)
      union all
      select e.occurred_at, e.event_name, coalesce(e.search_query, e.surface, e.page_path), null, e.odoo_template_id, e.quantity, e.value, e.session_id
        from public.analytics_events e where e.session_id in (select id from sess)) u
    order by at desc limit least(p_limit, 500)),
  orders as (
    select count(*) as n, coalesce(sum(value), 0) as revenue, min(occurred_at) as first_at, max(occurred_at) as last_at
      from public.analytics_events where user_id = p_user_id and event_name = 'purchase')
  select jsonb_build_object(
    'identity', private.analytics_identity(p_user_id),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'started_at', started_at, 'device_type', device_type,
                  'city', city, 'source_channel', source_channel, 'page_view_count', page_view_count,
                  'engaged_seconds', engaged_seconds) order by started_at desc), '[]'::jsonb) from sess),
    'timeline', (select coalesce(jsonb_agg(to_jsonb(tl) order by at), '[]'::jsonb) from tl),
    'orders', (select to_jsonb(orders) from orders))
  into res;
  return res;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Deterministic insights. Every rule has a fixed threshold (below) — no model-written claims. An
-- insight is only emitted when the data clears its minimum sample size. The client formats the
-- sentence from `code` + `params` (and resolves product names live from Odoo).
--   product_high_views_low_adds : >= 50 view sessions and <= 2% of them added the product
--   mobile_checkout_gap         : >= 100 sessions on both mobile and desktop and mobile's purchase
--                                 rate < 60% of desktop's (desktop rate > 0)
--   zero_result_search          : a query with >= 5 searches, ALL returning 0 results
--   abandoned_value             : >= 3 abandoned carts in the period
--   source_growth               : channel with >= 30 sessions now and >= +25% vs the previous period
--                                 of equal length (previous >= 10 sessions)
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_analytics_insights(
  p_start timestamptz, p_end timestamptz, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  out jsonb := '[]'::jsonb;
  r record;
  v_prev_start timestamptz := p_start - (p_end - p_start);
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics']);

  for r in
    select (x ->> 'odoo_template_id')::int as t, (x ->> 'view_sessions')::int as vs, (x ->> 'add_sessions')::int as adds
      from jsonb_array_elements(public.admin_analytics_products(p_start, p_end, p_filters, 300)) x
     where (x ->> 'view_sessions')::int >= 50 and (x ->> 'add_sessions')::numeric <= 0.02 * (x ->> 'view_sessions')::numeric
     order by (x ->> 'view_sessions')::int desc limit 3
  loop
    out := out || jsonb_build_object('code', 'product_high_views_low_adds', 'severity', 'warning',
      'params', jsonb_build_object('odoo_template_id', r.t, 'view_sessions', r.vs, 'add_sessions', r.adds));
  end loop;

  for r in
    with d as (select device_type, count(*) as sessions, count(*) filter (where has_purchase) as purchases
                 from private.analytics_facts(p_start, p_end, p_filters) where device_type in ('mobile', 'desktop') group by 1)
    select m.sessions as ms, m.purchases as mp, dk.sessions as ds, dk.purchases as dp
      from d m, d dk where m.device_type = 'mobile' and dk.device_type = 'desktop'
       and m.sessions >= 100 and dk.sessions >= 100 and dk.purchases > 0
       and (m.purchases::numeric / m.sessions) < 0.6 * (dk.purchases::numeric / dk.sessions)
  loop
    out := out || jsonb_build_object('code', 'mobile_checkout_gap', 'severity', 'warning',
      'params', jsonb_build_object('mobile_sessions', r.ms, 'mobile_purchases', r.mp, 'desktop_sessions', r.ds, 'desktop_purchases', r.dp));
  end loop;

  for r in
    select x ->> 'display' as q, (x ->> 'searches')::int as n
      from jsonb_array_elements(public.admin_analytics_searches(p_start, p_end, p_filters, 200) -> 'queries') x
     where (x ->> 'searches')::int >= 5 and (x ->> 'zero_results')::int = (x ->> 'searches')::int
     order by (x ->> 'searches')::int desc limit 3
  loop
    out := out || jsonb_build_object('code', 'zero_result_search', 'severity', 'warning',
      'params', jsonb_build_object('query', r.q, 'searches', r.n));
  end loop;

  for r in
    select (k ->> 'abandoned')::int as n, (k ->> 'abandoned_value')::numeric as v
      from (select public.admin_analytics_carts_summary(p_start, p_end, p_filters) -> 'kpis' as k) z
     where (k ->> 'abandoned')::int >= 3
  loop
    out := out || jsonb_build_object('code', 'abandoned_value', 'severity', 'info',
      'params', jsonb_build_object('carts', r.n, 'value', r.v));
  end loop;

  for r in
    with cur as (select source_channel, count(*) as n from private.analytics_sessions_in(p_start, p_end, p_filters) group by 1),
         prev as (select source_channel, count(*) as n from private.analytics_sessions_in(v_prev_start, p_start, p_filters) group by 1)
    select cur.source_channel as ch, cur.n as current_n, prev.n as previous_n,
           round(((cur.n - prev.n)::numeric / prev.n) * 100) as change_pct
      from cur join prev using (source_channel)
     where cur.n >= 30 and prev.n >= 10 and cur.n >= prev.n * 1.25 order by cur.n desc limit 2
  loop
    out := out || jsonb_build_object('code', 'source_growth', 'severity', 'positive',
      'params', jsonb_build_object('channel', r.ch, 'current', r.current_n, 'previous', r.previous_n, 'change_pct', r.change_pct));
  end loop;

  return out;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Collection health + maintenance
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_analytics_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'analytics', 'support']);
  select jsonb_build_object(
    'first_tracked_at', min(started_at) filter (where not is_test),
    'last_session_at', max(last_activity_at) filter (where not is_test),
    'sessions_total', count(*) filter (where not is_test),
    'sessions_24h', count(*) filter (where not is_test and started_at >= now() - interval '24 hours'),
    'geo_resolved_pct', round(100.0 * count(*) filter (where not is_test and country_code is not null) / nullif(count(*) filter (where not is_test), 0), 1),
    'test_sessions', count(*) filter (where is_test),
    'internal_sessions', count(*) filter (where is_internal and not is_test))
  into res from public.analytics_sessions;
  return res;
end;
$$;

create or replace function public.admin_analytics_set_internal_visitor(
  p_visitor uuid, p_internal boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.analytics_require(array['owner', 'admin']);
  if p_internal then
    insert into public.analytics_internal_visitors (visitor_id, note, created_by)
    values (p_visitor, left(p_note, 200), auth.uid()) on conflict (visitor_id) do nothing;
  else
    delete from public.analytics_internal_visitors where visitor_id = p_visitor;
  end if;
  update public.analytics_sessions set is_internal = p_internal where visitor_id = p_visitor;
end;
$$;

create or replace function public.admin_analytics_purge_test_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare n_s integer; n_c integer; n_o integer;
begin
  perform private.analytics_require(array['owner', 'admin']);
  delete from public.analytics_order_items where is_test; get diagnostics n_o = row_count;
  delete from public.analytics_carts where is_test; get diagnostics n_c = row_count;
  delete from public.analytics_sessions where is_test; get diagnostics n_s = row_count;   -- cascades page views + events
  return jsonb_build_object('sessions', n_s, 'carts', n_c, 'order_items', n_o);
end;
$$;

-- Retention: NOT scheduled and never run automatically — the business retention rule (suggested
-- 12-18 months for raw events) is a decision for the owner. Owner-only, explicit call.
create or replace function public.admin_analytics_purge_before(p_before timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare n_s integer; n_c integer;
begin
  perform private.analytics_require(array['owner']);
  if p_before > now() - interval '30 days' then
    raise exception 'analytics: refusing to purge data newer than 30 days';
  end if;
  delete from public.analytics_carts where last_activity_at < p_before; get diagnostics n_c = row_count;
  delete from public.analytics_sessions where started_at < p_before; get diagnostics n_s = row_count;
  delete from public.analytics_order_items where occurred_at < p_before;
  return jsonb_build_object('sessions', n_s, 'carts', n_c);
end;
$$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in (
       'admin_analytics_products', 'admin_analytics_product_detail', 'admin_analytics_carts_summary',
       'admin_analytics_abandoned_carts', 'admin_analytics_cart_detail', 'admin_analytics_cart_pairs',
       'admin_analytics_searches', 'admin_analytics_search_detail', 'admin_analytics_recommendations',
       'admin_analytics_session_journey', 'admin_analytics_customer_journey', 'admin_analytics_insights',
       'admin_analytics_health', 'admin_analytics_set_internal_visitor', 'admin_analytics_purge_test_data',
       'admin_analytics_purge_before')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
