-- Ingest-function behaviour test (always rolled back).
-- Run: npx supabase db query --linked --file supabase/tests/analytics_ingest.sql
-- Passing looks like an error whose message starts "INGEST PASSED (rolled back)".
do $$
declare
  sid uuid := '11111111-1111-4111-8111-111111111111'; vid uuid := '22222222-2222-4222-8222-222222222222';
  cid uuid := '33333333-3333-4333-8333-333333333333'; pv1 uuid := '44444444-4444-4444-8444-444444444441'; pv2 uuid := '44444444-4444-4444-8444-444444444442';
  batch jsonb; r1 jsonb; r2 jsonb; hijack jsonb; fails text := '';
begin
  batch := jsonb_build_object(
    'session', jsonb_build_object('id', sid, 'visitor_id', vid, 'landing_path', '/', 'is_test', true, 'device_type', 'mobile', 'source_channel', 'Direct'),
    'page_views', jsonb_build_array(
      jsonb_build_object('id', pv1, 'path', '/', 'page_type', 'home', 'started_at', now() - interval '2 minutes'),
      jsonb_build_object('id', pv2, 'path', '/product/x--1', 'page_type', 'product', 'odoo_template_id', 1, 'referrer_path', '/', 'started_at', now() - interval '1 minute')),
    -- 40 s reported, plus a forged 999999 s on the second view that must be clamped to wall-clock reality
    'engagements', jsonb_build_array(
      jsonb_build_object('page_view_id', pv1, 'engaged_seconds', 40, 'max_scroll_percent', 60, 'ended_at', now() - interval '1 minute'),
      jsonb_build_object('page_view_id', pv2, 'engaged_seconds', 14000, 'max_scroll_percent', 250, 'ended_at', now())),
    'events', jsonb_build_array(
      jsonb_build_object('id', '55555555-5555-4555-8555-555555555551', 'event_name', 'add_to_cart', 'occurred_at', now(), 'odoo_template_id', 1, 'quantity', 2, 'value', 200, 'cart_id', cid, 'page_view_id', pv2),
      jsonb_build_object('id', '55555555-5555-4555-8555-555555555552', 'event_name', 'checkout_started', 'occurred_at', now(), 'value', 250, 'cart_id', cid)),
    'cart', jsonb_build_object('id', cid, 'items', jsonb_build_array(
      jsonb_build_object('odoo_template_id', 1, 'odoo_variant_id', 11, 'quantity', 2, 'observed_unit_price', 100),
      jsonb_build_object('odoo_template_id', 2, 'odoo_variant_id', 0, 'quantity', 1, 'observed_unit_price', 50))));

  r1 := public.analytics_ingest_batch(batch);
  r2 := public.analytics_ingest_batch(batch);                       -- duplicate delivery (retry / StrictMode / beacon)

  if (r1 ->> 'events')::int <> 2 or (r1 ->> 'page_views')::int <> 2 then fails := fails || '[first delivery counts wrong] '; end if;
  if (r2 ->> 'events')::int <> 0 or (r2 ->> 'page_views')::int <> 0 then fails := fails || '[duplicate delivery not deduped] '; end if;
  if (select count(*) from public.analytics_events where session_id = sid) <> 2 then fails := fails || '[event rows duplicated] '; end if;
  if (select page_view_count from public.analytics_sessions where id = sid) <> 2 then fails := fails || '[session page_view_count wrong] '; end if;
  if (select count(*) from public.analytics_page_views where session_id = sid and is_entrance) <> 1 then fails := fails || '[entrance flag] '; end if;
  if (select is_entrance from public.analytics_page_views where id = pv1) is not true then fails := fails || '[first view not entrance] '; end if;
  if (select engaged_seconds from public.analytics_page_views where id = pv2) > 130 then fails := fails || '[forged engagement not clamped] '; end if;
  if (select max_scroll_percent from public.analytics_page_views where id = pv2) > 100 then fails := fails || '[scroll not clamped] '; end if;
  if (select checkout_started_at is null from public.analytics_carts where id = cid) then fails := fails || '[checkout_started not stamped on cart] '; end if;
  if (select current_item_count from public.analytics_carts where id = cid) <> 3 then fails := fails || '[cart count] '; end if;

  -- Cart snapshot: removing a line soft-removes it (history preserved), never hard-deletes.
  perform public.analytics_ingest_batch(jsonb_build_object('session', batch -> 'session',
    'cart', jsonb_build_object('id', cid, 'items', jsonb_build_array(jsonb_build_object('odoo_template_id', 1, 'odoo_variant_id', 11, 'quantity', 2, 'observed_unit_price', 100)))));
  if not (select removed_at is not null from public.analytics_cart_items where cart_id = cid and odoo_template_id = 2) then fails := fails || '[removed line not soft-removed] '; end if;
  if (select count(*) from public.analytics_cart_items where cart_id = cid) <> 2 then fails := fails || '[line hard-deleted] '; end if;

  -- Another visitor can neither write into this session nor into this cart.
  hijack := public.analytics_ingest_batch(jsonb_build_object('session', jsonb_build_object('id', sid, 'visitor_id', '99999999-9999-4999-8999-999999999999', 'is_test', true)));
  if hijack ->> 'ok' <> 'false' then fails := fails || '[session hijack allowed] '; end if;
  perform public.analytics_ingest_batch(jsonb_build_object('session', jsonb_build_object('id', gen_random_uuid(), 'visitor_id', '99999999-9999-4999-8999-999999999999', 'is_test', true),
    'cart', jsonb_build_object('id', cid, 'items', '[]'::jsonb)));
  if (select current_item_count from public.analytics_carts where id = cid) <> 2 then fails := fails || '[foreign cart overwritten] '; end if;

  -- Anonymous ingest can never carry a user (the Edge Function is the only source of user_id).
  if (select user_id is not null from public.analytics_sessions where id = sid) then fails := fails || '[anonymous session got a user] '; end if;

  -- Returning-visitor flag: a second session from the same visitor is marked returning.
  perform public.analytics_ingest_batch(jsonb_build_object('session', jsonb_build_object('id', gen_random_uuid(), 'visitor_id', vid, 'is_test', true)));
  if (select count(*) from public.analytics_sessions where visitor_id = vid and is_returning_visitor) <> 1 then fails := fails || '[returning visitor flag] '; end if;

  if fails <> '' then raise exception 'INGEST FAIL: %', fails; end if;
  raise exception 'INGEST PASSED (rolled back): dedupe, entrance, clamps, cart soft-removal, ownership, returning visitor';
end $$;
