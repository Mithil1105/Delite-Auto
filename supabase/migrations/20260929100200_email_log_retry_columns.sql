-- Admin-initiated email retry needs its own row (idempotency_key stays unique — see
-- _shared/email/index.ts) with an explicit link back to what it's retrying, so the Admin Email
-- Delivery page can show retry history instead of a retry silently overwriting the original
-- failure record. See Documentations MD/delite-transactional-email.md.

alter table public.email_log add column retry_of uuid references public.email_log (id) on delete set null;
alter table public.email_log add column attempt_number integer not null default 1;

create index email_log_retry_of_idx on public.email_log (retry_of);
