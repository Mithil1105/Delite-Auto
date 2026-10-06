// supabase/functions/create-order/index.ts
//
// POST /functions/v1/create-order — Cash on Delivery checkout only (see payment-create/
// payment-verify/razorpay-webhook for the online-payment path — Documentations MD/
// delite-payments.md). Deployed with verify_jwt=false (unlike every other admin-session function
// in this repo) because a GUEST checkout has no Supabase session at all — the platform-level JWT
// check would reject the request before this code ever ran. Authentication is instead handled
// internally: an Authorization header, if present, is verified exactly as strictly as before
// (invalid/expired -> 401, same as always); its absence is treated as a guest checkout, not an
// error, requiring guestName/guestEmail/guestPhone in the body instead. See
// Documentations MD/odoo-checkout-portal-returns.md.
//
// Places a REAL Odoo order immediately (COD has no payment-verification gate to wait for):
// re-validates every line's price/availability against live Odoo, resolves the Odoo customer +
// delivery address via _shared/orders/customerIdentity.ts (never trusts a client-sent Odoo partner
// id), creates a sale.order, mirrors a thin summary row into Supabase `orders`, and — for Admin
// payment visibility consistency (#47) — a matching `payment_attempts` row (method=cod,
// status=pending; there's no "paid" transition for COD in this phase).
//
// COD idempotency (see Documentations MD/delite-production-operations.md): the browser sends a
// stable `checkoutAttemptId` (one per checkout attempt, reused across a double-click/network
// retry/resubmit). The FIRST thing this function does is atomically claim that id via a unique-
// column insert into `payment_attempts` — mirroring _shared/payments/finalize.ts's claim-before-
// external-call shape for Razorpay — so a duplicate submission can never create a second Odoo
// sale.order; it always resolves to the one real order.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getOdooConfig, createSaleOrder, fetchSaleOrder, OrderValidationError, sleep, type OrderLineInput } from "../_shared/orders/placeOdooOrder.ts";
import { computeAuthoritativeQuote, assertQuoteUnchanged, type Quote } from "../_shared/orders/quote.ts";
import { resolveCustomer, formatShippingAddress, type AddressInput } from "../_shared/orders/customerIdentity.ts";
import { mirrorOrderFromAttempt } from "../_shared/orders/mirrorOrder.ts";
import { sendOrderConfirmation } from "../_shared/email/index.ts";
import { CheckoutError, checkoutErrorResponse } from "../_shared/errors/checkoutErrors.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CreateOrderBody {
  checkoutAttemptId: string;
  shippingName: string;
  shippingPhone: string;
  address: AddressInput;
  lines: OrderLineInput[];
  deliveryMethodId?: number | null;
  /** The fingerprint from a prior checkout-quote call. If provided and a freshly-recomputed quote
   * disagrees, the order is refused with CHECKOUT_CHANGED instead of silently using stale pricing
   * (Documentations MD/odoo-checkout-finalization.md Phase 5B). Optional only for safety/backward
   * compatibility — the frontend always sends it. */
  acceptedFingerprint?: string;
  /** Guest checkout only — ignored when a valid Authorization header identifies a real user. */
  guestEmail?: string;
  policyVersion?: string;
  policyAccepted?: boolean;
  analytics?: { visitor_id: string; session_id: string; cart_id: string; env?: string } | null;
}

interface AttemptRow {
  id: string;
  user_id: string | null;
  order_id: string | null;
  odoo_sale_order_id: number | null;
  status: string;
  syncing_since: string | null;
  retry_count: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Order service not configured" }, 500);
  const db = createClient(supabaseUrl, serviceRoleKey);

  // Optional auth — present and valid -> authenticated checkout; absent -> guest checkout; present
  // but invalid -> 401 (never silently downgraded to guest, that would let a stale/expired session
  // quietly lose its identity mid-checkout).
  const authHeader = req.headers.get("Authorization");
  let userId: string | null = null;
  let userEmail: string | null = null;
  if (authHeader) {
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await db.auth.getUser(jwt);
    if (userError || !userData.user) return json({ error: "Invalid or expired session — please sign in again" }, 401);
    userId = userData.user.id;
    userEmail = userData.user.email ?? null;
  }

  let body: CreateOrderBody;
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

  const shipping = { shippingName: body.shippingName, shippingPhone: body.shippingPhone, shippingAddress };

  try {
    // Phase 5B: the authoritative quote is computed fresh here, BEFORE any Odoo write — if the
    // customer accepted an earlier checkout-quote and anything has changed since (price, tax,
    // availability, delivery), this refuses with CHECKOUT_CHANGED instead of silently placing the
    // order at a stale amount. See Documentations MD/odoo-checkout-finalization.md.
    const quote: Quote = await computeAuthoritativeQuote({
      config: odooConfig,
      db,
      lines: body.lines,
      supabaseUserId: userId ?? undefined,
      deliveryMethodId: body.deliveryMethodId ?? null,
    });
    if (body.acceptedFingerprint) assertQuoteUnchanged(quote, body.acceptedFingerprint);

    // Atomic claim — the UNIQUE constraint on checkout_attempt_id is the only thing standing
    // between a double-submit and two real Odoo orders. Whoever's insert succeeds is the winner.
    const { data: claimedRow, error: claimError } = await db
      .from("payment_attempts")
      .insert({
        user_id: userId,
        checkout_attempt_id: body.checkoutAttemptId,
        amount: quote.grandTotal,
        currency: "INR",
        status: "pending",
        payment_method: "cod",
        odoo_sync_status: "pending",
        checkout_snapshot: { quoteLines: quote.lines, ...shipping, guestEmail: userId ? undefined : customerEmail },
      })
      .select("id, user_id, order_id, odoo_sale_order_id, status, syncing_since, retry_count")
      .single();

    let attempt: AttemptRow;
    let isWinner = false;

    if (!claimError && claimedRow) {
      attempt = claimedRow as AttemptRow;
      isWinner = true;
    } else if (claimError?.code === "23505") {
      // Already claimed — by a prior successful submit, a concurrent duplicate, or a prior
      // failed attempt now safe to retry. Never re-insert; always resolve against the one row.
      const existing = await selectAttemptByCheckoutId(db, body.checkoutAttemptId);
      if (!existing) return json({ error: "Could not place your order — please try again" }, 502);
      attempt = existing;
    } else {
      console.error("[create-order] claim insert failed", claimError?.message);
      return json({ error: "Could not place your order — please try again" }, 502);
    }

    // Case: this exact attempt already has a completed order — pure idempotent replay, no Odoo
    // call, same result returned as the original request would have gotten.
    if (!isWinner && attempt.order_id) {
      const { data: orderRow } = await db.from("orders").select("id, odoo_order_name").eq("id", attempt.order_id).maybeSingle();
      return json({ orderId: attempt.order_id, odooOrderName: orderRow?.odoo_order_name ?? null }, 200);
    }

    // Case: the Odoo order was already created by an earlier request that crashed/lost its
    // response before the local `orders` mirror was saved — resume from the Odoo id, never
    // call createSaleOrder again.
    if (!isWinner && attempt.odoo_sale_order_id) {
      const saleOrder = await fetchSaleOrder(odooConfig, attempt.odoo_sale_order_id);
      const mirrored = await mirrorOrderFromAttempt(db, attempt, saleOrder, shipping, "cod", "pending", {
        guestEmail: userId ? undefined : customerEmail,
        guestName: userId ? undefined : body.shippingName,
      });
      await db.from("payment_attempts").update({ odoo_sync_status: "synced", odoo_sync_pending: false }).eq("id", attempt.id);
      return json({ orderId: mirrored.orderId, odooOrderName: mirrored.odooOrderName }, 200);
    }

    if (!isWinner) {
      // Neither order_id nor odoo_sale_order_id yet — either a concurrent duplicate still being
      // processed by the original request, or a previously failed attempt. Poll briefly for the
      // in-flight case; if it resolves, return that. Otherwise, if it's genuinely failed and not
      // already being retried, claim the retry ourselves.
      const resolved = await pollForResolution(db, attempt.id);
      if (resolved?.order_id) {
        const { data: orderRow } = await db.from("orders").select("id, odoo_order_name").eq("id", resolved.order_id).maybeSingle();
        return json({ orderId: resolved.order_id, odooOrderName: orderRow?.odoo_order_name ?? null }, 200);
      }
      if (resolved?.odoo_sale_order_id) {
        const saleOrder = await fetchSaleOrder(odooConfig, resolved.odoo_sale_order_id);
        const mirrored = await mirrorOrderFromAttempt(db, resolved, saleOrder, shipping, "cod", "pending", {
          guestEmail: userId ? undefined : customerEmail,
          guestName: userId ? undefined : body.shippingName,
        });
        return json({ orderId: mirrored.orderId, odooOrderName: mirrored.odooOrderName }, 200);
      }

      const { data: retryClaim } = await db
        .from("payment_attempts")
        .update({ syncing_since: new Date().toISOString(), odoo_sync_status: "syncing", retry_count: (attempt.retry_count ?? 0) + 1, last_retry_at: new Date().toISOString() })
        .eq("id", attempt.id)
        .eq("status", "failed")
        .is("syncing_since", null)
        .select("id, user_id, order_id, odoo_sale_order_id, status, syncing_since, retry_count")
        .maybeSingle();

      if (!retryClaim) {
        return json({ error: "Your order is still being processed — please wait a moment and try again.", retryable: true }, 409);
      }
      attempt = retryClaim as AttemptRow;
      isWinner = true;
    }

    // Winner path — either a fresh claim or a just-claimed retry of a previously failed attempt.
    try {
      const customer = await resolveCustomer({
        db,
        odooConfig,
        supabaseUserId: userId ?? undefined,
        name: body.shippingName,
        email: customerEmail,
        phone: body.shippingPhone,
        address: body.address,
      });
      if (customer.ambiguousMatch) {
        console.warn("[create-order] ambiguous email match — created a new contact rather than guessing", customerEmail);
      }
      const saleOrder = await createSaleOrder(
        odooConfig,
        customer.partnerId,
        quote.lines,
        `Delite web order (COD) — ${customerEmail || userId}`,
        customer.partnerId,
        customer.shippingPartnerId
      );

      await db
        .from("payment_attempts")
        .update({ odoo_sale_order_id: saleOrder.saleOrderId, odoo_sync_status: "synced", odoo_sync_pending: false, syncing_since: null, updated_at: new Date().toISOString() })
        .eq("id", attempt.id);

      const mirrored = await mirrorOrderFromAttempt(db, attempt, saleOrder, shipping, "cod", "pending", {
        guestEmail: userId ? undefined : customerEmail,
        guestName: userId ? undefined : body.shippingName,
        odooPartnerId: customer.partnerId,
        policyVersion: body.policyVersion,
        policyAcceptedAt: body.policyAccepted ? new Date().toISOString() : undefined,
      });

      if (!mirrored.orderId) {
        return json({ orderId: null, odooOrderName: saleOrder.name, warning: "order_placed_history_sync_failed" }, 200);
      }

      // Confirmation email — best-effort, never allowed to turn a successful order into an error.
      try {
        if (customerEmail) {
          await sendOrderConfirmation({
            orderId: mirrored.orderId,
            toEmail: customerEmail,
            odooOrderName: saleOrder.name,
            orderDate: new Date().toLocaleDateString("en-IN"),
            lines: quote.lines.map((l) => ({ name: l.name, qty: l.quantity, unitPrice: l.unitPrice })),
            total: saleOrder.amountTotal,
            paymentMethod: "cod",
            shippingAddress,
            userId,
          });
        }
      } catch (emailErr) {
        console.error("[create-order] confirmation email failed", emailErr instanceof Error ? emailErr.message : emailErr);
      }

      // Purchase analytics: recorded only now — after Odoo AND the order mirror succeeded — and
      // built from server-verified data, never browser-supplied values. Isolated in its own
      // try/catch: analytics can never turn a successful order into an error. Guest orders have no
      // stable analytics identity to attach to in the current taxonomy (user_id is a required
      // column on analytics_events' purchase shape) — skipped for guests rather than fabricated.
      try {
        const a = body.analytics;
        const isUuid = (v: unknown) => typeof v === "string" && UUID_RE.test(v);
        if (userId && a && isUuid(a.visitor_id) && isUuid(a.session_id)) {
          await db.rpc("analytics_record_purchase", {
            p: {
              session_id: a.session_id,
              visitor_id: a.visitor_id,
              cart_id: isUuid(a.cart_id) ? a.cart_id : null,
              user_id: userId,
              order_id: mirrored.orderId,
              odoo_sale_order_id: saleOrder.saleOrderId,
              total: saleOrder.amountTotal,
              is_test: a.env === "test",
              items: quote.lines.map((line) => ({
                odoo_template_id: line.odooTemplateId,
                odoo_variant_id: line.odooVariantId,
                quantity: line.quantity,
                observed_unit_price: line.unitPrice,
              })),
            },
          });
        }
      } catch (analyticsError) {
        console.error("[create-order] analytics purchase record failed", analyticsError instanceof Error ? analyticsError.message : analyticsError);
      }

      return json({ orderId: mirrored.orderId, odooOrderName: mirrored.odooOrderName }, 200);
    } catch (odooErr) {
      // Odoo creation failed for this claimed attempt — recorded as a real, Admin-visible
      // recoverable failure (same shape as the Razorpay path's odoo_sync_pending) instead of
      // vanishing with no trace, so it shows up in Admin Payments and can be retried without the
      // customer having to do anything.
      const message = odooErr instanceof Error ? odooErr.message : "Odoo order creation failed";
      console.error("[create-order] Odoo order creation failed", message);
      await db
        .from("payment_attempts")
        .update({
          status: "failed",
          odoo_sync_pending: true,
          odoo_sync_status: "failed",
          last_sync_error_safe: message.slice(0, 300),
          syncing_since: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", attempt.id);
      if (odooErr instanceof OrderValidationError) return json({ error: odooErr.message }, odooErr.status);
      if (odooErr instanceof CheckoutError) return checkoutErrorResponse(odooErr);
      return json({ error: "Could not place your order — please try again" }, 502);
    }
  } catch (err) {
    if (err instanceof OrderValidationError) return json({ error: err.message }, err.status);
    if (err instanceof CheckoutError) return checkoutErrorResponse(err);
    console.error("[create-order]", err instanceof Error ? err.message : err);
    return json({ error: "Could not place your order — please try again" }, 502);
  }
});

// deno-lint-ignore no-explicit-any
async function selectAttemptByCheckoutId(db: any, checkoutAttemptId: string): Promise<AttemptRow | null> {
  const { data } = await db
    .from("payment_attempts")
    .select("id, user_id, order_id, odoo_sale_order_id, status, syncing_since, retry_count")
    .eq("checkout_attempt_id", checkoutAttemptId)
    .maybeSingle();
  return (data as AttemptRow | null) ?? null;
}

/** Bounded wait for a concurrent winner to finish (short — this is only for the rare true-race
 * case of two near-simultaneous submissions with the same checkout_attempt_id). Never blocks
 * indefinitely; callers fall through to a retryable response if this returns null. */
// deno-lint-ignore no-explicit-any
async function pollForResolution(db: any, attemptId: string): Promise<AttemptRow | null> {
  for (let i = 0; i < 8; i++) {
    await sleep(400);
    const { data } = await db
      .from("payment_attempts")
      .select("id, user_id, order_id, odoo_sale_order_id, status, syncing_since, retry_count")
      .eq("id", attemptId)
      .maybeSingle();
    const row = data as AttemptRow | null;
    if (row?.order_id || row?.odoo_sale_order_id) return row;
    if (row?.status === "failed" && !row.syncing_since) return null; // safe to retry-claim now
  }
  return null;
}

function validateBody(body: CreateOrderBody, isGuest: boolean): string | null {
  if (!body.checkoutAttemptId?.trim() || !UUID_RE.test(body.checkoutAttemptId)) return "Invalid checkout attempt";
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
    if (hasVariantId && (!Number.isInteger(line.odooVariantId) || line.odooVariantId! <= 0)) return "Invalid product in cart";
    if (hasTemplateId && (!Number.isInteger(line.odooTemplateId) || line.odooTemplateId! <= 0)) return "Invalid product in cart";
    if (!Number.isInteger(line.qty) || line.qty <= 0 || line.qty > 100) return "Invalid quantity in cart";
  }
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
