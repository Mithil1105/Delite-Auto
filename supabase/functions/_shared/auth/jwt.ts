// supabase/functions/_shared/auth/jwt.ts
//
// Deliberately dependency-free (no `Deno.*`, no `npm:` specifier) — the one piece of
// `requireAdmin.ts`'s logic that's pure enough to unit-test with plain Vitest from outside the
// Deno runtime, which is otherwise untested in this repo (see
// Documentations MD/delite-production-operations.md, "Deno edge functions have no automated test
// coverage" — this is the lightweight seam that assessment asked for, not a full harness: the
// surrounding auth/DB/role-lookup logic in requireAdmin.ts still isn't independently testable
// without a real or mocked Postgres + Supabase Auth, which stays covered by manual trace + the
// live support-role Playwright suite instead).
//
// Every Supabase-issued JWT carries an `aal` claim once MFA exists on the project — decoding it
// locally from the request's own Authorization header costs no extra network round trip, and is
// exactly what `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` does internally on the client.

export function decodeJwtAal(jwt: string): "aal1" | "aal2" | null {
  try {
    const payload = jwt.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(base64)) as { aal?: string };
    return decoded.aal === "aal1" || decoded.aal === "aal2" ? decoded.aal : null;
  } catch {
    return null;
  }
}
