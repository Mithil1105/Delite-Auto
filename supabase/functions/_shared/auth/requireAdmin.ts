// supabase/functions/_shared/auth/requireAdmin.ts
//
// Shared Edge Function authorization helper — replaces the duplicated inline
// "extract JWT → getUser → load profiles.admin_role → check a role Set" block that used to be
// copy-pasted (with subtly different role sets, and one legacy is_admin-only check) across every
// admin-* function. See Documentations MD/delite-auth-security.md.
//
// Also enforces REQUIRE_ADMIN_MFA server-side — the ONLY previous enforcement was the frontend
// RoleRoute guard, a UX gate, not a security boundary. The policy flag's single source of truth is
// `private.app_config` (a Postgres table, readable here via the service-role client bypassing
// RLS) — the SAME table the RLS-level `private.admin_mfa_satisfied()` helper reads, so the
// frontend, every Edge Function, and RLS itself can never disagree about whether the policy is on.
//
// AAL is read by decoding the JWT payload's `aal` claim locally — every Supabase-issued JWT always
// carries this claim, so this costs no extra network round trip (this is exactly what
// `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` does internally on the client, just applied
// to the JWT already received in this request's Authorization header instead of a second one).
// NEVER trust an `aal` value from anywhere else (e.g. a request body) — only ever the server's own
// decode of the caller's actual JWT.

import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { decodeJwtAal } from "./jwt.ts";

export type AdminRole = "owner" | "admin" | "content" | "merchandising" | "support" | "analytics";

export interface AdminAuthContext {
  db: SupabaseClient;
  user: User;
  adminRole: AdminRole;
  aal: "aal1" | "aal2" | null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * Validates the caller's session, checks their `admin_role` against `allowedRoles`, and — when
 * `REQUIRE_ADMIN_MFA` is on — rejects any session not currently at AAL2. Returns a ready-to-return
 * `Response` on any failure (401/403), or the resolved auth context on success — callers should
 * check `instanceof Response` and return it verbatim.
 */
export async function requireAdmin(req: Request, allowedRoles: AdminRole[]): Promise<AdminAuthContext | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Admin service not configured" }, 500);
  const db = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await db.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: "Invalid or expired session — please sign in again" }, 401);
  const user = userData.user;

  const { data: profile } = await db.from("profiles").select("admin_role").eq("id", user.id).maybeSingle();
  const adminRole = (profile?.admin_role as AdminRole | null | undefined) ?? null;
  if (!adminRole || !allowedRoles.includes(adminRole)) return json({ error: "Forbidden" }, 403);

  const aal = decodeJwtAal(jwt);

  const { data: configRow } = await db.schema("private").from("app_config").select("value").eq("key", "require_admin_mfa").maybeSingle();
  const mfaRequired = configRow?.value === "true";
  if (mfaRequired && aal !== "aal2") {
    return json({ error: "Two-factor authentication is required for this action", code: "mfa_required" }, 403);
  }

  return { db, user, adminRole, aal };
}
