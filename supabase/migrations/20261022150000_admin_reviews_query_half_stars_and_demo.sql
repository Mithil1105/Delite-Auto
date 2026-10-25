-- Admin reviews list, brought up to date with the review schema changes:
--   * ratings can now be half stars (product_reviews.rating is numeric(2,1), migration 20261016120000),
--     so the rating filters are numeric — the old integer parameters could not express "3.5";
--   * demo/seeded reviews (is_seed) are flagged and filterable (p_source: 'real' | 'demo' | 'all',
--     default 'real' so the moderation queue/history is not drowned by tens of thousands of demo rows);
--   * the row now carries is_seed and reviewer_name (demo reviews have no linked customer account);
--   * the result includes per-status counts for the chosen source plus real/demo totals, for the tab badges;
--   * sort can be newest | oldest | highest | lowest;
--   * search also matches the reviewer name.
-- The old integer-parameter signature is dropped (two overloads would make the RPC call ambiguous).
-- Used by the admin-reviews-list Edge Function. Safe to re-run.

drop function if exists public.admin_reviews_query(text, integer, integer, timestamptz, timestamptz, text, text, integer, integer);

create or replace function public.admin_reviews_query(
  p_status text default null,
  p_rating_min numeric default null,
  p_rating_max numeric default null,
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_search text default null,
  p_sort text default 'newest',
  p_limit integer default 50,
  p_offset integer default 0,
  p_source text default 'real'
)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_rows jsonb;
  v_total int;
  v_counts jsonb;
begin
  perform private.analytics_require(array['owner', 'admin', 'support']);

  with base as (
    select
      r.id, r.odoo_template_id, r.rating, r.title, r.body, r.status, r.created_at, r.user_id,
      r.verified_purchase, r.photo_paths, r.is_seed, r.reviewer_name,
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
      and (
        p_source = 'all'
        or (p_source = 'demo' and r.is_seed)
        or (p_source is distinct from 'demo' and p_source is distinct from 'all' and not r.is_seed)
      )
      and (p_rating_min is null or r.rating >= p_rating_min)
      and (p_rating_max is null or r.rating <= p_rating_max)
      and (p_start is null or r.created_at >= p_start)
      and (p_end is null or r.created_at < p_end)
      and (
        p_search is null or p_search = '' or
        r.title ilike '%' || p_search || '%' or
        r.body ilike '%' || p_search || '%' or
        r.reviewer_name ilike '%' || p_search || '%' or
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
          case when p_sort = 'highest' then rating end desc,
          case when p_sort = 'lowest' then rating end asc,
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

  -- Tab/source badges: status counts for the chosen source (ignoring the other filters), and the
  -- real/demo split over everything.
  select jsonb_build_object(
    'pending',  count(*) filter (where status = 'pending'  and src_ok),
    'approved', count(*) filter (where status = 'approved' and src_ok),
    'rejected', count(*) filter (where status = 'rejected' and src_ok),
    'all',      count(*) filter (where src_ok),
    'real',     count(*) filter (where not is_seed),
    'demo',     count(*) filter (where is_seed)
  )
  into v_counts
  from (
    select
      r.status,
      r.is_seed,
      (
        p_source = 'all'
        or (p_source = 'demo' and r.is_seed)
        or (p_source is distinct from 'demo' and p_source is distinct from 'all' and not r.is_seed)
      ) as src_ok
    from public.product_reviews r
  ) c;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'counts', v_counts);
end;
$function$;

revoke execute on function public.admin_reviews_query(text, numeric, numeric, timestamptz, timestamptz, text, text, integer, integer, text) from public, anon;
grant execute on function public.admin_reviews_query(text, numeric, numeric, timestamptz, timestamptz, text, text, integer, integer, text) to authenticated;
