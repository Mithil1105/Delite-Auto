-- Review enrichment: reviewer name snapshot, verified-purchase badge, review photos.
-- See Documentations MD/delite-accounts-orders-reviews-admin.md, "Review enrichment".
--
-- reviewer_name is a snapshot taken at submission time (not a live join to profiles), same
-- reasoning as shipping_name/guest_name on orders already in this schema: a later profile name
-- change should never silently rewrite what a past reviewer's name reads as, and profiles isn't
-- publicly readable row-by-row anyway.
--
-- verified_purchase is set ONLY by the submit-review Edge Function after a live Odoo
-- sale.order.line check (never client-supplied) — see supabase/functions/submit-review/index.ts.

alter table public.product_reviews
  add column if not exists reviewer_name text,
  add column if not exists verified_purchase boolean not null default false,
  add column if not exists photo_paths text[] not null default '{}'::text[];

-- Storage bucket for review photos. Public read (approved-review photos are shown to every
-- visitor); insert restricted to the uploader's own folder (first path segment = their own
-- auth.uid()) so one user can never attribute an upload to another; no update policy (photos are
-- immutable once attached to a submitted review); admin delete for moderation cleanup, mirroring
-- marketing-media's existing admin-delete pattern.
insert into storage.buckets (id, name, public)
values ('review-media', 'review-media', true)
on conflict (id) do nothing;

create policy "review_media_read_public" on storage.objects
  for select
  using (bucket_id = 'review-media');

create policy "review_media_insert_own" on storage.objects
  for insert
  with check (
    bucket_id = 'review-media'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "review_media_delete_admin" on storage.objects
  for delete
  using (
    bucket_id = 'review-media'
    and (select private.has_admin_role(array['owner'::admin_role, 'admin'::admin_role, 'support'::admin_role]))
  );
