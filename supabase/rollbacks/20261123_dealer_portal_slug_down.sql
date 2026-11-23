-- Rollback for 20261123090000_dealer_portal_slug.sql (drops the per-dealer address; dealers fall back to the shared portal address).
drop index if exists public.dealers_portal_slug_key;
alter table public.dealers drop column if exists portal_slug;
delete from supabase_migrations.schema_migrations where version = '20261123090000';
