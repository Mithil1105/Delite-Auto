// supabase/functions/payment-create/index.ts
//
// POST /functions/v1/payment-create — starts the ONLINE payment flow (see
// Documentations MD/delite-payments.md). Deployed with verify_jwt=false — same reasoning as
// create-order (Documentations MD/odoo-checkout-portal-returns.md): a guest checkout has no
// Supabase session at all, so the platform-level JWT check can't gate this function. An
// Authorization header, when present, is verified exactly as strictly as before; its absence means
// a guest checkout, requiring guestEmail in the body instead.
//
// Validates/prices the cart against LIVE Odoo (same re-validation `create-order` does for COD) but
// does NOT create a sale.order yet — for online payment, Odoo order creation is deferred until
// payment is verified (payment-verify / razorpay-webhook), never before. A `payment_attempts` row
// captures the validated snapshot so the later finalize step never has to re-trust the client.
//
// Gracefully unconfigured: if RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET secrets aren't set, returns a
// clean "temporarily unavailable" response (never a crash, never a fake success) — same pattern as
// getOdooConfig() returning null.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getOdooConfig, validateAndPriceLines, OrderValidationError, type OrderLineInput } from "../_shared/orders/placeOdooOrder.ts";
import { formatShippingAddress, type AddressInput } from "../_shared/orders/customerIdentity.ts";
import { getRazorpayConfig, createRazorpayOrder } from "../_shared/payments/razorpay.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface PaymentCreateBody {
  shippingName: string;
  shippingPhone: string;
  address: AddressInput;
  lines: OrderLineInput[];
  guestEmail?: string;
  policyVersion?: string;
  policyAccepted?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Payment service not configured" }, 500);
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const authHeader = req.headers.get("Authorization");
  let userId: string | null = null;
  let userEmail: string | null = null;
  if (authHeader) {
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await adminClient.auth.getUser(jwt);
    if (userError || !userData.user) return json({ error: "Invalid or expired session — please sign in again" }, 401);
    userId = userData.user.id;
    userEmail = userData.user.email ?? null;
  }

  let body: PaymentCreateBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  const validationError = validateBody(body, !userId);
  if (validationError) return json({ error: validationError }, 400);

  const customerEmail = userEmail ?? body.guestEmail!;
  const shippingAddress = formatShippingAddress(body.address);

  const odooConfig = getOdooConfig();
  if (!odooConfig) return json({ error: "Ordering temporarily unavailable" }, 501);

  const razorpayConfig = getRazorpayConfig();
  if (!razorpayConfig) return json({ error: "Online payment temporarily unavailable — please choose Cash on Delivery" }, 501);

  try {
    const { resolvedLines, byId } = await validateAndPriceLines(odooConfig, body.lines);
    const amount = resolvedLines.reduce((sum, l) => sum + (byId.get(l.odooVariantId)?.list_price ?? 0) * l.qty, 0);
    if (amount <= 0) return json({ error: "Invalid order total" }, 409);
    const amountInPaise = Math.round(amount * 100);

    const { data: attemptRow, error: insertError } = await adminClient
      .from("payment_attempts")
      .insert({
        user_id: userId,
        amount,
        currency: "INR",
        status: "created",
        payment_method: "online",
        checkout_snapshot: {
          resolvedLines,
          variantRows: Array.from(byId.values()),
          shippingName: body.shippingName,
          shippingPhone: body.shippingPhone,
          shippingAddress,
          address: body.address,
          guestEmail: userId ? undefined : customerEmail,
          policyVersion: body.policyVersion,
          policyAccepted: !!body.policyAccepted,
        },
      })
      .select("id")
      .single();
    if (insertError || !attemptRow) {
      console.error("[payment-create] payment_attempts insert failed", insertError?.message);
      return json({ error: "Could not start payment — please try again" }, 502);
    }

    const razorpayOrder = await createRazorpayOrder(razorpayConfig, amountInPaise, "INR", attemptRow.id);
    await adminClient.from("payment_attempts").update({ razorpay_order_id: razorpayOrder.id, updated_at: new Date().toISOString() }).eq("id", attemptRow.id);

    return json(
      {
        paymentAttemptId: attemptRow.id,
        razorpayOrderId: razorpayOrder.id,
        amount: amountInPaise,
        currency: razorpayOrder.currency,
        keyId: razorpayConfig.keyId,
      },
      200
    );
  } catch (err) {
    if (err instanceof OrderValidationError) return json({ error: err.message }, err.status);
    console.error("[payment-create]", err instanceof Error ? err.message : err);
    return json({ error: "Could not start payment — please try again" }, 502);
  }
});

function validateBody(body: PaymentCreateBody, isGuest: boolean): string | null {
  if (!body.shippingName?.trim()) return "Shipping name is required";
  if (!body.shippingPhone?.trim()) return "Shipping phone is required";
  if (!body.address || typeof body.address !== "object") return "Delivery address is required";
  if (!body.address.line1?.trim()) return "Address line 1 is required";
  if (!body.address.city?.trim()) return "City is required";
  if (!body.address.state?.trim()) return "State is required";
  if (!body.address.pincode?.trim()) return "PIN code is required";
  if (isGuest) {
    if (!body.guestEmail?.trim() || !EMAIL_RE.test(body.guestEmail.trim())) return "A valid email is required";
  }
  if (!body.policyAccepted) return "Please accept the Terms and Returns/Refund policy to continue";
  if (!Array.isArray(body.lines) || body.lines.length === 0) return "Cart is empty";
  for (const line of body.lines) {
    const hasVariantId = line.odooVariantId !== undefined;
    const hasTemplateId = line.odooTemplateId !== undefined;
    if (!hasVariantId && !hasTemplateId) return "Invalid product in cart";
    if (!Number.isInteger(line.qty) || line.qty <= 0 || line.qty > 100) return "Invalid quantity in cart";
  }
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
