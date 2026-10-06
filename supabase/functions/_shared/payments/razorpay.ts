// Razorpay REST helpers — plain fetch (no SDK dependency needed for Deno). Credentials read only
// from Deno.env, never returned to the client except the public key id (safe to expose — it
// identifies the account, it isn't a secret). Gracefully unconfigured: getRazorpayConfig() returns
// null when RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET aren't set, same pattern as getOdooConfig() —
// callers turn that into a clean "payment temporarily unavailable" response, never a crash.
//
// Signature verification itself lives in ./signature.ts (Deno-global-free, so it's directly unit
// testable from Vitest/Node — see server/payments/razorpay.test.ts) — re-exported here for
// backward-compatible imports.

export { verifyPaymentSignature as verifyPaymentSignatureRaw, verifyWebhookSignature } from "./signature.ts";
import { verifyPaymentSignature as verifyPaymentSignatureRaw } from "./signature.ts";

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string | null;
}

export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, webhookSecret: Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? null };
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

/** Creates a Razorpay Order (server-authoritative amount — the browser never sets the amount that
 * gets charged). `amountInPaise` must be an integer (Razorpay's smallest currency unit). */
export async function createRazorpayOrder(config: RazorpayConfig, amountInPaise: number, currency: string, receipt: string): Promise<RazorpayOrder> {
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${config.keyId}:${config.keySecret}`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: amountInPaise, currency, receipt, payment_capture: 1 }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Razorpay order creation failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as RazorpayOrder;
}

/** Config-object convenience wrapper around signature.ts's verifyPaymentSignature. */
export function verifyPaymentSignature(config: RazorpayConfig, razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string): Promise<boolean> {
  return verifyPaymentSignatureRaw(config.keySecret, razorpayOrderId, razorpayPaymentId, razorpaySignature);
}
