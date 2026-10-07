-- Role-matrix test for the analytics RPCs. Impersonates each role by temporarily changing the
-- owner's profiles.admin_role INSIDE a transaction that is always rolled back (the final RAISE),
-- so nothing persists. Fails loudly (RAISE) with the offending case if any expectation is wrong.
-- Run: npx supabase db query --linked --file supabase/tests/analytics_rbac.sql
do $$
declare
  uid uuid := (select id from public.profiles where admin_role = 'owner' limit 1);
  s timestamptz := now() - interval '30 days'; e timestamptz := now(); f jsonb := '{"include_test":true}';
  roles text[] := array['owner','admin','analytics','support','content','merchandising'];
  r text; report text := ''; ok boolean;
  cart uuid := (select id from public.analytics_carts where is_test limit 1);
  sess uuid := (select id from public.analytics_sessions where is_test limit 1);
  -- expectation per role: can aggregates / can cart+session journeys / can customer journey
  agg_ok text[] := array['owner','admin','analytics'];
  cart_ok text[] := array['owner','admin','analytics','support'];
  cust_ok text[] := array['owner','admin','support'];
  id_reveal text[] := array['owner','admin','support'];
  procedure_result boolean;
  ident jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  foreach r in array roles loop
    update public.profiles set admin_role = r::public.admin_role where id = uid;
    -- aggregates
    begin perform public.admin_analytics_overview(s, e, f); procedure_result := true;
    exception when insufficient_privilege then procedure_result := false; end;
    if procedure_result <> (r = any(agg_ok)) then raise exception 'RBAC FAIL overview role=% got=%', r, procedure_result; end if;
    -- carts + session journey
    begin perform public.admin_analytics_abandoned_carts(s, e, f); procedure_result := true;
    exception when insufficient_privilege then procedure_result := false; end;
    if procedure_result <> (r = any(cart_ok)) then raise exception 'RBAC FAIL abandoned_carts role=% got=%', r, procedure_result; end if;
    begin perform public.admin_analytics_session_journey(sess); procedure_result := true;
    exception when insufficient_privilege then procedure_result := false; end;
    if procedure_result <> (r = any(cart_ok)) then raise exception 'RBAC FAIL session_journey role=% got=%', r, procedure_result; end if;
    -- customer journey
    begin perform public.admin_analytics_customer_journey(uid); procedure_result := true;
    exception when insufficient_privilege then procedure_result := false; end;
    if procedure_result <> (r = any(cust_ok)) then raise exception 'RBAC FAIL customer_journey role=% got=%', r, procedure_result; end if;
    -- PII masking: identity is revealed only to owner/admin/support
    if r = any(cart_ok) then
      ident := public.admin_analytics_session_journey((select id from public.analytics_sessions where is_test and user_id = uid limit 1)) -> 'identity';
      if coalesce((ident ->> 'revealed')::boolean, false) <> (r = any(id_reveal)) then raise exception 'RBAC FAIL identity reveal role=% ident=%', r, ident; end if;
      if not (r = any(id_reveal)) and (ident ->> 'name' is not null or ident ->> 'phone' is not null or (ident ->> 'email') = (select u.email from auth.users u where u.id = uid)) then
        raise exception 'RBAC FAIL PII leaked to role=% ident=%', r, ident; end if;
    end if;
    report := report || r || ': ok; ';
  end loop;

  -- non-admin authenticated user
  update public.profiles set admin_role = null, is_admin = false where id = uid;
  begin perform public.admin_analytics_overview(s, e, f); raise exception 'RBAC FAIL non-admin read overview';
  exception when insufficient_privilege then report := report || 'non-admin denied; '; end;
  -- no JWT at all
  perform set_config('request.jwt.claims', '', true);
  begin perform public.admin_analytics_overview(s, e, f); raise exception 'RBAC FAIL anonymous read overview';
  exception when insufficient_privilege then report := report || 'no-jwt denied; '; end;

  raise exception 'RBAC PASSED (rolled back): %', report;
end $$;
