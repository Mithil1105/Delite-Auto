import { RefreshCw } from "lucide-react";
import { useOdooHealth } from "../../hooks/useOdooHealth";

function StatusRow({ label, ok, detail }: { label: string; ok: boolean | null; detail?: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-line last:border-b-0">
      <span className="text-[13.5px] text-steel-500">{label}</span>
      <div className="flex items-center gap-2">
        {detail && <span className="text-[12.5px] text-steel-500">{detail}</span>}
        <span
          className={
            ok === null
              ? "text-[12.5px] font-semibold text-steel-500"
              : ok
                ? "text-[12.5px] font-semibold text-badge-new"
                : "text-[12.5px] font-semibold text-sale"
          }
        >
          {ok === null ? "—" : ok ? "OK" : "Error"}
        </span>
      </div>
    </div>
  );
}

export default function OdooStatus() {
  const { health, loading, checkedAt, refresh } = useOdooHealth();
  const authenticated = health ? health.legacyRpcAuthenticated || !!health.json2Authenticated : null;

  return (
    <div className="p-6 lg:p-10 max-w-2xl">
      <div className="card-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display uppercase text-[13.5px]">System Status</h2>
          <button type="button" onClick={refresh} disabled={loading} className="btn-ghost !px-3 !py-1.5 text-[12.5px] gap-1.5">
            <RefreshCw className={loading ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} /> Refresh Status
          </button>
        </div>

        <StatusRow label="Odoo" ok={loading ? null : !!health?.reachable} />
        <StatusRow label="Supabase" ok={true} />
        <StatusRow label="Authentication" ok={loading ? null : authenticated} />
        <StatusRow label="Odoo Version" ok={null} detail={health?.odooServerVersion ?? "—"} />
        <StatusRow label="Last checked" ok={null} detail={checkedAt ? checkedAt.toLocaleString() : "—"} />

        {health?.error && <p className="text-[12.5px] text-sale mt-3">{health.error}</p>}

        <p className="text-[11.5px] text-steel-500 mt-4">
          Only non-secret status is ever shown here — no username, database name, or API key.
        </p>
      </div>
    </div>
  );
}
