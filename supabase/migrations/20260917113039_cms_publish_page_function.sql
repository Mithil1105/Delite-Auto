-- Publishing copies EVERY section's current draft to cms_section_published in one transaction
-- (a page with 3 sections published mid-way through, 2 old + 1 new, would be a real bug) and logs
-- one cms_publications row. SECURITY INVOKER (the default) deliberately, not DEFINER — this
-- function runs with the CALLING user's own privileges, so it's still fully governed by the same
-- RLS policies a direct write would hit (owner/admin/content only); a support/merchandising/
-- analytics caller gets a real RLS permission error, not a bypass.

create or replace function public.cms_publish_page(p_slug text, p_note text default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_page_id uuid;
begin
  select id into v_page_id from public.cms_pages where slug = p_slug;
  if v_page_id is null then
    raise exception 'Unknown page slug: %', p_slug;
  end if;

  insert into public.cms_section_published (section_id, content, visible, display_order, published_at, published_by)
  select d.section_id, d.content, d.visible, d.display_order, now(), (select auth.uid())
  from public.cms_section_drafts d
  join public.cms_sections s on s.id = d.section_id
  where s.page_id = v_page_id
  on conflict (section_id) do update set
    content = excluded.content,
    visible = excluded.visible,
    display_order = excluded.display_order,
    published_at = excluded.published_at,
    published_by = excluded.published_by;

  insert into public.cms_publications (page_id, published_by, note)
  values (v_page_id, (select auth.uid()), p_note);
end;
$$;

revoke execute on function public.cms_publish_page(text, text) from public, anon;
grant execute on function public.cms_publish_page(text, text) to authenticated;
