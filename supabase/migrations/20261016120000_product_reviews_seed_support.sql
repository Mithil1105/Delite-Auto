-- Seed/demo review support. See Documentations MD/seed-demo-reviews.md.
--
-- 1. rating becomes numeric(2,1) restricted to half-star steps (1, 1.5 ... 5) so a 3.5-star review
--    can be stored. Real customer submissions still send whole numbers (the form is unchanged).
-- 2. user_id becomes nullable: seeded demo reviews have no backing auth.users account. The
--    existing unique (odoo_template_id, user_id) constraint keeps working because NULLs are
--    distinct, and every join to auth.users/profiles in the admin RPCs is already a left join.
-- 3. is_seed flags demo rows so they can be removed in one statement:
--      delete from public.product_reviews where is_seed;

alter table public.product_reviews
  drop constraint if exists product_reviews_rating_check;

alter table public.product_reviews
  alter column rating type numeric(2,1) using rating::numeric(2,1);

alter table public.product_reviews
  add constraint product_reviews_rating_check
  check (rating between 1 and 5 and (rating * 2) = trunc(rating * 2));

alter table public.product_reviews
  alter column user_id drop not null;

alter table public.product_reviews
  add column if not exists is_seed boolean not null default false;

create index if not exists product_reviews_is_seed_idx
  on public.product_reviews (is_seed) where is_seed;
