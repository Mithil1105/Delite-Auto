// supabase/functions/admin-odoo-link/index.ts
//
// POST /functions/v1/admin-odoo-link { model, id } — requires the CALLER'S OWN session
// (Authorization: Bearer <user access token>, same convention as create-order) AND
// profiles.is_admin = true. Returns the constructed "Open in Odoo" URL for one record —
// ODOO_BASE_URL itself is never returned as its own field, only baked into the final URL, per
// server/odoo/adminLink.ts's original design note. Model is allowlisted (sale.order only, for
// now — the one thing /admin currently links out to).

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildOdooAdminUrl } from "../_shared/odoo/adminLink.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_MODELS = new Set(["sale.order"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Not configured" }, 500);
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await adminClient.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: "Invalid or expired session" }, 401);

  const { data: profile } = await adminClient.from("profiles").select("is_admin").eq("id", userData.user.id).maybeSingle();
  if (!profile?.is_admin) return json({ error: "Forbidden" }, 403);

  let body: { model?: string; id?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  const { model, id } = body;

  if (!model || !ALLOWED_MODELS.has(model)) return json({ error: "Unsupported model" }, 400);
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return json({ error: "Invalid id" }, 400);

  const baseUrl = Deno.env.get("ODOO_BASE_URL");
  if (!baseUrl) return json({ error: "Odoo not configured" }, 501);

  return json({ url: buildOdooAdminUrl(baseUrl, model, id) });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
