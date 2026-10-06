-- MFA backend hardening — see Documentations MD/delite-auth-security.md. The REQUIRE_ADMIN_MFA
-- policy added previously was enforced only in the frontend route guard (RoleRoute), which is a
-- UX gate, not a real security boundary: a stolen AAL1 token could still call privileged Edge
-- Functions or write directly to RLS-protected tables. This migration makes the policy flag a
-- single Postgres-backed source of truth (replacing the env-var-only mechanism, which RLS could
-- never read) and adds real RLS-level enforcement for the handful of tables still written
-- directly by the client rather than through a service-role Edge Function.
--
-- Off by default (`false`) — zero behavior change until a deliberate manual flip. Never enabled
-- automatically by this migration.

create table private.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

comment on table private.app_config is 'Small server-side config store, e.g. require_admin_mfa. Not exposed via the API (private schema) — read only by SECURITY DEFINER helpers and the service-role Edge Function client. Toggling is a deliberate manual SQL step, not a UI, on purpose.';

insert into private.app_config (key, value) values ('require_admin_mfa', 'false');

-- SECURITY DEFINER so it can read private.app_config regardless of caller; STABLE so it can be
-- used cheaply inside an RLS policy (evaluated once per statement, not once per row, per
-- Postgres's own stable-function RLS optimization).
create or replace function private.admin_mfa_satisfied()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when (select value from private.app_config where key = 'require_admin_mfa') is distinct from 'true' then true
    else coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
  end;
$$;

revoke execute on function private.admin_mfa_satisfied() from public, anon;
grant execute on function private.admin_mfa_satisfied() to authenticated;

-- Additive: AND the existing role check with the MFA check on every policy that lets an admin
-- write DIRECTLY (not through a service-role Edge Function) — cms_section_drafts, cms_media,
-- cms_promotions, product_reviews moderation, contact_enquiries status. Never replaces the role
-- check, never touches any SELECT-only policy, never touches tables already service-role-only
-- (payment_attempts, email_log, orders — those are hardened at the Edge Function layer instead,
-- see the new _shared/auth/requireAdmin.ts helper).

drop policy if exists "cms_section_drafts_write_content" on public.cms_section_drafts;
create policy "cms_section_drafts_write_content" on public.cms_section_drafts for all to authenticated
  using ((select private.has_admin_role(array['owner','admin','content']::public.admin_role[])) and (select private.admin_mfa_satisfied()))
  with check ((select private.has_admin_role(array['owner','admin','content']::public.admin_role[])) and (select private.admin_mfa_satisfied()));

drop policy if exists "cms_media_write_content" on public.cms_media;
create policy "cms_media_write_content" on public.cms_media for all to authenticated
  using ((select private.has_admin_role(array['owner','admin','content']::public.admin_role[])) and (select private.admin_mfa_satisfied()))
  with check ((select private.has_admin_role(array['owner','admin','content']::public.admin_role[])) and (select private.admin_mfa_satisfied()));

drop policy if exists "cms_promotions_write_content" on public.cms_promotions;
create policy "cms_promotions_write_content" on public.cms_promotions for all to authenticated
  using ((select private.has_admin_role(array['owner','admin','content']::public.admin_role[])) and (select private.admin_mfa_satisfied()))
  with check ((select private.has_admin_role(array['owner','admin','content']::public.admin_role[])) and (select private.admin_mfa_satisfied()));

drop policy if exists "reviews_update_admin" on public.product_reviews;
create policy "reviews_update_admin" on public.product_reviews for update to authenticated
  using ((select private.has_admin_role(array['owner','admin','support']::public.admin_role[])) and (select private.admin_mfa_satisfied()))
  with check ((select private.has_admin_role(array['owner','admin','support']::public.admin_role[])) and (select private.admin_mfa_satisfied()));

drop policy if exists "contact_enquiries_update_admin" on public.contact_enquiries;
create policy "contact_enquiries_update_admin" on public.contact_enquiries for update to authenticated
  using ((select private.has_admin_role(array['owner','admin','support']::public.admin_role[])) and (select private.admin_mfa_satisfied()))
  with check ((select private.has_admin_role(array['owner','admin','support']::public.admin_role[])) and (select private.admin_mfa_satisfied()));
