-- Navigation and Footer join the existing 'site-chrome' page (alongside 'announcement-bar' from
-- 20260917112736_seed_site_chrome_page.sql) — same reasoning: both are global site chrome, not
-- homepage layout sections. Empty content seed — existing hardcoded Header navItems / Footer
-- content keep rendering until an admin actually publishes something (fallback-safe).

do $$
declare
  v_page_id uuid;
  v_section_id uuid;
  v_row record;
begin
  select id into v_page_id from public.cms_pages where slug = 'site-chrome';

  for v_row in
    select * from (values ('navigation', 'navigation', 20), ('footer', 'footer', 30)) as t(section_key, section_type, display_order)
  loop
    insert into public.cms_sections (page_id, section_key, section_type, is_required)
      values (v_page_id, v_row.section_key, v_row.section_type, false)
      returning id into v_section_id;
    insert into public.cms_section_drafts (section_id, display_order, content) values (v_section_id, v_row.display_order, '{}'::jsonb);
    insert into public.cms_section_published (section_id, display_order, content) values (v_section_id, v_row.display_order, '{}'::jsonb);
  end loop;
end $$;
