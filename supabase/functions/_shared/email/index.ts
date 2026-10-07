// One shared server-side email service — every Edge Function that needs to send a transactional
// email calls into here, never a scattered provider-specific fetch. Provider: Resend (plain REST,
// no SDK dependency needed for Deno). Credentials read only from Deno.env — never sent to the
// client, never logged. Gracefully unconfigured (same pattern as getOdooConfig()/supabaseClient's
// `isSupabaseConfigured`): if RESEND_API_KEY is absent, every send is logged as 'failed' with a
// safe reason and the caller's own flow continues unaffected — email failure must NEVER roll back
// a valid paid order or a real Odoo order.
//
// Idempotency: `idempotencyKey` is the row's UNIQUE key in `email_log` — a caller MUST check
// (via `wasAlreadySent`) or rely on `sendEmail`'s own upsert-guard before triggering a
// provider send, so a retried webhook/order handler can't send the same email twice.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface EmailServiceConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

export function getEmailConfig(): EmailServiceConfig | null {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("TRANSACTIONAL_FROM_EMAIL");
  const fromName = Deno.env.get("TRANSACTIONAL_FROM_NAME") ?? "Delite Auto";
  if (!apiKey || !fromEmail) return null;
  return { apiKey, fromEmail, fromName };
}

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

interface SendEmailArgs {
  idempotencyKey: string;
  emailType: string;
  to: string;
  subject: string;
  html: string;
  userId?: string | null;
  orderId?: string | null;
  retryOf?: string | null;
  attemptNumber?: number;
}

/** Passed by admin-retry-email to resend a genuinely failed transactional email under a NEW
 * idempotency key (the original key is already claimed/failed and stays put — never deleted, per
 * Documentations MD/delite-transactional-email.md's "don't bypass idempotency" rule). */
export interface EmailRetryArgs {
  of: string;
  attempt: number;
}

/** Sends one transactional email, idempotently. Returns { sent: boolean, reason?: string } —
 * never throws (a caller placing/finalizing an order must never have that flow break because
 * email delivery failed). */
export async function sendEmail(args: SendEmailArgs): Promise<{ sent: boolean; reason?: string }> {
  const db = adminClient();

  // Claim the idempotency key first — a UNIQUE-constraint conflict means another call (a webhook
  // retry, a duplicate invocation) already claimed/sent this exact logical email.
  const { error: insertError } = await db.from("email_log").insert({
    idempotency_key: args.idempotencyKey,
    email_type: args.emailType,
    user_id: args.userId ?? null,
    order_id: args.orderId ?? null,
    status: "queued",
    retry_of: args.retryOf ?? null,
    attempt_number: args.attemptNumber ?? 1,
  });
  if (insertError) {
    // 23505 = unique_violation on idempotency_key — already sent/queued, not a new failure.
    return { sent: false, reason: insertError.code === "23505" ? "already_sent" : "log_insert_failed" };
  }

  const config = getEmailConfig();
  if (!config) {
    await db.from("email_log").update({ status: "failed", safe_failure_reason: "provider_not_configured" }).eq("idempotency_key", args.idempotencyKey);
    return { sent: false, reason: "provider_not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${config.fromName} <${config.fromEmail}>`, to: [args.to], subject: args.subject, html: args.html }),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      await db
        .from("email_log")
        .update({ status: "failed", safe_failure_reason: `provider_error_${res.status}` })
        .eq("idempotency_key", args.idempotencyKey);
      console.error("[email] Resend send failed", res.status, bodyText.slice(0, 300));
      return { sent: false, reason: `provider_error_${res.status}` };
    }
    const data = (await res.json()) as { id?: string };
    await db
      .from("email_log")
      .update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: data.id ?? null })
      .eq("idempotency_key", args.idempotencyKey);
    return { sent: true };
  } catch (err) {
    await db.from("email_log").update({ status: "failed", safe_failure_reason: "network_error" }).eq("idempotency_key", args.idempotencyKey);
    console.error("[email] send threw", err instanceof Error ? err.message : err);
    return { sent: false, reason: "network_error" };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface OrderConfirmationLine {
  name: string;
  qty: number;
  unitPrice: number;
}

export async function sendOrderConfirmation(args: {
  orderId: string;
  toEmail: string;
  customerFirstName?: string;
  odooOrderName: string;
  orderDate: string;
  lines: OrderConfirmationLine[];
  total: number;
  paymentMethod: "online" | "cod";
  shippingAddress: string;
  userId?: string | null;
  retry?: EmailRetryArgs;
}): Promise<{ sent: boolean; reason?: string }> {
  const greeting = args.customerFirstName ? `Hi ${escapeHtml(args.customerFirstName)},` : "Hi,";
  const rows = args.lines
    .map((l) => `<tr><td style="padding:6px 0">${escapeHtml(l.name)} × ${l.qty}</td><td style="padding:6px 0;text-align:right">₹${(l.unitPrice * l.qty).toLocaleString("en-IN")}</td></tr>`)
    .join("");
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
      <p>${greeting}</p>
      <p>Thanks for your order — here's your confirmation.</p>
      <p style="font-weight:600">Order ${escapeHtml(args.odooOrderName)} · ${escapeHtml(args.orderDate)}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}</table>
      <p style="font-weight:600">Total: ₹${args.total.toLocaleString("en-IN")}</p>
      <p>Payment: ${args.paymentMethod === "online" ? "Paid online" : "Cash on Delivery"}</p>
      <p>Shipping to: ${escapeHtml(args.shippingAddress)}</p>
      <p style="margin-top:24px;color:#555">Questions? Reply to this email or visit our <a href="https://deliteauto.com/contact">contact page</a>.</p>
    </div>`;
  return sendEmail({
    idempotencyKey: args.retry ? `order_confirmation:${args.orderId}:retry${args.retry.attempt}` : `order_confirmation:${args.orderId}`,
    emailType: "order_confirmation",
    to: args.toEmail,
    subject: `Your Delite Auto order ${args.odooOrderName} is confirmed`,
    html,
    userId: args.userId,
    orderId: args.orderId,
    retryOf: args.retry?.of ?? null,
    attemptNumber: args.retry?.attempt ?? 1,
  });
}

export async function sendOrderProcessingDelay(args: { orderId: string; toEmail: string; odooOrderName?: string; userId?: string | null; retry?: EmailRetryArgs }): Promise<{ sent: boolean; reason?: string }> {
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
      <p>Your payment was received successfully. We're finalizing your order details and it will
      be confirmed shortly — no action is needed from you.</p>
      <p>If you don't see a full confirmation within a few hours, reply to this email and we'll
      sort it out.</p>
    </div>`;
  return sendEmail({
    idempotencyKey: args.retry ? `order_processing_delay:${args.orderId}:retry${args.retry.attempt}` : `order_processing_delay:${args.orderId}`,
    emailType: "order_processing_delay",
    to: args.toEmail,
    subject: "Your Delite Auto payment was received — order finalizing",
    html,
    userId: args.userId,
    // args.orderId here is actually the payment_attempts id (no real `orders` row exists yet at
    // the point this is sent — see _shared/payments/finalize.ts) — NOT a real orders.id, so it
    // must never be written to this column (email_log.order_id has an FK to orders.id and would
    // fail every single send otherwise).
    orderId: null,
    retryOf: args.retry?.of ?? null,
    attemptNumber: args.retry?.attempt ?? 1,
  });
}

export async function sendReviewApproved(args: { reviewId: string; toEmail: string; productName: string; userId?: string | null; retry?: EmailRetryArgs }): Promise<{ sent: boolean; reason?: string }> {
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
      <p>Your review for <strong>${escapeHtml(args.productName)}</strong> is now live — thanks for
      sharing your experience.</p>
    </div>`;
  return sendEmail({
    idempotencyKey: args.retry ? `review_approved:${args.reviewId}:retry${args.retry.attempt}` : `review_approved:${args.reviewId}`,
    emailType: "review_approved",
    to: args.toEmail,
    subject: "Your review is now live",
    html,
    userId: args.userId,
    retryOf: args.retry?.of ?? null,
    attemptNumber: args.retry?.attempt ?? 1,
  });
}

/**
 * Internal notification — sent to the store's own inbox (CONTACT_NOTIFICATION_EMAIL), never to
 * the person who submitted the form, when a new contact enquiry is saved (see
 * supabase/functions/contact-submit/index.ts). Skipped entirely (no log row, no attempt) if the
 * env var isn't set — this is genuinely optional, never a failure. All user-supplied content is
 * HTML-escaped before interpolation.
 */
export async function sendContactNotification(args: {
  enquiryId: string;
  name: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
  createdAt: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const to = Deno.env.get("CONTACT_NOTIFICATION_EMAIL");
  if (!to) return { sent: false, reason: "notification_not_configured" };

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111">
      <p style="font-weight:600">New contact enquiry</p>
      <p><strong>Name:</strong> ${escapeHtml(args.name)}<br/>
      <strong>Email:</strong> ${escapeHtml(args.email)}<br/>
      ${args.phone ? `<strong>Phone:</strong> ${escapeHtml(args.phone)}<br/>` : ""}
      <strong>Subject:</strong> ${escapeHtml(args.subject || "—")}<br/>
      <strong>Received:</strong> ${escapeHtml(new Date(args.createdAt).toLocaleString())}</p>
      <p style="white-space:pre-wrap;border-left:3px solid #ddd;padding-left:12px">${escapeHtml(args.message)}</p>
      <p><a href="https://deliteauto.com/admin/contact">Open in Admin →</a></p>
    </div>`;

  return sendEmail({
    idempotencyKey: `contact_enquiry_notification:${args.enquiryId}`,
    emailType: "contact_enquiry_notification",
    to,
    subject: `New contact enquiry — ${args.subject || args.name}`,
    html,
  });
}

/** Return/exchange request acknowledgement (spec #37, #60) — sent once per request, idempotent on
 * the request's own id so a retried insert/duplicate call can never double-send. */
export async function sendReturnRequestReceived(args: {
  requestId: string;
  toEmail: string;
  type: "return" | "exchange";
  odooOrderName: string;
  userId?: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const noun = args.type === "exchange" ? "exchange" : "return";
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
      <p>We've received your ${noun} request for order <strong>${escapeHtml(args.odooOrderName)}</strong>.</p>
      <p>Our team will review it and follow up with next steps. You can track its status from
      <a href="https://deliteauto.com/account/returns">My Returns &amp; Exchanges</a> in your account.</p>
    </div>`;
  return sendEmail({
    idempotencyKey: `${args.type}_request_received:${args.requestId}`,
    emailType: `${args.type}_request_received`,
    to: args.toEmail,
    subject: `We've received your ${noun} request`,
    html,
    userId: args.userId,
  });
}

/**
 * Abandoned-cart recovery — built as a reusable template/service per #55-57, but deliberately
 * gated behind ABANDONED_CART_RECOVERY_ENABLED (unset/false = disabled). Nothing calls this
 * automatically anywhere in this codebase yet; wiring a scheduled sender is explicitly future
 * work, kept off by default so this phase never starts sending marketing email on its own.
 */
export function isAbandonedCartRecoveryEnabled(): boolean {
  return Deno.env.get("ABANDONED_CART_RECOVERY_ENABLED") === "true";
}

export async function sendAbandonedCartRecovery(args: {
  cartId: string;
  toEmail: string;
  items: { name: string; qty: number }[];
  userId?: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!isAbandonedCartRecoveryEnabled()) return { sent: false, reason: "feature_disabled" };
  const itemLines = args.items.map((i) => `<li>${escapeHtml(i.name)} × ${i.qty}</li>`).join("");
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
      <p>You left some items in your cart:</p>
      <ul>${itemLines}</ul>
      <p><a href="https://deliteauto.com/cart">Return to your cart</a></p>
    </div>`;
  return sendEmail({
    idempotencyKey: `abandoned_cart_recovery:${args.cartId}`,
    emailType: "abandoned_cart_recovery",
    to: args.toEmail,
    subject: "You left something in your cart",
    html,
    userId: args.userId,
  });
}
