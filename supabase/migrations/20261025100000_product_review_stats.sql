-- Average rating + number of approved reviews for many products in ONE call, so product cards (shop grid, home rails,
-- deals, car pages, related products...) can show real review stars instead of "No Reviews". Before this, only the product
-- page read the reviews, so every card said "No Reviews".
--
-- SECURITY INVOKER on purpose: it runs as the caller, so row-level security still applies (the public can only ever see
-- approved reviews). Backed by product_reviews_template_status_idx (odoo_template_id, status). The id list is capped so one
-- call can never aggregate an unbounded set. Safe to re-run.

create or replace function public.product_review_stats(p_ids integer[])
returns table (odoo_template_id integer, review_count integer, average numeric)
language sql
stable
security invoker
set search_path to ''
as $$
  select r.odoo_template_id, count(*)::integer, round(avg(r.rating)::numeric, 2)
  from public.product_reviews r
  where r.status = 'approved'
    and cardinality(p_ids) <= 200
    and r.odoo_template_id = any (p_ids)
  group by r.odoo_template_id
$$;

revoke execute on function public.product_review_stats(integer[]) from public;
grant execute on function public.product_review_stats(integer[]) to anon, authenticated;
