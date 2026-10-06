// supabase/functions/review-notify/index.ts
//
// POST /functions/v1/review-notify — sends the "your review is now live" email (#18) after an
// admin approves a review. A dedicated function because `_shared/email` is Deno-only server code
// (can't be called directly from the Admin browser bundle) and because resolving the reviewer's
// real email requires the Admin Auth API (service-role only, never in the browser).
//
// Auth-gated: requires a real admin session (profiles.admin_role set), re-verified server-side —
// never trusts the browser's own role check alone. Best-effort: a failure here never blocks or
// reverts the review-approval action itself (the caller fires this after its own update already
// succeeded).

import { getOdooConfig, odooSearchRead } from "../_shared/odoo/client.ts";
import { sendReviewApproved } from "../_shared/email/index.ts";
import { requireAdmin } from "../_shared/auth/requireAdmin.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireAdmin(req, ["owner", "admin", "content", "merchandising", "support", "analytics"]);
  if (auth instanceof Response) return auth;
  const { db } = auth;

  let body: { reviewId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!body.reviewId) return json({ error: "reviewId is required" }, 400);

  const { data: review } = await db.from("product_reviews").select("id, user_id, odoo_template_id, status").eq("id", body.reviewId).maybeSingle();
  if (!review || review.status !== "approved") return json({ ok: false, reason: "not_approved" }, 200);

  const { data: reviewerRes } = await db.auth.admin.getUserById(review.user_id);
  const toEmail = reviewerRes?.user?.email;
  if (!toEmail) return json({ ok: false, reason: "no_email_on_file" }, 200); // never invent one for an anonymous review

  let productName = `product #${review.odoo_template_id}`;
  const odooConfig = getOdooConfig();
  if (odooConfig) {
    try {
      const [product] = await odooSearchRead<{ name: string }>(odooConfig, "product.template", [["id", "=", review.odoo_template_id]], ["name"]);
      if (product?.name) productName = product.name;
    } catch {
      // Non-critical — the email still sends with the fallback name above.
    }
  }

  const result = await sendReviewApproved({ reviewId: review.id, toEmail, productName, userId: review.user_id });
  return json({ ok: result.sent, reason: result.reason }, 200);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
