-- Deterministic synthetic analytics dataset for testing the reporting functions, the Admin UI and
-- screenshots. EVERY row is flagged is_test = true, so it is invisible to reports unless the
-- "include test traffic" filter is on, and is removed by admin_analytics_purge_test_data().
-- Run with:  npx supabase db query --linked --file supabase/tests/analytics_seed.sql
-- Idempotent: purges previous seed rows first.

delete from public.analytics_carts where is_test;
delete from public.analytics_order_items where is_test;
delete from public.analytics_sessions where is_test;

do $$
declare
  admin_user uuid := (select id from public.profiles where admin_role = 'owner' limit 1);
  tmpl integer[] := array[8, 14, 24, 25, 9, 11, 26, 27, 30, 31];
  slugs text[] := array['grass-18-mm-set-of-5--8', 'seat-cover--14', 'floor-mat--24', 'dashcam--25', 'steering-cover--9', 'phone-holder--11', 'bike-guard--26', 'helmet--27', 'car-perfume--30', 'tyre-inflator--31'];
  prices numeric[] := array[1, 2499, 1899, 5999, 799, 449, 1299, 2199, 299, 1499];
  geos text[][] := array[
    array['IN','India','Gujarat','Ahmedabad'], array['IN','India','Gujarat','Ahmedabad'], array['IN','India','Gujarat','Ahmedabad'],
    array['IN','India','Maharashtra','Mumbai'], array['IN','India','Maharashtra','Mumbai'],
    array['IN','India','Gujarat','Surat'], array['IN','India','Delhi','New Delhi'],
    array['IN','India','Karnataka','Bengaluru'], array['IN','India','Rajasthan','Jaipur'],
    array['US','United States','California','San Jose'], array['AE','United Arab Emirates','Dubai','Dubai'],
    array['GB','United Kingdom','England','London']];
  queries text[] := array['seat cover', 'seat cover', 'seat cover', 'floor mat', 'floor mat', 'dashcam', 'dashcam', 'steering cover', 'steering cover', 'steering cover', 'bike guard', 'perfume', 'helmet'];
  channels text[] := array['Direct','Direct','Direct','Google Organic','Google Organic','Google Organic','Instagram','Instagram','Facebook','WhatsApp','Referral','Campaign'];
  i integer; j integer; k integer;
  sid uuid; vid uuid; cid uuid; pvid uuid; oid uuid;
  t0 timestamptz; t timestamptz; gi integer; ch text; dev text; n_pv integer; ti integer; p text;
  has_add boolean; has_co boolean; has_buy boolean; is_user boolean; q text; found boolean;
  visitor_pool uuid[] := array[]::uuid[];
  cart_items jsonb; total numeric; abandoned_age interval; recs text[] := array['pdp_recommendation', 'cart_recommendation', 'home_trending'];
begin
  perform setseed(0.42);
  for i in 1..90 loop visitor_pool := visitor_pool || gen_random_uuid(); end loop;

  for i in 1..420 loop
    sid := gen_random_uuid();
    vid := case when random() < 0.35 then visitor_pool[1 + floor(random() * 90)::int] else gen_random_uuid() end;
    t0 := now() - (random() * interval '40 days') - (random() * interval '20 hours');
    if i > 410 then t0 := now() - (random() * interval '12 minutes'); end if;   -- a few "active recently"
    gi := 1 + floor(random() * array_length(geos, 1))::int;
    ch := channels[1 + floor(random() * array_length(channels, 1))::int];
    dev := case when random() < 0.6 then 'mobile' when random() < 0.83 then 'desktop' else 'tablet' end;
    is_user := random() < 0.18 and admin_user is not null;
    n_pv := 1 + floor(random() * random() * 9)::int;
    has_add := random() < 0.22; has_co := has_add and random() < 0.5; has_buy := has_co and random() < 0.45;

    insert into public.analytics_sessions (id, visitor_id, user_id, started_at, last_activity_at, landing_path, referrer_domain,
      utm_source, utm_medium, utm_campaign, source_channel, device_type, browser_family, os_family,
      country_code, country_name, region, city, is_returning_visitor, is_test, page_view_count, event_count, engaged_seconds)
    values (sid, vid, case when is_user then admin_user end, t0, t0, '/',
      case ch when 'Google Organic' then 'www.google.com' when 'Instagram' then 'l.instagram.com' when 'Facebook' then 'l.facebook.com' when 'WhatsApp' then 'wa.me' when 'Referral' then 'autoblog.example' end,
      case ch when 'Campaign' then 'diwali' end, case ch when 'Campaign' then 'email' end, case ch when 'Campaign' then 'diwali-sale' end,
      ch, dev, case when random() < 0.7 then 'Chrome' when random() < 0.7 then 'Safari' else 'Edge' end,
      case dev when 'mobile' then case when random() < 0.7 then 'Android' else 'iOS' end else case when random() < 0.7 then 'Windows' else 'macOS' end end,
      geos[gi][1], geos[gi][2], geos[gi][3], geos[gi][4], i % 5 = 0, true, 0, 0, 0);

    t := t0; found := true;
    for j in 1..n_pv loop
      pvid := gen_random_uuid();
      ti := 1 + floor(random() * array_length(tmpl, 1))::int;
      p := case when j = 1 and random() < 0.5 then '/' when j = 1 then '/shop' when random() < 0.55 then '/product/' || slugs[ti] when random() < 0.5 then '/shop' when random() < 0.5 then '/cart' else '/brands' end;
      insert into public.analytics_page_views (id, session_id, visitor_id, user_id, path, page_type, odoo_template_id, started_at, ended_at, engaged_seconds, max_scroll_percent, is_entrance, referrer_path)
      values (pvid, sid, vid, case when is_user then admin_user end, p,
        case when p = '/' then 'home' when p like '/product/%' then 'product' else trim(leading '/' from p) end,
        case when p like '/product/%' then tmpl[ti] end, t, t + interval '40 seconds',
        round((random() * random() * 120)::numeric, 2), floor(random() * 101)::int, j = 1, case when j > 1 then '/shop' end);
      if p like '/product/%' then
        insert into public.analytics_events (id, event_name, occurred_at, session_id, visitor_id, user_id, page_view_id, page_path, page_type, odoo_template_id)
        values (gen_random_uuid(), 'product_view', t, sid, vid, case when is_user then admin_user end, pvid, p, 'product', tmpl[ti]);
        if random() < 0.35 then
          insert into public.analytics_events (id, event_name, occurred_at, session_id, visitor_id, page_view_id, page_path, odoo_template_id, surface, strategy)
          values (gen_random_uuid(), 'recommendation_impression', t, sid, vid, pvid, p, tmpl[1 + floor(random() * 10)::int], 'pdp_recommendation', 'same_category');
          if random() < 0.3 then
            insert into public.analytics_events (id, event_name, occurred_at, session_id, visitor_id, page_view_id, page_path, odoo_template_id, surface, strategy)
            values (gen_random_uuid(), 'recommendation_click', t, sid, vid, pvid, p, tmpl[1 + floor(random() * 10)::int], 'pdp_recommendation', 'same_category');
          end if;
        end if;
        if random() < 0.08 then
          insert into public.analytics_events (id, event_name, occurred_at, session_id, visitor_id, odoo_template_id, surface)
          values (gen_random_uuid(), 'wishlist_add', t, sid, vid, tmpl[ti], 'product_card');
        end if;
      end if;
      -- search on the shop page
      if p = '/shop' and random() < 0.3 then
        q := queries[1 + floor(random() * array_length(queries, 1))::int];
        found := q not in ('steering cover');
        insert into public.analytics_events (id, event_name, occurred_at, session_id, visitor_id, page_path, search_query, search_query_norm, result_count)
        values (gen_random_uuid(), 'search_submitted', t, sid, vid, '/shop', initcap(q), q, case when found then 12 else 0 end);
        if not found then
          insert into public.analytics_events (id, event_name, occurred_at, session_id, visitor_id, page_path, search_query, search_query_norm, result_count)
          values (gen_random_uuid(), 'search_zero_results', t, sid, vid, '/shop', initcap(q), q, 0);
        elsif random() < 0.5 then
          insert into public.analytics_events (id, event_name, occurred_at, session_id, visitor_id, page_path, odoo_template_id, search_query, search_query_norm, duration_ms)
          values (gen_random_uuid(), 'search_result_click', t + interval '5 seconds', sid, vid, '/shop', tmpl[1 + floor(random() * 10)::int], initcap(q), q, 4200);
        end if;
      end if;
      t := t + interval '45 seconds';
    end loop;

    if has_add then
      cid := gen_random_uuid();
      cart_items := '[]'::jsonb; total := 0;
      for k in 1..(1 + floor(random() * 3)::int) loop
        ti := 1 + floor(random() * array_length(tmpl, 1))::int;
        cart_items := cart_items || jsonb_build_object('t', tmpl[ti], 'q', 1 + floor(random() * 2)::int, 'p', prices[ti]);
      end loop;
      -- dedupe by template (cart_items PK)
      insert into public.analytics_carts (id, visitor_id, session_id, last_session_id, user_id, created_at, updated_at, last_activity_at, checkout_started_at, current_item_count, observed_cart_value, is_test)
      values (cid, vid, sid, sid, case when is_user then admin_user end, t, t, t + interval '2 minutes', case when has_co then t + interval '90 seconds' end, 0, 0, true);
      insert into public.analytics_cart_items (cart_id, odoo_template_id, quantity, observed_unit_price, added_at)
      select cid, (x ->> 't')::int, max((x ->> 'q')::int), max((x ->> 'p')::numeric), t
        from jsonb_array_elements(cart_items) x group by (x ->> 't')::int;
      update public.analytics_carts c set
        current_item_count = (select coalesce(sum(quantity), 0) from public.analytics_cart_items where cart_id = cid),
        observed_cart_value = (select coalesce(sum(observed_line_value), 0) from public.analytics_cart_items where cart_id = cid)
      where c.id = cid;
      insert into public.analytics_events (id, event_name, occurred_at, session_id, visitor_id, user_id, cart_id, odoo_template_id, quantity, value)
      select gen_random_uuid(), 'add_to_cart', t, sid, vid, case when is_user then admin_user end, cid, odoo_template_id, quantity, observed_line_value
        from public.analytics_cart_items where cart_id = cid;
      if random() < 0.15 then
        insert into public.analytics_events (id, event_name, occurred_at, session_id, visitor_id, cart_id, odoo_template_id, quantity)
        select gen_random_uuid(), 'remove_from_cart', t + interval '30 seconds', sid, vid, cid, odoo_template_id, 1 from public.analytics_cart_items where cart_id = cid limit 1;
      end if;
      insert into public.analytics_events (id, event_name, occurred_at, session_id, visitor_id, cart_id, page_path)
      values (gen_random_uuid(), 'cart_viewed', t + interval '1 minute', sid, vid, cid, '/cart');
      if has_co then
        insert into public.analytics_events (id, event_name, occurred_at, session_id, visitor_id, user_id, cart_id, value, page_path)
        values (gen_random_uuid(), 'checkout_started', t + interval '90 seconds', sid, vid, case when is_user then admin_user end, cid,
          (select observed_cart_value from public.analytics_carts where id = cid), '/checkout');
        insert into public.analytics_events (id, event_name, occurred_at, session_id, visitor_id, cart_id, metadata)
        values (gen_random_uuid(), 'checkout_step_viewed', t + interval '95 seconds', sid, vid, cid, '{"step":"details"}');
      end if;
      if has_buy then
        oid := gen_random_uuid();
        insert into public.analytics_events (id, event_name, occurred_at, session_id, visitor_id, user_id, cart_id, order_id, value)
        values (gen_random_uuid(), 'purchase', t + interval '3 minutes', sid, vid, case when is_user then admin_user end, cid, oid,
          (select observed_cart_value from public.analytics_carts where id = cid));
        insert into public.analytics_order_items (order_id, odoo_template_id, quantity, observed_unit_price, session_id, visitor_id, user_id, cart_id, occurred_at, is_test)
        select oid, odoo_template_id, quantity, observed_unit_price, sid, vid, case when is_user then admin_user end, cid, t + interval '3 minutes', true
          from public.analytics_cart_items where cart_id = cid;
        update public.analytics_carts set converted_at = t + interval '3 minutes', order_id = oid,
          abandoned_at = case when random() < 0.25 then t + interval '40 minutes' end,
          last_activity_at = t + interval '3 minutes' where id = cid;
      elsif i <= 410 then
        -- leave abandoned at varied ages (last_activity already in the past)
        null;
      else
        update public.analytics_carts set last_activity_at = now() - interval '5 minutes' where id = cid;   -- still active
      end if;
    end if;

    update public.analytics_sessions s set
      page_view_count = (select count(*) from public.analytics_page_views where session_id = sid),
      event_count = (select count(*) from public.analytics_events where session_id = sid),
      engaged_seconds = (select coalesce(sum(engaged_seconds), 0) from public.analytics_page_views where session_id = sid),
      last_activity_at = t, ended_at = t
    where s.id = sid;
  end loop;
end $$;

select
  (select count(*) from public.analytics_sessions where is_test) as sessions,
  (select count(*) from public.analytics_page_views v join public.analytics_sessions s on s.id = v.session_id where s.is_test) as page_views,
  (select count(*) from public.analytics_events e join public.analytics_sessions s on s.id = e.session_id where s.is_test) as events,
  (select count(*) from public.analytics_carts where is_test) as carts,
  (select count(*) from public.analytics_events e join public.analytics_sessions s on s.id = e.session_id where s.is_test and e.event_name = 'purchase') as purchases;
