-- Dealer portal (B2B) — Phase 2 purchase workflow: carts, orders, order-line price snapshots.
-- Same access model as 20261028090000_dealer_portal_foundation.sql: service-role Edge Functions
-- only (RLS on, no policies, privileges revoked). Additive.

create table public.dealer_cart_items (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  odoo_variant_id integer not null,
  quantity integer not null check (quantity >= 1),
  -- The unit price (paise) the dealer last SAW for this line. If the server's current price
  -- differs, the UI shows old -> new and requires acknowledgment before an order can be placed.
  quoted_price_paise bigint,
  updated_at timestamptz not null default now(),
  unique (dealer_id, odoo_variant_id)
);

create sequence public.dealer_order_number_seq start 1000;

create table public.dealer_orders (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete restrict,
  order_number text not null unique default ('DLR-' || lpad(nextval('public.dealer_order_number_seq')::text, 6, '0')),
  idempotency_key text not null,
  -- pending_sync: stored in Delite, Odoo quotation not created yet (retryable).
  -- quotation/confirmed/completed/cancelled: mirrored from the authoritative Odoo sale.order state.
  status text not null default 'pending_sync' check (status in ('pending_sync', 'quotation', 'confirmed', 'completed', 'cancelled')),
  odoo_sale_order_id integer,
  odoo_order_name text,
  currency text not null default 'INR',
  subtotal_paise bigint not null,
  tax_paise bigint not null,
  shipping_paise bigint not null default 0,
  total_paise bigint not null,
  shipping_address jsonb not null default '{}'::jsonb,
  po_reference text,
  notes text,
  quote_fingerprint text,
  placed_by uuid references auth.users (id) on delete set null,
  retry_count integer not null default 0,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A double-click / back-button retry can never create a second order.
  unique (dealer_id, idempotency_key)
);
create index dealer_orders_dealer_idx on public.dealer_orders (dealer_id, created_at desc);
create index dealer_orders_status_idx on public.dealer_orders (status);

-- Immutable price snapshot per line — later admin price edits never touch these rows.
create table public.dealer_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.dealer_orders (id) on delete cascade,
  odoo_template_id integer not null,
  odoo_variant_id integer not null,
  sku text,
  product_name text not null,
  quantity integer not null check (quantity >= 1),
  unit_price_paise bigint not null,
  tax_basis text not null check (tax_basis in ('exclusive', 'inclusive')),
  subtotal_paise bigint not null,
  tax_paise bigint not null,
  line_total_paise bigint not null,
  price_rule_id uuid,
  price_rule_version integer
);
create index dealer_order_items_order_idx on public.dealer_order_items (order_id);

-- Atomic order + line-snapshot insert, idempotent on (dealer_id, idempotency_key): a duplicate
-- submit returns the ORIGINAL order with created=false instead of ever creating a second one.
create or replace function public.dealer_insert_order(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  existing public.dealer_orders;
  inserted public.dealer_orders;
begin
  select * into existing from public.dealer_orders
   where dealer_id = (p_order ->> 'dealer_id')::uuid and idempotency_key = p_order ->> 'idempotency_key';
  if found then
    return jsonb_build_object('created', false, 'order', to_jsonb(existing));
  end if;

  begin
    insert into public.dealer_orders (
      dealer_id, idempotency_key, status, currency, subtotal_paise, tax_paise, shipping_paise, total_paise,
      shipping_address, po_reference, notes, quote_fingerprint, placed_by, retry_count
    ) values (
      (p_order ->> 'dealer_id')::uuid, p_order ->> 'idempotency_key', 'pending_sync', 'INR',
      (p_order ->> 'subtotal_paise')::bigint, (p_order ->> 'tax_paise')::bigint,
      coalesce((p_order ->> 'shipping_paise')::bigint, 0), (p_order ->> 'total_paise')::bigint,
      coalesce(p_order -> 'shipping_address', '{}'::jsonb), nullif(p_order ->> 'po_reference', ''),
      nullif(p_order ->> 'notes', ''), p_order ->> 'quote_fingerprint', nullif(p_order ->> 'placed_by', '')::uuid, 0
    ) returning * into inserted;
  exception when unique_violation then
    select * into existing from public.dealer_orders
     where dealer_id = (p_order ->> 'dealer_id')::uuid and idempotency_key = p_order ->> 'idempotency_key';
    return jsonb_build_object('created', false, 'order', to_jsonb(existing));
  end;

  insert into public.dealer_order_items (
    order_id, odoo_template_id, odoo_variant_id, sku, product_name, quantity, unit_price_paise,
    tax_basis, subtotal_paise, tax_paise, line_total_paise, price_rule_id, price_rule_version
  )
  select inserted.id, x.odoo_template_id, x.odoo_variant_id, x.sku, x.product_name, x.quantity,
         x.unit_price_paise, x.tax_basis, x.subtotal_paise, x.tax_paise, x.line_total_paise,
         x.price_rule_id, x.price_rule_version
    from jsonb_to_recordset(p_items) as x(
      odoo_template_id integer, odoo_variant_id integer, sku text, product_name text, quantity integer,
      unit_price_paise bigint, tax_basis text, subtotal_paise bigint, tax_paise bigint,
      line_total_paise bigint, price_rule_id uuid, price_rule_version integer
    );

  return jsonb_build_object('created', true, 'order', to_jsonb(inserted));
end;
$$;

revoke execute on function public.dealer_insert_order(jsonb, jsonb) from public, anon, authenticated;

alter table public.dealer_cart_items enable row level security;
alter table public.dealer_orders enable row level security;
alter table public.dealer_order_items enable row level security;

revoke all on public.dealer_cart_items, public.dealer_orders, public.dealer_order_items from anon, authenticated;
revoke all on sequence public.dealer_order_number_seq from anon, authenticated;
