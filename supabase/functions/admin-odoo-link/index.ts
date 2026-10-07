// supabase/functions/admin-odoo-link/index.ts
//
// POST /functions/v1/admin-odoo-link { model, id } — requires the CALLER'S OWN session
// (Authorization: Bearer <user access token>, same convention as create-order) AND
// profiles.is_admin = true. Returns the constructed "Open in Odoo" URL for one record —
// ODOO_BASE_URL itself is never returned as its own field, only baked into the final URL, per
// server/odoo/adminLink.ts's original design note. Model is allowlisted (sale.order,
// product.template — the two things /admin currently links out to; product.template added for
// the read-only product browser, never used to edit anything).

import { requireAdmin } from "../_shared/auth/requireAdmin.ts";
import { buildOdooAdminUrl } from "../_shared/odoo/adminLink.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// product.template added for the read-only admin product browser's "Open in Odoo" action (spec:
// this only ever LINKS to Odoo's own record editor, never edits anything from Delite Admin).
const ALLOWED_MODELS = new Set(["sale.order", "product.template"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  // Matches the pages that call this (Orders/Payments/Products) — owner/admin/support.
  const auth = await requireAdmin(req, ["owner", "admin", "support"]);
  if (auth instanceof Response) return auth;

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
