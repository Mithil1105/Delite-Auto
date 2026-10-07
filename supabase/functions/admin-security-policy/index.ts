// supabase/functions/admin-security-policy/index.ts
//
// POST /functions/v1/admin-security-policy — returns { requireAdminMfa }, an explicit
// server-side config flag (default false/unset), never inferred. See
// Documentations MD/delite-auth-security.md: MFA itself stays optional-by-default; this is only
// the foundation for a deliberate decision to make it mandatory for admin routes. NOT turned on by
// this pass. No admin-role check — the value itself isn't sensitive, and a non-admin session may
// need it too (RoleRoute reads it before it knows whether the account is even an admin yet).
//
// Reads the single Postgres-backed source of truth (`private.app_config`) — the SAME table
// `private.admin_mfa_satisfied()` (RLS) and `_shared/auth/requireAdmin.ts` (every admin Edge
// Function) read, so the frontend's displayed policy can never drift from what's actually
// enforced. This used to read Deno.env.get("REQUIRE_ADMIN_MFA") — that mechanism is retired.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Not configured" }, 500);
  const db = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await db.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: "Invalid or expired session" }, 401);

  const { data: configRow } = await db.schema("private").from("app_config").select("value").eq("key", "require_admin_mfa").maybeSingle();
  return json({ requireAdminMfa: configRow?.value === "true" }, 200);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
