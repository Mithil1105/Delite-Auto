// supabase/functions/payment-verify/index.ts
//
// POST /functions/v1/payment-verify — called by the frontend immediately after Razorpay
// Checkout's client-side success callback, for a fast confirmation UX. This is NOT treated as
// proof of payment on its own (#8) — it verifies the HMAC signature Razorpay itself computed
// (order_id|payment_id signed with the account's key secret) before doing anything. The
// razorpay-webhook function is the authoritative, eventually-consistent source of truth; this
// endpoint and the webhook both call the same idempotent finalizePaidAttempt(), so whichever
// arrives first does the work and the other is a safe no-op (#7).
//
// Deployed with verify_jwt=false — same reasoning as create-order/payment-create (see
// Documentations MD/odoo-checkout-portal-returns.md): a guest checkout has no Supabase session to
// verify its own payment with. Ownership for a guest attempt is instead proven by knowing the
// exact (random, unguessable UUID) paymentAttemptId Razorpay Checkout.js was opened with — the
// same trust model the guest order-confirmation page already uses.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getRazorpayConfig, verifyPaymentSignature } from "../_shared/payments/razorpay.ts";
import { finalizePaidAttempt } from "../_shared/payments/finalize.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyBody {
  paymentAttemptId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
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
  if (authHeader) {
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await adminClient.auth.getUser(jwt);
    if (userError || !userData.user) return json({ error: "Invalid or expired session — please sign in again" }, 401);
    userId = userData.user.id;
  }

  let body: VerifyBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!body.paymentAttemptId || !body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) {
    return json({ error: "Invalid verification payload" }, 400);
  }

  const razorpayConfig = getRazorpayConfig();
  if (!razorpayConfig) return json({ error: "Online payment temporarily unavailable" }, 501);

  // Ownership check — an authenticated caller's attempt must belong to them; a guest caller's
  // attempt must itself be a guest attempt (user_id null) — proven by knowing the exact
  // unguessable paymentAttemptId, not by any session (guests have none).
  const { data: attempt } = await adminClient.from("payment_attempts").select("id, user_id, razorpay_order_id").eq("id", body.paymentAttemptId).maybeSingle();
  if (!attempt || attempt.user_id !== userId || attempt.razorpay_order_id !== body.razorpay_order_id) {
    return json({ error: "Payment attempt not found" }, 404);
  }

  const valid = await verifyPaymentSignature(razorpayConfig, body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature);
  if (!valid) {
    console.error("[payment-verify] signature mismatch", { paymentAttemptId: body.paymentAttemptId });
    await adminClient
      .from("payment_attempts")
      .update({ status: "failed", failure_code: "signature_verification_failed", failure_reason_safe: "We couldn't verify this payment.", updated_at: new Date().toISOString() })
      .eq("id", body.paymentAttemptId)
      .eq("status", "created");
    return json({ error: "Payment verification failed" }, 400);
  }

  const result = await finalizePaidAttempt(body.paymentAttemptId, body.razorpay_payment_id);
  if (!result.ok) return json({ error: "Could not finalize your order — please contact support" }, 502);
  if (result.error === "odoo_sync_pending") {
    return json({ paid: true, orderId: null, message: "Payment received — your order is being finalized." }, 200);
  }
  return json({ paid: true, orderId: result.orderId ?? null, odooOrderName: result.odooOrderName ?? null }, 200);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
