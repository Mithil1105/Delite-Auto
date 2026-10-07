-- COD duplicate-submit protection + admin Odoo-retry operational state — see
-- Documentations MD/delite-production-operations.md. Mirrors the Razorpay path's existing
-- "atomic claim on a unique column, before the Odoo write" idempotency shape (see
-- _shared/payments/finalize.ts's razorpay_payment_id claim) for COD, keyed instead by a
-- client-generated checkout_attempt_id — a double-submit/network-retry with the same id must
-- resolve to the SAME order, never a second Odoo sale.order.

alter table public.payment_attempts add column checkout_attempt_id uuid unique;

-- Admin-retry bookkeeping (also written by _shared/payments/finalize.ts for the Razorpay path,
-- so both payment methods surface in the same Admin recovery view).
alter table public.payment_attempts add column retry_count integer not null default 0;
alter table public.payment_attempts add column last_retry_at timestamptz;
alter table public.payment_attempts add column last_sync_error_safe text;
-- Claim-lock so two concurrent "Retry" clicks (or a click during an in-flight automatic attempt)
-- can never both call Odoo for the same attempt — see admin-retry-odoo-order-sync.
alter table public.payment_attempts add column syncing_since timestamptz;

alter table public.payment_attempts
  add column odoo_sync_status text not null default 'not_applicable'
  check (odoo_sync_status in ('not_applicable', 'pending', 'syncing', 'synced', 'failed'));

-- Backfill the new richer state from the existing boolean so already-stuck rows show up correctly.
update public.payment_attempts set odoo_sync_status = 'failed' where odoo_sync_pending = true;
update public.payment_attempts set odoo_sync_status = 'synced' where odoo_sync_pending = false and odoo_sale_order_id is not null;

create index payment_attempts_checkout_attempt_id_idx on public.payment_attempts (checkout_attempt_id);

-- Defence in depth: even if two callers both somehow reach the orders-insert step for the same
-- attempt (shouldn't happen given the claim above), the DB itself refuses a second order row.
create unique index orders_payment_attempt_id_unique_idx
  on public.orders (payment_attempt_id)
  where payment_attempt_id is not null;
