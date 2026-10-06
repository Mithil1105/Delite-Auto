// supabase/functions/return-request/index.ts
//
// POST /functions/v1/return-request — authenticated only. Creates a return/exchange REQUEST row
// (never a completed return — see Documentations MD/odoo-checkout-portal-returns.md, "Phase I"
// for why this pass doesn't attempt automated Odoo reverse-transfer creation).
//
// Every eligibility rule is re-verified server-side against LIVE Odoo/Supabase data — the frontend
// check is convenience only (spec #42):
//   1. order belongs to the caller (auth.uid())
//   2. the requested variant was actually a line on that order
//   3. the order's delivery (stock.picking) is state='done' with a real date_done
//   4. today <= date_done + RETURNS_WINDOW_DAYS (spec #31 — delivery date, never order/payment date)
//   5. requested quantity <= delivered quantity minus already-requested quantity for that line
//      (spec #43 — no double-returning more than was ever delivered)
// Any failure returns a clear 4xx — never a fabricated "Requested" confirmation on failure.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getOdooConfig, odooSearchRead } from "../_shared/odoo/client.ts";
import { RETURNS_WINDOW_DAYS } from "../_shared/policy/config.ts";
import { sendReturnRequestReceived } from "../_shared/email/index.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REASONS = new Set(["wrong_item", "damaged", "defective", "does_not_fit", "no_longer_needed", "other"]);

interface Body {
  orderId: string;
  odooVariantId: number;
  quantity: number;
  type: "return" | "exchange";
  reason: string;
  note?: string;
  desiredReplacementVariantId?: number;
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

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  const validationError = validateBody(body);
  if (validationError) return json({ error: validationError }, 400);

  const odooConfig = getOdooConfig();
  if (!odooConfig) return json({ error: "Temporarily unavailable" }, 501);

  // 1. Order ownership.
  const { data: order } = await db
    .from("orders")
    .select("id, user_id, odoo_sale_order_id, odoo_order_name, guest_email")
    .eq("id", body.orderId)
    .maybeSingle();
  if (!order || order.user_id !== user.id || !order.odoo_sale_order_id) return json({ error: "Order not found" }, 404);

  try {
    // 2. The requested variant was actually a line on this order.
    const lines = await odooSearchRead<{ id: number; product_id: [number, string]; product_uom_qty: number }>(
      odooConfig,
      "sale.order.line",
      [["order_id", "=", order.odoo_sale_order_id], ["display_type", "=", false]],
      ["id", "product_id", "product_uom_qty"]
    );
    const line = lines.find((l) => l.product_id[0] === body.odooVariantId);
    if (!line) return json({ error: "That item is not part of this order" }, 400);

    // 3-4. Delivery must be done, with a real date, within the policy window from THAT date.
    const [saleOrder] = await odooSearchRead<{ id: number; picking_ids: number[] }>(odooConfig, "sale.order", [["id", "=", order.odoo_sale_order_id]], ["id", "picking_ids"]);
    if (!saleOrder?.picking_ids?.length) return json({ error: "This order has not been delivered yet" }, 409);

    const pickings = await odooSearchRead<{ id: number; state: string; date_done: string | false }>(
      odooConfig,
      "stock.picking",
      [["id", "in", saleOrder.picking_ids]],
      ["id", "state", "date_done"]
    );
    const delivered = pickings.find((p) => p.state === "done" && p.date_done);
    if (!delivered || !delivered.date_done) return json({ error: "This order has not been delivered yet" }, 409);

    const deliveredAt = new Date(delivered.date_done);
    const deadline = new Date(deliveredAt.getTime() + RETURNS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    if (new Date() > deadline) {
      return json({ error: `The return window (${RETURNS_WINDOW_DAYS} days from delivery) has passed for this order` }, 409);
    }

    // 5. Quantity guard — never allow returning more than was ever delivered, across all
    // non-rejected prior requests for this exact order+variant.
    const { data: priorRequests } = await db
      .from("return_requests")
      .select("quantity, status")
      .eq("order_id", order.id)
      .eq("odoo_variant_id", body.odooVariantId)
      .neq("status", "rejected");
    const alreadyRequested = (priorRequests ?? []).reduce((sum, r) => sum + r.quantity, 0);
    if (alreadyRequested + body.quantity > line.product_uom_qty) {
      return json({ error: `Only ${Math.max(0, line.product_uom_qty - alreadyRequested)} unit(s) of this item remain eligible for return` }, 409);
    }

    // Resolve the customer's partner id for the request row (real, server-derived — not trusted
    // from the client, matching the rest of this phase's identity handling).
    const { data: profile } = await db.from("profiles").select("odoo_partner_id").eq("id", user.id).maybeSingle();
    if (!profile?.odoo_partner_id) return json({ error: "Could not verify your account — please try again" }, 409);

    const { data: inserted, error: insertError } = await db
      .from("return_requests")
      .insert({
        user_id: user.id,
        order_id: order.id,
        odoo_sale_order_id: order.odoo_sale_order_id,
        odoo_partner_id: profile.odoo_partner_id,
        odoo_variant_id: body.odooVariantId,
        odoo_picking_id: delivered.id,
        quantity: body.quantity,
        type: body.type,
        reason: body.reason,
        note: body.note?.slice(0, 1000) || null,
        desired_replacement_variant_id: body.type === "exchange" ? body.desiredReplacementVariantId ?? null : null,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error("[return-request] insert failed", insertError?.message);
      return json({ error: "Could not submit your request — please try again" }, 502);
    }

    // Acknowledgement email — best-effort, never turns a successfully-saved request into an error.
    try {
      const toEmail = user.email ?? order.guest_email ?? "";
      if (toEmail) {
        await sendReturnRequestReceived({ requestId: inserted.id, toEmail, type: body.type, odooOrderName: order.odoo_order_name ?? "", userId: user.id });
      }
    } catch (emailErr) {
      console.error("[return-request] acknowledgement email failed", emailErr instanceof Error ? emailErr.message : emailErr);
    }

    return json({ id: inserted.id, status: "requested" }, 200);
  } catch (err) {
    console.error("[return-request]", err instanceof Error ? err.message : err);
    return json({ error: "Could not submit your request — please try again" }, 502);
  }
});

function validateBody(body: Body): string | null {
  if (!body.orderId?.trim()) return "orderId is required";
  if (!Number.isInteger(body.odooVariantId) || body.odooVariantId <= 0) return "Invalid item";
  if (!Number.isInteger(body.quantity) || body.quantity <= 0 || body.quantity > 100) return "Invalid quantity";
  if (body.type !== "return" && body.type !== "exchange") return "Invalid request type";
  if (!REASONS.has(body.reason)) return "Invalid reason";
  if (body.reason === "other" && !body.note?.trim()) return "Please add a note for 'Other'";
  if (body.type === "exchange" && (!body.desiredReplacementVariantId || !Number.isInteger(body.desiredReplacementVariantId))) {
    return "A replacement variant is required for an exchange";
  }
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
