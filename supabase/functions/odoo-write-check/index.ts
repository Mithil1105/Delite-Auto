// supabase/functions/odoo-write-check/index.ts
//
// One-off (kept as a re-runnable diagnostic) permission check for the real order-placement flow.
// Every Edge Function before this one has been read-only. Before create-order depends on write
// access, this confirms the Odoo API user can actually `create` on res.partner and sale.order —
// via Odoo's own non-mutating check_access_rights, never an actual test write. Protected the same
// way as odoo-schema/odoo-catalog-classify (x-internal-token, fails closed). Never returns secrets.

import { getOdooConfig, odooCheckAccessRights } from "../_shared/odoo/client.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const requiredToken = Deno.env.get("INTERNAL_DIAGNOSTICS_TOKEN");
  if (!requiredToken) return json({ error: "Diagnostics disabled: INTERNAL_DIAGNOSTICS_TOKEN is not set" }, 403);
  if (req.headers.get("x-internal-token") !== requiredToken) return json({ error: "Missing or invalid x-internal-token header" }, 403);

  const config = getOdooConfig();
  if (!config) return json({ configured: false });

  try {
    // Sequential, not Promise.all — this Odoo instance rate-limits (HTTP 429) under concurrent
    // RPC load, the same issue documented and fixed the same way in odoo-schema/
    // odoo-catalog-classify/catalog-products.
    const partnerCreate = await odooCheckAccessRights(config, "res.partner", "create");
    await sleep(300);
    const partnerWrite = await odooCheckAccessRights(config, "res.partner", "write");
    await sleep(300);
    const saleOrderCreate = await odooCheckAccessRights(config, "sale.order", "create");
    await sleep(300);
    const saleOrderLineCreate = await odooCheckAccessRights(config, "sale.order.line", "create");
    return json({
      configured: true,
      "res.partner": { create: partnerCreate, write: partnerWrite },
      "sale.order": { create: saleOrderCreate },
      "sale.order.line": { create: saleOrderLineCreate },
      canPlaceRealOrders: partnerCreate && partnerWrite && saleOrderCreate && saleOrderLineCreate,
    });
  } catch (err) {
    return json({ configured: true, error: err instanceof Error ? err.message : "Write-check failed" }, 500);
  }
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
