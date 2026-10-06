// supabase/functions/customer-profile/index.ts
//
// POST /functions/v1/customer-profile — authenticated only. Returns the signed-in customer's
// commerce profile: real Odoo res.partner fields when a mapping exists, safely degraded Supabase
// profile fields otherwise. Never accepts or trusts a client-supplied partner id — the mapping is
// resolved server-side from auth.uid() only (spec #3, #6).
//
// Returns ONLY: name, email, phone, and the customer's default/billing address (street/street2) —
// never an arbitrary res.partner field.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getOdooConfig, odooSearchRead } from "../_shared/odoo/client.ts";

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
  if (userError || !userData.user) return json({ error: "Invalid or expired session — please sign in again" }, 401);
  const user = userData.user;

  const { data: profile } = await db.from("profiles").select("odoo_partner_id, full_name, phone").eq("id", user.id).maybeSingle();

  if (!profile?.odoo_partner_id) {
    // No mapping yet — this is normal for a brand-new account that hasn't checked out. Return
    // what Supabase already knows, honestly labeled as not-yet-linked rather than guessing.
    return json({
      linked: false,
      name: profile?.full_name ?? null,
      email: user.email ?? null,
      phone: profile?.phone ?? null,
      address: null,
    });
  }

  const odooConfig = getOdooConfig();
  if (!odooConfig) return json({ linked: true, name: profile.full_name, email: user.email, phone: profile.phone, address: null });

  try {
    const [partner] = await odooSearchRead<{ id: number; name: string; email: string | false; phone: string | false; street: string | false; street2: string | false }>(
      odooConfig,
      "res.partner",
      [["id", "=", profile.odoo_partner_id]],
      ["id", "name", "email", "phone", "street", "street2"]
    );
    if (!partner) return json({ linked: true, name: profile.full_name, email: user.email, phone: profile.phone, address: null });

    return json({
      linked: true,
      name: partner.name,
      email: partner.email || user.email || null,
      phone: partner.phone || profile.phone || null,
      address: partner.street ? { line1: partner.street, line2: partner.street2 || null } : null,
    });
  } catch (err) {
    console.error("[customer-profile]", err instanceof Error ? err.message : err);
    // Odoo unreachable — degrade to the Supabase-known fields rather than erroring the whole page.
    return json({ linked: true, name: profile.full_name, email: user.email, phone: profile.phone, address: null });
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
