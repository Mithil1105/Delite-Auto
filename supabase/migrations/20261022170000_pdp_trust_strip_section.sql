-- The product-page promise strip (under Buy Now) becomes admin-editable: a 'pdp-trust-strip' section on the
-- existing 'site-chrome' CMS page (alongside announcement-bar / navigation / footer). Seeded with the two
-- messages that were hardcoded before, so the page looks the same until an admin changes it. Safe to re-run.

do $$
declare
  v_page_id uuid;
  v_section_id uuid;
  v_content jsonb := jsonb_build_object(
    'items', jsonb_build_array(
      jsonb_build_object('id', 'returns', 'text', '30-day money-back guarantee', 'icon', 'returns'),
      jsonb_build_object('id', 'shipping', 'text', 'Shipping in 2–3 business days', 'icon', 'truck')
    ),
    'intervalMs', 3200,
    'showIcons', true
  );
begin
  select id into v_page_id from public.cms_pages where slug = 'site-chrome';
  if v_page_id is null then
    raise exception 'site-chrome page missing';
  end if;
  if exists (select 1 from public.cms_sections where page_id = v_page_id and section_key = 'pdp-trust-strip') then
    return;
  end if;

  insert into public.cms_sections (page_id, section_key, section_type, is_required)
    values (v_page_id, 'pdp-trust-strip', 'pdp-trust-strip', false)
    returning id into v_section_id;
  insert into public.cms_section_drafts (section_id, display_order, content) values (v_section_id, 40, v_content);
  insert into public.cms_section_published (section_id, display_order, content) values (v_section_id, 40, v_content);
end $$;
