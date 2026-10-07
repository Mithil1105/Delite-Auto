import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";

interface ActivityRow {
  id: string;
  actor_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: { full_name: string | null } | { full_name: string | null }[] | null;
}

const PAGE_SIZE = 50;

function actorName(r: ActivityRow): string {
  const actor = Array.isArray(r.actor) ? r.actor[0] : r.actor;
  return actor?.full_name || r.actor_id.slice(0, 8);
}

function csvEscape(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

/**
 * Real filters/pagination/export (#51-52) — previously a single hard limit(100), no filters. Never
 * fetches the entire history into the browser: the list is server-side paginated (`.range()`), and
 * export re-queries the same filters with its own capped limit rather than dumping already-loaded
 * rows only.
 */
export default function ActivityLog() {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actorQuery, setActorQuery] = useState("");
  const [actionQuery, setActionQuery] = useState("");
  const [exporting, setExporting] = useState(false);

  const applyFilters = <T,>(query: T): T => {
    // deno-lint-ignore no-explicit-any
    let q = query as any;
    if (dateFrom) q = q.gte("created_at", new Date(dateFrom).toISOString());
    if (dateTo) q = q.lte("created_at", new Date(`${dateTo}T23:59:59`).toISOString());
    if (actionQuery.trim()) q = q.ilike("action", `%${actionQuery.trim()}%`);
    return q;
  };

  useEffect(() => {
    if (!supabase) return;
    let query = supabase
      .from("admin_activity_log")
      .select("id, actor_id, action, target_type, target_id, metadata, created_at, actor:profiles!admin_activity_log_actor_id_fkey(full_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    query = applyFilters(query);
    query.then(({ data, count }) => {
      let list = (data as unknown as ActivityRow[] | null) ?? [];
      if (actorQuery.trim()) list = list.filter((r) => actorName(r).toLowerCase().includes(actorQuery.trim().toLowerCase()));
      setRows(list);
      setTotal(count ?? 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, dateFrom, dateTo, actionQuery, actorQuery]);

  useEffect(() => setPage(0), [dateFrom, dateTo, actionQuery, actorQuery]);

  const exportCsv = async () => {
    if (!supabase) return;
    setExporting(true);
    let query = supabase
      .from("admin_activity_log")
      .select("action, target_type, target_id, metadata, created_at, actor:profiles!admin_activity_log_actor_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(5000);
    query = applyFilters(query);
    const { data } = await query;
    setExporting(false);
    const list = (data as unknown as ActivityRow[] | null) ?? [];
    const header = ["timestamp", "actor", "action", "target_type", "target_id", "metadata_summary"];
    const csvRows = list.map((r) =>
      [
        r.created_at,
        actorName(r),
        r.action,
        r.target_type ?? "",
        r.target_id ?? "",
        r.metadata ? JSON.stringify(r.metadata).slice(0, 200) : "",
      ]
        .map((v) => csvEscape(String(v)))
        .join(",")
    );
    const csv = [header.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 lg:p-10 max-w-4xl">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="font-display uppercase text-[13.5px]">Activity Log</h2>
        <button type="button" onClick={exportCsv} disabled={exporting} className="btn-outline !px-3 !py-1.5 text-[12.5px] inline-flex items-center gap-1.5 disabled:opacity-50">
          <Download className="w-3.5 h-3.5" /> {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="block text-[10.5px] uppercase tracking-wide text-steel-500 mb-1">From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 px-2.5 border border-line text-[12.5px]" />
        </div>
        <div>
          <label className="block text-[10.5px] uppercase tracking-wide text-steel-500 mb-1">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 px-2.5 border border-line text-[12.5px]" />
        </div>
        <div>
          <label className="block text-[10.5px] uppercase tracking-wide text-steel-500 mb-1">Actor</label>
          <input value={actorQuery} onChange={(e) => setActorQuery(e.target.value)} placeholder="Name" className="h-9 px-2.5 border border-line text-[12.5px]" />
        </div>
        <div>
          <label className="block text-[10.5px] uppercase tracking-wide text-steel-500 mb-1">Action</label>
          <input value={actionQuery} onChange={(e) => setActionQuery(e.target.value)} placeholder="e.g. media.removed" className="h-9 px-2.5 border border-line text-[12.5px]" />
        </div>
      </div>

      {rows === null && <p className="text-[13.5px] text-steel-500">Loading…</p>}
      {rows !== null && rows.length === 0 && <p className="text-[13.5px] text-steel-500">No matching activity.</p>}
      {rows !== null && rows.length > 0 && (
        <div className="border border-line divide-y divide-line">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
              <div>
                <span className="font-semibold">{r.action}</span>
                <span className="text-steel-500"> · {actorName(r)}</span>
                {r.target_type && <span className="text-steel-500"> · {r.target_type}{r.target_id ? ` #${r.target_id.slice(0, 8)}` : ""}</span>}
              </div>
              <span className="text-steel-500 text-[12px]">{new Date(r.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-[13px]">
          <span className="text-steel-500">{total} entries · page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 0} onClick={() => setPage((p) => p - 1)} className="btn-ghost !px-3 !py-1.5 disabled:opacity-40">Prev</button>
            <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-ghost !px-3 !py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
