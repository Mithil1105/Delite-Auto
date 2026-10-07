-- Reconciles the payment_attempts/email_log/orders/product_reviews SELECT (and product_reviews
-- UPDATE) policies from the legacy private.is_admin() boolean check onto the granular
-- private.has_admin_role(...) system, matching the role matrix used everywhere else new (e.g.
-- contact_enquiries) — owner/admin/support all handle payments, orders, and reviews per
-- Documentations MD/delite-admin.md's role matrix. private.is_admin() itself and profiles' own
-- policies are left untouched (profiles access is an owner/admin-user-management concern, out of
-- scope here — see Documentations MD/delite-production-operations.md, "Known limitations").
--
-- Safety backfill first: admin-bootstrap (see supabase/functions/admin-bootstrap) sets only the
-- legacy `is_admin` boolean, never `admin_role` — without this backfill, switching these policies
-- to has_admin_role() would silently lock out any account bootstrapped that way.
update public.profiles set admin_role = 'admin' where is_admin = true and admin_role is null;

drop policy if exists "payment_attempts_select_admin" on public.payment_attempts;
create policy "payment_attempts_select_admin"
  on public.payment_attempts for select
  to authenticated
  using ((select private.has_admin_role(array['owner', 'admin', 'support']::public.admin_role[])));

drop policy if exists "email_log_select_admin" on public.email_log;
create policy "email_log_select_admin"
  on public.email_log for select
  to authenticated
  using ((select private.has_admin_role(array['owner', 'admin', 'support']::public.admin_role[])));

drop policy if exists "orders_select_admin" on public.orders;
create policy "orders_select_admin"
  on public.orders for select
  to authenticated
  using ((select private.has_admin_role(array['owner', 'admin', 'support']::public.admin_role[])));

drop policy if exists "reviews_select_admin" on public.product_reviews;
create policy "reviews_select_admin"
  on public.product_reviews for select
  to authenticated
  using ((select private.has_admin_role(array['owner', 'admin', 'support']::public.admin_role[])));

drop policy if exists "reviews_update_admin" on public.product_reviews;
create policy "reviews_update_admin"
  on public.product_reviews for update
  to authenticated
  using ((select private.has_admin_role(array['owner', 'admin', 'support']::public.admin_role[])))
  with check ((select private.has_admin_role(array['owner', 'admin', 'support']::public.admin_role[])));
