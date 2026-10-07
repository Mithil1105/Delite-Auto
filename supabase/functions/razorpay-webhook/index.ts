// supabase/functions/razorpay-webhook/index.ts
//
// POST /functions/v1/razorpay-webhook — the AUTHORITATIVE payment confirmation path (#9). Not
// gated by Supabase user auth (see supabase/config.toml — verify_jwt = false for this function);
// authenticated instead via Razorpay's own HMAC signature computed over the RAW request body with
// RAZORPAY_WEBHOOK_SECRET. Must read the body as text and verify BEFORE any JSON.parse — the
// signature is over the exact bytes sent.
//
// Idempotent by construction: every handled event calls the same finalizePaidAttempt() that
// payment-verify also calls, which claims the payment via a UNIQUE-constraint update — a retried
// webhook delivery (Razorpay retries on non-2xx) is always a safe no-op on replay.

import { getRazorpayConfig, verifyWebhookSignature } from "../_shared/payments/razorpay.ts";
import { finalizePaidAttempt } from "../_shared/payments/finalize.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

async function logWebhookEvent(db: SupabaseClient, eventType: string, paymentAttemptId: string | null, success: boolean, safeError: string | null) {
  await db.from("payment_webhook_events").insert({ provider: "razorpay", event_type: eventType, payment_attempt_id: paymentAttemptId, success, safe_error: safeError });
}

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: { entity: { id: string; order_id: string; status: string; error_description?: string } };
    refund?: { entity: { id: string; payment_id: string; status: string } };
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });

  const razorpayConfig = getRazorpayConfig();
  if (!razorpayConfig || !razorpayConfig.webhookSecret) {
    console.error("[razorpay-webhook] not configured");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), { status: 501 });
  }

  const signatureHeader = req.headers.get("x-razorpay-signature");
  const rawBody = await req.text();
  if (!signatureHeader || !(await verifyWebhookSignature(razorpayConfig.webhookSecret, rawBody, signatureHeader))) {
    console.error("[razorpay-webhook] signature verification failed");
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
  }

  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceRoleKey);

  // Honest "last webhook received" / failure-count visibility for the Admin Integrations page —
  // one row per invocation, success or failure, never inferred from payment_attempts alone.
  let webhookAttemptId: string | null = null;

  try {
    switch (payload.event) {
      case "payment.captured": {
        const payment = payload.payload.payment?.entity;
        if (!payment) break;
        const { data: attempt } = await db.from("payment_attempts").select("id").eq("razorpay_order_id", payment.order_id).maybeSingle();
        if (!attempt) {
          console.error("[razorpay-webhook] payment.captured for unknown order", payment.order_id);
          await logWebhookEvent(db, payload.event, null, false, "unknown_order");
          break;
        }
        webhookAttemptId = attempt.id;
        await finalizePaidAttempt(attempt.id, payment.id);
        await logWebhookEvent(db, payload.event, attempt.id, true, null);
        break;
      }
      case "payment.failed": {
        const payment = payload.payload.payment?.entity;
        if (!payment) break;
        const { data: attempt } = await db.from("payment_attempts").select("id").eq("razorpay_order_id", payment.order_id).maybeSingle();
        await db
          .from("payment_attempts")
          .update({
            status: "failed",
            failure_code: "payment_failed",
            failure_reason_safe: payment.error_description?.slice(0, 200) ?? "Payment failed",
            updated_at: new Date().toISOString(),
          })
          .eq("razorpay_order_id", payment.order_id)
          .eq("status", "created");
        await logWebhookEvent(db, payload.event, attempt?.id ?? null, true, null);
        break;
      }
      case "refund.processed": {
        const refund = payload.payload.refund?.entity;
        if (!refund) break;
        const { data: attempt } = await db.from("payment_attempts").select("id, order_id").eq("razorpay_payment_id", refund.payment_id).maybeSingle();
        if (attempt) {
          await db.from("payment_attempts").update({ status: "refunded", updated_at: new Date().toISOString() }).eq("id", attempt.id);
          if (attempt.order_id) await db.from("orders").update({ payment_status: "refunded" }).eq("id", attempt.order_id);
        }
        await logWebhookEvent(db, payload.event, attempt?.id ?? null, true, null);
        break;
      }
      default:
        // Unhandled event types are acknowledged (2xx) so Razorpay doesn't keep retrying — never
        // an error just because we don't act on a given event.
        await logWebhookEvent(db, payload.event, null, true, null);
        break;
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook processing failed";
    console.error("[razorpay-webhook]", message);
    await logWebhookEvent(db, payload.event, webhookAttemptId, false, message.slice(0, 300));
    // 500 so Razorpay retries — a transient DB/Odoo hiccup shouldn't silently drop the event.
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), { status: 500 });
  }
});
