// supabase/functions/submit-review/index.ts
//
// POST /functions/v1/submit-review { odooTemplateId, rating, title?, body?, photoPaths? }
// Authenticated only. Replaces the previous client-direct `supabase.from("product_reviews")
// .insert(...)` so two fields can be computed server-side, never trusted from the client:
//   - reviewer_name: a snapshot of the caller's own profiles.full_name at submission time.
//   - verified_purchase: true only if a live Odoo sale.order.line query finds a real,
//     non-cancelled order for this exact product under the caller's own mapped
//     profiles.odoo_partner_id — a client-supplied boolean here could trivially lie.
// status still defaults to 'pending' via the existing product_reviews_force_pending trigger
// regardless of what this function sends — defense in depth, unchanged.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getOdooConfig, odooSearchRead } from "../_shared/odoo/client.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SubmitReviewBody {
  odooTemplateId?: number;
  rating?: number;
  title?: string | null;
  body?: string | null;
  photoPaths?: string[];
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

  let body: SubmitReviewBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const odooTemplateId = body.odooTemplateId;
  const rating = body.rating;
  if (!Number.isInteger(odooTemplateId) || odooTemplateId! <= 0) return json({ error: "A valid product is required" }, 400);
  if (!Number.isInteger(rating) || rating! < 1 || rating! > 5) return json({ error: "Rating must be 1-5" }, 400);
  const photoPaths = Array.isArray(body.photoPaths) ? body.photoPaths.filter((p): p is string => typeof p === "string").slice(0, 6) : [];
  // Every photo path must live inside the caller's own storage folder — the same constraint the
  // storage RLS policy already enforces on upload, re-checked here so a crafted request can't
  // attribute someone else's uploaded photo to this review.
  if (photoPaths.some((p) => !p.startsWith(`${user.id}/`))) return json({ error: "Invalid photo reference" }, 400);

  const { data: profile } = await db.from("profiles").select("full_name, odoo_partner_id").eq("id", user.id).maybeSingle();

  let verifiedPurchase = false;
  const odooConfig = getOdooConfig();
  if (odooConfig && profile?.odoo_partner_id) {
    try {
      const lines = await odooSearchRead<{ id: number }>(
        odooConfig,
        "sale.order.line",
        [
          ["order_id.partner_id", "=", profile.odoo_partner_id],
          ["order_id.state", "!=", "cancel"],
          ["product_id.product_tmpl_id", "=", odooTemplateId],
        ],
        ["id"],
        { limit: 1 }
      );
      verifiedPurchase = lines.length > 0;
    } catch (err) {
      // A transient Odoo failure must never block a review submission — the badge is a nice-to-
      // have, not a gate; it just stays unverified for this attempt.
      console.error("[submit-review] verified-purchase check failed (non-fatal)", err instanceof Error ? err.message : err);
    }
  }

  const { error: insertError } = await db.from("product_reviews").insert({
    odoo_template_id: odooTemplateId,
    user_id: user.id,
    rating,
    title: typeof body.title === "string" ? body.title.trim() || null : null,
    body: typeof body.body === "string" ? body.body.trim() || null : null,
    reviewer_name: profile?.full_name ?? null,
    verified_purchase: verifiedPurchase,
    photo_paths: photoPaths,
  });

  if (insertError) {
    const message = insertError.message.toLowerCase().includes("duplicate") ? "already_reviewed" : "submit_failed";
    return json({ error: message }, message === "already_reviewed" ? 409 : 500);
  }

  return json({ ok: true, verifiedPurchase });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
