-- Marketing Media library (Documentations MD/delite-admin.md) — NOT the Odoo product gallery.
-- Storage bucket is public-read (these become plain <img src> URLs, same reasoning already
-- applied to catalog-media's proxy) but admin-write-only. cms_media is the searchable index
-- Storage alone doesn't give you.

insert into storage.buckets (id, name, public)
values ('marketing-media', 'marketing-media', true)
on conflict (id) do nothing;

create policy "marketing_media_read_public" on storage.objects for select
  using (bucket_id = 'marketing-media');

create policy "marketing_media_insert_admin" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'marketing-media'
    and (select private.has_admin_role(array['owner','admin','content']::public.admin_role[]))
  );

create policy "marketing_media_update_admin" on storage.objects for update to authenticated
  using (
    bucket_id = 'marketing-media'
    and (select private.has_admin_role(array['owner','admin','content']::public.admin_role[]))
  );

create policy "marketing_media_delete_admin" on storage.objects for delete to authenticated
  using (
    bucket_id = 'marketing-media'
    and (select private.has_admin_role(array['owner','admin','content']::public.admin_role[]))
  );

create table public.cms_media (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  width integer,
  height integer,
  alt_text text,
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index cms_media_created_at_idx on public.cms_media (created_at desc);

alter table public.cms_media enable row level security;

create policy "cms_media_select_admin" on public.cms_media for select to authenticated
  using ((select private.has_admin_role(array['owner','admin','content','merchandising','support','analytics']::public.admin_role[])));

create policy "cms_media_write_content" on public.cms_media for all to authenticated
  using ((select private.has_admin_role(array['owner','admin','content']::public.admin_role[])))
  with check ((select private.has_admin_role(array['owner','admin','content']::public.admin_role[])));

-- Admin activity log (Documentations MD/delite-admin.md) — append-only audit trail. No
-- update/delete policy at all: an audit log that admins can edit or erase isn't an audit log.
create table public.admin_activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id),
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index admin_activity_log_created_at_idx on public.admin_activity_log (created_at desc);

alter table public.admin_activity_log enable row level security;

create policy "activity_log_select_admin" on public.admin_activity_log for select to authenticated
  using ((select private.has_admin_role(array['owner','admin','content','merchandising','support','analytics']::public.admin_role[])));

-- An admin may only log an action as themselves (actor_id must match the caller) — prevents one
-- admin recording an entry that impersonates another.
create policy "activity_log_insert_self" on public.admin_activity_log for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and (select private.has_admin_role(array['owner','admin','content','merchandising','support','analytics']::public.admin_role[]))
  );
