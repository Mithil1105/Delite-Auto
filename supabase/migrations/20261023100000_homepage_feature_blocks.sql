-- Four "feature block" sections for the home page: a label, big heading, paragraph, button and picture side by side
-- (picture left or right), optionally followed by a product row. Each block can pull its content from a blog post
-- (picked in the admin) or be written directly. They are listed in Admin -> Website -> Homepage like every other
-- section, so they can be reordered, hidden and edited; with no content they render nothing. Safe to re-run.

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
      ('feature-block-1', 'feature-block', 47),
      ('feature-block-2', 'feature-block', 65),
      ('feature-block-3', 'feature-block', 85),
      ('feature-block-4', 'feature-block', 98)
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
