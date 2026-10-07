// Pure HMAC signature verification — deliberately free of any Deno-only global (no `Deno.env`),
// so it loads unchanged in both the Deno Edge Functions and its Vitest suite (Node), same
// discipline as supabase/functions/_shared/analytics/core.ts. Only `crypto.subtle`/`TextEncoder`,
// both standard Web APIs available in Deno and modern Node.

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifies the post-checkout client callback signature: HMAC-SHA256(order_id|payment_id,
 * key_secret) must equal razorpay_signature. This is the "fast path" verification — the webhook
 * (verified separately, over the raw request body with RAZORPAY_WEBHOOK_SECRET) remains the
 * authoritative source of truth; this never runs standalone as "payment_id from browser = paid". */
export async function verifyPaymentSignature(keySecret: string, razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string): Promise<boolean> {
  const expected = await hmacSha256Hex(keySecret, `${razorpayOrderId}|${razorpayPaymentId}`);
  return timingSafeEqual(expected, razorpaySignature);
}

/** Verifies a webhook request's signature over the RAW request body (must be computed before any
 * JSON.parse — Razorpay signs the exact bytes sent). */
export async function verifyWebhookSignature(webhookSecret: string, rawBody: string, signatureHeader: string): Promise<boolean> {
  const expected = await hmacSha256Hex(webhookSecret, rawBody);
  return timingSafeEqual(expected, signatureHeader);
}
