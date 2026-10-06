-- Odoo-backed customer checkout/account/returns phase — see
-- Documentations MD/odoo-checkout-portal-returns.md for the architecture decision (React/Supabase
-- checkout kept, Odoo extended as backend-of-record for customer/address/order/return data — no
-- Odoo-hosted checkout handoff). Additive only; no existing migration edited.

-- ============================================================================
-- 1. Durable Supabase user <-> Odoo res.partner mapping (spec #2)
-- ============================================================================
-- Nullable, unique when set — one Supabase user maps to at most one Odoo partner, and one Odoo
-- partner is claimed by at most one Supabase user (prevents two different signed-in accounts from
-- silently converging on the same partner later). Never written by the browser — only by the
-- server-side resolution logic in _shared/orders/customerIdentity.ts.
alter table public.profiles add column if not exists odoo_partner_id integer;
create unique index if not exists profiles_odoo_partner_id_key on public.profiles (odoo_partner_id) where odoo_partner_id is not null;

comment on column public.profiles.odoo_partner_id is 'Resolved Odoo res.partner id for this customer — server-resolved only (email-match or created-on-first-order), never client-supplied. See customerIdentity.ts.';

-- ============================================================================
-- 2. Guest checkout support (spec #10-11) — orders.user_id becomes nullable
-- ============================================================================
-- A guest order has no Supabase account at all (anonymous sign-in is disabled on this project's
-- Auth settings and not something this session's tooling can enable — see
-- Documentations MD/odoo-checkout-portal-returns.md). guest_email/guest_name capture enough to
-- send the confirmation email and support a future "claim this order" flow; real commerce identity
-- still lives in Odoo (res.partner), never duplicated here as a second source of truth.
alter table public.orders alter column user_id drop not null;
alter table public.orders add column if not exists guest_email text;
alter table public.orders add column if not exists guest_name text;
alter table public.orders add column if not exists odoo_partner_id integer;

comment on column public.orders.guest_email is 'Set only for orders placed without a signed-in Supabase account (user_id is null). Never used for auth.';
comment on column public.orders.odoo_partner_id is 'The Odoo res.partner this order was placed against — mirrors payment_attempts.checkout_snapshot for convenient querying, Odoo remains authoritative.';

-- Guests can never read the orders RLS-select-own policy governs (no session at all) — the
-- existing `profiles_select_own`-style row check on orders (`auth.uid() = user_id`) already
-- correctly never matches a NULL user_id row for any signed-in customer, so no policy change is
-- needed here. Guest order confirmation is shown from data the server returns directly in the
-- create-order/payment-verify response, never re-fetched via RLS — see Checkout.tsx/
-- OrderConfirmation.tsx.

-- ============================================================================
-- 3. Checkout policy acceptance (spec #35-36)
-- ============================================================================
alter table public.orders add column if not exists policy_version text;
alter table public.orders add column if not exists policy_accepted_at timestamptz;

comment on column public.orders.policy_version is 'The Terms/Returns/Refund policy version string the customer accepted at checkout — see src/lib/policy.ts. Lets policy wording change later without confusing older orders.';

-- ============================================================================
-- 4. Return / exchange requests (spec #40, #45) — a REQUEST record only, never inventory-return
-- truth. Real reverse-transfer/return completion lives in Odoo; this table exists so a customer can
-- submit a request and staff can see/process it, matching the explicit instruction not to fake
-- "Returned"/"Refunded"/"Exchange complete" from Supabase alone.
-- ============================================================================
create type public.return_request_type as enum ('return', 'exchange');
create type public.return_request_status as enum ('requested', 'approved', 'rejected', 'completed');
create type public.return_request_reason as enum ('wrong_item', 'damaged', 'defective', 'does_not_fit', 'no_longer_needed', 'other');

create table public.return_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null, -- nullable: a guest's order can still be returned if they're later identified by order id + contact match (future work) — never required for the request table itself to exist
  order_id uuid not null references public.orders(id) on delete cascade,
  odoo_sale_order_id integer not null,
  odoo_partner_id integer not null,
  odoo_variant_id integer not null,
  odoo_picking_id integer, -- the delivering stock.picking this line was fulfilled by, when known — null until resolved server-side
  quantity integer not null check (quantity > 0),
  type public.return_request_type not null,
  reason public.return_request_reason not null,
  note text,
  desired_replacement_variant_id integer, -- exchange only
  status public.return_request_status not null default 'requested',
  odoo_return_picking_id integer, -- set once staff/an operator creates the real Odoo reverse-transfer for this request — see Known issues in the doc for why this pass doesn't create it automatically
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.return_requests is 'A customer-submitted return/exchange REQUEST — status stays "requested" until an operator creates/confirms the real Odoo return; this table is never the source of truth for inventory-return completion. See Documentations MD/odoo-checkout-portal-returns.md.';

create index return_requests_order_id_idx on public.return_requests (order_id);
create index return_requests_user_id_idx on public.return_requests (user_id) where user_id is not null;

alter table public.return_requests enable row level security;

create policy "return_requests_select_own" on public.return_requests for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "return_requests_select_admin" on public.return_requests for select to authenticated
  using ((select private.has_admin_role(array['owner','admin','support']::public.admin_role[])));

-- No client INSERT/UPDATE policy — every write goes through the return-request Edge Function
-- (service-role), which re-validates ownership/eligibility server-side (spec #31/#42) rather than
-- trusting a browser-submitted quantity/eligibility check. `updated_at` is set explicitly by the
-- writing code on each update (no generic trigger convention exists elsewhere in this schema —
-- payment_attempts/orders already follow this same explicit-set pattern).
