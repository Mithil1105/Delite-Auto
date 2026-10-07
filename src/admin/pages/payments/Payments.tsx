import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { formatINR } from "../../../lib/format";
import { useAdminToast } from "../../components/AdminToastProvider";
import { Panel, Badge, Drawer, KeyValue } from "../../analytics/ui";

type PaymentStatus = "created" | "pending" | "authorized" | "paid" | "failed" | "expired" | "refunded";
type SyncState = "not_applicable" | "pending" | "syncing" | "synced" | "failed";
type SortMode = "newest" | "oldest" | "amount_desc" | "amount_asc";

interface PaymentRow {
  id: string;
  created_at: string;
  user_id: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  payment_method: "online" | "cod";
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  odoo_sale_order_id: number | null;
  order_id: string | null;
  odoo_sync_pending: boolean;
  odoo_sync_status: SyncState;
  retry_count: number;
  last_retry_at: string | null;
  last_sync_error_safe: string | null;
  failure_reason_safe: string | null;
  paid_at: string | null;
  odoo_order_name: string | null;
  customer_email: string | null;
  customer_name: string | null;
  email_status: "queued" | "sent" | "failed" | null;
}

interface Kpis {
  total_attempts: number;
  paid: number;
  pending: number;
  failed: number;
  refunded: number;
  cod: number;
  paid_awaiting_sync: number;
}

const PAGE_SIZE = 50;

function maskId(id: string | null): string {
  if (!id) return "—";
  return id.length <= 8 ? id : `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function CopyableId({ id, label }: { id: string | null; label: string }) {
  const { showToast } = useAdminToast();
  if (!id) return <span className="text-steel-300">—</span>;
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={async () => {
        await navigator.clipboard.writeText(id);
        showToast(`${label} copied`);
      }}
      className="font-mono text-[12px] hover:underline"
    >
      {maskId(id)}
    </button>
  );
}

/** Payment attempts and orders are different concepts — a payment_attempts row is never revenue
 * on its own (spec: "do not count failed attempts as revenue"), and the PAID + odoo_sync_pending
 * combination must never read as a failure (spec section 11) — money has already been received. */
function StatusBadge({ row }: { row: PaymentRow }) {
  if (row.status === "paid" && row.odoo_sync_pending) {
    return <Badge tone="warn">Payment received — Odoo sync pending</Badge>;
  }
  const tone = row.status === "paid" ? "good" : row.status === "failed" || row.status === "expired" ? "bad" : row.status === "refunded" ? "warn" : "neutral";
  return <Badge tone={tone}>{row.status}</Badge>;
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="card-surface p-4 min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-steel-500 truncate">{label}</div>
      <div className={`font-display text-[24px] leading-tight mt-1 tabular-nums ${tone === "warn" && value > 0 ? "text-amber-700" : ""}`}>{value}</div>
    </div>
  );
}

/**
 * Real Admin visibility into payment_attempts — previously nowhere in the UI. Server-side
 * filter/sort/search/pagination via public.admin_payments_list / admin_payments_kpis (see
 * Documentations MD/delite-production-operations.md). Supersedes the earlier narrower "Odoo Sync
 * & Failures" page — this is the one canonical payments ledger, with an Odoo-sync-state filter
 * covering the same recovery workflow plus everything else (KPIs, all statuses, detail, sort).
 */
export default function Payments() {
  const { showToast } = useAdminToast();
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  const [status, setStatus] = useState<"all" | PaymentStatus>("all");
  const [method, setMethod] = useState<"all" | "online" | "cod">("all");
  const [syncState, setSyncState] = useState<"all" | SyncState>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [selected, setSelected] = useState<PaymentRow | null>(null);
  const [retrying, setRetrying] = useState(false);

  const periodStart = dateFrom ? new Date(dateFrom).toISOString() : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const periodEnd = dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : new Date().toISOString();

  const loadKpis = async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc("admin_payments_kpis", { p_start: periodStart, p_end: periodEnd });
    setKpis((data as Kpis | null) ?? null);
  };

  const loadRows = async () => {
    if (!supabase) return;
    setRows(null);
    const { data, error } = await supabase.rpc("admin_payments_list", {
      p_status: status === "all" ? null : [status],
      p_method: method === "all" ? null : method,
      p_sync_state: syncState === "all" ? null : syncState,
      p_start: dateFrom ? periodStart : null,
      p_end: dateTo ? periodEnd : null,
      p_search: search.trim() || null,
      p_sort: sort,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    });
    if (error) {
      console.error("[Payments] admin_payments_list failed", error.message);
      setRows([]);
      setTotal(0);
      return;
    }
    setRows((data?.rows as PaymentRow[] | null) ?? []);
    setTotal((data?.total as number | null) ?? 0);
  };

  useEffect(() => {
    loadKpis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, method, syncState, search, sort, dateFrom, dateTo]);

  useEffect(() => setPage(0), [status, method, syncState, search, sort, dateFrom, dateTo]);

  const retry = async (row: PaymentRow) => {
    if (!supabase) return;
    setRetrying(true);
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>("admin-retry-odoo-order-sync", { body: { paymentAttemptId: row.id } });
    setRetrying(false);
    if (error || data?.error) showToast(data?.error ?? "Retry failed — still pending", "error");
    else showToast("Odoo sync succeeded");
    await Promise.all([loadRows(), loadKpis()]);
    if (selected?.id === row.id) {
      const refreshed = (rows ?? []).find((r) => r.id === row.id);
      if (refreshed) setSelected(refreshed);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeTo = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <div className="p-6 lg:p-10">
      <h2 className="font-display uppercase text-[13.5px] mb-4">Payments</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
        <KpiCard label="Total Attempts" value={kpis?.total_attempts ?? 0} />
        <KpiCard label="Paid" value={kpis?.paid ?? 0} />
        <KpiCard label="Pending" value={kpis?.pending ?? 0} />
        <KpiCard label="Failed" value={kpis?.failed ?? 0} />
        <KpiCard label="Refunded" value={kpis?.refunded ?? 0} />
        <KpiCard label="COD" value={kpis?.cod ?? 0} />
        <KpiCard label="Paid — Odoo Sync Pending" value={kpis?.paid_awaiting_sync ?? 0} tone="warn" />
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, order, provider ID" className="h-9 px-2.5 border border-line text-[12.5px] min-w-[240px]" />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-9 px-2.5 border border-line text-[12.5px]">
          <option value="all">All statuses</option>
          <option value="created">Created</option>
          <option value="pending">Pending</option>
          <option value="authorized">Authorized</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
          <option value="expired">Expired</option>
          <option value="refunded">Refunded</option>
        </select>
        <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="h-9 px-2.5 border border-line text-[12.5px]">
          <option value="all">All methods</option>
          <option value="online">Online</option>
          <option value="cod">COD</option>
        </select>
        <select value={syncState} onChange={(e) => setSyncState(e.target.value as typeof syncState)} className="h-9 px-2.5 border border-line text-[12.5px]">
          <option value="all">All Odoo sync states</option>
          <option value="pending">Sync pending</option>
          <option value="syncing">Syncing</option>
          <option value="synced">Synced</option>
          <option value="failed">Sync failed</option>
          <option value="not_applicable">Not applicable</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 px-2.5 border border-line text-[12.5px]" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 px-2.5 border border-line text-[12.5px]" />
        <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className="h-9 px-2.5 border border-line text-[12.5px]">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="amount_desc">Amount high → low</option>
          <option value="amount_asc">Amount low → high</option>
        </select>
      </div>

      <div className="border border-line overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-steel-50 text-left text-[11px] uppercase tracking-wide text-steel-500">
              <th className="p-3 font-semibold">Created</th>
              <th className="p-3 font-semibold">Customer</th>
              <th className="p-3 font-semibold">Method</th>
              <th className="p-3 font-semibold">Amount</th>
              <th className="p-3 font-semibold">Status</th>
              <th className="p-3 font-semibold">Odoo Sync</th>
              <th className="p-3 font-semibold">Order</th>
              <th className="p-3 font-semibold">Provider ID</th>
              <th className="p-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td colSpan={9} className="p-6 text-center text-steel-500">Loading…</td></tr>
            )}
            {rows?.length === 0 && (
              <tr><td colSpan={9} className="p-6 text-center text-steel-500">No payment attempts yet.</td></tr>
            )}
            {rows?.map((row) => (
              <tr key={row.id} onClick={() => setSelected(row)} className="border-b border-line last:border-b-0 cursor-pointer hover:bg-steel-50/50">
                <td className="p-3 text-steel-500 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                <td className="p-3">{row.customer_name || row.customer_email || "—"}</td>
                <td className="p-3 uppercase text-[12px]">{row.payment_method}</td>
                <td className="p-3 font-semibold whitespace-nowrap">{formatINR(row.amount)}</td>
                <td className="p-3"><StatusBadge row={row} /></td>
                <td className="p-3">
                  <Badge tone={row.odoo_sync_status === "failed" ? "bad" : row.odoo_sync_status === "syncing" ? "warn" : row.odoo_sync_status === "synced" ? "good" : "neutral"}>
                    {row.odoo_sync_status}
                  </Badge>
                </td>
                <td className="p-3 text-steel-500">{row.odoo_order_name ?? "—"}</td>
                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                  <CopyableId id={row.razorpay_payment_id ?? row.razorpay_order_id} label="Provider ID" />
                </td>
                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                  {row.odoo_sync_pending ? (
                    <button type="button" disabled={retrying} onClick={() => retry(row)} className="btn-outline !px-3 !py-1.5 text-[12px] disabled:opacity-50">
                      {retrying ? "Retrying…" : "Retry"}
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

      {total > 0 && (
        <div className="flex items-center justify-between mt-4 text-[13px]">
          <span className="text-steel-500">{rangeFrom}–{rangeTo} of {total}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 0} onClick={() => setPage((p) => p - 1)} className="btn-ghost !px-3 !py-1.5 disabled:opacity-40">Prev</button>
            <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-ghost !px-3 !py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected ? formatINR(selected.amount) : ""} subtitle={selected ? new Date(selected.created_at).toLocaleString() : ""}>
        {selected && (
          <>
            {selected.status === "paid" && selected.odoo_sync_pending && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-[13px] font-semibold">
                ⚠ Payment received — Odoo sync pending. This is not a failed payment — money has been received. Do not refund or ask the customer to retry.
              </div>
            )}
            <Panel title="Payment">
              <KeyValue
                rows={[
                  ["Attempt ID", <span key="id" className="font-mono text-[12px]">{selected.id}</span>],
                  ["Customer", selected.customer_name || selected.customer_email || "Unknown"],
                  ["Payment method", selected.payment_method.toUpperCase()],
                  ["Amount", `${formatINR(selected.amount)} ${selected.currency}`],
                  ["Status", <StatusBadge key="sb" row={selected} />],
                  ["Razorpay order ID", <CopyableId key="rzo" id={selected.razorpay_order_id} label="Razorpay order ID" />],
                  ["Razorpay payment ID", <CopyableId key="rzp" id={selected.razorpay_payment_id} label="Razorpay payment ID" />],
                  ["Paid at", selected.paid_at ? new Date(selected.paid_at).toLocaleString() : "—"],
                  ...(selected.failure_reason_safe ? ([["Failure reason", selected.failure_reason_safe]] as [string, string][]) : []),
                ]}
              />
            </Panel>
            <Panel title="Odoo sync" className="mt-4">
              <KeyValue
                rows={[
                  ["Related Delite order", selected.order_id ? selected.order_id.slice(0, 8) : "Not yet created"],
                  ["Related Odoo order", selected.odoo_order_name ?? (selected.odoo_sale_order_id ? String(selected.odoo_sale_order_id) : "Not yet created")],
                  ["Sync status", <Badge key="ss" tone={selected.odoo_sync_status === "failed" ? "bad" : selected.odoo_sync_status === "syncing" ? "warn" : "good"}>{selected.odoo_sync_status}</Badge>],
                  ["Retry count", String(selected.retry_count)],
                  ["Last retry", selected.last_retry_at ? new Date(selected.last_retry_at).toLocaleString() : "—"],
                  ...(selected.last_sync_error_safe ? ([["Last error", selected.last_sync_error_safe]] as [string, string][]) : []),
                ]}
              />
              {selected.odoo_sync_pending && (
                <button type="button" disabled={retrying} onClick={() => retry(selected)} className="btn-outline !px-3 !py-1.5 text-[12.5px] mt-3 disabled:opacity-50">
                  {retrying ? "Retrying…" : "Retry Odoo sync"}
                </button>
              )}
            </Panel>
            <Panel title="Email confirmation" className="mt-4">
              <KeyValue rows={[["Status", selected.email_status ? <Badge key="es" tone={selected.email_status === "sent" ? "good" : selected.email_status === "failed" ? "bad" : "neutral"}>{selected.email_status}</Badge> : "No email recorded"]]} />
            </Panel>
          </>
        )}
      </Drawer>
    </div>
  );
}
