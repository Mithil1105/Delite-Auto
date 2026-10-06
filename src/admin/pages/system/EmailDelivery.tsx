import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useAdminToast } from "../../components/AdminToastProvider";
import { Badge } from "../../analytics/ui";

type StatusFilter = "all" | "sent" | "failed" | "queued";

interface EmailRow {
  id: string;
  email_type: string;
  status: "queued" | "sent" | "failed";
  order_id: string | null;
  provider_message_id: string | null;
  safe_failure_reason: string | null;
  retry_of: string | null;
  attempt_number: number;
  created_at: string;
  sent_at: string | null;
  order: { odoo_order_name: string | null } | { odoo_order_name: string | null }[] | null;
}

const PAGE_SIZE = 50;
const RETRYABLE_TYPES = new Set(["order_confirmation", "order_processing_delay", "review_approved"]);

function orderName(r: EmailRow): string {
  const o = Array.isArray(r.order) ? r.order[0] : r.order;
  return o?.odoo_order_name ?? (r.order_id ? r.order_id.slice(0, 8) : "—");
}

function csvEscape(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

/**
 * Admin visibility into `email_log` — previously nowhere in the UI (see
 * Documentations MD/delite-transactional-email.md). Same filter/pagination/export shape as
 * ActivityLog.tsx. Retry only ever re-sends through the original typed template — never a free
 * compose box — and only for genuinely `failed` rows of a Delite-owned transactional type.
 */
export default function EmailDelivery() {
  const { showToast } = useAdminToast();
  const [rows, setRows] = useState<EmailRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const applyFilters = <T,>(query: T): T => {
    // deno-lint-ignore no-explicit-any
    let q = query as any;
    if (status !== "all") q = q.eq("status", status);
    if (dateFrom) q = q.gte("created_at", new Date(dateFrom).toISOString());
    if (dateTo) q = q.lte("created_at", new Date(`${dateTo}T23:59:59`).toISOString());
    if (search.trim()) q = q.ilike("email_type", `%${search.trim()}%`);
    return q;
  };

  const load = async () => {
    if (!supabase) return;
    setRows(null);
    let query = supabase
      .from("email_log")
      .select("id, email_type, status, order_id, provider_message_id, safe_failure_reason, retry_of, attempt_number, created_at, sent_at, order:orders(odoo_order_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    query = applyFilters(query);
    const { data, count } = await query;
    setRows((data as unknown as EmailRow[] | null) ?? []);
    setTotal(count ?? 0);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, dateFrom, dateTo, search]);

  useEffect(() => setPage(0), [status, dateFrom, dateTo, search]);

  const retry = async (row: EmailRow) => {
    if (!supabase) return;
    setRetryingId(row.id);
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>("admin-retry-email", { body: { emailLogId: row.id } });
    setRetryingId(null);
    if (error || data?.error) showToast(data?.error ?? "Retry failed", "error");
    else showToast("Email sent");
    await load();
  };

  const exportCsv = async () => {
    if (!supabase) return;
    setExporting(true);
    let query = supabase
      .from("email_log")
      .select("email_type, status, order_id, provider_message_id, safe_failure_reason, created_at, sent_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    query = applyFilters(query);
    const { data } = await query;
    setExporting(false);
    const list = (data as { email_type: string; status: string; order_id: string | null; provider_message_id: string | null; safe_failure_reason: string | null; created_at: string; sent_at: string | null }[] | null) ?? [];
    const header = ["created_at", "email_type", "status", "order_id", "provider_message_id", "failure_reason", "sent_at"];
    const csvRows = list.map((r) => [r.created_at, r.email_type, r.status, r.order_id ?? "", r.provider_message_id ?? "", r.safe_failure_reason ?? "", r.sent_at ?? ""].map((v) => csvEscape(String(v))).join(","));
    const csv = [header.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `email-delivery-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="font-display uppercase text-[13.5px]">Email Delivery</h2>
        <button type="button" onClick={exportCsv} disabled={exporting} className="btn-outline !px-3 !py-1.5 text-[12.5px] inline-flex items-center gap-1.5 disabled:opacity-50">
          <Download className="w-3.5 h-3.5" /> {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="inline-flex border border-line bg-white">
          {(["all", "sent", "failed", "queued"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} className={`px-3 py-1.5 text-[12px] font-semibold capitalize ${status === s ? "bg-ink text-white" : "text-steel-700 hover:bg-steel-50"}`}>
              {s}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-[10.5px] uppercase tracking-wide text-steel-500 mb-1">From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 px-2.5 border border-line text-[12.5px]" />
        </div>
        <div>
          <label className="block text-[10.5px] uppercase tracking-wide text-steel-500 mb-1">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 px-2.5 border border-line text-[12.5px]" />
        </div>
        <div>
          <label className="block text-[10.5px] uppercase tracking-wide text-steel-500 mb-1">Type</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. order_confirmation" className="h-9 px-2.5 border border-line text-[12.5px]" />
        </div>
      </div>

      <div className="border border-line overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-steel-50 text-left text-[11px] uppercase tracking-wide text-steel-500">
              <th className="p-3 font-semibold">Type</th>
              <th className="p-3 font-semibold">Related order</th>
              <th className="p-3 font-semibold">Status</th>
              <th className="p-3 font-semibold">Attempt</th>
              <th className="p-3 font-semibold">Failure</th>
              <th className="p-3 font-semibold">Created</th>
              <th className="p-3 font-semibold">Sent</th>
              <th className="p-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td colSpan={8} className="p-6 text-center text-steel-500">Loading…</td></tr>
            )}
            {rows?.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-steel-500">No matching emails.</td></tr>
            )}
            {rows?.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-b-0">
                <td className="p-3 font-medium">{row.email_type}</td>
                <td className="p-3 text-steel-500">{orderName(row)}</td>
                <td className="p-3">
                  <Badge tone={row.status === "sent" ? "good" : row.status === "failed" ? "bad" : "neutral"}>{row.status}</Badge>
                </td>
                <td className="p-3 text-steel-500">{row.attempt_number}{row.retry_of ? " (retry)" : ""}</td>
                <td className="p-3 text-steel-500 max-w-[200px] truncate" title={row.safe_failure_reason ?? ""}>{row.safe_failure_reason ?? "—"}</td>
                <td className="p-3 text-steel-500">{new Date(row.created_at).toLocaleString()}</td>
                <td className="p-3 text-steel-500">{row.sent_at ? new Date(row.sent_at).toLocaleString() : "—"}</td>
                <td className="p-3">
                  {row.status === "failed" && RETRYABLE_TYPES.has(row.email_type) ? (
                    <button type="button" disabled={retryingId === row.id} onClick={() => retry(row)} className="btn-outline !px-3 !py-1.5 text-[12px] disabled:opacity-50">
                      {retryingId === row.id ? "Retrying…" : "Retry"}
                    </button>
                  ) : (
                    <span className="text-steel-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
