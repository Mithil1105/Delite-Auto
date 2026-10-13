-- Product media cache bucket (Documentations MD/storefront-performance-2026-10.md,
-- "Product image caching"). Public-read, same pattern as marketing-media/review-media, but with
-- NO authenticated-write policy at all: every object here is written exclusively by
-- catalog-media's service-role cache-fill logic (Edge Functions bypass RLS via the service role
-- key), never by a human admin upload or any client-authenticated request. That's a smaller
-- write-attack-surface than marketing-media's admin-role-gated policy, not a weaker one.
--
-- Objects are content-addressed by Odoo's own write_date (see buildStorageMediaPath in
-- _shared/odoo/catalog.ts) so a stale object is never served under a URL a current page
-- references — an Odoo image update naturally produces a new path, not an update-in-place.

insert into storage.buckets (id, name, public)
values ('product-media', 'product-media', true)
on conflict (id) do nothing;

create policy "product_media_read_public" on storage.objects for select
  using (bucket_id = 'product-media');
