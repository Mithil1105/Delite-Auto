// supabase/functions/admin-users-manage/index.ts
//
// POST /functions/v1/admin-users-manage — the real Admin Users management surface (replaces the
// /admin/settings/users placeholder). NOT a reuse of admin-bootstrap (#30) — that function was
// built for one-time initial bootstrap and unconditionally sets is_admin: true with no caller
// permission check at all (only an x-internal-token). This function requires a real signed-in
// OWNER session (mirrors the existing route-level restriction — ADMIN_NAV already limits
// /admin/settings/users to `roles: ["owner"]`), verifies it server-side (never trusts a client
// claim), and is the only place that calls Supabase's Admin Auth API for ongoing user management.
// `service_role` never leaves this function.
//
// Actions: list | invite | changeRole | revoke. Every mutating action writes an
// admin_activity_log row. Last-owner protection is enforced at the DATABASE layer (see
// 20260929090000_last_owner_protection.sql's trigger) — this function's own owner-only gate is
// defence in depth, not the only guard.

import { requireAdmin } from "../_shared/auth/requireAdmin.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_ROLES = ["owner", "admin", "content", "merchandising", "support", "analytics"] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

type Body =
  | { action: "list" }
  | { action: "invite"; email: string; fullName: string; role: AdminRole }
  | { action: "changeRole"; userId: string; role: AdminRole }
  | { action: "revoke"; userId: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireAdmin(req, ["owner"]);
  if (auth instanceof Response) return auth;
  const { db, user: caller } = auth;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  try {
    switch (body.action) {
      case "list":
        return json({ users: await listAdmins(db) }, 200);
      case "invite":
        return json(await inviteAdmin(db, caller.id, body), 200);
      case "changeRole":
        return json(await changeRole(db, caller.id, body), 200);
      case "revoke":
        return json(await revokeAdmin(db, caller.id, body), 200);
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    console.error("[admin-users-manage]", err instanceof Error ? err.message : err);
    const message = err instanceof Error ? err.message : "Request failed";
    return json({ error: message }, 502);
  }
});

// deno-lint-ignore no-explicit-any
async function listAdmins(db: any) {
  const { data: profiles } = await db.from("profiles").select("id, full_name, admin_role, is_admin, created_at").not("admin_role", "is", null);
  const rows = [];
  for (const p of profiles ?? []) {
    const { data: userRes } = await db.auth.admin.getUserById(p.id);
    const u = userRes?.user;
    rows.push({
      id: p.id,
      fullName: p.full_name,
      email: u?.email ?? null,
      role: p.admin_role,
      status: p.is_admin ? "active" : "revoked",
      createdAt: p.created_at,
      lastSignInAt: u?.last_sign_in_at ?? null,
      mfaEnabled: Array.isArray(u?.factors) ? u.factors.some((f: { status: string }) => f.status === "verified") : null,
    });
  }
  return rows;
}

// deno-lint-ignore no-explicit-any
async function inviteAdmin(db: any, actorId: string, body: { email: string; fullName: string; role: AdminRole }) {
  if (!body.email?.trim() || !ADMIN_ROLES.includes(body.role)) throw new Error("Email and a valid role are required");

  // Real invitation, not a password handoff — Supabase sends its own invite email; the invited
  // person sets their own password via the link (#29's "prefer an invitation architecture rather
  // than entering another person's password").
  const { data, error } = await db.auth.admin.inviteUserByEmail(body.email.trim(), { data: { full_name: body.fullName || undefined } });
  if (error || !data.user) throw new Error(error?.message ?? "Invite failed");

  await db.from("profiles").upsert({ id: data.user.id, full_name: body.fullName || null, is_admin: true, admin_role: body.role });
  await logActivity(db, actorId, "admin.invited", data.user.id, { email: body.email, role: body.role });
  return { ok: true, userId: data.user.id };
}

// deno-lint-ignore no-explicit-any
async function changeRole(db: any, actorId: string, body: { userId: string; role: AdminRole }) {
  if (!body.userId || !ADMIN_ROLES.includes(body.role)) throw new Error("A user and a valid role are required");
  const { error } = await db.from("profiles").update({ admin_role: body.role, is_admin: true }).eq("id", body.userId);
  if (error) throw new Error(error.message); // surfaces the last-owner-protection trigger's message verbatim if it fires
  await logActivity(db, actorId, "admin.role_changed", body.userId, { role: body.role });
  return { ok: true };
}

// deno-lint-ignore no-explicit-any
async function revokeAdmin(db: any, actorId: string, body: { userId: string }) {
  if (!body.userId) throw new Error("A user is required");
  // Revokes the ADMIN PERMISSION only — never deletes the underlying Supabase account (#33). The
  // account keeps working as an ordinary customer login; only admin_role/is_admin are cleared.
  const { error } = await db.from("profiles").update({ admin_role: null, is_admin: false }).eq("id", body.userId);
  if (error) throw new Error(error.message);
  await logActivity(db, actorId, "admin.access_revoked", body.userId, {});
  return { ok: true };
}

// deno-lint-ignore no-explicit-any
async function logActivity(db: any, actorId: string, action: string, targetId: string, metadata: Record<string, unknown>) {
  await db.from("admin_activity_log").insert({ actor_id: actorId, action, target_type: "profile", target_id: targetId, metadata });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
