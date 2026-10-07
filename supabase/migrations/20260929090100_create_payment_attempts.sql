-- Payment lifecycle — see Documentations MD/delite-payments.md. A dedicated payment_attempts
-- table (not overloading `orders`) because a checkout attempt and a placed order are different
-- things: a payment can be created/failed/expired without ever becoming an order, and — critically
-- — for ONLINE payments the Odoo sale.order is not created until payment is verified (see the
-- payment-verify/razorpay-webhook Edge Functions), so `orders` cannot be the row a Razorpay order
-- id is attached to at creation time.
--
-- No card/payment credentials are ever stored here — only provider order/payment ids, amount, and
-- a safe failure reason.

create type public.payment_status as enum ('created', 'pending', 'authorized', 'paid', 'failed', 'expired', 'refunded');
create type public.payment_method as enum ('online', 'cod');

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  -- Set once the resulting order actually exists (online: after payment verified; cod: immediately
  -- by create-order, for a consistent join even though cod orders don't really need this row —
  -- cod still gets a payment_attempts row so Admin has ONE place to read payment state, see #47).
  order_id uuid references public.orders (id) on delete set null,
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  odoo_sale_order_id integer,
  amount numeric(12, 2) not null,
  currency text not null default 'INR',
  status public.payment_status not null default 'created',
  payment_method public.payment_method not null default 'online',
  failure_code text,
  failure_reason_safe text,
  -- Server-validated cart lines + shipping details captured at attempt-creation time (already
  -- re-priced against live Odoo — see payment-create's reuse of create-order's validation step).
  -- The webhook/verify finalize step reads FROM HERE, never from a fresh client request — a
  -- webhook retry or a delayed client callback can't be tricked into ordering something different
  -- than what was actually paid for.
  checkout_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create index payment_attempts_user_id_idx on public.payment_attempts (user_id);
create index payment_attempts_order_id_idx on public.payment_attempts (order_id);
create index payment_attempts_status_idx on public.payment_attempts (status);

alter table public.payment_attempts enable row level security;

create policy "payment_attempts_select_own"
  on public.payment_attempts for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "payment_attempts_select_admin"
  on public.payment_attempts for select
  to authenticated
  using ((select private.is_admin()));

-- No INSERT/UPDATE/DELETE policy for any client role, same pattern as `orders` — every write is
-- the payment-create/payment-verify/razorpay-webhook Edge Functions' service-role client. A
-- forged/self-reported "paid" state is impossible by construction, not just discouraged.

-- `orders` gains explicit, separate payment fields — "paid" and "fulfilled" are different concepts
-- (see #47) and must never be conflated into the existing single `status` text column.
alter table public.orders add column payment_method public.payment_method not null default 'cod';
alter table public.orders add column payment_status public.payment_status not null default 'pending';
alter table public.orders add column payment_attempt_id uuid references public.payment_attempts (id) on delete set null;

create index orders_payment_attempt_id_idx on public.orders (payment_attempt_id);
