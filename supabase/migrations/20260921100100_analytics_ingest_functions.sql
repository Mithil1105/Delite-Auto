-- Analytics ingestion. These SECURITY DEFINER functions are callable ONLY by the service role
-- (the analytics-track / create-order Edge Functions). The Edge Function does the request-level
-- validation (event allowlist, schemas, sizes, auth token -> user_id); these functions provide the
-- atomicity, dedupe, ownership checks and derived bookkeeping in one round trip.

create or replace function public.analytics_ingest_batch(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s jsonb := p -> 'session';
  v_session uuid := (s ->> 'id')::uuid;
  v_visitor uuid := (s ->> 'visitor_id')::uuid;
  v_user uuid := nullif(s ->> 'user_id', '')::uuid;
  v_test boolean := coalesce((s ->> 'is_test')::boolean, false);
  v_internal boolean := false;
  v_owner uuid;
  v_needs_geo boolean := false;
  v_cart jsonb := p -> 'cart';
  v_cart_id uuid;
  v_checkout boolean := false;
  r jsonb;
  n integer;
  n_pv integer := 0;
  n_ev integer := 0;
  v_had_engagement boolean := false;
  v_prev_activity timestamptz;
  v_prev_count integer;
  v_prev_converted timestamptz;
  v_prev_abandoned timestamptz;
  v_prev_visitor uuid;
  -- The session began at the earliest thing the browser reports, not when the batch happened to arrive.
  v_first timestamptz := least(
    now(),
    coalesce((select min((x ->> 'started_at')::timestamptz) from jsonb_array_elements(coalesce(p -> 'page_views', '[]'::jsonb)) x), now()),
    coalesce((select min((x ->> 'occurred_at')::timestamptz) from jsonb_array_elements(coalesce(p -> 'events', '[]'::jsonb)) x), now()));
begin
  v_internal :=
    exists (select 1 from public.analytics_internal_visitors iv where iv.visitor_id = v_visitor)
    or (v_user is not null and exists (
      select 1 from public.profiles pr where pr.id = v_user and (pr.is_admin or pr.admin_role is not null)));

  insert into public.analytics_sessions as a (
    id, visitor_id, user_id, started_at, last_activity_at, landing_path, referrer, referrer_domain,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, source_channel,
    device_type, browser_family, os_family, is_returning_visitor, is_internal, is_test)
  values (
    v_session, v_visitor, v_user, v_first, now(), coalesce(s ->> 'landing_path', '/'),
    s ->> 'referrer', s ->> 'referrer_domain',
    s ->> 'utm_source', s ->> 'utm_medium', s ->> 'utm_campaign', s ->> 'utm_content', s ->> 'utm_term',
    coalesce(s ->> 'source_channel', 'Direct'),
    s ->> 'device_type', s ->> 'browser_family', s ->> 'os_family',
    exists (select 1 from public.analytics_sessions o where o.visitor_id = v_visitor and o.id <> v_session),
    v_internal, v_test)
  on conflict (id) do update set
    last_activity_at = greatest(a.last_activity_at, now()),
    -- Login mid-session: attach the authenticated user to the existing anonymous session (first
    -- authenticated identity wins; later events still carry their own user_id).
    user_id = coalesce(a.user_id, excluded.user_id),
    is_internal = a.is_internal or excluded.is_internal
  where a.visitor_id = excluded.visitor_id;

  -- A session id can never be used to write into another visitor's session.
  select visitor_id into v_owner from public.analytics_sessions where id = v_session;
  if v_owner is distinct from v_visitor then
    return jsonb_build_object('ok', false, 'error', 'session_mismatch');
  end if;

  -- Claim (once per session) the right to look up coarse geography; the Edge Function does the
  -- lookup in the background and stores only country/region/city.
  if not v_test then
    update public.analytics_sessions
       set geo_attempted_at = now()
     where id = v_session and country_code is null and geo_attempted_at is null;
    get diagnostics n = row_count;
    v_needs_geo := n > 0;
  end if;

  -- Page views (ordered so the first one of a session is flagged as its entrance).
  for r in
    select value from jsonb_array_elements(coalesce(p -> 'page_views', '[]'::jsonb)) order by value ->> 'started_at'
  loop
    insert into public.analytics_page_views (
      id, session_id, visitor_id, user_id, path, page_type, odoo_template_id, odoo_variant_id,
      category_id, referrer_path, started_at, is_entrance)
    values (
      (r ->> 'id')::uuid, v_session, v_visitor, v_user, r ->> 'path', r ->> 'page_type',
      (r ->> 'odoo_template_id')::integer, (r ->> 'odoo_variant_id')::integer,
      (r ->> 'category_id')::integer, r ->> 'referrer_path', (r ->> 'started_at')::timestamptz,
      not exists (select 1 from public.analytics_page_views x where x.session_id = v_session))
    on conflict (id) do nothing;
    get diagnostics n = row_count;
    n_pv := n_pv + n;
  end loop;

  -- Engagement is CUMULATIVE per page view (idempotent under retries), clamped to plausible
  -- wall-clock time so a forged value can't inflate dwell time.
  for r in select value from jsonb_array_elements(coalesce(p -> 'engagements', '[]'::jsonb)) loop
    update public.analytics_page_views w set
      engaged_seconds = greatest(w.engaged_seconds, least(
        (r ->> 'engaged_seconds')::numeric,
        extract(epoch from (now() - w.started_at)) + 60, 14400)),
      max_scroll_percent = greatest(w.max_scroll_percent, least(100, greatest(0, (r ->> 'max_scroll_percent')::integer))),
      ended_at = greatest(coalesce(w.ended_at, w.started_at), coalesce((r ->> 'ended_at')::timestamptz, now()))
    where w.id = (r ->> 'page_view_id')::uuid and w.session_id = v_session;
    v_had_engagement := true;
  end loop;

  if v_had_engagement then
    update public.analytics_sessions set
      engaged_seconds = (select coalesce(sum(engaged_seconds), 0) from public.analytics_page_views where session_id = v_session),
      ended_at = (select max(ended_at) from public.analytics_page_views where session_id = v_session)
    where id = v_session;
  end if;

  -- Events (client event_id is the dedupe key).
  for r in select value from jsonb_array_elements(coalesce(p -> 'events', '[]'::jsonb)) loop
    insert into public.analytics_events (
      id, event_name, occurred_at, session_id, visitor_id, user_id, page_view_id, page_path, page_type,
      odoo_template_id, odoo_variant_id, category_id, brand_id, cart_id, quantity, value,
      surface, strategy, search_query, search_query_norm, result_count, duration_ms, metadata)
    values (
      (r ->> 'id')::uuid, r ->> 'event_name', (r ->> 'occurred_at')::timestamptz, v_session, v_visitor, v_user,
      (r ->> 'page_view_id')::uuid, r ->> 'page_path', r ->> 'page_type',
      (r ->> 'odoo_template_id')::integer, (r ->> 'odoo_variant_id')::integer,
      (r ->> 'category_id')::integer, (r ->> 'brand_id')::integer, (r ->> 'cart_id')::uuid,
      (r ->> 'quantity')::integer, (r ->> 'value')::numeric,
      r ->> 'surface', r ->> 'strategy', r ->> 'search_query', r ->> 'search_query_norm',
      (r ->> 'result_count')::integer, (r ->> 'duration_ms')::integer,
      coalesce(r -> 'metadata', '{}'::jsonb))
    on conflict (id) do nothing;
    get diagnostics n = row_count;
    n_ev := n_ev + n;
    if n > 0 and r ->> 'event_name' = 'checkout_started' then v_checkout := true; end if;
  end loop;

  update public.analytics_sessions set
    page_view_count = page_view_count + n_pv,
    event_count = event_count + n_ev,
    last_activity_at = greatest(last_activity_at, now())
  where id = v_session;

  -- Cart observation sync (atomic snapshot).
  if v_cart is not null and jsonb_typeof(v_cart) = 'object' and (v_cart ->> 'id') is not null then
    v_cart_id := (v_cart ->> 'id')::uuid;

    select visitor_id, last_activity_at, current_item_count, converted_at, abandoned_at
      into v_prev_visitor, v_prev_activity, v_prev_count, v_prev_converted, v_prev_abandoned
      from public.analytics_carts where id = v_cart_id;

    if v_prev_visitor is not null and v_prev_visitor <> v_visitor then
      -- Someone else's cart id: ignore silently (never write into another visitor's cart).
      null;
    else
      insert into public.analytics_carts as c (
        id, visitor_id, session_id, last_session_id, user_id, last_activity_at, updated_at,
        checkout_started_at, current_item_count, observed_cart_value, is_test)
      values (
        v_cart_id, v_visitor, v_session, v_session, v_user, now(), now(),
        case when v_checkout then now() end,
        coalesce((select sum((i ->> 'quantity')::integer) from jsonb_array_elements(v_cart -> 'items') i), 0),
        coalesce((select sum((i ->> 'quantity')::integer * (i ->> 'observed_unit_price')::numeric) from jsonb_array_elements(v_cart -> 'items') i), 0),
        v_test)
      on conflict (id) do update set
        last_session_id = excluded.last_session_id,
        user_id = coalesce(c.user_id, excluded.user_id),
        last_activity_at = now(),
        updated_at = now(),
        checkout_started_at = coalesce(c.checkout_started_at, excluded.checkout_started_at),
        current_item_count = excluded.current_item_count,
        observed_cart_value = excluded.observed_cart_value,
        -- Came back after >= 30 quiet minutes with items and no conversion: it WAS abandoned,
        -- and this is the return. (Idempotent: stamped once.)
        abandoned_at = case
          when c.abandoned_at is null and c.converted_at is null and c.current_item_count > 0
               and c.last_activity_at <= now() - interval '30 minutes'
          then c.last_activity_at + interval '30 minutes' else c.abandoned_at end,
        returned_at = case
          when c.converted_at is null and c.current_item_count > 0
               and c.last_activity_at <= now() - interval '30 minutes'
          then now() else c.returned_at end
      where c.visitor_id = excluded.visitor_id;

      -- Line snapshot: upsert what is present, soft-remove what is not (history preserved).
      insert into public.analytics_cart_items as ci (cart_id, odoo_template_id, odoo_variant_id, quantity, observed_unit_price)
      select v_cart_id, (i ->> 'odoo_template_id')::integer, coalesce((i ->> 'odoo_variant_id')::integer, 0),
             (i ->> 'quantity')::integer, (i ->> 'observed_unit_price')::numeric
        from jsonb_array_elements(v_cart -> 'items') i
      on conflict (cart_id, odoo_template_id, odoo_variant_id) do update set
        quantity = excluded.quantity,
        observed_unit_price = excluded.observed_unit_price,
        updated_at = now(),
        removed_at = null;

      update public.analytics_cart_items ci set removed_at = now(), updated_at = now()
       where ci.cart_id = v_cart_id and ci.removed_at is null
         and not exists (
           select 1 from jsonb_array_elements(v_cart -> 'items') i
            where (i ->> 'odoo_template_id')::integer = ci.odoo_template_id
              and coalesce((i ->> 'odoo_variant_id')::integer, 0) = ci.odoo_variant_id);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'page_views', n_pv, 'events', n_ev, 'needs_geo', v_needs_geo);
end;
$$;

create or replace function public.analytics_set_session_geo(
  p_session uuid, p_country_code text, p_country_name text, p_region text, p_city text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.analytics_sessions
     set country_code = nullif(left(p_country_code, 2), ''), country_name = nullif(left(p_country_name, 80), ''),
         region = nullif(left(p_region, 80), ''), city = nullif(left(p_city, 80), '')
   where id = p_session and country_code is null;
$$;

-- Server-owned purchase: only ever called by create-order AFTER Odoo confirmed the order and the
-- orders mirror row exists. Idempotent per order (unique index on purchase events).
create or replace function public.analytics_record_purchase(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid := (p ->> 'session_id')::uuid;
  v_visitor uuid := (p ->> 'visitor_id')::uuid;
  v_user uuid := nullif(p ->> 'user_id', '')::uuid;
  v_cart uuid := nullif(p ->> 'cart_id', '')::uuid;
  v_order uuid := (p ->> 'order_id')::uuid;
  v_sale integer := (p ->> 'odoo_sale_order_id')::integer;
  v_total numeric := (p ->> 'total')::numeric;
  v_test boolean := coalesce((p ->> 'is_test')::boolean, false);
  v_owner uuid;
  n integer;
begin
  insert into public.analytics_sessions as a (id, visitor_id, user_id, landing_path, is_test, is_returning_visitor)
  values (v_session, v_visitor, v_user, '/checkout', v_test,
          exists (select 1 from public.analytics_sessions o where o.visitor_id = v_visitor and o.id <> v_session))
  on conflict (id) do update set user_id = coalesce(a.user_id, excluded.user_id), last_activity_at = now()
  where a.visitor_id = excluded.visitor_id;

  select visitor_id into v_owner from public.analytics_sessions where id = v_session;
  if v_owner is distinct from v_visitor then
    return jsonb_build_object('ok', false, 'error', 'session_mismatch');
  end if;

  insert into public.analytics_events (id, event_name, session_id, visitor_id, user_id, cart_id, order_id,
                                       odoo_sale_order_id, value, metadata)
  values (gen_random_uuid(), 'purchase', v_session, v_visitor, v_user, v_cart, v_order, v_sale, v_total, '{}'::jsonb)
  on conflict do nothing;
  get diagnostics n = row_count;

  if n > 0 then
    insert into public.analytics_order_items (order_id, odoo_sale_order_id, odoo_template_id, odoo_variant_id,
                                              quantity, observed_unit_price, session_id, visitor_id, user_id,
                                              cart_id, is_test)
    select v_order, v_sale, (i ->> 'odoo_template_id')::integer, coalesce((i ->> 'odoo_variant_id')::integer, 0),
           (i ->> 'quantity')::integer, (i ->> 'observed_unit_price')::numeric,
           v_session, v_visitor, v_user, v_cart, v_test
      from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) i
     where (i ->> 'odoo_template_id') is not null
    on conflict do nothing;

    update public.analytics_sessions set event_count = event_count + 1, last_activity_at = now() where id = v_session;

    if v_cart is not null then
      update public.analytics_carts c set
        converted_at = now(), order_id = v_order, odoo_sale_order_id = v_sale, updated_at = now(),
        user_id = coalesce(c.user_id, v_user),
        -- Converted after having gone quiet: a recovered conversion.
        abandoned_at = case when c.abandoned_at is null and c.current_item_count > 0
                                 and c.last_activity_at <= now() - interval '30 minutes'
                            then c.last_activity_at + interval '30 minutes' else c.abandoned_at end,
        returned_at = case when c.current_item_count > 0 and c.last_activity_at <= now() - interval '30 minutes'
                           then now() else c.returned_at end
      where c.id = v_cart and c.visitor_id = v_visitor and c.converted_at is null;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'duplicate', n = 0);
end;
$$;

revoke all on function public.analytics_ingest_batch(jsonb) from public, anon, authenticated;
revoke all on function public.analytics_set_session_geo(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.analytics_record_purchase(jsonb) from public, anon, authenticated;
grant execute on function public.analytics_ingest_batch(jsonb) to service_role;
grant execute on function public.analytics_set_session_geo(uuid, text, text, text, text) to service_role;
grant execute on function public.analytics_record_purchase(jsonb) to service_role;
