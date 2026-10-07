import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useOdooHealth } from "../../hooks/useOdooHealth";
import { Panel, Badge } from "../../analytics/ui";

interface Issue {
  key: string;
  label: string;
  href: string;
  count: number;
  oldest: string;
  latest: string;
}

interface SystemHealth {
  razorpay: {
    configured: boolean;
    webhookConfigured: boolean;
    mode: string;
    lastAuthorizedPaymentAt: string | null;
    lastWebhookReceivedAt: string | null;
    recentWebhookFailureCount: number;
  };
  resend: { configured: boolean; lastSuccessfulEmailAt: string | null; failedEmailCount24h: number };
  analytics: { lastEventAt: string | null };
  supabase: { reachable: boolean };
  issues: Issue[];
  checklist: {
    razorpayConfigured: boolean;
    razorpayWebhookVerified: boolean;
    transactionalEmailConfigured: boolean;
    contactCapture: boolean;
    adminOwnerExists: boolean;
    authRedirectUrls: "unknown";
    leakedPasswordProtection: "unknown";
    // Real evidence (the Auth Admin API's per-user factor list), not a guess — unlike the two
    // above, which genuinely need Management API access this project doesn't have. See
    // Documentations MD/delite-auth-security.md, "security-hardening verification pass".
    mfaEnrolledForOwner: boolean;
  };
}

function fmt(v: string | null): string {
  return v ? new Date(v).toLocaleString() : "Never";
}

/** Razorpay/Resend distinct states (spec: never call something "Healthy" merely because an env
 * var exists — real stored operational evidence, e.g. a verified payment or successful send, is
 * required before that word is used). */
function ProviderStatusBadge({ configured, hasEvidence, evidenceLabel }: { configured: boolean; hasEvidence: boolean; evidenceLabel: string }) {
  if (!configured) return <Badge tone="warn">Not configured</Badge>;
  if (hasEvidence) return <Badge tone="good">Healthy</Badge>;
  return <Badge tone="neutral">Configured — no {evidenceLabel} recorded yet</Badge>;
}

function ChecklistRow({ label, ok }: { label: string; ok: boolean | "unknown" }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-line last:border-b-0 text-[13px]">
      <span className="text-steel-500">{label}</span>
      {ok === "unknown" ? <Badge tone="neutral">Unknown / manual check</Badge> : <Badge tone={ok ? "good" : "bad"}>{ok ? "✓" : "✗"}</Badge>}
    </div>
  );
}

/**
 * Operational health for external systems (spec: Admin can SEE a problem without reading Edge
 * Function logs). Odoo reuses the existing useOdooHealth()/odoo-health function unchanged —
 * Razorpay/Resend/Analytics/the readiness checklist come from the new admin-system-health
 * function. Never renders a secret — see Documentations MD/delite-production-operations.md.
 */
export default function Integrations() {
  const { health: odooHealth, loading: odooLoading, checkedAt, refresh: refreshOdoo } = useOdooHealth();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.functions.invoke<SystemHealth>("admin-system-health", { method: "POST" });
    if (data) setHealth(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const odooOk = odooHealth ? odooHealth.reachable && (odooHealth.legacyRpcAuthenticated || !!odooHealth.json2Authenticated) : null;

  return (
    <div className="p-6 lg:p-10 max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display uppercase text-[13.5px]">Integrations Health</h2>
        <button
          type="button"
          onClick={() => {
            refreshOdoo();
            refresh();
          }}
          disabled={loading || odooLoading}
          className="btn-ghost !px-3 !py-1.5 text-[12.5px] gap-1.5"
        >
          <RefreshCw className={loading || odooLoading ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} /> Refresh
        </button>
      </div>

      <Panel title="Attention">
        {!health ? (
          <p className="text-[13px] text-steel-500">Loading…</p>
        ) : health.issues.length === 0 ? (
          <p className="text-[13px] text-steel-500">All systems operational — no open issues.</p>
        ) : (
          <div className="divide-y divide-line">
            {health.issues.map((issue) => (
              <div key={issue.key} className="flex items-center justify-between py-2.5 text-[13px]">
                <div>
                  <span className="font-semibold">{issue.count}</span> <span>{issue.label}</span>
                  <div className="text-[11.5px] text-steel-500">
                    Oldest {new Date(issue.oldest).toLocaleString()} · Latest {new Date(issue.latest).toLocaleString()}
                  </div>
                </div>
                <Link to={issue.href} className="text-[12.5px] font-semibold text-brand-700 hover:underline shrink-0 ml-4">View →</Link>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Odoo" subtitle={`Last checked: ${checkedAt ? checkedAt.toLocaleString() : "—"}`}>
        <div className="flex items-center justify-between py-2 border-b border-line text-[13px]">
          <span className="text-steel-500">Status</span>
          <Badge tone={odooOk === null ? "neutral" : odooOk ? "good" : "bad"}>{odooOk === null ? "Checking…" : odooOk ? "Connected" : "Error"}</Badge>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-line text-[13px]">
          <span className="text-steel-500">Version</span>
          <span className="font-medium">{odooHealth?.odooServerVersion ?? "—"}</span>
        </div>
        {odooHealth?.error && <p className="text-[12.5px] text-sale mt-2">{odooHealth.error}</p>}
      </Panel>

      <Panel title="Razorpay" subtitle="Online payments">
        <div className="flex items-center justify-between py-2 border-b border-line text-[13px]">
          <span className="text-steel-500">Status</span>
          <ProviderStatusBadge configured={health?.razorpay.configured ?? false} hasEvidence={!!health?.razorpay.lastAuthorizedPaymentAt} evidenceLabel="verified payment" />
        </div>
        <div className="flex items-center justify-between py-2 border-b border-line text-[13px]">
          <span className="text-steel-500">Mode</span>
          <span className="font-medium uppercase">{health?.razorpay.mode ?? "unknown"}</span>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-line text-[13px]">
          <span className="text-steel-500">Last successful verified payment</span>
          <span className="font-medium">{fmt(health?.razorpay.lastAuthorizedPaymentAt ?? null)}</span>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-line text-[13px]">
          <span className="text-steel-500">Last webhook received</span>
          <span className="font-medium">{fmt(health?.razorpay.lastWebhookReceivedAt ?? null)}</span>
        </div>
        <div className="flex items-center justify-between py-2 text-[13px]">
          <span className="text-steel-500">Recent webhook failures (24h)</span>
          <Badge tone={(health?.razorpay.recentWebhookFailureCount ?? 0) > 0 ? "bad" : "good"}>{health?.razorpay.recentWebhookFailureCount ?? 0}</Badge>
        </div>
      </Panel>

      <Panel title="Resend" subtitle="Transactional email">
        <div className="flex items-center justify-between py-2 border-b border-line text-[13px]">
          <span className="text-steel-500">Status</span>
          <ProviderStatusBadge configured={health?.resend.configured ?? false} hasEvidence={!!health?.resend.lastSuccessfulEmailAt} evidenceLabel="successful sends" />
        </div>
        <div className="flex items-center justify-between py-2 border-b border-line text-[13px]">
          <span className="text-steel-500">Last successful email</span>
          <span className="font-medium">{fmt(health?.resend.lastSuccessfulEmailAt ?? null)}</span>
        </div>
        <div className="flex items-center justify-between py-2 text-[13px]">
          <span className="text-steel-500">Failed emails (24h)</span>
          <Badge tone={(health?.resend.failedEmailCount24h ?? 0) > 0 ? "bad" : "good"}>{health?.resend.failedEmailCount24h ?? 0}</Badge>
        </div>
      </Panel>

      <Panel title="Analytics">
        <div className="flex items-center justify-between py-2 text-[13px]">
          <span className="text-steel-500">Last event received</span>
          <span className="font-medium">{health?.analytics.lastEventAt ? fmt(health.analytics.lastEventAt) : "No recent events"}</span>
        </div>
      </Panel>

      <Panel title="Production readiness checklist">
        {health ? (
          <>
            <ChecklistRow label="Odoo authenticated" ok={odooOk ?? "unknown"} />
            <ChecklistRow label="Razorpay configured" ok={health.checklist.razorpayConfigured} />
            <ChecklistRow label="Razorpay webhook verified" ok={health.checklist.razorpayWebhookVerified} />
            <ChecklistRow label="Transactional email configured" ok={health.checklist.transactionalEmailConfigured} />
            <ChecklistRow label="Auth redirect URLs" ok={health.checklist.authRedirectUrls} />
            <ChecklistRow label="Contact capture" ok={health.checklist.contactCapture} />
            <ChecklistRow label="Admin owner exists" ok={health.checklist.adminOwnerExists} />
            <ChecklistRow label="Leaked-password protection" ok={health.checklist.leakedPasswordProtection} />
            <ChecklistRow label="MFA enrolled for owner" ok={health.checklist.mfaEnrolledForOwner} />
          </>
        ) : (
          <p className="text-[13px] text-steel-500">Loading…</p>
        )}
      </Panel>

      <p className="text-[11.5px] text-steel-500">
        Only non-secret status is ever shown here — no API keys, webhook secrets, service role key, or Odoo credentials.
      </p>
    </div>
  );
}
