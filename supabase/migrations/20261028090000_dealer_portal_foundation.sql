-- Dealer portal (B2B) — Phase 1 foundation. See Documentations MD/dealer-portal.md.
--
-- Every table here is reachable ONLY through the `admin-dealers` / `dealer-portal` Edge Functions
-- (service-role client). RLS is enabled with NO policies for anon/authenticated, and table
-- privileges are revoked as well, so a consumer or dealer JWT can never read or write these tables
-- directly — the dealer identity always comes from `dealer_users`, never from a request parameter.
-- Purely additive: no existing table, function or policy is touched.

create extension if not exists btree_gist with schema extensions;

create table public.dealers (
  id uuid primary key default gen_random_uuid(),
  dealer_code text not null unique,
  legal_name text not null,
  display_name text not null,
  contact_name text,
  contact_email text not null,
  contact_phone text,
  gstin text,
  billing_address jsonb not null default '{}'::jsonb,
  shipping_address jsonb not null default '{}'::jsonb,
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'draft' check (status in ('draft', 'invited', 'active', 'suspended', 'archived')),
  linked_odoo_partner_id integer,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dealers_status_idx on public.dealers (status);

create table public.dealer_users (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  -- one dealer per auth user in v1 (unique); the table shape allows several users per dealer later.
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'owner' check (role in ('owner')),
  status text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  invited_at timestamptz not null default now(),
  last_login_at timestamptz
);
create index dealer_users_dealer_idx on public.dealer_users (dealer_id);

create table public.dealer_branding (
  dealer_id uuid primary key references public.dealers (id) on delete cascade,
  logo_path text,
  cover_path text,
  accent_color text not null default '#10148F' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  tagline text,
  welcome_text text,
  -- Dealers never see public comparison prices unless an admin opts in (spec §7).
  show_public_price boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Entitlement ("may this dealer see/buy this exact variant?") — default deny: no row = invisible.
create table public.dealer_product_access (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  odoo_template_id integer not null,
  odoo_variant_id integer not null,
  sku text,
  product_name text not null,
  is_visible boolean not null default true,
  is_orderable boolean not null default true,
  minimum_quantity integer not null default 1 check (minimum_quantity >= 1),
  quantity_multiple integer not null default 1 check (quantity_multiple >= 1),
  featured_rank integer,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (dealer_id, odoo_variant_id)
);
create index dealer_product_access_dealer_idx on public.dealer_product_access (dealer_id);

-- Negotiated price ("what does this dealer pay?") — deliberately separate from entitlement.
-- Money is integer paise. Overlapping ACTIVE windows for one dealer+variant are rejected by the
-- exclusion constraint below (spec §7: reject conflicts in v1).
create table public.dealer_price_rules (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  odoo_variant_id integer not null,
  unit_price_paise bigint not null check (unit_price_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  tax_basis text not null default 'exclusive' check (tax_basis in ('exclusive', 'inclusive')),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'active', 'expired')),
  deal_note text,
  version integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint dealer_price_rules_no_overlap exclude using gist (
    dealer_id with =,
    odoo_variant_id with =,
    tstzrange(coalesce(starts_at, '-infinity'::timestamptz), coalesce(ends_at, 'infinity'::timestamptz)) with &&
  ) where (status = 'active')
);
create index dealer_price_rules_lookup_idx on public.dealer_price_rules (dealer_id, odoo_variant_id, status);

-- Append-only audit trail (spec FR-12). Never stores passwords, tokens or payment details.
create table public.dealer_audit_log (
  id bigint generated always as identity primary key,
  dealer_id uuid references public.dealers (id) on delete set null,
  actor_type text not null check (actor_type in ('admin', 'dealer', 'system')),
  actor_id uuid,
  event_type text not null,
  entity text,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  request_id text,
  created_at timestamptz not null default now()
);
create index dealer_audit_log_dealer_idx on public.dealer_audit_log (dealer_id, created_at desc);

create or replace function public.dealer_audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'dealer_audit_log is append-only';
end;
$$;

create trigger dealer_audit_log_no_update
  before update or delete on public.dealer_audit_log
  for each row execute function public.dealer_audit_log_immutable();

-- Atomically applies a publish plan computed (and unit-tested) in TypeScript
-- (_shared/dealer/pricing.ts planPublish): expire the superseded active rules, activate the drafts.
-- The exclusion constraint above is the final backstop against any overlap the planner missed.
create or replace function public.dealer_apply_price_plan(p_dealer_id uuid, p_plan jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  r jsonb;
  plan_at timestamptz := (p_plan ->> 'at')::timestamptz;
begin
  update public.dealer_price_rules
     set status = 'expired', ends_at = plan_at, updated_at = now(), version = version + 1
   where dealer_id = p_dealer_id
     and status = 'active'
     and id in (select (jsonb_array_elements_text(p_plan -> 'expireIds'))::uuid);

  for r in select * from jsonb_array_elements(coalesce(p_plan -> 'activate', '[]'::jsonb)) loop
    update public.dealer_price_rules
       set status = 'active',
           starts_at = nullif(r ->> 'startsAt', '')::timestamptz,
           ends_at = nullif(r ->> 'endsAt', '')::timestamptz,
           updated_at = now(),
           version = version + 1
     where id = (r ->> 'id')::uuid and dealer_id = p_dealer_id and status = 'draft';
  end loop;
end;
$$;

revoke execute on function public.dealer_apply_price_plan(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.dealer_audit_log_immutable() from public, anon, authenticated;

alter table public.dealers enable row level security;
alter table public.dealer_users enable row level security;
alter table public.dealer_branding enable row level security;
alter table public.dealer_product_access enable row level security;
alter table public.dealer_price_rules enable row level security;
alter table public.dealer_audit_log enable row level security;

revoke all on public.dealers, public.dealer_users, public.dealer_branding, public.dealer_product_access,
  public.dealer_price_rules, public.dealer_audit_log from anon, authenticated;
