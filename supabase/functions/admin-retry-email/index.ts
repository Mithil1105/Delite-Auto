// supabase/functions/admin-retry-email/index.ts
//
// POST /functions/v1/admin-retry-email { emailLogId } — Admin-only retry for a genuinely FAILED
// row in `email_log` (see Documentations MD/delite-transactional-email.md). Never a generic
// "compose and send any email" tool: only the Delite-owned transactional types this codebase
// already knows how to build (order_confirmation, order_processing_delay, review_approved) can be
// retried, and each is re-sent through its own existing typed template/service function — never a
// raw HTML passthrough. Supabase Auth emails (password reset, etc.) never appear in this table and
// can never be retried from here.
//
// Never bypasses the existing idempotency design by deleting/reusing the original row's key — a
// NEW email_log row is created with retry_of/attempt_number pointing back at the original, so the
// original failure stays a permanent, auditable record (spec: "don't bypass idempotency").

import { getOdooConfig, odooRead } from "../_shared/odoo/client.ts";
import { sendOrderConfirmation, sendOrderProcessingDelay, sendReviewApproved } from "../_shared/email/index.ts";
import { requireAdmin } from "../_shared/auth/requireAdmin.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RETRYABLE_TYPES = new Set(["order_confirmation", "order_processing_delay", "review_approved"]);

interface CheckoutSnapshotLine {
  odooVariantId: number;
  qty: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireAdmin(req, ["owner", "admin", "support"]);
  if (auth instanceof Response) return auth;
  const { db, user: caller } = auth;

  let body: { emailLogId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!body.emailLogId) return json({ error: "emailLogId is required" }, 400);

  const { data: original } = await db.from("email_log").select("*").eq("id", body.emailLogId).maybeSingle();
  if (!original) return json({ error: "Email not found" }, 404);
  if (original.status !== "failed") return json({ error: "Only a failed email can be retried" }, 400);
  if (!RETRYABLE_TYPES.has(original.email_type)) return json({ error: "This email type can't be retried from here" }, 400);

  const entityId = original.idempotency_key.split(":")[1];
  const attemptNumber = (original.attempt_number ?? 1) + 1;
  const retry = { of: original.id as string, attempt: attemptNumber };

  try {
    let result: { sent: boolean; reason?: string };

    if (original.email_type === "order_confirmation") {
      const { data: order } = await db
        .from("orders")
        .select("id, user_id, odoo_order_name, subtotal, shipping_address, payment_method, created_at, payment_attempt_id")
        .eq("id", entityId)
        .maybeSingle();
      if (!order) return json({ error: "The original order no longer exists" }, 404);
      const { data: userRes } = await db.auth.admin.getUserById(order.user_id);
      const toEmail = userRes?.user?.email;
      if (!toEmail) return json({ error: "Customer email is unavailable" }, 400);

      let lines: { name: string; qty: number; unitPrice: number }[] = [];
      if (order.payment_attempt_id) {
        const { data: attempt } = await db.from("payment_attempts").select("checkout_snapshot").eq("id", order.payment_attempt_id).maybeSingle();
        const resolvedLines = (attempt?.checkout_snapshot?.resolvedLines ?? []) as CheckoutSnapshotLine[];
        const odooConfig = getOdooConfig();
        if (odooConfig && resolvedLines.length > 0) {
          const variantRows = await odooRead<{ id: number; name: string; list_price: number }>(
            odooConfig,
            "product.product",
            resolvedLines.map((l) => l.odooVariantId),
            ["id", "name", "list_price"]
          );
          const byId = new Map(variantRows.map((v) => [v.id, v]));
          lines = resolvedLines.map((l) => ({ name: byId.get(l.odooVariantId)?.name ?? "Item", qty: l.qty, unitPrice: byId.get(l.odooVariantId)?.list_price ?? 0 }));
        }
      }

      result = await sendOrderConfirmation({
        orderId: order.id,
        toEmail,
        odooOrderName: order.odoo_order_name ?? "",
        orderDate: new Date(order.created_at).toLocaleDateString("en-IN"),
        lines,
        total: order.subtotal,
        paymentMethod: order.payment_method,
        shippingAddress: order.shipping_address,
        userId: order.user_id,
        retry,
      });
    } else if (original.email_type === "order_processing_delay") {
      const { data: userRes } = await db.auth.admin.getUserById(original.user_id ?? "");
      const toEmail = userRes?.user?.email;
      if (!toEmail) return json({ error: "Customer email is unavailable" }, 400);
      result = await sendOrderProcessingDelay({ orderId: entityId, toEmail, userId: original.user_id, retry });
    } else {
      const { data: review } = await db.from("product_reviews").select("id, user_id, odoo_template_id").eq("id", entityId).maybeSingle();
      if (!review) return json({ error: "The original review no longer exists" }, 404);
      const { data: userRes } = await db.auth.admin.getUserById(review.user_id);
      const toEmail = userRes?.user?.email;
      if (!toEmail) return json({ error: "Customer email is unavailable" }, 400);
      const odooConfig = getOdooConfig();
      let productName = "your product";
      if (odooConfig) {
        const [tmpl] = await odooRead<{ id: number; name: string }>(odooConfig, "product.template", [review.odoo_template_id], ["id", "name"]);
        productName = tmpl?.name ?? productName;
      }
      result = await sendReviewApproved({ reviewId: review.id, toEmail, productName, userId: review.user_id, retry });
    }

    await db.from("admin_activity_log").insert({
      actor_id: caller.id,
      action: result.sent ? "email.retry_succeeded" : "email.retry_failed",
      target_type: "email_log",
      target_id: original.id,
      metadata: { emailType: original.email_type, reason: result.reason ?? null },
    });

    if (!result.sent) return json({ error: `Retry failed: ${result.reason ?? "unknown"}` }, 502);
    return json({ ok: true }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Retry failed";
    console.error("[admin-retry-email]", message);
    await db.from("admin_activity_log").insert({
      actor_id: caller.id,
      action: "email.retry_failed",
      target_type: "email_log",
      target_id: original.id,
      metadata: { emailType: original.email_type, reason: message.slice(0, 300) },
    });
    return json({ error: "Retry failed — please try again" }, 502);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
