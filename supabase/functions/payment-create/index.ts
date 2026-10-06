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
import { getOdooConfig, OrderValidationError, type OrderLineInput } from "../_shared/orders/placeOdooOrder.ts";
import { computeAuthoritativeQuote, assertQuoteUnchanged, type Quote } from "../_shared/orders/quote.ts";
import { formatShippingAddress, type AddressInput } from "../_shared/orders/customerIdentity.ts";
import { getRazorpayConfig, createRazorpayOrder } from "../_shared/payments/razorpay.ts";
import { CheckoutError, checkoutErrorResponse } from "../_shared/errors/checkoutErrors.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface PaymentCreateBody {
  /** Phase 5C: one stable id per checkout attempt, generated once by the frontend and reused
   * across retries/double-clicks — the SAME mechanism create-order's COD path already uses. Closes
   * the previous gap where a retried "Pay Online" click could create two Razorpay orders before
   * the first payment-create response returned. See
   * Documentations MD/odoo-checkout-finalization.md Phase 5C.
   *
   * Optional only for one deploy cycle's backward compatibility: this backend ships before the
   * frontend that sends it (coordinated-but-not-atomic deploy — see "Deploy order" in that doc). A
   * request without one still works (falls back to the pre-fix behavior: no idempotency claim,
   * same as before this pass), it just isn't protected against a double-click. Once the updated
   * frontend is live, every real request includes it. Do not remove this fallback casually — it's
   * what keeps "Pay Online" from breaking for anyone still on an un-updated client mid-rollout. */
  checkoutAttemptId?: string;
  shippingName: string;
  shippingPhone: string;
  address: AddressInput;
  lines: OrderLineInput[];
  deliveryMethodId?: number | null;
  acceptedFingerprint?: string;
  guestEmail?: string;
  policyVersion?: string;
  policyAccepted?: boolean;
}

interface AttemptRow {
  id: string;
  razorpay_order_id: string | null;
  amount: number;
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
    // Phase 5B: authoritative quote, computed fresh — the amount charged on Razorpay comes ONLY
    // from this, never from a client-sent value. See Documentations MD/odoo-checkout-finalization.md.
    const quote: Quote = await computeAuthoritativeQuote({
      config: odooConfig,
      db: adminClient,
      lines: body.lines,
      supabaseUserId: userId ?? undefined,
      deliveryMethodId: body.deliveryMethodId ?? null,
    });
    if (body.acceptedFingerprint) assertQuoteUnchanged(quote, body.acceptedFingerprint);
    if (quote.grandTotal <= 0) return checkoutErrorResponse(new CheckoutError("PRICING_UNAVAILABLE", "Invalid order total"));
    const amountInPaise = Math.round(quote.grandTotal * 100);

    // Phase 5C idempotency fix: claim checkout_attempt_id the same way create-order's COD path
    // does, BEFORE ever calling Razorpay — a double-click/retry before the first response returns
    // can no longer create two Razorpay orders. The column is shared with the COD path on the same
    // table; one checkoutAttemptId -> at most one payment_attempts row regardless of method.
    const { data: claimedRow, error: claimError } = await adminClient
      .from("payment_attempts")
      .insert({
        user_id: userId,
        checkout_attempt_id: body.checkoutAttemptId,
        amount: quote.grandTotal,
        currency: "INR",
        status: "created",
        payment_method: "online",
        checkout_snapshot: {
          quoteLines: quote.lines,
          shippingName: body.shippingName,
          shippingPhone: body.shippingPhone,
          shippingAddress,
          address: body.address,
          guestEmail: userId ? undefined : customerEmail,
          policyVersion: body.policyVersion,
          policyAccepted: !!body.policyAccepted,
        },
      })
      .select("id, razorpay_order_id, amount")
      .single();

    let attempt: AttemptRow;
    if (!claimError && claimedRow) {
      attempt = claimedRow as AttemptRow;
    } else if (claimError?.code === "23505") {
      // Already claimed — a prior submit for this exact checkout attempt. Never create a second
      // Razorpay order: reuse the existing one if it's ready, or ask the client to wait briefly if
      // the original request is still in flight.
      const { data: existing } = await adminClient
        .from("payment_attempts")
        .select("id, razorpay_order_id, amount")
        .eq("checkout_attempt_id", body.checkoutAttemptId)
        .maybeSingle();
      if (!existing) return json({ error: "Could not start payment — please try again" }, 502);
      attempt = existing as AttemptRow;
      if (!attempt.razorpay_order_id) {
        return checkoutErrorResponse(
          new CheckoutError("PAYMENT_ALREADY_PROCESSING", "Your payment is still being started — please wait a moment and try again", { retryable: true })
        );
      }
      return json(
        {
          paymentAttemptId: attempt.id,
          razorpayOrderId: attempt.razorpay_order_id,
          amount: Math.round(attempt.amount * 100),
          currency: "INR",
          keyId: razorpayConfig.keyId,
        },
        200
      );
    } else {
      console.error("[payment-create] payment_attempts insert failed", claimError?.message);
      return json({ error: "Could not start payment — please try again" }, 502);
    }

    const razorpayOrder = await createRazorpayOrder(razorpayConfig, amountInPaise, "INR", attempt.id);
    await adminClient.from("payment_attempts").update({ razorpay_order_id: razorpayOrder.id, updated_at: new Date().toISOString() }).eq("id", attempt.id);

    return json(
      {
        paymentAttemptId: attempt.id,
        razorpayOrderId: razorpayOrder.id,
        amount: amountInPaise,
        currency: razorpayOrder.currency,
        keyId: razorpayConfig.keyId,
      },
      200
    );
  } catch (err) {
    if (err instanceof OrderValidationError) return json({ error: err.message }, err.status);
    if (err instanceof CheckoutError) return checkoutErrorResponse(err);
    console.error("[payment-create]", err instanceof Error ? err.message : err);
    return json({ error: "Could not start payment — please try again" }, 502);
  }
});

function validateBody(body: PaymentCreateBody, isGuest: boolean): string | null {
  if (body.checkoutAttemptId !== undefined && !UUID_RE.test(body.checkoutAttemptId)) return "Invalid checkout attempt";
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
