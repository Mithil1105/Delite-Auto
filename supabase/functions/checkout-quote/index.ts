// supabase/functions/checkout-quote/index.ts
//
// POST /functions/v1/checkout-quote — the server-authoritative checkout quote (Documentations MD/
// odoo-checkout-finalization.md Phase 5). The browser may send ONLY product identity + quantity +
// an optional delivery method choice; it is never authoritative for price, discount, tax,
// shipping, subtotal, or total — those are always freshly computed from live Odoo here.
//
// Read-only: this function never creates/writes anything in Odoo or Supabase. The SAME
// computeAuthoritativeQuote() this calls is also called again, fresh, immediately before COD/
// online order placement (create-order, payment-create) to detect any change since this quote was
// issued — see _shared/orders/quote.ts.
//
// Deployed with verify_jwt=false (same reasoning as create-order/payment-create): a guest
// shopper has no Supabase session yet and must still be able to get a quote. An Authorization
// header, when present, is verified exactly as strictly as elsewhere — invalid/expired -> 401,
// never silently downgraded to guest.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getOdooConfig, type OrderLineInput } from "../_shared/orders/placeOdooOrder.ts";
import { computeAuthoritativeQuote } from "../_shared/orders/quote.ts";
import { CheckoutError, checkoutErrorResponse } from "../_shared/errors/checkoutErrors.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QuoteBody {
  lines: OrderLineInput[];
  deliveryMethodId?: number | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Quote service not configured" }, 500);
  const db = createClient(supabaseUrl, serviceRoleKey);

  const authHeader = req.headers.get("Authorization");
  let userId: string | undefined;
  if (authHeader) {
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await db.auth.getUser(jwt);
    if (userError || !userData.user) return checkoutErrorResponse(new CheckoutError("SESSION_EXPIRED", "Your session has expired — please sign in again"));
    userId = userData.user.id;
  }

  let body: QuoteBody;
  try {
    body = await req.json();
  } catch {
    return checkoutErrorResponse(new CheckoutError("VALIDATION_FAILED", "Invalid request body"));
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return checkoutErrorResponse(new CheckoutError("VALIDATION_FAILED", "Your cart is empty"));
  }
  for (const line of body.lines) {
    const hasVariantId = line.odooVariantId !== undefined;
    const hasTemplateId = line.odooTemplateId !== undefined;
    if (!hasVariantId && !hasTemplateId) return checkoutErrorResponse(new CheckoutError("PRODUCT_INVALID", "Invalid product in cart"));
    if (!Number.isInteger(line.qty) || line.qty <= 0 || line.qty > 100) {
      return checkoutErrorResponse(new CheckoutError("PRODUCT_INVALID", "Invalid quantity in cart"));
    }
  }

  const odooConfig = getOdooConfig();
  if (!odooConfig) return checkoutErrorResponse(new CheckoutError("ODOO_UNAVAILABLE", "Pricing is temporarily unavailable — please try again shortly"));

  try {
    const quote = await computeAuthoritativeQuote({
      config: odooConfig,
      db,
      lines: body.lines,
      supabaseUserId: userId,
      deliveryMethodId: body.deliveryMethodId ?? null,
    });
    return json(quote, 200);
  } catch (err) {
    if (err instanceof CheckoutError) return checkoutErrorResponse(err);
    console.error("[checkout-quote]", err instanceof Error ? err.message : err);
    return checkoutErrorResponse(new CheckoutError("PRICING_UNAVAILABLE", "Couldn't price your cart right now — please try again shortly"));
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
