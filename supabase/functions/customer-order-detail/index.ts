// supabase/functions/customer-order-detail/index.ts
//
// POST /functions/v1/customer-order-detail { orderId? , odooSaleOrderId? } — authenticated only.
// Ownership is ALWAYS re-verified server-side before returning anything (spec #16/#26/#73):
//   - orderId (a Delite-tracked order): must belong to auth.uid().
//   - odooSaleOrderId (a legacy order with no Delite row): the underlying sale.order's partner_id
//     must equal the caller's own mapped profiles.odoo_partner_id.
// Any mismatch returns 404 — never a 403 that confirms the id exists, never any order data.
//
// Returns lines/variant ids/historical unit price, address, payment state (Delite-tracked orders
// only — spec #51: never invent payment state for a legacy order this app never processed),
// real sale.order/stock.picking state, and tracking when a real carrier record has one.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getOdooConfig, odooSearchRead, type OdooConfig } from "../_shared/odoo/client.ts";
import { RETURNS_WINDOW_DAYS } from "../_shared/policy/config.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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

  let body: { orderId?: string; odooSaleOrderId?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const odooConfig = getOdooConfig();
  if (!odooConfig) return json({ error: "Temporarily unavailable" }, 501);

  let delitOrder: {
    id: string;
    odoo_sale_order_id: number | null;
    payment_method: string;
    payment_status: string;
    policy_version: string | null;
    policy_accepted_at: string | null;
  } | null = null;

  let odooSaleOrderId: number | null = null;

  if (body.orderId) {
    const { data } = await db
      .from("orders")
      .select("id, user_id, odoo_sale_order_id, payment_method, payment_status, policy_version, policy_accepted_at")
      .eq("id", body.orderId)
      .maybeSingle();
    // Ownership check — a mismatched or missing row both 404, identically, so an attacker probing
    // ids can't distinguish "doesn't exist" from "exists but isn't yours" (spec #73).
    if (!data || data.user_id !== user.id) return json({ error: "Order not found" }, 404);
    delitOrder = data;
    odooSaleOrderId = data.odoo_sale_order_id;
  } else if (body.odooSaleOrderId && Number.isInteger(body.odooSaleOrderId)) {
    const { data: profile } = await db.from("profiles").select("odoo_partner_id").eq("id", user.id).maybeSingle();
    if (!profile?.odoo_partner_id) return json({ error: "Order not found" }, 404);
    const [order] = await odooSearchRead<{ id: number; partner_id: [number, string] }>(
      odooConfig,
      "sale.order",
      [["id", "=", body.odooSaleOrderId]],
      ["id", "partner_id"]
    );
    if (!order || order.partner_id?.[0] !== profile.odoo_partner_id) return json({ error: "Order not found" }, 404);
    odooSaleOrderId = order.id;
  } else {
    return json({ error: "orderId or odooSaleOrderId is required" }, 400);
  }

  try {
    const [saleOrder] = await odooSearchRead<{
      id: number;
      name: string;
      state: string;
      amount_total: number;
      amount_tax: number;
      date_order: string;
      partner_shipping_id: [number, number] | false;
      partner_invoice_id: [number, number] | false;
      picking_ids: number[];
      invoice_ids: number[];
    }>(
      odooConfig,
      "sale.order",
      [["id", "=", odooSaleOrderId]],
      ["id", "name", "state", "amount_total", "amount_tax", "date_order", "partner_shipping_id", "partner_invoice_id", "picking_ids", "invoice_ids"]
    );
    if (!saleOrder) return json({ error: "Order not found" }, 404);
    await sleep(250);

    const lines = await odooSearchRead<{ id: number; product_id: [number, string]; product_uom_qty: number; price_unit: number; price_subtotal: number }>(
      odooConfig,
      "sale.order.line",
      [["order_id", "=", saleOrder.id], ["display_type", "=", false]],
      ["id", "product_id", "product_uom_qty", "price_unit", "price_subtotal"]
    );
    await sleep(250);

    let shippingAddress: { line1: string; line2: string } | null = null;
    if (saleOrder.partner_shipping_id) {
      const [addr] = await odooSearchRead<{ id: number; street: string | false; street2: string | false }>(
        odooConfig,
        "res.partner",
        [["id", "=", saleOrder.partner_shipping_id[0]]],
        ["id", "street", "street2"]
      );
      if (addr?.street) shippingAddress = { line1: addr.street, line2: addr.street2 || "" };
      await sleep(250);
    }

    const delivery = await resolveDelivery(odooConfig, saleOrder.picking_ids);

    // Return eligibility (spec #24/#31/#42 mirrored here for display — the real enforcement lives
    // server-side in return-request/index.ts, this is convenience data only, never trusted back).
    let returnEligible = false;
    let returnDeadline: string | null = null;
    if (delivery?.state === "done" && delivery.doneAt) {
      const deadline = new Date(new Date(delivery.doneAt).getTime() + RETURNS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      returnDeadline = deadline.toISOString();
      returnEligible = new Date() <= deadline;
    }

    // Already-requested quantity per line, so the UI can show real remaining-returnable counts
    // instead of just the original ordered quantity.
    let alreadyRequestedByVariant = new Map<number, number>();
    if (delitOrder) {
      const { data: priorRequests } = await db.from("return_requests").select("odoo_variant_id, quantity, status").eq("order_id", delitOrder.id).neq("status", "rejected");
      alreadyRequestedByVariant = new Map();
      for (const r of priorRequests ?? []) {
        alreadyRequestedByVariant.set(r.odoo_variant_id, (alreadyRequestedByVariant.get(r.odoo_variant_id) ?? 0) + r.quantity);
      }
    }

    return json({
      source: delitOrder ? "delite" : "legacy",
      odooOrderName: saleOrder.name,
      odooState: saleOrder.state,
      date: saleOrder.date_order,
      total: saleOrder.amount_total,
      tax: saleOrder.amount_tax,
      lines: lines.map((l) => ({
        odooVariantId: l.product_id[0],
        name: l.product_id[1],
        quantity: l.product_uom_qty,
        unitPrice: l.price_unit,
        subtotal: l.price_subtotal,
        alreadyRequestedQty: alreadyRequestedByVariant.get(l.product_id[0]) ?? 0,
      })),
      shippingAddress,
      hasInvoice: (saleOrder.invoice_ids?.length ?? 0) > 0,
      delivery,
      returnEligible: returnEligible && !!delitOrder, // legacy orders' returns are out of scope this pass — see doc
      returnDeadline,
      // Payment state only for orders this app itself processed — never fabricated for a legacy
      // Odoo order whose payment lived in a different system entirely (spec #48/#51).
      payment: delitOrder ? { method: delitOrder.payment_method, status: delitOrder.payment_status } : null,
      policy: delitOrder ? { version: delitOrder.policy_version, acceptedAt: delitOrder.policy_accepted_at } : null,
    });
  } catch (err) {
    console.error("[customer-order-detail]", err instanceof Error ? err.message : err);
    return json({ error: "Could not load order details — please try again" }, 502);
  }
});

/** Real delivery state only — never a fabricated Processing/Shipped/Delivered unless the
 * underlying stock.picking record actually supports it (spec #29-30). Returns the most advanced
 * (highest-priority) picking when more than one exists for this order. */
async function resolveDelivery(odooConfig: OdooConfig, pickingIds: number[]): Promise<{
  state: string | null;
  doneAt: string | null;
  trackingRef: string | null;
  trackingUrl: string | null;
} | null> {
  if (!pickingIds || pickingIds.length === 0) return null;
  try {
    const pickings = await odooSearchRead<{ id: number; state: string; date_done: string | false; carrier_tracking_ref: string | false; carrier_tracking_url: string | false }>(
      odooConfig,
      "stock.picking",
      [["id", "in", pickingIds]],
      ["id", "state", "date_done", "carrier_tracking_ref", "carrier_tracking_url"]
    );
    if (pickings.length === 0) return null;
    // Priority: a "done" picking (real delivery/dispatch completion) wins over an earlier-stage
    // one, so the customer sees their most advanced real status rather than an arbitrary picking.
    const priority = ["done", "assigned", "confirmed", "waiting", "draft", "cancel"];
    const best = pickings.sort((a, b) => priority.indexOf(a.state) - priority.indexOf(b.state))[0];
    return {
      state: best.state,
      doneAt: best.date_done || null,
      trackingRef: best.carrier_tracking_ref || null,
      trackingUrl: best.carrier_tracking_url || null,
    };
  } catch (err) {
    console.error("[customer-order-detail] delivery resolution failed (non-fatal)", err instanceof Error ? err.message : err);
    return null;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
