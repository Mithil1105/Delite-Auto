// supabase/functions/customer-orders/index.ts
//
// POST /functions/v1/customer-orders — authenticated only, no arbitrary partner/customer id
// accepted from the browser (spec #24). auth.uid() -> profiles.odoo_partner_id -> Odoo sale.order
// for that partner. Returns a MERGED list: orders this app itself placed (fast path, direct
// Supabase read) plus any OTHER real Odoo orders under the same partner placed before this
// customer had a React account (spec #50 — "My Orders may include legacy Odoo orders. That is
// useful.") — deduped by odoo_sale_order_id so nothing appears twice.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getOdooConfig, odooSearchRead } from "../_shared/odoo/client.ts";

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
  if (userError || !userData.user) return json({ error: "Invalid or expired session — please sign in again" }, 401);
  const user = userData.user;

  const { data: ownOrders } = await db
    .from("orders")
    .select("id, odoo_sale_order_id, odoo_order_name, status, subtotal, payment_method, payment_status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const known = ownOrders ?? [];
  const knownOdooIds = new Set(known.filter((o) => o.odoo_sale_order_id).map((o) => o.odoo_sale_order_id as number));

  const merged = known.map((o) => ({
    source: "delite" as const,
    id: o.id,
    odooSaleOrderId: o.odoo_sale_order_id,
    odooOrderName: o.odoo_order_name,
    status: o.status,
    total: o.subtotal,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    date: o.created_at,
  }));

  // Legacy Odoo orders — only attempted when a mapping exists; never blocks the response if Odoo
  // is briefly unreachable (spec #63's "don't break the page" principle applies to reads too).
  const { data: profile } = await db.from("profiles").select("odoo_partner_id").eq("id", user.id).maybeSingle();
  if (profile?.odoo_partner_id) {
    const odooConfig = getOdooConfig();
    if (odooConfig) {
      try {
        const legacy = await odooSearchRead<{ id: number; name: string; amount_total: number; state: string; date_order: string }>(
          odooConfig,
          "sale.order",
          [["partner_id", "=", profile.odoo_partner_id], ["id", "not in", knownOdooIds.size > 0 ? Array.from(knownOdooIds) : [0]]],
          ["id", "name", "amount_total", "state", "date_order"],
          { limit: 50, order: "date_order desc" }
        );
        for (const o of legacy) {
          merged.push({
            source: "legacy" as const,
            // No Delite-tracked payment record exists for a legacy order — payment authority for
            // these belongs to whatever the original Odoo-side checkout used (spec #48/#51), never
            // routed through this app's Razorpay integration.
            id: null,
            odooSaleOrderId: o.id,
            odooOrderName: o.name,
            status: mapSaleOrderState(o.state),
            total: o.amount_total,
            paymentMethod: null,
            paymentStatus: null,
            date: o.date_order,
          } as unknown as (typeof merged)[number]);
        }
      } catch (err) {
        console.error("[customer-orders] legacy Odoo fetch failed (non-fatal)", err instanceof Error ? err.message : err);
      }
    }
  }

  merged.sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
  return json({ orders: merged });
});

/** sale.order.state -> a customer-friendly word, only for values this Odoo instance's own
 * selection field actually defines (draft/sent/sale/done/cancel — standard Odoo core states,
 * verified via this project's odoo-schema introspection of sale.order). Never invents a status. */
function mapSaleOrderState(state: string): string {
  switch (state) {
    case "draft":
    case "sent":
      return "quotation";
    case "sale":
      return "placed";
    case "done":
      return "completed";
    case "cancel":
      return "cancelled";
    default:
      return state;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
