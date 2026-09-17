// supabase/functions/admin-bootstrap/index.ts
//
// POST { email, password, fullName? } — x-internal-token gated (same pattern as odoo-schema/
// odoo-catalog-classify/odoo-write-check: fails closed if INTERNAL_DIAGNOSTICS_TOKEN isn't set).
// Kept as a re-runnable ops tool, not a one-off — the only way to create the FIRST admin (or reset
// an admin's password) without a chicken-and-egg problem, since /admin itself requires an admin to
// already exist.
//
// Creates (or updates) a Supabase Auth user as PRE-CONFIRMED via Supabase's own Admin Auth API
// (service-role — legitimate, documented use, not a workaround) — bypasses the project's email-
// confirmation requirement for THIS specific account without touching that project-wide setting.
// Then sets profiles.is_admin = true.
//
// No credentials are ever hardcoded in this file or logged — email/password are per-call inputs,
// never persisted anywhere but Supabase's own Auth store (which already encrypts passwords at
// rest, same as any normal signup).

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

interface BootstrapBody {
  email?: string;
  password?: string;
  fullName?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const requiredToken = Deno.env.get("INTERNAL_DIAGNOSTICS_TOKEN");
  if (!requiredToken) return json({ error: "Disabled: INTERNAL_DIAGNOSTICS_TOKEN is not set" }, 403);
  if (req.headers.get("x-internal-token") !== requiredToken) return json({ error: "Missing or invalid x-internal-token header" }, 403);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Not configured" }, 500);
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let body: BootstrapBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!body.email || !body.password) return json({ error: "email and password are required" }, 400);
  if (body.password.length < 6) return json({ error: "password must be at least 6 characters" }, 400);

  try {
    // The admin API has no direct get-by-email, so list + filter — makes re-running this
    // idempotent (promote/reset an existing user) instead of erroring on "already exists".
    const { data: existingList, error: listError } = await adminClient.auth.admin.listUsers();
    if (listError) return json({ error: listError.message }, 500);
    const existing = existingList.users.find((u) => u.email?.toLowerCase() === body.email!.toLowerCase());

    let userId: string;
    if (existing) {
      const { data: updated, error: updateError } = await adminClient.auth.admin.updateUserById(existing.id, {
        password: body.password,
        email_confirm: true,
      });
      if (updateError || !updated.user) return json({ error: updateError?.message ?? "Failed to update user" }, 500);
      userId = updated.user.id;
    } else {
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: body.fullName ? { full_name: body.fullName } : undefined,
      });
      if (createError || !created.user) return json({ error: createError?.message ?? "Failed to create user" }, 500);
      userId = created.user.id;
    }

    // profiles is normally auto-created by the handle_new_user trigger on signup — upsert here
    // covers both "just created" (trigger already inserted it) and "promoting an existing user".
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({ id: userId, is_admin: true, full_name: body.fullName ?? null }, { onConflict: "id" });
    if (profileError) return json({ error: profileError.message }, 500);

    return json({ ok: true, userId, email: body.email, isAdmin: true });
  } catch (err) {
    console.error("[admin-bootstrap]", err instanceof Error ? err.message : err);
    return json({ error: "Failed to bootstrap admin user" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
