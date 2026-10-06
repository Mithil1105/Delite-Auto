-- CMS data architecture (Documentations MD/delite-admin.md). Delite CMS owns HOW the website
-- presents/promotes content — never sellable-item data, which stays Odoo-owned (see
-- Documentations MD/odoo-real-catalog.md). Draft/publish model: cms_section_drafts is what an
-- admin edits live; cms_section_published is only ever written by a publish action (never
-- directly editable) and is what a future storefront-wiring pass would read; cms_publications is
-- the version-identity trail (one row per publish) the spec asks for without a full revision
-- system yet.
--
-- Real section keys/order below were read directly off src/pages/Home.tsx, not invented.

create table public.cms_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  created_at timestamptz not null default now()
);

create table public.cms_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.cms_pages (id) on delete cascade,
  section_key text not null,
  section_type text not null,
  is_required boolean not null default false,
  created_at timestamptz not null default now(),
  constraint cms_sections_page_key_unique unique (page_id, section_key)
);

create table public.cms_section_drafts (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null unique references public.cms_sections (id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  visible boolean not null default true,
  display_order integer not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create table public.cms_section_published (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null unique references public.cms_sections (id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  visible boolean not null default true,
  display_order integer not null,
  published_at timestamptz not null default now(),
  published_by uuid references public.profiles (id)
);

create table public.cms_publications (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.cms_pages (id) on delete cascade,
  published_at timestamptz not null default now(),
  published_by uuid references public.profiles (id),
  note text
);

create index cms_sections_page_id_idx on public.cms_sections (page_id);
create index cms_publications_page_id_idx on public.cms_publications (page_id, published_at desc);

alter table public.cms_pages enable row level security;
alter table public.cms_sections enable row level security;
alter table public.cms_section_drafts enable row level security;
alter table public.cms_section_published enable row level security;
alter table public.cms_publications enable row level security;

-- Any signed-in admin (whatever their specific role) can read the CMS — harmless, and several
-- roles legitimately need context even where they can't write (e.g. support seeing the current
-- homepage while answering a customer question). No public/anon policy anywhere in this
-- migration: drafts must never be publicly readable (spec: CMS publication security), and nothing
-- public consumes cms_section_published yet either (the live storefront isn't wired to it this
-- pass — see Documentations MD/delite-admin.md, "Known gaps").
create policy "cms_pages_select_admin" on public.cms_pages for select to authenticated
  using ((select private.has_admin_role(array['owner','admin','content','merchandising','support','analytics']::public.admin_role[])));
create policy "cms_sections_select_admin" on public.cms_sections for select to authenticated
  using ((select private.has_admin_role(array['owner','admin','content','merchandising','support','analytics']::public.admin_role[])));
create policy "cms_section_drafts_select_admin" on public.cms_section_drafts for select to authenticated
  using ((select private.has_admin_role(array['owner','admin','content','merchandising','support','analytics']::public.admin_role[])));
create policy "cms_section_published_select_admin" on public.cms_section_published for select to authenticated
  using ((select private.has_admin_role(array['owner','admin','content','merchandising','support','analytics']::public.admin_role[])));
create policy "cms_publications_select_admin" on public.cms_publications for select to authenticated
  using ((select private.has_admin_role(array['owner','admin','content','merchandising','support','analytics']::public.admin_role[])));

-- Structural writes (adding/renaming/removing a section) are owner/admin only — deliberately not
-- opened to 'content', whose job is editing section CONTENT, not the page's structural registry.
create policy "cms_pages_write_owner_admin" on public.cms_pages for all to authenticated
  using ((select private.has_admin_role(array['owner','admin']::public.admin_role[])))
  with check ((select private.has_admin_role(array['owner','admin']::public.admin_role[])));
create policy "cms_sections_write_owner_admin" on public.cms_sections for all to authenticated
  using ((select private.has_admin_role(array['owner','admin']::public.admin_role[])))
  with check ((select private.has_admin_role(array['owner','admin']::public.admin_role[])));

-- Content writes (draft edits, publish) are owner/admin/content.
create policy "cms_section_drafts_write_content" on public.cms_section_drafts for all to authenticated
  using ((select private.has_admin_role(array['owner','admin','content']::public.admin_role[])))
  with check ((select private.has_admin_role(array['owner','admin','content']::public.admin_role[])));
create policy "cms_section_published_write_content" on public.cms_section_published for all to authenticated
  using ((select private.has_admin_role(array['owner','admin','content']::public.admin_role[])))
  with check ((select private.has_admin_role(array['owner','admin','content']::public.admin_role[])));
create policy "cms_publications_write_content" on public.cms_publications for insert to authenticated
  with check ((select private.has_admin_role(array['owner','admin','content']::public.admin_role[])));

-- Seed: one page (homepage), its 11 real sections (key/order read directly off Home.tsx), and a
-- matching draft + published row per section so the shell has real, non-empty data to render from
-- the moment it ships — never an empty-state-only "foundation."
do $$
declare
  v_page_id uuid;
  v_section_id uuid;
  v_row record;
begin
  insert into public.cms_pages (slug, title) values ('homepage', 'Homepage') returning id into v_page_id;

  for v_row in
    select * from (values
      ('hero', 'hero', true, 10),
      ('vehicle-shop-split', 'vehicle-shop-split', false, 20),
      ('category-strip', 'category-strip', false, 30),
      ('trending', 'product-rail', false, 40),
      ('perfect-vehicle', 'product-rail', false, 50),
      ('brands', 'brand-grid', false, 60),
      ('top-categories-car', 'product-rail', false, 70),
      ('promo-banners', 'promo-banners', false, 80),
      ('top-categories-bike', 'product-rail', false, 90),
      ('testimonials', 'testimonials', false, 100),
      ('get-in-touch', 'get-in-touch', false, 110)
    ) as t(section_key, section_type, is_required, display_order)
  loop
    insert into public.cms_sections (page_id, section_key, section_type, is_required)
      values (v_page_id, v_row.section_key, v_row.section_type, v_row.is_required)
      returning id into v_section_id;

    insert into public.cms_section_drafts (section_id, display_order, content)
      values (v_section_id, v_row.display_order, '{}'::jsonb);

    insert into public.cms_section_published (section_id, display_order, content)
      values (v_section_id, v_row.display_order, '{}'::jsonb);
  end loop;
end $$;
