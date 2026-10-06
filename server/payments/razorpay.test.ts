// Tests the security-critical signature verification in
// supabase/functions/_shared/payments/signature.ts directly — deliberately Deno-global-free (no
// `Deno.env` reference anywhere in that module), same discipline as
// supabase/functions/_shared/analytics/core.ts, so it loads unchanged in Vitest/Node. See
// Documentations MD/delite-payments.md, "Testing" (#65: invalid signature).

import { describe, expect, it } from "vitest";
import { verifyPaymentSignature, verifyWebhookSignature } from "../../supabase/functions/_shared/payments/signature.ts";

const keySecret = "test_secret_abc123";
const webhookSecret = "webhook_secret_xyz789";

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("verifyPaymentSignature", () => {
  it("accepts a correctly computed signature", async () => {
    const orderId = "order_abc123";
    const paymentId = "pay_xyz789";
    const validSignature = await hmacHex(keySecret, `${orderId}|${paymentId}`);
    await expect(verifyPaymentSignature(keySecret, orderId, paymentId, validSignature)).resolves.toBe(true);
  });

  it("rejects a tampered signature", async () => {
    const orderId = "order_abc123";
    const paymentId = "pay_xyz789";
    const validSignature = await hmacHex(keySecret, `${orderId}|${paymentId}`);
    const tampered = validSignature.slice(0, -1) + (validSignature.at(-1) === "0" ? "1" : "0");
    await expect(verifyPaymentSignature(keySecret, orderId, paymentId, tampered)).resolves.toBe(false);
  });

  it("rejects a signature computed with the wrong order/payment id (replay across attempts)", async () => {
    const validSignature = await hmacHex(keySecret, "order_abc123|pay_xyz789");
    await expect(verifyPaymentSignature(keySecret, "order_different", "pay_xyz789", validSignature)).resolves.toBe(false);
  });

  it("rejects an empty signature", async () => {
    await expect(verifyPaymentSignature(keySecret, "order_abc123", "pay_xyz789", "")).resolves.toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  it("accepts a signature computed over the exact raw body", async () => {
    const rawBody = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1" } } } });
    const validSignature = await hmacHex(webhookSecret, rawBody);
    await expect(verifyWebhookSignature(webhookSecret, rawBody, validSignature)).resolves.toBe(true);
  });

  it("rejects when the body was re-serialized (even semantically identical JSON with different byte layout)", async () => {
    const original = '{"event":"payment.captured","payload":{}}';
    const reformatted = '{ "event": "payment.captured", "payload": {} }';
    const validSignature = await hmacHex(webhookSecret, original);
    // Signed over `original`'s exact bytes — verifying against a differently-formatted (but
    // semantically equal) body must fail, proving the check is over raw bytes, not parsed JSON.
    await expect(verifyWebhookSignature(webhookSecret, reformatted, validSignature)).resolves.toBe(false);
  });

  it("rejects a forged signature from a different (attacker-guessed) secret", async () => {
    const rawBody = '{"event":"payment.captured"}';
    const forgedSignature = await hmacHex("wrong_secret", rawBody);
    await expect(verifyWebhookSignature(webhookSecret, rawBody, forgedSignature)).resolves.toBe(false);
  });
});
