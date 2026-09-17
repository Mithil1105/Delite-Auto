-- orders: a thin mirror of real Odoo sale.order records, written ONLY by the create-order Edge
-- Function (service-role key, bypasses RLS entirely) — never directly by a client. Odoo itself
-- remains the system of record for order line items/pricing; this table exists so a signed-in
-- user can see their own order history and an admin can list all orders without an extra live
-- Odoo round trip per page load. See Documentations MD/delite-accounts-orders-reviews-admin.md.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  odoo_sale_order_id integer,
  odoo_order_name text,
  -- Deliberately stays 'placed' after creation in this phase — syncing real Odoo order status
  -- (paid/shipped/delivered) back into this column needs polling or an Odoo-side webhook, neither
  -- confirmed available on this instance. Documented as a known gap, not silently promised.
  status text not null default 'placed',
  subtotal numeric(12, 2) not null,
  shipping_name text not null,
  shipping_phone text not null,
  shipping_address text not null,
  created_at timestamptz not null default now()
);

create index if not exists orders_user_id_idx on public.orders (user_id);

alter table public.orders enable row level security;

create policy "orders_select_own"
  on public.orders for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "orders_select_admin"
  on public.orders for select
  to authenticated
  using ((select private.is_admin()));

-- No INSERT/UPDATE/DELETE policy for any client-facing role at all. The only way a row gets into
-- this table is the create-order Edge Function's service-role client, which bypasses RLS by
-- design — a forged client-side order is impossible by construction, not just discouraged by
-- policy. If a future admin "cancel order" action is added, it belongs in a gated Edge Function
-- too (service-role write), not a direct client UPDATE policy.
