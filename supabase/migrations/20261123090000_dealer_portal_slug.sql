-- Dealer portal: per-dealer address (<portal_slug>.<dealer base domain>) with a branded landing/login page.
-- Additive only: one nullable column + a partial unique index. Rollback:
-- supabase/rollbacks/20261123_dealer_portal_slug_down.sql
alter table public.dealers
  add column portal_slug text check (portal_slug is null or portal_slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$');
create unique index dealers_portal_slug_key on public.dealers (portal_slug) where portal_slug is not null;
