-- Security advisor finding (get_advisors, run right after the profiles/orders/product_reviews
-- migrations): public.handle_new_user() is a trigger function, only ever meant to be invoked by
-- the on_auth_user_created trigger — but living in the `public` schema means PostgREST
-- auto-exposes it as a callable RPC endpoint (`/rest/v1/rpc/handle_new_user`) to anon/authenticated
-- by default. A trigger function has no useful standalone behavior when called directly (NEW/OLD
-- aren't set outside a real trigger firing), so this isn't exploitable today, but the advisor is
-- right that it shouldn't be reachable at all. Revoking direct EXECUTE does not affect the
-- trigger itself (trigger firing doesn't go through role-based EXECUTE grants the way an RPC call
-- does).
--
-- public.rls_auto_enable() (the other advisor finding) is a pre-existing, Supabase-platform-
-- managed event trigger function on this project, not something this codebase created — left
-- untouched.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
