-- The announcement bar (Header.tsx) is global site chrome, not a reorderable homepage section —
-- doesn't belong in the 'homepage' page's section list (which is specifically the 11 sections
-- Home.tsx actually renders, in order). Modeled as its own single-section page instead of
-- shoehorning it into homepage's ordering, keeping "page.sections in display order" a true
-- invariant for the homepage editor.

do $$
declare
  v_page_id uuid;
  v_section_id uuid;
begin
  insert into public.cms_pages (slug, title) values ('site-chrome', 'Site-wide') returning id into v_page_id;

  insert into public.cms_sections (page_id, section_key, section_type, is_required)
    values (v_page_id, 'announcement-bar', 'announcement-bar', false)
    returning id into v_section_id;

  insert into public.cms_section_drafts (section_id, display_order, content)
    values (v_section_id, 10, '{}'::jsonb);

  insert into public.cms_section_published (section_id, display_order, content)
    values (v_section_id, 10, '{}'::jsonb);
end $$;
