// supabase/functions/dealer-portal/index.ts
//
// POST /functions/v1/dealer-portal   { "action": "catalog.list", "payload": { ... } }
//
// The ONE Edge Function behind dealers.deliteauto.com. The dealer is derived from the caller's
// verified Supabase session via `dealer_users` — a `dealerId` in the payload is never read. A signed-in
// consumer or admin account with no dealer_users row gets 403 (and a security.denied audit entry).
// Responses are `private, no-store` and CORS is an explicit origin allow-list: contract prices are
// never cacheable by a shared cache. See Documentations MD/dealer-portal.md.

import { adminClient, buildDeps, corsHeaders, errorResponse, jsonResponse, rateLimit, readJsonBody } from "../_shared/dealer/deps.ts";
import { DealerError } from "../_shared/dealer/errors.ts";
import { createDealerEngine } from "../_shared/dealer/engine.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  const requestId = crypto.randomUUID();
  if (req.method !== "POST") return jsonResponse(req, { error: { code: "VALIDATION", message: "Method not allowed" } }, 405, requestId);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new DealerError("UNAUTHENTICATED", "Please sign in");
    const db = adminClient();
    const { data, error } = await db.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (error || !data.user) throw new DealerError("UNAUTHENTICATED", "Your session has expired — please sign in again");
    rateLimit(`dealer:${data.user.id}`, 180);

    const { action, payload } = await readJsonBody(req);
    const engine = createDealerEngine(buildDeps(db));
    const session = await engine.resolveSession(data.user.id, requestId);
    const result = await engine.callDealer(session, action, payload);
    return jsonResponse(req, result, 200, requestId);
  } catch (err) {
    return errorResponse(req, err, requestId);
  }
});
