-- Surfaces the new verified_purchase/photo_paths columns (see
-- 20261007160000_product_reviews_enrichment.sql) in the admin reviews list/detail drawer, so a
-- moderator can see a verified-purchase badge and attached photos before approving/rejecting.
create or replace function public.admin_reviews_query(
  p_status text default null,
  p_rating_min integer default null,
  p_rating_max integer default null,
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_search text default null,
  p_sort text default 'newest',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_rows jsonb;
  v_total int;
begin
  perform private.analytics_require(array['owner', 'admin', 'support']);

  with base as (
    select
      r.id, r.odoo_template_id, r.rating, r.title, r.body, r.status, r.created_at, r.user_id,
      r.verified_purchase, r.photo_paths,
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
$function$;
