-- Phase 2: the public storefront now reads published CMS content directly (Documentations MD/
-- delite-admin.md, "Known gaps" from Phase 1 — this closes it). Adds anon+authenticated SELECT on
-- the structural/published tables only. `cms_section_drafts` is deliberately untouched — it keeps
-- its Phase-1 admin-only policies, so a draft can never leak through a public query regardless of
-- what the frontend does or doesn't filter.

create policy "cms_pages_select_public"
  on public.cms_pages for select
  to anon, authenticated
  using (true);

create policy "cms_sections_select_public"
  on public.cms_sections for select
  to anon, authenticated
  using (true);

create policy "cms_section_published_select_public"
  on public.cms_section_published for select
  to anon, authenticated
  using (true);
