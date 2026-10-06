// supabase/functions/customer-addresses/index.ts
//
// POST /functions/v1/customer-addresses — authenticated only.
//   { action: "list" } -> the customer's saved delivery addresses (Odoo child res.partner
//     contacts, type='delivery', parent_id = the caller's mapped partner — spec #7).
//   { action: "add", address: {...} } -> creates a new delivery child contact. The PARENT is
//     always derived server-side from the caller's own mapping — the browser can never supply a
//     parent_id (spec #8). If the caller has no mapping yet (no order placed yet), one is created
//     now using the address's own name/phone as the customer's first Odoo contact.
//
// Odoo remains the only address store — no competing Supabase-only address book (spec #7).

import { createClient } from "npm:@supabase/supabase-js@2";
import { getOdooConfig, odooCreate, odooSearchRead, type OdooConfig } from "../_shared/odoo/client.ts";
import { resolveStructuredAddress } from "../_shared/address/resolveAddress.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AddressBody {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  label?: string;
}

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

  let body: { action?: string; address?: AddressBody };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const odooConfig = getOdooConfig();
  if (!odooConfig) return json({ error: "Temporarily unavailable" }, 501);

  const { data: profile } = await db.from("profiles").select("odoo_partner_id, full_name, phone").eq("id", user.id).maybeSingle();

  if (body.action === "list") {
    if (!profile?.odoo_partner_id) return json({ addresses: [] });
    try {
      const rows = await odooSearchRead<{
        id: number;
        name: string;
        street: string | false;
        street2: string | false;
        city: string | false;
        zip: string | false;
        state_id: [number, string] | false;
        country_id: [number, string] | false;
        phone: string | false;
      }>(
        odooConfig,
        "res.partner",
        [["parent_id", "=", profile.odoo_partner_id], ["type", "=", "delivery"]],
        ["id", "name", "street", "street2", "city", "zip", "state_id", "country_id", "phone"]
      );
      return json({
        addresses: rows.map((r) => ({
          id: r.id,
          label: r.name,
          line1: r.street || "",
          line2: r.street2 || "",
          city: r.city || "",
          state: r.state_id ? r.state_id[1] : "",
          pincode: r.zip || "",
          country: r.country_id ? r.country_id[1] : "",
          phone: r.phone || "",
        })),
      });
    } catch (err) {
      console.error("[customer-addresses] list failed", err instanceof Error ? err.message : err);
      return json({ addresses: [] });
    }
  }

  if (body.action === "add") {
    const a = body.address;
    if (!a?.line1?.trim() || !a.city?.trim() || !a.state?.trim() || !a.pincode?.trim()) {
      return json({ error: "A complete address is required" }, 400);
    }
    try {
      const parentId = await resolveOrCreateParent(db, odooConfig, user.id, user.email ?? "", profile);
      const structured = await resolveStructuredAddress(odooConfig, a);
      const newId = await odooCreate(odooConfig, "res.partner", {
        parent_id: parentId,
        type: "delivery",
        name: a.label?.trim() || `${profile?.full_name ?? "Delivery"} address`,
        street: structured.street,
        street2: structured.street2 || undefined,
        city: structured.city || undefined,
        zip: structured.zip || undefined,
        state_id: structured.state_id,
        country_id: structured.country_id,
        phone: profile?.phone || undefined,
      });
      return json({ id: newId }, 200);
    } catch (err) {
      console.error("[customer-addresses] add failed", err instanceof Error ? err.message : err);
      return json({ error: "Could not save this address — please try again" }, 502);
    }
  }

  return json({ error: "Unknown action" }, 400);
});

async function resolveOrCreateParent(
  // deno-lint-ignore no-explicit-any
  db: any,
  odooConfig: OdooConfig,
  userId: string,
  email: string,
  profile: { odoo_partner_id: number | null; full_name: string | null; phone: string | null } | null
): Promise<number> {
  if (profile?.odoo_partner_id) return profile.odoo_partner_id;

  // First address before any order — same safe, ambiguity-aware search as checkout uses, kept
  // deliberately minimal here rather than re-importing the full resolveCustomer() (no delivery
  // child needed at this step, only the parent).
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail) {
    const matches = await odooSearchRead<{ id: number }>(odooConfig, "res.partner", [["email", "=ilike", normalizedEmail], ["type", "=", "contact"]], ["id"], { limit: 2 });
    if (matches.length === 1) {
      await db.from("profiles").update({ odoo_partner_id: matches[0].id }).eq("id", userId).is("odoo_partner_id", null);
      return matches[0].id;
    }
  }
  const newId = await odooCreate(odooConfig, "res.partner", { name: profile?.full_name || email || "Delite customer", email: normalizedEmail || undefined, phone: profile?.phone || undefined });
  await db.from("profiles").update({ odoo_partner_id: newId }).eq("id", userId).is("odoo_partner_id", null);
  return newId;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
