-- Account-backed wishlist for signed-in customers (guest wishlist stays localStorage-only in the
-- frontend — see Documentations MD/delite-auth-security.md). Keyed by real Odoo template id, never
-- a copied price/image/name — the storefront always resolves current product data live via
-- catalogService, same "Odoo-ID-only persistence" rule already used by CMS merchandising.

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  odoo_template_id integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, odoo_template_id)
);

create index wishlist_items_user_id_idx on public.wishlist_items (user_id);

alter table public.wishlist_items enable row level security;

create policy "wishlist_items_select_own"
  on public.wishlist_items for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "wishlist_items_insert_own"
  on public.wishlist_items for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "wishlist_items_delete_own"
  on public.wishlist_items for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- No UPDATE policy — a wishlist item is added or removed, never edited in place.
