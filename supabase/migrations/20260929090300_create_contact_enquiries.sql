-- Real backing store for the public Contact form (previously fully decorative — see
-- Documentations MD/delite-contact-and-admin-media.md). No anon INSERT policy exists here on
-- purpose: RLS cannot rate-limit, so public submission goes through the `contact-submit` Edge
-- Function (service-role, rate-limited) instead of a direct client insert — the table itself is
-- unreachable from the browser, same defence-in-depth shape as `orders`/`payment_attempts`.

create type public.contact_enquiry_status as enum ('new', 'in_progress', 'resolved', 'archived');

create table public.contact_enquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  subject text,
  message text not null,
  status public.contact_enquiry_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contact_enquiries_status_idx on public.contact_enquiries (status, created_at desc);

alter table public.contact_enquiries enable row level security;

create policy "contact_enquiries_select_admin"
  on public.contact_enquiries for select
  to authenticated
  using ((select private.has_admin_role(array['owner', 'admin', 'support']::public.admin_role[])));

create policy "contact_enquiries_update_admin"
  on public.contact_enquiries for update
  to authenticated
  using ((select private.has_admin_role(array['owner', 'admin', 'support']::public.admin_role[])))
  with check ((select private.has_admin_role(array['owner', 'admin', 'support']::public.admin_role[])));

-- No INSERT policy for any client role (see header) and no DELETE policy at all — an enquiry is
-- archived via status, never deleted, same "no CRM, don't over-build" restraint as the rest of
-- this admin surface.
