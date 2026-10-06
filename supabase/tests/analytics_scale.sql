-- Scale sanity check (always rolled back). Generates ~25k sessions / ~100k page views / ~150k events
-- of synthetic test traffic, then times the heaviest reporting functions over a 30-day window.
-- Run: npx supabase db query --linked --file supabase/tests/analytics_scale.sql
-- The result is delivered as the message of the final (rollback) exception.
do $$
declare
  uid uuid := (select id from public.profiles where admin_role = 'owner' limit 1);
  t0 timestamptz; out text := '';
  s timestamptz := now() - interval '30 days'; e timestamptz := now();
  f jsonb := '{"include_test":true}';
  n_s integer := 25000;
  tmpl integer[] := array[8, 14, 24, 25, 9, 11, 26, 27, 30, 31];
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local statement_timeout = '110s';

  insert into public.analytics_sessions (id, visitor_id, started_at, last_activity_at, landing_path, source_channel, device_type, browser_family,
      os_family, country_code, country_name, region, city, is_test, page_view_count, event_count, engaged_seconds)
  select gen_random_uuid(), gen_random_uuid(), now() - random() * interval '30 days', now(), '/',
         (array['Direct', 'Google Organic', 'Instagram', 'Facebook', 'Referral'])[1 + floor(random() * 5)::int],
         (array['mobile', 'desktop', 'tablet'])[1 + floor(random() * 3)::int], 'Chrome', 'Android', 'IN', 'India',
         (array['Gujarat', 'Maharashtra', 'Delhi'])[1 + floor(random() * 3)::int], 'City' || floor(random() * 20)::int,
         true, 4, 6, round((random() * 120)::numeric, 1)
    from generate_series(1, n_s);

  insert into public.analytics_page_views (id, session_id, visitor_id, path, page_type, odoo_template_id, started_at, engaged_seconds, max_scroll_percent, is_entrance)
  select gen_random_uuid(), s.id, s.visitor_id,
         case when k = 1 then '/' when k = 2 then '/shop' else '/product/p--' || tmpl[1 + floor(random() * 10)::int] end,
         case when k = 1 then 'home' when k = 2 then 'shop' else 'product' end,
         case when k > 2 then tmpl[1 + floor(random() * 10)::int] end,
         s.started_at + (k * interval '30 seconds'), round((random() * 60)::numeric, 1), floor(random() * 100)::int, k = 1
    from public.analytics_sessions s cross join generate_series(1, 4) k where s.is_test;

  insert into public.analytics_events (id, event_name, occurred_at, session_id, visitor_id, odoo_template_id, quantity, value)
  select gen_random_uuid(), (array['product_view', 'product_view', 'add_to_cart', 'cart_viewed', 'checkout_started', 'purchase'])[k],
         s.started_at + (k * interval '20 seconds'), s.id, s.visitor_id, tmpl[1 + floor(random() * 10)::int], 1, 1500
    from public.analytics_sessions s cross join generate_series(1, 6) k
   where s.is_test and (k <= 2 or random() < (case k when 3 then 0.2 when 4 then 0.15 when 5 then 0.08 else 0.03 end));

  analyze public.analytics_sessions; analyze public.analytics_page_views; analyze public.analytics_events;
  out := format('rows: sessions=%s page_views=%s events=%s | ', (select count(*) from public.analytics_sessions where is_test),
                (select count(*) from public.analytics_page_views v join public.analytics_sessions x on x.id = v.session_id where x.is_test),
                (select count(*) from public.analytics_events v join public.analytics_sessions x on x.id = v.session_id where x.is_test));

  t0 := clock_timestamp(); perform public.admin_analytics_overview(s, e, f);
  out := out || format('overview %s ms | ', round(extract(epoch from clock_timestamp() - t0) * 1000));
  t0 := clock_timestamp(); perform public.admin_analytics_timeseries(s, e, 'day', f);
  out := out || format('timeseries %s ms | ', round(extract(epoch from clock_timestamp() - t0) * 1000));
  t0 := clock_timestamp(); perform public.admin_analytics_funnel(s, e, f);
  out := out || format('funnel %s ms | ', round(extract(epoch from clock_timestamp() - t0) * 1000));
  t0 := clock_timestamp(); perform public.admin_analytics_pages(s, e, f, 300);
  out := out || format('pages %s ms | ', round(extract(epoch from clock_timestamp() - t0) * 1000));
  t0 := clock_timestamp(); perform public.admin_analytics_products(s, e, f, 500);
  out := out || format('products %s ms | ', round(extract(epoch from clock_timestamp() - t0) * 1000));
  t0 := clock_timestamp(); perform public.admin_analytics_geography(s, e, 'city', f, 100);
  out := out || format('geography %s ms | ', round(extract(epoch from clock_timestamp() - t0) * 1000));
  t0 := clock_timestamp(); perform public.admin_analytics_sources(s, e, 'channel', f, 100);
  out := out || format('sources %s ms | ', round(extract(epoch from clock_timestamp() - t0) * 1000));
  t0 := clock_timestamp(); perform public.admin_analytics_landing_exit(s, e, f, 100);
  out := out || format('landing/exit %s ms', round(extract(epoch from clock_timestamp() - t0) * 1000));
  raise exception 'SCALE (rolled back): %', out;
end $$;
