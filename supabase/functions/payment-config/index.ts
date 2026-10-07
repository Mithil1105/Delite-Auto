// supabase/functions/payment-config/index.ts
//
// POST /functions/v1/payment-config — lets Checkout.tsx know UP FRONT whether online payment can
// actually initialize, so it never shows "Pay Online" as an option only to fail after the
// customer selects it and submits (spec: checkout must stay honest about provider availability).
// Reveals only a boolean — never a key, never inferred from a secret's shape (see
// Documentations MD/delite-production-operations.md). Requires a normal signed-in session (same
// as every other checkout-adjacent function) but no admin role — this isn't sensitive information.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getRazorpayConfig } from "../_shared/payments/razorpay.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Not configured" }, 500);
  const db = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await db.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: "Invalid or expired session" }, 401);

  return json({ onlinePaymentConfigured: !!getRazorpayConfig() }, 200);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
