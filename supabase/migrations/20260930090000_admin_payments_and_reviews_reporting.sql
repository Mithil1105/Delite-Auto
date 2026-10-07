-- Server-side reporting for the new Admin Payments and Reviews-history pages — see
-- Documentations MD/delite-production-operations.md. Follows the exact convention already
-- established by the admin_analytics_* functions (20260921100200_analytics_reporting_core.sql):
-- SECURITY DEFINER, search_path pinned empty, an explicit role check as the first statement, one
-- jsonb return value. Reuses private.analytics_require() verbatim for that role check — it's a
-- generic "raise if not one of these admin_role values" helper despite its name, not analytics-
-- specific, so this avoids duplicating the exact same three lines under a second name.
--
-- Both list functions return `{ rows: jsonb[], total: int }` — server-side filtering/sorting/
-- pagination throughout (a single query, total count via `count(*) over()` alongside the already-
-- limited page), never "fetch everything and filter in the browser".

create or replace function public.admin_payments_kpis(p_start timestamptz, p_end timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'support']);

  select jsonb_build_object(
    'total_attempts', count(*) filter (where created_at >= p_start and created_at < p_end),
    'paid', count(*) filter (where created_at >= p_start and created_at < p_end and status = 'paid'),
    -- "Pending" groups every non-terminal state (created/pending/authorized) — the operationally
    -- useful "still in flight" bucket, not just the literal 'pending' enum value.
    'pending', count(*) filter (where created_at >= p_start and created_at < p_end and status in ('created', 'pending', 'authorized')),
    'failed', count(*) filter (where created_at >= p_start and created_at < p_end and status in ('failed', 'expired')),
    'refunded', count(*) filter (where created_at >= p_start and created_at < p_end and status = 'refunded'),
    'cod', count(*) filter (where created_at >= p_start and created_at < p_end and payment_method = 'cod')
  )
  into v_result
  from public.payment_attempts;

  -- Deliberately NOT period-scoped — this is a live operational backlog (paid, Odoo order still
  -- missing), not a historical count for the selected range.
  v_result := v_result || jsonb_build_object(
    'paid_awaiting_sync', (select count(*) from public.payment_attempts where odoo_sync_pending = true)
  );

  return v_result;
end;
$$;

revoke execute on function public.admin_payments_kpis(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_payments_kpis(timestamptz, timestamptz) to authenticated;

create or replace function public.admin_payments_list(
  p_status public.payment_status[] default null,
  p_method public.payment_method default null,
  p_sync_state text default null,
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_search text default null,
  p_sort text default 'newest',
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_total int;
begin
  perform private.analytics_require(array['owner', 'admin', 'support']);

  with base as (
    select
      pa.id, pa.created_at, pa.user_id, pa.amount, pa.currency, pa.status, pa.payment_method,
      pa.razorpay_order_id, pa.razorpay_payment_id, pa.odoo_sale_order_id, pa.order_id,
      pa.odoo_sync_pending, pa.odoo_sync_status, pa.retry_count, pa.last_retry_at,
      pa.last_sync_error_safe, pa.failure_reason_safe, pa.paid_at,
      o.odoo_order_name,
      au.email as customer_email, pr.full_name as customer_name,
      el.status as email_status
    from public.payment_attempts pa
    left join public.orders o on o.id = pa.order_id
    left join auth.users au on au.id = pa.user_id
    left join public.profiles pr on pr.id = pa.user_id
    left join lateral (
      select status from public.email_log where order_id = o.id order by created_at desc limit 1
    ) el on true
    where (p_status is null or pa.status = any(p_status))
      and (p_method is null or pa.payment_method = p_method)
      and (p_sync_state is null or p_sync_state = '' or pa.odoo_sync_status = p_sync_state)
      and (p_start is null or pa.created_at >= p_start)
      and (p_end is null or pa.created_at < p_end)
      and (
        p_search is null or p_search = '' or
        pr.full_name ilike '%' || p_search || '%' or
        au.email ilike '%' || p_search || '%' or
        o.odoo_order_name ilike '%' || p_search || '%' or
        pa.razorpay_order_id ilike '%' || p_search || '%' or
        pa.razorpay_payment_id ilike '%' || p_search || '%'
      )
  ),
  numbered as (
    select
      base.*,
      count(*) over () as total_count,
      row_number() over (
        order by
          case when p_sort = 'oldest' then created_at end asc,
          case when p_sort = 'amount_asc' then amount end asc,
          case when p_sort = 'amount_desc' then amount end desc,
          created_at desc
      ) as rn
    from base
  ),
  page as (
    select * from numbered order by rn limit p_limit offset p_offset
  )
  select
    coalesce(jsonb_agg(to_jsonb(page) - 'total_count' - 'rn' order by page.rn), '[]'::jsonb),
    coalesce(max(page.total_count), 0)
  into v_rows, v_total
  from page;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

revoke execute on function public.admin_payments_list(public.payment_status[], public.payment_method, text, timestamptz, timestamptz, text, text, int, int) from public, anon;
grant execute on function public.admin_payments_list(public.payment_status[], public.payment_method, text, timestamptz, timestamptz, text, text, int, int) to authenticated;

create or replace function public.admin_reviews_query(
  p_status text default null,
  p_rating_min int default null,
  p_rating_max int default null,
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_search text default null,
  p_sort text default 'newest',
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_total int;
begin
  perform private.analytics_require(array['owner', 'admin', 'support']);

  with base as (
    select
      r.id, r.odoo_template_id, r.rating, r.title, r.body, r.status, r.created_at, r.user_id,
      au.email as customer_email, pr.full_name as customer_name,
      mod_actor.full_name as moderated_by, mod_log.created_at as moderated_at
    from public.product_reviews r
    left join auth.users au on au.id = r.user_id
    left join public.profiles pr on pr.id = r.user_id
    left join lateral (
      select actor_id, created_at
      from public.admin_activity_log
      where target_type = 'product_review' and target_id = r.id::text and action = 'review.moderated'
      order by created_at desc
      limit 1
    ) mod_log on true
    left join public.profiles mod_actor on mod_actor.id = mod_log.actor_id
    where (p_status is null or p_status = 'all' or r.status = p_status)
      and (p_rating_min is null or r.rating >= p_rating_min)
      and (p_rating_max is null or r.rating <= p_rating_max)
      and (p_start is null or r.created_at >= p_start)
      and (p_end is null or r.created_at < p_end)
      and (
        p_search is null or p_search = '' or
        r.title ilike '%' || p_search || '%' or
        r.body ilike '%' || p_search || '%' or
        pr.full_name ilike '%' || p_search || '%' or
        au.email ilike '%' || p_search || '%'
      )
  ),
  numbered as (
    select
      base.*,
      count(*) over () as total_count,
      row_number() over (
        order by
          case when p_sort = 'oldest' then created_at end asc,
          created_at desc
      ) as rn
    from base
  ),
  page as (
    select * from numbered order by rn limit p_limit offset p_offset
  )
  select
    coalesce(jsonb_agg(to_jsonb(page) - 'total_count' - 'rn' order by page.rn), '[]'::jsonb),
    coalesce(max(page.total_count), 0)
  into v_rows, v_total
  from page;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

revoke execute on function public.admin_reviews_query(text, int, int, timestamptz, timestamptz, text, text, int, int) from public, anon;
grant execute on function public.admin_reviews_query(text, int, int, timestamptz, timestamptz, text, text, int, int) to authenticated;
