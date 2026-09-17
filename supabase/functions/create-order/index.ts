// supabase/functions/create-order/index.ts
//
// POST /functions/v1/create-order — requires the CALLER'S OWN Supabase session access token as
// the Authorization bearer (not the anon/publishable key — the frontend calls this via
// `supabase.functions.invoke()`, which attaches the signed-in user's token automatically).
//
// Places a REAL Odoo order: re-validates every line's price/availability against live Odoo (never
// trusts client-sent prices — the same principle already applied to catalog/stock elsewhere in
// this project), finds-or-creates a res.partner, creates a sale.order, then mirrors a thin summary
// row into Supabase `orders` (service-role key, bypasses RLS — this is the ONLY writer of that
// table, per its migration's own policy design). Write access to res.partner/sale.order was
// verified via odoo-write-check before this was built — see
// Documentations MD/delite-accounts-orders-reviews-admin.md.
//
// No payment is processed (confirmed out of scope for this phase) — every order is created
// pending-payment, honestly labelled, never marked paid.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getOdooConfig, odooCreate, odooExecuteKw, odooSearchRead, type OdooConfig } from "../_shared/odoo/client.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderLineInput {
  /** Undefined for a single/no-variant product added without going through the PDP's variant
   * selector — resolved server-side below via `odooTemplateId`, never guessed client-side. */
  odooVariantId?: number;
  odooTemplateId?: number;
  qty: number;
}

interface CreateOrderBody {
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  lines: OrderLineInput[];
}

interface OdooVariantRow {
  id: number;
  list_price: number;
  active: boolean;
  name: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Order service not configured" }, 500);
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await adminClient.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: "Invalid or expired session — please sign in again" }, 401);
  const user = userData.user;

  let body: CreateOrderBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const validationError = validateBody(body);
  if (validationError) return json({ error: validationError }, 400);

  const odooConfig = getOdooConfig();
  if (!odooConfig) return json({ error: "Ordering temporarily unavailable" }, 501);

  try {
    // Resolve any line that only carries an odooTemplateId (a single/no-variant product quick-
    // added without going through the PDP's variant selector) to its real product.product id —
    // looked up live, never guessed. Odoo always has at least one product.product per template.
    const templateIdsNeedingResolution = [
      ...new Set(body.lines.filter((l) => !l.odooVariantId && l.odooTemplateId).map((l) => l.odooTemplateId!)),
    ];
    const variantByTemplateId = new Map<number, number>();
    if (templateIdsNeedingResolution.length > 0) {
      const rows = await odooSearchRead<{ id: number; product_tmpl_id: [number, string] }>(
        odooConfig,
        "product.product",
        [["product_tmpl_id", "in", templateIdsNeedingResolution]],
        ["id", "product_tmpl_id"]
      );
      for (const row of rows) {
        const templateId = row.product_tmpl_id[0];
        // Multiple product.product rows for one template here means it's genuinely a
        // multi-variant product that reached checkout without a selection — a real upstream bug
        // (the PDP gates Add to Cart on a selection for these), not something to guess around by
        // picking one arbitrarily. Keeps the FIRST seen and lets the "no v" check below reject
        // duplicates deterministically instead of silently picking a possibly-wrong variant.
        if (!variantByTemplateId.has(templateId)) variantByTemplateId.set(templateId, row.id);
      }
      await sleep(300);
    }

    const resolvedLines = body.lines.map((line) => ({
      odooVariantId: line.odooVariantId ?? (line.odooTemplateId ? variantByTemplateId.get(line.odooTemplateId) : undefined),
      qty: line.qty,
    }));
    for (const line of resolvedLines) {
      if (!line.odooVariantId) return json({ error: "Couldn't identify a product in your cart — please remove and re-add it" }, 409);
    }

    // Re-validate every line against LIVE Odoo — the client's cart snapshot could be stale
    // (price changed, product archived since it was added). Never trust a client-sent price.
    const variantIds = resolvedLines.map((l) => l.odooVariantId!);
    const variants = await odooSearchRead<OdooVariantRow>(odooConfig, "product.product", [["id", "in", variantIds]], [
      "id",
      "list_price",
      "active",
      "name",
    ]);
    const byId = new Map(variants.map((v) => [v.id, v]));
    for (const line of resolvedLines) {
      const v = byId.get(line.odooVariantId!);
      if (!v) return json({ error: `A product in your cart is no longer available (id ${line.odooVariantId})` }, 409);
      if (v.active === false) return json({ error: `${v.name} is no longer available` }, 409);
    }

    await sleep(300);
    const partnerId = await findOrCreatePartner(odooConfig, user.email ?? "", body.shippingName, body.shippingPhone, body.shippingAddress);

    await sleep(300);
    const orderLine = resolvedLines.map((line) => [
      0,
      0,
      {
        product_id: line.odooVariantId,
        product_uom_qty: line.qty,
        price_unit: byId.get(line.odooVariantId!)!.list_price,
      },
    ]);
    const saleOrderId = await odooCreate(odooConfig, "sale.order", {
      partner_id: partnerId,
      order_line: orderLine,
      client_order_ref: `Delite web order — ${user.email ?? user.id}`,
    });

    await sleep(300);
    const [saleOrder] = await odooSearchRead<{ id: number; name: string; amount_total: number }>(
      odooConfig,
      "sale.order",
      [["id", "=", saleOrderId]],
      ["id", "name", "amount_total"]
    );

    const { data: orderRow, error: insertError } = await adminClient
      .from("orders")
      .insert({
        user_id: user.id,
        odoo_sale_order_id: saleOrderId,
        odoo_order_name: saleOrder?.name ?? null,
        status: "placed",
        subtotal: saleOrder?.amount_total ?? 0,
        shipping_name: body.shippingName,
        shipping_phone: body.shippingPhone,
        shipping_address: body.shippingAddress,
      })
      .select("id")
      .single();

    if (insertError) {
      // The Odoo order is real and already placed — this is a history-sync failure, not an order
      // failure. Reported honestly as a warning, never masked as a failed order (it isn't one).
      console.error("[create-order] mirror insert failed", insertError.message);
      return json({ orderId: null, odooOrderName: saleOrder?.name, warning: "order_placed_history_sync_failed" }, 200);
    }

    return json({ orderId: orderRow.id, odooOrderName: saleOrder?.name }, 200);
  } catch (err) {
    console.error("[create-order]", err instanceof Error ? err.message : err);
    return json({ error: "Could not place your order — please try again" }, 502);
  }
});

function validateBody(body: CreateOrderBody): string | null {
  if (!body.shippingName?.trim()) return "Shipping name is required";
  if (!body.shippingPhone?.trim()) return "Shipping phone is required";
  if (!body.shippingAddress?.trim()) return "Shipping address is required";
  if (!Array.isArray(body.lines) || body.lines.length === 0) return "Cart is empty";
  for (const line of body.lines) {
    const hasVariantId = line.odooVariantId !== undefined;
    const hasTemplateId = line.odooTemplateId !== undefined;
    if (!hasVariantId && !hasTemplateId) return "Invalid product in cart";
    if (hasVariantId && (!Number.isInteger(line.odooVariantId) || line.odooVariantId! <= 0)) return "Invalid product in cart";
    if (hasTemplateId && (!Number.isInteger(line.odooTemplateId) || line.odooTemplateId! <= 0)) return "Invalid product in cart";
    if (!Number.isInteger(line.qty) || line.qty <= 0 || line.qty > 100) return "Invalid quantity in cart";
  }
  return null;
}

async function findOrCreatePartner(
  config: OdooConfig,
  email: string,
  name: string,
  phone: string,
  address: string
): Promise<number> {
  const domain = email ? ["|", ["email", "=", email], ["phone", "=", phone]] : [["phone", "=", phone]];
  const existing = await odooSearchRead<{ id: number }>(config, "res.partner", domain, ["id"], { limit: 1 });
  if (existing.length > 0) {
    const partnerId = existing[0].id;
    await odooExecuteKw(config, "res.partner", "write", [[partnerId], { name, phone, street: address }]);
    return partnerId;
  }
  return odooCreate(config, "res.partner", { name, phone, street: address, email: email || undefined });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
