-- Honest "last webhook received / recent failure count" for the Admin Integrations page — without
-- this, webhook health can only be guessed at from payment_attempts.updated_at, which doesn't
-- distinguish a webhook-driven update from a payment-verify-driven one. One row per invocation
-- (success or failure), written by razorpay-webhook — see Documentations MD/delite-payments.md.

create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'razorpay',
  event_type text not null,
  payment_attempt_id uuid references public.payment_attempts (id) on delete set null,
  success boolean not null,
  safe_error text,
  received_at timestamptz not null default now()
);

create index payment_webhook_events_received_at_idx on public.payment_webhook_events (received_at desc);

alter table public.payment_webhook_events enable row level security;

create policy "payment_webhook_events_select_admin"
  on public.payment_webhook_events for select
  to authenticated
  using ((select private.has_admin_role(array['owner', 'admin']::public.admin_role[])));

-- No INSERT/UPDATE/DELETE policy for any client role — every write is razorpay-webhook's
-- service-role client, same defence-in-depth pattern as every other operational table here.
