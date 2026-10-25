-- Blog / info posts, written and published from the admin (Admin -> Website -> Blog).
--
-- Text fields are stored per language as jsonb: { "en": ..., "hi": ..., "gu": ... }. English is required; an empty
-- Hindi/Gujarati entry makes the storefront fall back to English. `body` is a list of simple blocks per language
-- (heading / paragraph / image / gallery / quote) - never raw HTML - so staff cannot break the page layout and the
-- storefront never has to trust markup.
--
-- Visibility: the public sees a post only when status = 'published' AND published_at <= now() (so a future
-- published_at schedules it). Admins (owner / admin / content) see and edit everything, including drafts.
--
-- Also seeds the homepage "Latest from the blog" section (blog-latest) and two DRAFT sample posts so the editor has
-- something to open; the samples are not public until someone publishes them. Safe to re-run.

create table if not exists public.blog_posts (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 120),
  status        text not null default 'draft' check (status in ('draft', 'published')),
  published_at  timestamptz,
  category      text not null default 'Guides' check (length(category) between 1 and 40),
  layout        text not null default 'standard' check (layout in ('standard', 'hero', 'split', 'gallery')),
  cover_image   text check (cover_image is null or length(cover_image) <= 600),
  cover_alt     text check (cover_alt is null or length(cover_alt) <= 200),
  show_products boolean not null default false,
  product_ids   integer[] not null default '{}' check (cardinality(product_ids) <= 8),
  title         jsonb not null default '{}'::jsonb check (coalesce(title ->> 'en', '') <> ''),
  excerpt       jsonb not null default '{}'::jsonb,
  body          jsonb not null default '{}'::jsonb,
  author_name   text check (author_name is null or length(author_name) <= 80),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists blog_posts_published_idx on public.blog_posts (published_at desc) where status = 'published';

alter table public.blog_posts enable row level security;

drop policy if exists "blog_posts_select_public" on public.blog_posts;
create policy "blog_posts_select_public" on public.blog_posts for select to anon, authenticated
  using (status = 'published' and published_at is not null and published_at <= now());

drop policy if exists "blog_posts_select_admin" on public.blog_posts;
create policy "blog_posts_select_admin" on public.blog_posts for select to authenticated
  using ((select private.has_admin_role(array['owner', 'admin', 'content']::public.admin_role[])));

drop policy if exists "blog_posts_insert_admin" on public.blog_posts;
create policy "blog_posts_insert_admin" on public.blog_posts for insert to authenticated
  with check ((select private.has_admin_role(array['owner', 'admin', 'content']::public.admin_role[])));

drop policy if exists "blog_posts_update_admin" on public.blog_posts;
create policy "blog_posts_update_admin" on public.blog_posts for update to authenticated
  using ((select private.has_admin_role(array['owner', 'admin', 'content']::public.admin_role[])))
  with check ((select private.has_admin_role(array['owner', 'admin', 'content']::public.admin_role[])));

drop policy if exists "blog_posts_delete_admin" on public.blog_posts;
create policy "blog_posts_delete_admin" on public.blog_posts for delete to authenticated
  using ((select private.has_admin_role(array['owner', 'admin', 'content']::public.admin_role[])));

-- Homepage "Latest from the blog" section (listed in Admin -> Website -> Homepage like the others).
do $$
declare
  v_page_id uuid;
  v_section_id uuid;
begin
  select id into v_page_id from public.cms_pages where slug = 'homepage';
  if v_page_id is null then
    raise exception 'homepage page missing';
  end if;
  if not exists (select 1 from public.cms_sections where page_id = v_page_id and section_key = 'blog-latest') then
    insert into public.cms_sections (page_id, section_key, section_type, is_required)
      values (v_page_id, 'blog-latest', 'blog-latest', false)
      returning id into v_section_id;
    insert into public.cms_section_drafts (section_id, display_order, content) values (v_section_id, 99, '{}'::jsonb);
    insert into public.cms_section_published (section_id, display_order, content) values (v_section_id, 99, '{}'::jsonb);
  end if;
end $$;

-- Two draft sample posts (English only; Hindi/Gujarati fall back to English until someone adds them).
insert into public.blog_posts (slug, status, category, layout, show_products, title, excerpt, body, author_name)
values
  (
    'how-to-choose-the-right-seat-covers',
    'draft', 'Guides', 'standard', false,
    '{"en": "How to choose the right seat covers for your car"}'::jsonb,
    '{"en": "Leather, fabric or vegan leather? A quick guide to picking seat covers that fit well, last long and suit your budget."}'::jsonb,
    '{"en": [
      {"type": "paragraph", "text": "Seat covers protect your original upholstery, keep the cabin cooler or warmer and make an older car feel new. The right pair depends on your climate, your budget and how you use the car."},
      {"type": "heading", "text": "1. Pick the material"},
      {"type": "paragraph", "text": "Fabric covers breathe well and suit hot weather. Vegan leather looks premium and wipes clean. Genuine leather feels the best but costs more and needs care."},
      {"type": "heading", "text": "2. Insist on a model-specific fit"},
      {"type": "paragraph", "text": "Universal covers slip and wrinkle. Covers made for your exact model follow the seat shape, leave the airbag seams free and stay in place."},
      {"type": "quote", "text": "A good seat cover should look like it came from the factory.", "by": "Delite Auto Accessories"},
      {"type": "heading", "text": "3. Get it fitted properly"},
      {"type": "paragraph", "text": "Fitting takes about an hour at our Ahmedabad store. A neat installation matters as much as the cover itself."}
    ]}'::jsonb,
    'Delite Auto'
  ),
  (
    'five-care-tips-to-keep-your-car-new',
    'draft', 'Care tips', 'standard', false,
    '{"en": "5 simple care tips to keep your car looking new"}'::jsonb,
    '{"en": "Small habits that protect paint, interior and electronics, especially through the Indian summer and monsoon."}'::jsonb,
    '{"en": [
      {"type": "paragraph", "text": "You do not need a lot of time or money to keep a car looking good. These five habits make the biggest difference."},
      {"type": "heading", "text": "Wash in the shade"},
      {"type": "paragraph", "text": "Washing under direct sun leaves water spots. Park in the shade and use a microfibre cloth to dry."},
      {"type": "heading", "text": "Protect the dashboard"},
      {"type": "paragraph", "text": "A dashboard mat and a sunshade reduce cracking and fading from heat."},
      {"type": "heading", "text": "Use floor mats that fit"},
      {"type": "paragraph", "text": "Custom mats catch mud and water in the monsoon and are easy to rinse."}
    ]}'::jsonb,
    'Delite Auto'
  )
on conflict (slug) do nothing;
