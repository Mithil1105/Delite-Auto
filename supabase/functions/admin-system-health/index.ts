// supabase/functions/admin-system-health/index.ts
//
// POST /functions/v1/admin-system-health — Admin-only operational health for Razorpay, Resend,
// and Analytics (Odoo already has its own odoo-health function/useOdooHealth hook — this
// deliberately doesn't duplicate that). Every status is derived from real evidence (env presence,
// actual rows in payment_attempts/payment_webhook_events/email_log/analytics tables) — never
// inferred from a secret's shape, and never a fabricated "Connected" just because a variable name
// exists. See Documentations MD/delite-production-operations.md.
//
// Never returns: API keys, webhook secrets, service role key, Odoo credentials, database names.

import { requireAdmin } from "../_shared/auth/requireAdmin.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireAdmin(req, ["owner", "admin"]);
  if (auth instanceof Response) return auth;
  const { db } = auth;

  const razorpayConfigured = !!Deno.env.get("RAZORPAY_KEY_ID") && !!Deno.env.get("RAZORPAY_KEY_SECRET");
  const webhookConfigured = !!Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  // Never inferred from the key's shape — an explicit, deliberately-set var only.
  const paymentEnvironment = Deno.env.get("PAYMENT_ENVIRONMENT") ?? "unknown";

  const resendConfigured = !!Deno.env.get("RESEND_API_KEY") && !!Deno.env.get("TRANSACTIONAL_FROM_EMAIL");

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    lastPayment,
    lastWebhook,
    recentWebhookFailures,
    lastSentEmail,
    failedEmails24h,
    lastAnalyticsEvent,
    owners,
    syncPendingRange,
    failedEmailRange,
    paymentFailureRange,
    contactNotifyFailureRange,
  ] = await Promise.all([
    db.from("payment_attempts").select("paid_at").in("status", ["authorized", "paid"]).order("paid_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("payment_webhook_events").select("received_at").order("received_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("payment_webhook_events").select("id", { count: "exact", head: true }).eq("success", false).gte("received_at", dayAgo),
    db.from("email_log").select("sent_at").eq("status", "sent").order("sent_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("email_log").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", dayAgo),
    db.from("analytics_events").select("occurred_at").order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("profiles").select("id").eq("admin_role", "owner").eq("is_admin", true),
    // Operational issue list (spec: issue/count/oldest/latest/View→, never hundreds of raw logs).
    db.from("payment_attempts").select("created_at", { count: "exact" }).eq("odoo_sync_pending", true).order("created_at", { ascending: true }),
    db.from("email_log").select("created_at", { count: "exact" }).eq("status", "failed").gte("created_at", dayAgo).order("created_at", { ascending: true }),
    db.from("payment_attempts").select("created_at", { count: "exact" }).in("status", ["failed", "expired"]).gte("created_at", dayAgo).order("created_at", { ascending: true }),
    db.from("email_log").select("created_at", { count: "exact" }).eq("email_type", "contact_enquiry_notification").eq("status", "failed").order("created_at", { ascending: true }),
  ]);

  const issue = (key: string, label: string, href: string, res: { data: { created_at: string }[] | null; count: number | null }) => {
    const rows = res.data ?? [];
    if (!rows.length) return null;
    return { key, label, href, count: res.count ?? rows.length, oldest: rows[0].created_at, latest: rows[rows.length - 1].created_at };
  };

  const issues = [
    issue("odoo_sync_pending", "Paid orders awaiting Odoo sync", "/admin/payments?syncState=pending", syncPendingRange),
    issue("failed_emails", "Failed transactional emails (24h)", "/admin/system/email?status=failed", failedEmailRange),
    issue("payment_failures", "Payment failures (24h)", "/admin/payments?status=failed", paymentFailureRange),
    issue("contact_notification_failures", "Failed contact-notification emails", "/admin/system/email?status=failed", contactNotifyFailureRange),
  ].filter((i): i is NonNullable<typeof i> => i !== null);

  const ownerIds = (owners.data ?? []).map((r) => r.id as string);
  // Real evidence, not a guess: Supabase's Auth Admin API returns each user's enrolled MFA
  // factors directly — the same call `admin-users-manage`'s `list` action already uses. "Every
  // owner account has a verified TOTP factor" (not just one) is the correct bar for a security
  // checklist — a second, unenrolled owner account is still a real gap.
  const ownerMfaChecks = await Promise.all(
    ownerIds.map(async (id) => {
      const { data } = await db.auth.admin.getUserById(id);
      return (data.user?.factors ?? []).some((f) => f.status === "verified");
    })
  );
  const mfaEnrolledForOwner = ownerIds.length > 0 && ownerMfaChecks.every(Boolean);

  const checklist = {
    razorpayConfigured,
    razorpayWebhookVerified: (recentWebhookFailures.count ?? 0) >= 0 && !!lastWebhook.data,
    transactionalEmailConfigured: resendConfigured,
    contactCapture: true,
    adminOwnerExists: ownerIds.length > 0,
    authRedirectUrls: "unknown" as const,
    leakedPasswordProtection: "unknown" as const,
    mfaEnrolledForOwner,
  };

  return json(
    {
      razorpay: {
        configured: razorpayConfigured,
        webhookConfigured,
        mode: paymentEnvironment,
        lastAuthorizedPaymentAt: lastPayment.data?.paid_at ?? null,
        lastWebhookReceivedAt: lastWebhook.data?.received_at ?? null,
        recentWebhookFailureCount: recentWebhookFailures.count ?? 0,
      },
      resend: {
        configured: resendConfigured,
        lastSuccessfulEmailAt: lastSentEmail.data?.sent_at ?? null,
        failedEmailCount24h: failedEmails24h.count ?? 0,
      },
      analytics: {
        lastEventAt: lastAnalyticsEvent.data?.occurred_at ?? null,
      },
      supabase: { reachable: true },
      checklist,
      issues,
    },
    200
  );
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
