// supabase/functions/admin-retry-odoo-order-sync/index.ts
//
// POST /functions/v1/admin-retry-odoo-order-sync { paymentAttemptId } — Admin-only recovery action
// for a payment_attempts row stuck with odoo_sync_pending = true (payment collected/COD placed,
// but the Odoo sale.order was never created — see Documentations MD/delite-production-operations.md).
//
// The browser supplies ONLY the attempt id — never an amount, customer, product list, or a "mark
// paid" flag. Everything else is re-read from the authoritative server-side row. Idempotent by
// construction: a claim (syncing_since) guards against two concurrent retries, and the row is
// re-checked for an existing odoo_sale_order_id/order_id before ever calling Odoo again — clicking
// Retry repeatedly can never create a second Odoo order.

import { getOdooConfig, createSaleOrder, fetchSaleOrder } from "../_shared/orders/placeOdooOrder.ts";
import { computeAuthoritativeQuote, type QuoteLine } from "../_shared/orders/quote.ts";
import { resolveCustomer, type AddressInput } from "../_shared/orders/customerIdentity.ts";
import { mirrorOrderFromAttempt } from "../_shared/orders/mirrorOrder.ts";
import { requireAdmin } from "../_shared/auth/requireAdmin.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CheckoutSnapshot {
  /** Current snapshot shape (post odoo-checkout-finalization) — already priced/taxed. */
  quoteLines?: QuoteLine[];
  /** Legacy snapshot shape (payment_attempts rows created before the quote pipeline existed) —
   * only identity/qty, no pricing. Re-quoted fresh on retry rather than trusted as-is, since a
   * stuck attempt may be arbitrarily old and `list_price`/pricelist/tax could have changed since. */
  resolvedLines?: { odooVariantId: number; qty: number }[];
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  address?: AddressInput;
  guestEmail?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Matches the Orders page's existing access level (owner/admin/support) — support already has
  // legitimate order visibility, so retrying a stuck sync for an order they can already see is
  // consistent, not a scope expansion (spec section 14).
  const auth = await requireAdmin(req, ["owner", "admin", "support"]);
  if (auth instanceof Response) return auth;
  const { db, user: caller } = auth;

  let body: { paymentAttemptId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!body.paymentAttemptId) return json({ error: "paymentAttemptId is required" }, 400);

  const { data: attempt } = await db
    .from("payment_attempts")
    .select("id, user_id, order_id, odoo_sale_order_id, odoo_sync_pending, syncing_since, retry_count, payment_method, checkout_snapshot")
    .eq("id", body.paymentAttemptId)
    .maybeSingle();
  if (!attempt) return json({ error: "Payment attempt not found" }, 404);

  // Already fully synced — a genuinely idempotent no-op, never re-created.
  if (attempt.order_id && attempt.odoo_sale_order_id) {
    return json({ ok: true, alreadyProcessed: true, orderId: attempt.order_id }, 200);
  }

  // Atomic claim — the row's own syncing_since is the lock; a second concurrent click for the
  // same attempt (or the automatic COD retry path) can never both proceed past this point.
  const { data: claimed } = await db
    .from("payment_attempts")
    .update({ syncing_since: new Date().toISOString(), odoo_sync_status: "syncing" })
    .eq("id", attempt.id)
    .eq("odoo_sync_pending", true)
    .is("syncing_since", null)
    .select("id, user_id, order_id, odoo_sale_order_id, retry_count, payment_method, checkout_snapshot")
    .maybeSingle();

  if (!claimed) {
    if (attempt.syncing_since) return json({ error: "A retry is already in progress for this attempt" }, 409);
    return json({ error: "This attempt is not eligible for retry" }, 400);
  }

  const odooConfig = getOdooConfig();
  if (!odooConfig) {
    await db.from("payment_attempts").update({ syncing_since: null, odoo_sync_status: "failed" }).eq("id", attempt.id);
    return json({ error: "Odoo is not configured" }, 501);
  }

  const shipping = claimed.checkout_snapshot as CheckoutSnapshot;

  try {
    let saleOrder: { saleOrderId: number; name: string; amountTotal: number };
    if (claimed.odoo_sale_order_id) {
      // Odoo order already exists (a previous attempt got this far before crashing) — never
      // create a second one, only resume the local mirror.
      saleOrder = await fetchSaleOrder(odooConfig, claimed.odoo_sale_order_id);
    } else {
      let email = shipping.guestEmail ?? "";
      if (claimed.user_id) {
        const { data: userRes } = await db.auth.admin.getUserById(claimed.user_id);
        email = userRes?.user?.email ?? "";
      }

      let quoteLines: QuoteLine[];
      if (shipping.quoteLines && shipping.quoteLines.length > 0) {
        quoteLines = shipping.quoteLines;
      } else if (shipping.resolvedLines && shipping.resolvedLines.length > 0) {
        const freshQuote = await computeAuthoritativeQuote({
          config: odooConfig,
          db,
          lines: shipping.resolvedLines,
          supabaseUserId: claimed.user_id ?? undefined,
        });
        quoteLines = freshQuote.lines;
      } else {
        throw new Error("checkout snapshot has no line items to retry");
      }

      const address: AddressInput = shipping.address ?? { line1: shipping.shippingAddress, city: "", state: "", pincode: "" };
      const customer = await resolveCustomer({
        db,
        odooConfig,
        supabaseUserId: claimed.user_id ?? undefined,
        name: shipping.shippingName,
        email,
        phone: shipping.shippingPhone,
        address,
      });
      saleOrder = await createSaleOrder(
        odooConfig,
        customer.partnerId,
        quoteLines,
        `Delite web order (admin retry) — ${email || claimed.user_id}`,
        customer.partnerId,
        customer.shippingPartnerId
      );
    }

    const paymentStatus = claimed.payment_method === "cod" ? "pending" : "paid";
    const mirrored = await mirrorOrderFromAttempt(db, claimed, saleOrder, shipping, claimed.payment_method, paymentStatus);

    await db
      .from("payment_attempts")
      .update({
        odoo_sale_order_id: saleOrder.saleOrderId,
        odoo_sync_pending: false,
        odoo_sync_status: "synced",
        retry_count: (claimed.retry_count ?? 0) + 1,
        last_retry_at: new Date().toISOString(),
        syncing_since: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id);

    await logActivity(db, caller.id, "payment_attempt.odoo_retry_succeeded", "payment_attempt", attempt.id, { orderId: mirrored.orderId });

    return json({ ok: true, orderId: mirrored.orderId, odooOrderName: mirrored.odooOrderName }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Odoo order creation failed";
    console.error("[admin-retry-odoo-order-sync]", message);
    await db
      .from("payment_attempts")
      .update({
        retry_count: (claimed.retry_count ?? 0) + 1,
        last_retry_at: new Date().toISOString(),
        last_sync_error_safe: message.slice(0, 300),
        odoo_sync_status: "failed",
        syncing_since: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id);
    await logActivity(db, caller.id, "payment_attempt.odoo_retry_failed", "payment_attempt", attempt.id, { reason: message.slice(0, 300) });
    return json({ error: "Retry failed — the attempt remains pending and can be retried again" }, 502);
  }
});

// deno-lint-ignore no-explicit-any
async function logActivity(db: any, actorId: string, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>) {
  await db.from("admin_activity_log").insert({ actor_id: actorId, action, target_type: targetType, target_id: targetId, metadata });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
