-- Homepage gets four new admin-controlled sections (they appear in Admin -> Website -> Homepage, where they can be
-- reordered, hidden and edited like the others):
--   trending-accessories  a product rail (products picked in the admin; falls back to the Odoo "trending" category)
--   image-banner-1/2/3    empty landscape image spaces - render nothing until the admin uploads an image
-- Positions: banner 1 under the category strip, trending accessories after Trending, banner 2 between Top Categories
-- (car) and the promo banners, banner 3 between Top Categories (bike) and testimonials. Safe to re-run.

do $$
declare
  v_page_id uuid;
  v_section_id uuid;
  v_row record;
begin
  select id into v_page_id from public.cms_pages where slug = 'homepage';
  if v_page_id is null then
    raise exception 'homepage page missing';
  end if;

  for v_row in
    select * from (values
      ('image-banner-1',       'image-banner',  35),
      ('trending-accessories', 'product-rail',  45),
      ('image-banner-2',       'image-banner',  75),
      ('image-banner-3',       'image-banner',  95)
    ) as t(section_key, section_type, display_order)
  loop
    continue when exists (select 1 from public.cms_sections where page_id = v_page_id and section_key = v_row.section_key);
    insert into public.cms_sections (page_id, section_key, section_type, is_required)
      values (v_page_id, v_row.section_key, v_row.section_type, false)
      returning id into v_section_id;
    insert into public.cms_section_drafts (section_id, display_order, content) values (v_section_id, v_row.display_order, '{}'::jsonb);
    insert into public.cms_section_published (section_id, display_order, content) values (v_section_id, v_row.display_order, '{}'::jsonb);
  end loop;
end $$;
