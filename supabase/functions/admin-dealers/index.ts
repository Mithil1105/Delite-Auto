// supabase/functions/admin-dealers/index.ts
//
// POST /functions/v1/admin-dealers   { "action": "dealers.list", "payload": { ... } }
//
// The ONE Edge Function behind the admin "Dealers" section. Authentication/role/MFA reuse the shared
// requireAdmin() helper (which also enforces REQUIRE_ADMIN_MFA server-side); per-action capability
// checks (dealers.manage vs pricing.manage vs orders.*) live in the engine. Every dealer-facing
// rule lives in _shared/dealer/engine.ts. See Documentations MD/dealer-portal.md.

import { requireAdmin } from "../_shared/auth/requireAdmin.ts";
import { buildDeps, errorResponse, jsonResponse, rateLimit, readJsonBody, withHeaders, corsHeaders } from "../_shared/dealer/deps.ts";
import { createDealerEngine } from "../_shared/dealer/engine.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  const requestId = crypto.randomUUID();
  if (req.method !== "POST") return jsonResponse(req, { error: { code: "VALIDATION", message: "Method not allowed" } }, 405, requestId);

  try {
    const auth = await requireAdmin(req, ["owner", "admin", "support", "dealer_manager"]);
    if (auth instanceof Response) return await withHeaders(req, auth, requestId);
    rateLimit(`admin:${auth.user.id}`, 300);

    const { action, payload } = await readJsonBody(req);
    const engine = createDealerEngine(buildDeps(auth.db));
    const result = await engine.callAdmin({ id: auth.user.id, role: auth.adminRole, requestId }, action, payload);
    return jsonResponse(req, result, 200, requestId);
  } catch (err) {
    return errorResponse(req, err, requestId);
  }
});
