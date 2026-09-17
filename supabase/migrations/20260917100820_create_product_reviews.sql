-- product_reviews: real customer reviews against a real Odoo product.template id (never the
-- static placeholder rating/reviewCount previously shown for a handful of mock products only).
-- Moderated: every insert lands as 'pending' (enforced server-side by a trigger, never trusted
-- from the client payload) and only becomes publicly visible once an admin approves it.
-- See Documentations MD/delite-accounts-orders-reviews-admin.md.

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  odoo_template_id integer not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  title text,
  body text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  constraint product_reviews_one_per_user_per_product unique (odoo_template_id, user_id)
);

-- Backs both the PDP's "approved reviews for this product" query and the admin moderation queue's
-- "pending reviews" query.
create index if not exists product_reviews_template_status_idx
  on public.product_reviews (odoo_template_id, status);

create index if not exists product_reviews_user_id_idx on public.product_reviews (user_id);

alter table public.product_reviews enable row level security;

-- Publicly visible (even signed-out) once approved — a review is storefront content, not private
-- data.
create policy "reviews_select_approved"
  on public.product_reviews for select
  to anon, authenticated
  using (status = 'approved');

-- A user can see their own review regardless of its moderation status (e.g. to see it's still
-- pending).
create policy "reviews_select_own"
  on public.product_reviews for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "reviews_select_admin"
  on public.product_reviews for select
  to authenticated
  using ((select private.is_admin()));

create policy "reviews_insert_own"
  on public.product_reviews for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "reviews_update_admin"
  on public.product_reviews for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Forces every insert to 'pending' regardless of what the client sends in the payload — a client
-- can never self-approve by just including status: 'approved' in the insert.
create or replace function private.force_review_pending_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.status := 'pending';
  return new;
end;
$$;

create trigger product_reviews_force_pending
  before insert on public.product_reviews
  for each row
  execute function private.force_review_pending_on_insert();
