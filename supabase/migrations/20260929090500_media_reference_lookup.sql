-- Media-delete safety (Documentations MD/delite-admin.md, "Known gaps" — reference checking was
-- flagged as an unfinished follow-up). SECURITY INVOKER (not DEFINER): runs under the calling
-- admin's own RLS, exactly like cms_publish_page() — it can only see what that admin could already
-- see via cms_sections/cms_section_drafts/cms_section_published/cms_promotions directly, so it
-- grants no new read access. A plain jsonb-cast LIKE match is intentionally broad (may
-- over-match a coincidental substring) rather than narrow — a false "still referenced" warning is
-- safe; a false "safe to delete" is not.

create or replace function public.find_media_references(p_storage_path text)
returns table (source text, status text, label text)
language sql
security invoker
set search_path = ''
stable
as $$
  select 'homepage_section'::text as source, 'draft'::text as status, s.section_key as label
  from public.cms_section_drafts d
  join public.cms_sections s on s.id = d.section_id
  where d.content::text like '%' || p_storage_path || '%'

  union all

  select 'homepage_section'::text, 'published'::text, s.section_key
  from public.cms_section_published pub
  join public.cms_sections s on s.id = pub.section_id
  where pub.content::text like '%' || p_storage_path || '%'

  union all

  select 'promotion'::text, pr.status, pr.internal_name
  from public.cms_promotions pr
  where pr.image_storage_path = p_storage_path or pr.mobile_image_storage_path = p_storage_path;
$$;

grant execute on function public.find_media_references(text) to authenticated;
