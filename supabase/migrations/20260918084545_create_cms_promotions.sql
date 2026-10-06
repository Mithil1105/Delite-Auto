-- Promotions are a variable-length COLLECTION (create/edit/delete N promotions), unlike every
-- other CMS module this phase which fits the fixed-named-slot cms_sections shape — the one
-- justified exception to "reuse the existing five tables," per Documentations MD/delite-admin.md.
-- Still shares the same role helper, the same activity-log/media patterns, and a simple
-- draft/published `status` column (not a separate draft/published table pair) since a promotion
-- is a discrete row, not a page section with independent draft-vs-live divergence.
--
-- Marketing-only: nothing here can ever change an Odoo price/stock/discount — `heading`/`body`
-- are free text an admin writes (e.g. "20% OFF"), never computed from or written back to Odoo.
--
-- No start/end scheduling this pass — enabled/disabled only (see the "IMPORTANT" callout in the
-- Phase 2 task spec: "If scheduling cannot be done safely in this pass: support enabled/disabled
-- now, document scheduling as future work").

create table public.cms_promotions (
  id uuid primary key default gen_random_uuid(),
  internal_name text not null,
  heading text not null,
  subheading text,
  body text,
  image_storage_path text,
  mobile_image_storage_path text,
  cta_label text,
  cta_url text,
  enabled boolean not null default false,
  display_order integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  published_at timestamptz,
  published_by uuid references public.profiles (id)
);

create index cms_promotions_status_enabled_idx on public.cms_promotions (status, enabled, display_order);

alter table public.cms_promotions enable row level security;

-- Public sees only live, enabled promotions.
create policy "cms_promotions_select_public"
  on public.cms_promotions for select
  to anon, authenticated
  using (status = 'published' and enabled = true);

-- Admins (any role) can see the full list including drafts, for the editor's list view.
create policy "cms_promotions_select_admin"
  on public.cms_promotions for select
  to authenticated
  using ((select private.has_admin_role(array['owner','admin','content','merchandising','support','analytics']::public.admin_role[])));

create policy "cms_promotions_write_content"
  on public.cms_promotions for all
  to authenticated
  using ((select private.has_admin_role(array['owner','admin','content']::public.admin_role[])))
  with check ((select private.has_admin_role(array['owner','admin','content']::public.admin_role[])));
