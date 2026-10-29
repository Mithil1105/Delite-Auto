import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { ApiError } from "../../../dealer/lib/transport";
import { brandingImageUrl } from "../../../dealer/lib/media";
import { btnDanger, btnOutline, btnPrimary, EmptyState, ErrorState, formatDateTime, PageSkeleton, Spinner, useApi } from "../../../dealer/ui";
import { adminDealers } from "./adminDealerApi";
import { adminInput, ADMIN_ACCENT_STYLE, DealerStatusBadge, Modal, useAdminBase } from "./dealerAdminUi";

export default function DealersList() {
  const base = useAdminBase();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, status]);

  const { data, error, loading, reload } = useApi(() => adminDealers.list({ search: debounced || undefined, status: status || undefined, page, pageSize: 25 }), [debounced, status, page]);

  const toggle = (id: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const bulkSuspend = async () => {
    setBusy(true);
    try {
      const res = await adminDealers.bulkSuspend([...selected]);
      setNotice(`${res.suspended} dealer${res.suspended === 1 ? "" : "s"} suspended${res.skipped.length ? `, ${res.skipped.length} skipped (not eligible)` : ""}.`);
      setSelected(new Set());
      setConfirming(false);
      reload();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Couldn't suspend");
    } finally {
      setBusy(false);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="p-6 lg:p-10 max-w-7xl" style={ADMIN_ACCENT_STYLE}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display uppercase text-[15px]">Dealers</h2>
          <p className="text-[12.5px] text-steel-500">Invitation-only partners with private catalogues and contract pricing.</p>
        </div>
        <Link to={`${base}/dealers/new`} className={btnPrimary}><Plus className="w-4 h-4" aria-hidden /> Add dealer</Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-steel-500" aria-hidden />
          <label htmlFor="dl-search" className="sr-only">Search dealers</label>
          <input id="dl-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code or email" className={`${adminInput} pl-8 w-64`} />
        </div>
        <label className="sr-only" htmlFor="dl-status">Status</label>
        <select id="dl-status" value={status} onChange={(e) => setStatus(e.target.value)} className={adminInput}>
          <option value="">All statuses</option>
          {["draft", "invited", "active", "suspended", "archived"].map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
        {selected.size > 0 && <button type="button" className={btnDanger} onClick={() => setConfirming(true)}>Suspend {selected.size} selected</button>}
      </div>
      {notice && <p role="status" className="mb-3 text-[13px] bg-steel-50 border border-line rounded px-3 py-2">{notice}</p>}

      {loading && <PageSkeleton rows={4} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!loading && data && data.rows.length === 0 && <EmptyState title={debounced || status ? "No dealers match" : "No dealers yet"} action={!debounced && !status ? <Link to={`${base}/dealers/new`} className={btnPrimary}>Add your first dealer</Link> : undefined}>{debounced || status ? "Try a different search or filter." : "Create a dealer, assign products and prices, then send an invite."}</EmptyState>}
      {!loading && data && data.rows.length > 0 && (
        <>
          <div className="bg-white border border-line rounded-lg overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11.5px] uppercase tracking-wide text-steel-500 border-b border-line">
                <tr>
                  <th className="p-3 w-8"><span className="sr-only">Select</span></th>
                  <th className="p-3 font-medium">Dealer</th><th className="p-3 font-medium">Owner email</th><th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium text-right">Products</th><th className="p-3 font-medium">Last order</th><th className="p-3 font-medium">Last login</th><th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((d) => {
                  const logo = brandingImageUrl(d.logoPath);
                  return (
                    <tr key={d.id} className="hover:bg-steel-50/50 cursor-pointer" onClick={() => navigate(`${base}/dealers/${d.id}/overview`)}>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} aria-label={`Select ${d.displayName}`} /></td>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          {logo ? <img src={logo} alt="" className="w-8 h-8 object-contain rounded" /> : <span className="w-8 h-8 rounded grid place-items-center text-white font-display text-sm shrink-0" style={{ background: d.accentColor ?? "#10148F" }} aria-hidden>{d.displayName.charAt(0)}</span>}
                          <div><div className="font-semibold">{d.displayName}</div><div className="text-[11.5px] text-steel-500 font-mono">{d.dealerCode}</div></div>
                        </div>
                      </td>
                      <td className="p-3 text-steel-700">{d.ownerEmail}</td>
                      <td className="p-3"><DealerStatusBadge status={d.status} /></td>
                      <td className="p-3 text-right tabular-nums">{d.assignedCount}</td>
                      <td className="p-3 text-steel-700">{d.lastOrderAt ? formatDateTime(d.lastOrderAt) : "—"}</td>
                      <td className="p-3 text-steel-700">{d.lastLoginAt ? formatDateTime(d.lastLoginAt) : "Never"}</td>
                      <td className="p-3 text-right"><Link to={`${base}/dealers/${d.id}/overview`} onClick={(e) => e.stopPropagation()} className="font-semibold underline">Open</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-[13px]">
              <span className="text-steel-500">{data.total} dealers · page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button type="button" className={btnOutline} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
                <button type="button" className={btnOutline} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {confirming && (
        <Modal title="Suspend dealers?" onClose={() => setConfirming(false)}>
          <p className="text-[13.5px] mb-4">{selected.size} dealer{selected.size === 1 ? "" : "s"} will lose purchasing access <strong>immediately</strong>. Their order history is kept. You can reactivate them later.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnOutline} onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" className={btnDanger} disabled={busy} onClick={bulkSuspend}>{busy && <Spinner />} Suspend</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
