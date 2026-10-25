-- Deals & Offers page: a CMS page ("deals") whose sections the client switches on/off, reorders and
-- edits from Admin → Website → Deals & Offers, using the same draft/publish model as the homepage
-- (cms_pages / cms_sections / cms_section_drafts / cms_section_published). Safe to re-run.
-- See Documentations MD/deals-and-offers-page.md.
--
-- `visible` on each section row IS the feature flag. The storefront also carries the same defaults
-- in code (src/data/dealsSections.ts), so /deals works even before this migration is applied; keep
-- the two in step when adding a section.

do $$
declare
  v_page_id uuid;
  v_section_id uuid;
  v_row record;
begin
  select id into v_page_id from public.cms_pages where slug = 'deals';
  if v_page_id is null then
    insert into public.cms_pages (slug, title) values ('deals', 'Deals & Offers') returning id into v_page_id;
  end if;

  for v_row in
    select * from (values
      -- key,              type,             required, order, visible, content
      ('settings',         'settings',       true,     5,     true,  '{"pageEnabled": true}'::jsonb),
      ('message-strip',    'message-strip',  false,    8,     false, '{}'::jsonb),
      ('hero',             'hero',           false,    10,    true,  '{}'::jsonb),
      ('campaign',         'campaign',       false,    20,    false, '{}'::jsonb),
      ('hot-picks',        'product-rail',   false,    40,    true,  '{}'::jsonb),
      ('offer-category',   'product-rail',   false,    50,    false, '{}'::jsonb),
      ('budget',           'budget',         false,    60,    true,  '{}'::jsonb),
      ('car-offers',       'car-offers',     false,    70,    true,  '{}'::jsonb),
      ('new-arrivals',     'product-rail',   false,    80,    true,  '{}'::jsonb),
      ('top-rated',        'product-rail',   false,    90,    false, '{}'::jsonb),
      ('biggest-savings',  'product-rail',   false,    100,   false, '{}'::jsonb),
      ('combos',           'combos',         false,    110,   false, '{}'::jsonb),
      ('brand-strip',      'brand-strip',    false,    120,   true,  '{}'::jsonb),
      ('whatsapp',         'whatsapp',       false,    130,   false, '{}'::jsonb)
    ) as t(section_key, section_type, is_required, display_order, visible, content)
  loop
    select id into v_section_id from public.cms_sections where page_id = v_page_id and section_key = v_row.section_key;
    if v_section_id is null then
      insert into public.cms_sections (page_id, section_key, section_type, is_required)
        values (v_page_id, v_row.section_key, v_row.section_type, v_row.is_required)
        returning id into v_section_id;

      insert into public.cms_section_drafts (section_id, display_order, visible, content)
        values (v_section_id, v_row.display_order, v_row.visible, v_row.content);
      insert into public.cms_section_published (section_id, display_order, visible, content)
        values (v_section_id, v_row.display_order, v_row.visible, v_row.content);
    end if;
  end loop;
end $$;

-- "Top rated" section: products ranked by their approved reviews' average. Demo reviews
-- (product_reviews.is_seed) are excluded unless the client explicitly opts in, so the default is
-- an honest list of what real customers said. SECURITY INVOKER: the existing RLS policy
-- (approved reviews are publicly readable) is the only access rule — this adds none.
create or replace function public.top_rated_products(
  p_limit integer default 12,
  p_min_reviews integer default 5,
  p_include_seed boolean default false
)
returns table (odoo_template_id integer, avg_rating numeric, review_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.odoo_template_id,
         round(avg(r.rating)::numeric, 2) as avg_rating,
         count(*)::integer as review_count
  from public.product_reviews r
  where r.status = 'approved'
    and (p_include_seed or not r.is_seed)
  group by r.odoo_template_id
  having count(*) >= greatest(p_min_reviews, 1)
  order by avg(r.rating) desc, count(*) desc
  limit least(greatest(p_limit, 1), 48);
$$;

grant execute on function public.top_rated_products(integer, integer, boolean) to anon, authenticated;
