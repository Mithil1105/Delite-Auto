// Idempotent payment finalization — the ONE place that turns a verified Razorpay payment into a
// real Odoo order. Called from both payment-verify (the fast client-callback path) and
// razorpay-webhook (the authoritative, eventually-consistent path); either one may arrive first,
// or arrive more than once (a webhook retry). A retry or a race between the two callers must NEVER
// create two Delite orders, two Odoo orders, or two confirmation emails — see #7.
//
// Design decision (documented per #4): the order is priced from `checkout_snapshot` — the
// server-validated lines captured at payment-create time — NOT re-validated against Odoo again
// here. Money has already been collected for that exact total; rejecting/repricing at this point
// would mean charging a customer and then refusing their order, which is worse than honoring a
// snapshot that's at most a few minutes stale.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getOdooConfig, createSaleOrder, type ResolvedLine, type OdooVariantRow } from "../orders/placeOdooOrder.ts";
import { computeAuthoritativeQuote, type QuoteLine } from "../orders/quote.ts";
import { resolveCustomer, type AddressInput } from "../orders/customerIdentity.ts";
import { sendOrderConfirmation, sendOrderProcessingDelay } from "../email/index.ts";

interface CheckoutSnapshot {
  /** Current snapshot shape (post odoo-checkout-finalization, Documentations MD/
   * odoo-checkout-finalization.md) — already priced/taxed by computeAuthoritativeQuote at
   * payment-create time. Used AS-IS here, never re-quoted (see header comment: money has already
   * been collected for this exact total). */
  quoteLines?: QuoteLine[];
  /** Legacy fields — present only on payment_attempts rows created before the quote pipeline
   * existed. A stuck legacy attempt reaching finalize (should be rare/never for a NEW payment, only
   * possible via an old in-flight attempt) is re-quoted fresh as a one-time backward-compat path —
   * see below. */
  resolvedLines?: ResolvedLine[];
  variantRows?: OdooVariantRow[];
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  address?: AddressInput; // absent only for attempts created before this field existed
  guestEmail?: string;
  policyVersion?: string;
  policyAccepted?: boolean;
}

function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

export interface FinalizeResult {
  ok: boolean;
  orderId?: string;
  odooOrderName?: string;
  alreadyProcessed?: boolean;
  error?: string;
}

export async function finalizePaidAttempt(paymentAttemptId: string, razorpayPaymentId: string): Promise<FinalizeResult> {
  const db = adminClient();

  // Atomic claim on the UNIQUE razorpay_payment_id column — only the first caller to reach this
  // update wins; everyone else (a concurrent verify/webhook race, or a retried webhook delivery)
  // reads back the already-in-progress-or-finished state instead of doing the work twice.
  const { data: claimed } = await db
    .from("payment_attempts")
    .update({ razorpay_payment_id: razorpayPaymentId, status: "authorized", updated_at: new Date().toISOString() })
    .eq("id", paymentAttemptId)
    .is("razorpay_payment_id", null)
    .select("*")
    .maybeSingle();

  if (!claimed) {
    const { data: existing } = await db.from("payment_attempts").select("*").eq("id", paymentAttemptId).maybeSingle();
    if (existing?.status === "paid") return { ok: true, orderId: existing.order_id ?? undefined, alreadyProcessed: true };
    // Another caller is actively finalizing (or this attempt failed/expired already) — a safe
    // idempotent no-op either way; never double-create.
    return { ok: true, alreadyProcessed: true };
  }

  const attempt = claimed as {
    id: string;
    user_id: string | null;
    amount: number;
    checkout_snapshot: CheckoutSnapshot;
  };

  const odooConfig = getOdooConfig();
  const snapshot = attempt.checkout_snapshot;

  if (!odooConfig) {
    await db
      .from("payment_attempts")
      .update({ odoo_sync_pending: true, odoo_sync_status: "failed", last_sync_error_safe: "odoo_unavailable", updated_at: new Date().toISOString() })
      .eq("id", attempt.id);
    return { ok: true, alreadyProcessed: false, error: "odoo_unavailable_payment_recorded" };
  }

  let saleOrder: { saleOrderId: number; name: string; amountTotal: number } | null = null;
  let partnerEmail = "";
  let resolvedPartnerId: number | null = null;
  let quoteLines: QuoteLine[] = [];
  try {
    if (attempt.user_id) {
      const { data: userData } = await db.auth.admin.getUserById(attempt.user_id);
      partnerEmail = userData?.user?.email ?? "";
    } else {
      partnerEmail = snapshot.guestEmail ?? "";
    }

    // `address` is only absent for an attempt created before this field existed (a very narrow
    // window — never for a new checkout) — fall back to parsing nothing extra out of the legacy
    // free-text shippingAddress rather than guessing a structured split of it.
    const address: AddressInput = snapshot.address ?? { line1: snapshot.shippingAddress, city: "", state: "", pincode: "" };
    const customer = await resolveCustomer({
      db,
      odooConfig,
      supabaseUserId: attempt.user_id ?? undefined,
      name: snapshot.shippingName,
      email: partnerEmail,
      phone: snapshot.shippingPhone,
      address,
    });
    resolvedPartnerId = customer.partnerId;

    if (snapshot.quoteLines && snapshot.quoteLines.length > 0) {
      // The normal path — the exact accepted, authoritative, already-taxed lines captured at
      // payment-create time. Never re-quoted here: money has already been collected for this
      // total, and re-pricing after capture could charge one amount and record another.
      quoteLines = snapshot.quoteLines;
    } else if (snapshot.resolvedLines && snapshot.resolvedLines.length > 0) {
      // One-time backward-compat path for a payment_attempts row created before the quote
      // pipeline existed. Re-quoted fresh since no quoteLines were ever captured for it — this is
      // strictly better than the old behavior (raw list_price with no tax), not worse.
      console.warn("[finalize] legacy checkout_snapshot without quoteLines — re-quoting fresh", attempt.id);
      const freshQuote = await computeAuthoritativeQuote({
        config: odooConfig,
        db,
        lines: snapshot.resolvedLines,
        supabaseUserId: attempt.user_id ?? undefined,
      });
      quoteLines = freshQuote.lines;
    } else {
      throw new Error("checkout snapshot has no line items to finalize");
    }

    saleOrder = await createSaleOrder(
      odooConfig,
      customer.partnerId,
      quoteLines,
      `Delite web order (paid) — ${partnerEmail || attempt.user_id}`,
      customer.partnerId,
      customer.shippingPartnerId
    );
  } catch (err) {
    // Payment already succeeded — never lose it. Recorded as a real, Admin-visible operational
    // problem instead of silently retried or reported as a failed payment (see #10/#63).
    console.error("[finalize] Odoo order creation failed after verified payment", err instanceof Error ? err.message : err);
    await db
      .from("payment_attempts")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        odoo_sync_pending: true,
        odoo_sync_status: "failed",
        last_sync_error_safe: (err instanceof Error ? err.message : "Odoo order creation failed").slice(0, 300),
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id);
    if (partnerEmail) await sendOrderProcessingDelay({ orderId: attempt.id, toEmail: partnerEmail, userId: attempt.user_id });
    return { ok: true, alreadyProcessed: false, error: "odoo_sync_pending" };
  }

  const { data: orderRow, error: insertError } = await db
    .from("orders")
    .insert({
      user_id: attempt.user_id,
      guest_email: attempt.user_id ? null : partnerEmail || null,
      guest_name: attempt.user_id ? null : snapshot.shippingName,
      odoo_partner_id: resolvedPartnerId,
      policy_version: snapshot.policyVersion ?? null,
      policy_accepted_at: snapshot.policyAccepted ? new Date().toISOString() : null,
      odoo_sale_order_id: saleOrder.saleOrderId,
      odoo_order_name: saleOrder.name,
      status: "placed",
      subtotal: saleOrder.amountTotal,
      shipping_name: snapshot.shippingName,
      shipping_phone: snapshot.shippingPhone,
      shipping_address: snapshot.shippingAddress,
      payment_method: "online",
      payment_status: "paid",
      payment_attempt_id: attempt.id,
    })
    .select("id")
    .single();

  await db
    .from("payment_attempts")
    .update({
      status: "paid",
      order_id: orderRow?.id ?? null,
      odoo_sale_order_id: saleOrder.saleOrderId,
      odoo_sync_status: "synced",
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", attempt.id);

  if (insertError) {
    console.error("[finalize] orders mirror insert failed", insertError.message);
    return { ok: true, orderId: undefined, odooOrderName: saleOrder.name, error: "order_placed_history_sync_failed" };
  }

  // Purchase analytics + confirmation email — best-effort, never allowed to turn a successful,
  // already-mirrored order into an error response.
  try {
    if (partnerEmail) {
      await sendOrderConfirmation({
        orderId: orderRow.id,
        toEmail: partnerEmail,
        odooOrderName: saleOrder.name,
        orderDate: new Date().toLocaleDateString("en-IN"),
        lines: quoteLines.map((l) => ({ name: l.name, qty: l.quantity, unitPrice: l.unitPrice })),
        total: saleOrder.amountTotal,
        paymentMethod: "online",
        shippingAddress: snapshot.shippingAddress,
        userId: attempt.user_id,
      });
    }
  } catch (emailErr) {
    console.error("[finalize] confirmation email failed", emailErr instanceof Error ? emailErr.message : emailErr);
  }

  return { ok: true, orderId: orderRow.id, odooOrderName: saleOrder.name };
}
