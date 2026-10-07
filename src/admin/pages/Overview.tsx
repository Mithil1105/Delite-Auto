import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { useOdooHealth } from "../hooks/useOdooHealth";
import { getLastPublication, getPageSections } from "../services/cmsService";

interface Stats {
  sectionsVisible: number;
  sectionsTotal: number;
  ordersCount: number;
  pendingReviews: number;
}

interface AttentionStats {
  odooSyncPending: number;
  failedEmails: number;
  openEnquiries: number;
  paymentFailuresToday: number;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-surface p-5">
      <h3 className="font-display uppercase text-[12.5px] text-steel-500 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[13.5px]">
      <span className="text-steel-500">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export default function Overview() {
  const { health, loading: odooLoading, checkedAt } = useOdooHealth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [attention, setAttention] = useState<AttentionStats | null>(null);
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  const [recentActivity, setRecentActivity] = useState<{ action: string; created_at: string }[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    Promise.all([
      getPageSections("homepage"),
      getLastPublication("homepage"),
      supabase.from("orders").select("id", { count: "exact", head: true }),
      supabase.from("product_reviews").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("admin_activity_log").select("action, created_at").order("created_at", { ascending: false }).limit(5),
      supabase.from("payment_attempts").select("id", { count: "exact", head: true }).eq("odoo_sync_pending", true),
      supabase.from("email_log").select("id", { count: "exact", head: true }).eq("status", "failed"),
      supabase.from("contact_enquiries").select("id", { count: "exact", head: true }).in("status", ["new", "in_progress"]),
      supabase.from("payment_attempts").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", todayStart.toISOString()),
    ]).then(([sections, lastPub, orders, pendingReviews, activity, syncPending, failedEmails, openEnquiries, paymentFailures]) => {
      if (cancelled) return;
      setStats({
        sectionsVisible: sections.filter((s) => s.visible).length,
        sectionsTotal: sections.length,
        ordersCount: orders.count ?? 0,
        pendingReviews: pendingReviews.count ?? 0,
      });
      setAttention({
        odooSyncPending: syncPending.count ?? 0,
        failedEmails: failedEmails.count ?? 0,
        openEnquiries: openEnquiries.count ?? 0,
        paymentFailuresToday: paymentFailures.count ?? 0,
      });
      setLastPublishedAt(lastPub?.publishedAt ?? null);
      setRecentActivity(activity.data ?? []);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const odooOk = health?.reachable && (health.legacyRpcAuthenticated || health.json2Authenticated);

  return (
    <div className="p-6 lg:p-10 max-w-6xl">
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {attention && (attention.odooSyncPending > 0 || attention.failedEmails > 0 || attention.openEnquiries > 0 || attention.paymentFailuresToday > 0) && (
          <Card title="⚠ Attention Required">
            {attention.odooSyncPending > 0 && (
              <Row label="Orders awaiting Odoo sync" value={<Link to="/admin/system/odoo-sync" className="text-brand-700 hover:underline">{attention.odooSyncPending} →</Link>} />
            )}
            {attention.failedEmails > 0 && (
              <Row label="Failed emails" value={<Link to="/admin/system/email" className="text-brand-700 hover:underline">{attention.failedEmails} →</Link>} />
            )}
            {attention.openEnquiries > 0 && (
              <Row label="Open contact enquiries" value={<Link to="/admin/contact" className="text-brand-700 hover:underline">{attention.openEnquiries} →</Link>} />
            )}
            {attention.paymentFailuresToday > 0 && (
              <Row label="Payment failures today" value={<Link to="/admin/system/odoo-sync" className="text-brand-700 hover:underline">{attention.paymentFailuresToday} →</Link>} />
            )}
          </Card>
        )}

        <Card title="Website">
          {stats ? (
            <>
              <Row label="Homepage sections" value={`${stats.sectionsVisible} / ${stats.sectionsTotal} visible`} />
              <Row label="Last published" value={lastPublishedAt ? new Date(lastPublishedAt).toLocaleString() : "Never published"} />
            </>
          ) : (
            <p className="text-[13px] text-steel-500">Loading…</p>
          )}
          <Link to="/admin/website/homepage" className="text-[12.5px] font-semibold text-brand-700 hover:underline mt-3 inline-block">
            Open Homepage CMS →
          </Link>
        </Card>

        <Card title="Odoo">
          {odooLoading ? (
            <p className="text-[13px] text-steel-500">Checking…</p>
          ) : (
            <>
              <Row label="Connection" value={odooOk ? "Connected" : "Error"} />
              <Row label="Version" value={health?.odooServerVersion ?? "—"} />
              <Row label="Last checked" value={checkedAt ? checkedAt.toLocaleTimeString() : "—"} />
            </>
          )}
          <Link to="/admin/odoo/status" className="text-[12.5px] font-semibold text-brand-700 hover:underline mt-3 inline-block">
            Open Odoo status →
          </Link>
        </Card>

        <Card title="Commerce">
          {stats ? (
            <Row label="Orders placed" value={stats.ordersCount} />
          ) : (
            <p className="text-[13px] text-steel-500">Loading…</p>
          )}
          <Link to="/admin/orders" className="text-[12.5px] font-semibold text-brand-700 hover:underline mt-3 inline-block">
            Open Orders →
          </Link>
        </Card>

        <Card title="Behaviour">
          <p className="text-[13.5px] text-steel-500">Not available yet — no visitor/cart tracking is implemented.</p>
        </Card>

        <Card title="Operations">
          {stats ? <Row label="Pending reviews" value={stats.pendingReviews} /> : <p className="text-[13px] text-steel-500">Loading…</p>}
          <div className="mt-3 flex flex-col gap-1">
            {recentActivity && recentActivity.length === 0 && <p className="text-[12.5px] text-steel-500">No recent activity.</p>}
            {recentActivity?.map((a, i) => (
              <div key={i} className="text-[12px] text-steel-500 flex justify-between gap-2">
                <span className="truncate">{a.action}</span>
                <span className="shrink-0">{new Date(a.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
          <Link to="/admin/settings/activity" className="text-[12.5px] font-semibold text-brand-700 hover:underline mt-3 inline-block">
            Open Activity Log →
          </Link>
        </Card>
      </div>
    </div>
  );
}
