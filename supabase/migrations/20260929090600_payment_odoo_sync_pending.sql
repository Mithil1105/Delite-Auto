-- If Odoo order creation fails AFTER a payment has already been verified/captured (Razorpay money
-- already collected), the payment must never be reported as failed or lost — see #10. This flag
-- lets the payment-finalize path record "paid, but the Odoo order still needs to be created" as an
-- explicit, Admin-visible operational state instead of silently retrying-and-hoping or (worse)
-- telling the customer their payment failed when it didn't.

alter table public.payment_attempts add column odoo_sync_pending boolean not null default false;

create index payment_attempts_odoo_sync_pending_idx
  on public.payment_attempts (odoo_sync_pending)
  where odoo_sync_pending = true;
