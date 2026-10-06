-- Server-owned transactional email log — see Documentations MD/delite-transactional-email.md.
-- `idempotency_key` is UNIQUE so a retried webhook/order handler can never send (or even attempt
-- to send) the same logical email twice: the caller does an upsert-or-check-first against this
-- table before calling the provider. Never stores email body copies or secrets.

create type public.email_status as enum ('queued', 'sent', 'failed');

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  email_type text not null,
  idempotency_key text not null unique,
  provider_message_id text,
  status public.email_status not null default 'queued',
  safe_failure_reason text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index email_log_order_id_idx on public.email_log (order_id);

alter table public.email_log enable row level security;

create policy "email_log_select_admin"
  on public.email_log for select
  to authenticated
  using ((select private.is_admin()));

-- No INSERT/UPDATE/DELETE policy for any client role — every write is the shared email service's
-- service-role client, same pattern as `orders`/`payment_attempts`.
