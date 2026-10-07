-- Abandonment / recovery classification test (always rolled back). Uses the REAL ingest and
-- purchase functions, then backdates timestamps to simulate elapsed time.
-- Run: npx supabase db query --linked --file supabase/tests/analytics_abandonment.sql
-- Passing looks like an error whose message starts "ABANDONMENT PASSED (rolled back)".
do $$
declare
  uid uuid := (select id from public.profiles where admin_role = 'owner' limit 1);
  v1 uuid := gen_random_uuid(); s1 uuid := gen_random_uuid(); c1 uuid := gen_random_uuid();  -- anonymous, inactive 31 min
  v2 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid();  -- authenticated, inactive 31 min
  v3 uuid := gen_random_uuid(); s3 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid();  -- still active (10 min)
  v4 uuid := gen_random_uuid(); s4 uuid := gen_random_uuid(); c4 uuid := gen_random_uuid();  -- converted before the threshold
  v5 uuid := gen_random_uuid(); s5 uuid := gen_random_uuid(); c5 uuid := gen_random_uuid();  -- abandoned, later converted (recovered)
  v6 uuid := gen_random_uuid(); s6 uuid := gen_random_uuid(); c6 uuid := gen_random_uuid();  -- abandoned, returned, did not buy
  v7 uuid := gen_random_uuid(); s7 uuid := gen_random_uuid(); c7 uuid := gen_random_uuid();  -- empty cart, old
  o4 uuid := gen_random_uuid(); o5 uuid := gen_random_uuid();
  one_item jsonb := jsonb_build_array(jsonb_build_object('odoo_template_id', 8, 'quantity', 1, 'observed_unit_price', 100));
  chk record; got record; fails text := '';
begin
  perform public.analytics_ingest_batch(jsonb_build_object('session', jsonb_build_object('id', s1, 'visitor_id', v1, 'is_test', true), 'cart', jsonb_build_object('id', c1, 'items', one_item)));
  perform public.analytics_ingest_batch(jsonb_build_object('session', jsonb_build_object('id', s2, 'visitor_id', v2, 'user_id', uid, 'is_test', true), 'cart', jsonb_build_object('id', c2, 'items', one_item)));
  perform public.analytics_ingest_batch(jsonb_build_object('session', jsonb_build_object('id', s3, 'visitor_id', v3, 'is_test', true), 'cart', jsonb_build_object('id', c3, 'items', one_item)));
  perform public.analytics_ingest_batch(jsonb_build_object('session', jsonb_build_object('id', s4, 'visitor_id', v4, 'is_test', true), 'cart', jsonb_build_object('id', c4, 'items', one_item)));
  perform public.analytics_ingest_batch(jsonb_build_object('session', jsonb_build_object('id', s5, 'visitor_id', v5, 'is_test', true), 'cart', jsonb_build_object('id', c5, 'items', one_item)));
  perform public.analytics_ingest_batch(jsonb_build_object('session', jsonb_build_object('id', s6, 'visitor_id', v6, 'is_test', true), 'cart', jsonb_build_object('id', c6, 'items', one_item)));
  perform public.analytics_ingest_batch(jsonb_build_object('session', jsonb_build_object('id', s7, 'visitor_id', v7, 'is_test', true), 'cart', jsonb_build_object('id', c7, 'items', '[]'::jsonb)));

  -- Simulate elapsed time.
  update public.analytics_carts set last_activity_at = now() - interval '31 minutes' where id in (c1, c2, c5, c6);
  update public.analytics_carts set last_activity_at = now() - interval '10 minutes' where id = c3;
  update public.analytics_carts set last_activity_at = now() - interval '5 hours' where id = c7;

  -- c4: purchased promptly.
  perform public.analytics_record_purchase(jsonb_build_object('session_id', s4, 'visitor_id', v4, 'cart_id', c4, 'order_id', o4,
    'odoo_sale_order_id', 1, 'total', 100, 'is_test', true, 'items', one_item));
  -- c5: had gone quiet for 31 min, then the customer purchases => recovered conversion.
  perform public.analytics_record_purchase(jsonb_build_object('session_id', s5, 'visitor_id', v5, 'cart_id', c5, 'order_id', o5,
    'odoo_sale_order_id', 2, 'total', 100, 'is_test', true, 'items', one_item));
  -- c6: abandoned, visitor returns and touches the cart (no purchase), then goes quiet again.
  perform public.analytics_ingest_batch(jsonb_build_object('session', jsonb_build_object('id', s6, 'visitor_id', v6, 'is_test', true), 'cart', jsonb_build_object('id', c6, 'items', one_item)));
  update public.analytics_carts set last_activity_at = now() - interval '40 minutes' where id = c6;

  for chk in select * from (values
      (c1, 'abandoned', false, 'anonymous inactive 31m'),
      (c2, 'abandoned', false, 'authenticated inactive 31m'),
      (c3, 'active', false, 'active 10m'),
      (c4, 'converted', false, 'converted before threshold'),
      (c5, 'converted', true, 'abandoned then purchased => recovered'),
      (c6, 'abandoned', false, 'abandoned, returned, not bought'),
      (c7, 'empty', false, 'empty cart never abandoned')) as t(id, es, er, label)
  loop
    select status, recovered into got from private.analytics_cart_status where id = chk.id;
    if got.status <> chk.es or got.recovered <> chk.er then
      fails := fails || format('[%s: expected %s/%s got %s/%s] ', chk.label, chk.es, chk.er, got.status, got.recovered);
    end if;
  end loop;

  if (select abandoned_at is null or returned_at is null from public.analytics_carts where id = c6) then
    fails := fails || '[c6 missing abandoned_at/returned_at] ';
  end if;
  if (select user_id is null from public.analytics_carts where id = c2) then fails := fails || '[c2 lost user_id] '; end if;

  -- Purchase is idempotent per order.
  perform public.analytics_record_purchase(jsonb_build_object('session_id', s5, 'visitor_id', v5, 'cart_id', c5, 'order_id', o5,
    'odoo_sale_order_id', 2, 'total', 100, 'is_test', true, 'items', one_item));
  if (select count(*) from public.analytics_events where order_id = o5 and event_name = 'purchase') <> 1 then fails := fails || '[purchase not idempotent] '; end if;
  if (select count(*) from public.analytics_order_items where order_id = o5) <> 1 then fails := fails || '[order items duplicated] '; end if;

  -- A different visitor cannot convert someone else's cart.
  perform public.analytics_record_purchase(jsonb_build_object('session_id', s3, 'visitor_id', v3, 'cart_id', c1, 'order_id', gen_random_uuid(),
    'odoo_sale_order_id', 3, 'total', 1, 'is_test', true, 'items', '[]'::jsonb));
  if (select converted_at is not null from public.analytics_carts where id = c1) then fails := fails || '[foreign cart converted] '; end if;

  if fails <> '' then raise exception 'ABANDONMENT FAIL: %', fails; end if;
  raise exception 'ABANDONMENT PASSED (rolled back): 7 lifecycle cases + idempotency + ownership';
end $$;
