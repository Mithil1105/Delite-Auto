-- Two new cms_pages, reusing the exact same sections/drafts/published/publish-RPC machinery from
-- 20260917112634_create_cms_schema.sql — no new tables, no new publish logic. Both pages seed
-- EMPTY content ({}), so nothing publicly changes until an admin actually curates something —
-- see Documentations MD/delite-admin.md, "CMS fallback behaviour".

do $$
declare
  v_page_id uuid;
  v_section_id uuid;
  v_row record;
begin
  -- seo: one section per real top-level route this store currently has.
  insert into public.cms_pages (slug, title) values ('seo', 'SEO') returning id into v_page_id;

  for v_row in
    select * from (values
      ('home', 10), ('shop', 20), ('brands', 30), ('about', 40), ('contact', 50)
    ) as t(section_key, display_order)
  loop
    insert into public.cms_sections (page_id, section_key, section_type, is_required)
      values (v_page_id, v_row.section_key, 'seo', false)
      returning id into v_section_id;
    insert into public.cms_section_drafts (section_id, display_order, content) values (v_section_id, v_row.display_order, '{}'::jsonb);
    insert into public.cms_section_published (section_id, display_order, content) values (v_section_id, v_row.display_order, '{}'::jsonb);
  end loop;

  -- merchandising: one section per curated rail. Content shape is { productIds: number[] } for
  -- featured/trending/new-arrivals, { categorySelections: [...] } for categories — enforced at
  -- the application layer (jsonb has no schema), verified by cms.boundary.test.ts.
  insert into public.cms_pages (slug, title) values ('merchandising', 'Merchandising') returning id into v_page_id;

  for v_row in
    select * from (values
      ('featured', 10), ('trending', 20), ('new-arrivals', 30), ('categories', 40)
    ) as t(section_key, display_order)
  loop
    insert into public.cms_sections (page_id, section_key, section_type, is_required)
      values (v_page_id, v_row.section_key, 'merchandising', false)
      returning id into v_section_id;
    insert into public.cms_section_drafts (section_id, display_order, content)
      values (v_section_id, v_row.display_order, case when v_row.section_key = 'categories' then '{"categorySelections": []}'::jsonb else '{"productIds": []}'::jsonb end);
    insert into public.cms_section_published (section_id, display_order, content)
      values (v_section_id, v_row.display_order, case when v_row.section_key = 'categories' then '{"categorySelections": []}'::jsonb else '{"productIds": []}'::jsonb end);
  end loop;
end $$;
