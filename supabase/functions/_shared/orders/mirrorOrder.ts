// Shared "insert the local orders mirror for an already-placed Odoo sale.order, then backfill
// payment_attempts.order_id" step — factored out because create-order (COD) and
// admin-retry-odoo-order-sync both need the exact same sequence (previously only inlined once,
// in create-order). _shared/payments/finalize.ts keeps its own inline copy deliberately — it's the
// one proven, already-shipped Razorpay path and is left untouched to avoid destabilizing it.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface AttemptShippingSnapshot {
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
}

export interface MirroredOrderResult {
  orderId: string | null;
  odooOrderName: string;
}

/** Additive, all-optional — a guest order (attempt.user_id null) supplies guestEmail/guestName so
 * the confirmation email and any future "claim this order" flow have somewhere to read them from;
 * odooPartnerId/policyVersion/policyAcceptedAt mirror what customerIdentity.ts resolved and what
 * the customer accepted at checkout (spec #2, #36). */
export interface MirrorExtras {
  guestEmail?: string;
  guestName?: string;
  odooPartnerId?: number;
  policyVersion?: string;
  policyAcceptedAt?: string;
}

export async function mirrorOrderFromAttempt(
  db: SupabaseClient,
  attempt: { id: string; user_id: string | null },
  saleOrder: { saleOrderId: number; name: string; amountTotal: number },
  shipping: AttemptShippingSnapshot,
  paymentMethod: "online" | "cod",
  paymentStatus: string,
  extras: MirrorExtras = {}
): Promise<MirroredOrderResult> {
  const { data: orderRow, error: insertError } = await db
    .from("orders")
    .insert({
      user_id: attempt.user_id,
      guest_email: extras.guestEmail ?? null,
      guest_name: extras.guestName ?? null,
      odoo_partner_id: extras.odooPartnerId ?? null,
      policy_version: extras.policyVersion ?? null,
      policy_accepted_at: extras.policyAcceptedAt ?? null,
      odoo_sale_order_id: saleOrder.saleOrderId,
      odoo_order_name: saleOrder.name,
      status: "placed",
      subtotal: saleOrder.amountTotal,
      shipping_name: shipping.shippingName,
      shipping_phone: shipping.shippingPhone,
      shipping_address: shipping.shippingAddress,
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      payment_attempt_id: attempt.id,
    })
    .select("id")
    .single();

  if (insertError) {
    // The Odoo order is real and already placed — a history-sync failure, never masked as an
    // order failure. The unique index on orders.payment_attempt_id can also legitimately produce
    // this if a concurrent caller already mirrored this exact attempt — in that case the order
    // already exists and the caller should re-read it, not treat this as a hard failure.
    console.error("[mirrorOrderFromAttempt] orders insert failed", insertError.message);
    return { orderId: null, odooOrderName: saleOrder.name };
  }

  await db
    .from("payment_attempts")
    .update({ order_id: orderRow.id, odoo_sale_order_id: saleOrder.saleOrderId })
    .eq("id", attempt.id);

  return { orderId: orderRow.id, odooOrderName: saleOrder.name };
}
