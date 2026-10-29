import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, MoreVertical, Plus, Search, ShieldAlert } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { ApiError } from "../../../dealer/lib/transport";
import { brandingImageUrl } from "../../../dealer/lib/media";
import { btnDanger, btnOutline, btnPrimary, EmptyState, ErrorState, formatDateTime, labelClass, PageSkeleton, Spinner, useApi } from "../../../dealer/ui";
import { adminDealers, type DealerListRow, type DealerStatus, type PortalMode, type SortKey } from "./adminDealerApi";
import { adminInput, ADMIN_ACCENT_STYLE, DealerStatusBadge, Modal, useAdminBase } from "./dealerAdminUi";

type Confirm = { dealer: DealerListRow; to: DealerStatus } | { bulk: true } | null;

const MODE_HELP: Record<PortalMode, string> = {
  off: "Nobody can sign in to the dealer portal.",
  pilot: "Only dealers marked “Pilot” can sign in. Use this for the first internal and partner dealers.",
  on: "Every active dealer can sign in.",
};

export default function DealersList() {
  const base = useAdminBase();
  const navigate = useNavigate();
  const { adminRole } = useAuth();
  const isOwner = adminRole === "owner";
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [managersOpen, setManagersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, status, sortBy, sortDir]);

  const { data, error, loading, reload } = useApi(() => adminDealers.list({ search: debounced || undefined, status: status || undefined, page, pageSize: 25, sortBy, sortDir }), [debounced, status, page, sortBy, sortDir]);
  const security = useApi(() => adminDealers.securitySummary(), []);
  const mode = useApi(() => adminDealers.portalMode(), []);

  const toggle = (id: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const sort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir(key === "created" || key === "updated" ? "desc" : "asc");
    }
  };

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      setNotice(done);
      setSelected(new Set());
      setConfirm(null);
      reload();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Something went wrong");
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const changeMode = async (next: PortalMode) => {
    try {
      await adminDealers.setPortalMode(next);
      setNotice(`Dealer portal is now ${next.toUpperCase()}.`);
      mode.reload();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Couldn't change the rollout mode");
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const Th = ({ k, children, className = "" }: { k: SortKey; children: string; className?: string }) => (
    <th className={`p-3 font-medium ${className}`} aria-sort={sortBy === k ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => sort(k)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink">
        {children}
        {sortBy === k && (sortDir === "asc" ? <ArrowUp className="w-3 h-3" aria-hidden /> : <ArrowDown className="w-3 h-3" aria-hidden />)}
      </button>
    </th>
  );

  return (
    <div className="p-6 lg:p-10 max-w-7xl" style={ADMIN_ACCENT_STYLE}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display uppercase text-[15px]">Dealers</h2>
          <p className="text-[12.5px] text-steel-500">Invitation-only partners with private catalogues and contract pricing.</p>
        </div>
        <Link to={`${base}/dealers/new`} className={btnPrimary}><Plus className="w-4 h-4" aria-hidden /> Add dealer</Link>
      </div>

      {security.data?.alert && (
        <div role="alert" className="mb-4 flex gap-3 rounded-lg border border-sale/40 bg-sale/5 p-4 text-[13.5px]">
          <ShieldAlert className="w-5 h-5 text-sale shrink-0" aria-hidden />
          <div><strong>Unusual access activity.</strong> In the last {security.data.sinceHours} hours: {security.data.denied} refused sign-in{security.data.denied === 1 ? "" : "s"} to the dealer portal{security.data.crossTenant ? ` and ${security.data.crossTenant} attempt${security.data.crossTenant === 1 ? "" : "s"} to open another dealer's data` : ""}. Details are in each dealer's Activity tab.</div>
        </div>
      )}

      <section aria-label="Portal rollout" className="mb-5 bg-white border border-line rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className={labelClass}>Portal rollout</div>
          {mode.data ? (
            <>
              <div className="flex items-center gap-3">
                <select aria-label="Portal rollout mode" value={mode.data.mode} disabled={!isOwner} onChange={(e) => changeMode(e.target.value as PortalMode)} className={`${adminInput} font-semibold`}>
                  <option value="off">Off</option><option value="pilot">Pilot only</option><option value="on">On — all dealers</option>
                </select>
                {!isOwner && <span className="text-[12px] text-steel-500">Only an owner can change this.</span>}
              </div>
              <p className="text-[12.5px] text-steel-500 mt-1.5">{MODE_HELP[mode.data.mode]}</p>
            </>
          ) : <Spinner />}
        </div>
        {isOwner && <button type="button" className={btnOutline} onClick={() => setManagersOpen(true)}>Dealer manager access</button>}
      </section>

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
        {selected.size > 0 && <button type="button" className={btnDanger} onClick={() => setConfirm({ bulk: true })}>Suspend {selected.size} selected</button>}
      </div>
      {notice && <p role="status" className="mb-3 text-[13px] bg-steel-50 border border-line rounded px-3 py-2">{notice}</p>}

      {loading && <PageSkeleton rows={4} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!loading && data && data.rows.length === 0 && <EmptyState title={debounced || status ? "No dealers match" : "No dealers yet"} action={!debounced && !status ? <Link to={`${base}/dealers/new`} className={btnPrimary}>Add your first dealer</Link> : undefined}>{debounced || status ? "Try a different search or filter." : "Create a dealer, assign products and prices, then send an invite."}</EmptyState>}
      {!loading && data && data.rows.length > 0 && (
        <>
          <div className="bg-white border border-line rounded-lg overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11.5px] text-steel-500 border-b border-line">
                <tr>
                  <th className="p-3 w-8"><span className="sr-only">Select</span></th>
                  <Th k="name">Dealer</Th><th className="p-3 font-medium uppercase tracking-wide">Owner email</th><Th k="status">Status</Th>
                  <th className="p-3 font-medium uppercase tracking-wide text-right">Products</th><th className="p-3 font-medium uppercase tracking-wide">Last order</th><th className="p-3 font-medium uppercase tracking-wide">Last login</th>
                  <th className="p-3"><span className="sr-only">Actions</span></th>
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
                          <div><div className="font-semibold">{d.displayName}{d.isPilot && <span className="ml-2 text-[10.5px] font-semibold uppercase tracking-wide bg-gold/30 text-ink rounded px-1.5 py-0.5">Pilot</span>}</div><div className="text-[11.5px] text-steel-500 font-mono">{d.dealerCode}</div></div>
                        </div>
                      </td>
                      <td className="p-3 text-steel-700">{d.ownerEmail}</td>
                      <td className="p-3"><DealerStatusBadge status={d.status} /></td>
                      <td className="p-3 text-right tabular-nums">{d.assignedCount}</td>
                      <td className="p-3 text-steel-700">{d.lastOrderAt ? formatDateTime(d.lastOrderAt) : "—"}</td>
                      <td className="p-3 text-steel-700">{d.lastLoginAt ? formatDateTime(d.lastLoginAt) : "Never"}</td>
                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}><RowMenu dealer={d} base={base} onAction={(to) => setConfirm({ dealer: d, to })} /></td>
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

      {confirm && (
        <Modal title={"bulk" in confirm ? "Suspend dealers?" : confirm.to === "archived" ? `Archive ${confirm.dealer.displayName}?` : `Suspend ${confirm.dealer.displayName}?`} onClose={() => setConfirm(null)}>
          <p className="text-[13.5px] mb-4">
            {"bulk" in confirm
              ? `${selected.size} dealer${selected.size === 1 ? "" : "s"} will lose purchasing access immediately and be signed out. Their order history is kept. You can reactivate them later.`
              : confirm.to === "archived"
                ? "Archiving closes the account permanently and signs everyone out. Order history stays visible to admins. This can't be undone."
                : "They lose purchasing access immediately and are signed out. Orders and prices are kept, and you can reactivate them."}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnOutline} onClick={() => setConfirm(null)}>Cancel</button>
            <button type="button" className={btnDanger} disabled={busy} onClick={() => run("bulk" in confirm ? () => adminDealers.bulkSuspend([...selected]) : () => adminDealers.setStatus(confirm.dealer.id, confirm.to), "bulk" in confirm ? "Selected dealers suspended." : `${confirm.dealer.displayName} is now ${confirm.to}.`)}>{busy && <Spinner />} {"bulk" in confirm || confirm.to === "suspended" ? "Suspend" : "Archive"}</button>
          </div>
        </Modal>
      )}
      {managersOpen && <ManagersModal dealers={data?.rows ?? []} onClose={() => setManagersOpen(false)} />}
    </div>
  );
}

function RowMenu({ dealer, base, onAction }: { dealer: DealerListRow; base: string; onAction: (to: DealerStatus) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const canSuspend = dealer.status === "invited" || dealer.status === "active";
  const item = "block w-full text-left px-3 py-2 text-[13px] hover:bg-steel-50";
  return (
    <div className="relative inline-block" ref={ref} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Actions for ${dealer.displayName}`} onClick={() => setOpen((o) => !o)} className="p-1.5 rounded hover:bg-steel-100"><MoreVertical className="w-4 h-4" /></button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-44 bg-white border border-line rounded-lg shadow-lift py-1 z-20 text-left">
          <Link role="menuitem" to={`${base}/dealers/${dealer.id}/overview`} className={item}>Open</Link>
          <Link role="menuitem" to={`${base}/dealers/${dealer.id}/catalog`} className={item}>Catalogue &amp; pricing</Link>
          <Link role="menuitem" to={`${base}/dealers/${dealer.id}/orders`} className={item}>Orders</Link>
          {canSuspend && <button role="menuitem" type="button" className={`${item} text-sale`} onClick={() => { setOpen(false); onAction("suspended"); }}>Suspend…</button>}
          {dealer.status === "suspended" && <button role="menuitem" type="button" className={item} onClick={async () => { setOpen(false); try { await adminDealers.setStatus(dealer.id, "active"); location.reload(); } catch { /* shown on next load */ } }}>Reactivate</button>}
          {dealer.status !== "archived" && <button role="menuitem" type="button" className={`${item} text-sale`} onClick={() => { setOpen(false); onAction("archived"); }}>Archive…</button>}
        </div>
      )}
    </div>
  );
}

function ManagersModal({ dealers, onClose }: { dealers: DealerListRow[]; onClose: () => void }) {
  const { data, error, loading, reload } = useApi(() => adminDealers.managers(), []);
  const all = useApi(() => adminDealers.list({ pageSize: 100 }), []);
  const [edit, setEdit] = useState<{ userId: string; allDealers: boolean; ids: Set<string>; pricing: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const choices = all.data?.rows ?? dealers;

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    setMsg(null);
    try {
      await adminDealers.setGrant(edit.userId, edit.allDealers ? null : [...edit.ids], edit.pricing);
      setEdit(null);
      reload();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Dealer manager access" onClose={onClose} wide>
      <p className="text-[13px] text-steel-500 mb-4">A <strong>Dealer manager</strong> can run day-to-day dealer administration for the dealers you choose here. They can only change prices if you tick the pricing box. Give someone the role under <em>Settings → Team &amp; security → Admin users</em> first.</p>
      {loading && <PageSkeleton rows={1} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.managers.length === 0 && <p className="text-[13px] text-steel-500">No admin account has the Dealer manager role yet.</p>}
      {data && data.managers.length > 0 && (
        <ul className="divide-y divide-line border border-line rounded-lg">
          {data.managers.map((m) => (
            <li key={m.userId} className="p-3 flex flex-wrap items-center justify-between gap-3 text-[13px]">
              <div>
                <div className="font-medium">{m.name ?? m.userId.slice(0, 8)}</div>
                <div className="text-steel-500">{!m.hasGrant ? "No access yet" : m.dealerIds === null ? "All dealers" : `${m.dealerIds.length} dealer${m.dealerIds.length === 1 ? "" : "s"}`}{m.hasGrant ? ` · ${m.canManagePricing ? "can change prices" : "view & manage only, no pricing"}` : ""}</div>
              </div>
              <button type="button" className={btnOutline} onClick={() => setEdit({ userId: m.userId, allDealers: m.dealerIds === null, ids: new Set(m.dealerIds ?? []), pricing: m.canManagePricing })}>Edit access</button>
            </li>
          ))}
        </ul>
      )}
      {edit && (
        <div className="mt-5 border border-line rounded-lg p-4 space-y-3 bg-steel-50/50">
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={edit.allDealers} onChange={(e) => setEdit({ ...edit, allDealers: e.target.checked })} /> Every dealer</label>
          {!edit.allDealers && (
            <fieldset className="max-h-44 overflow-y-auto border border-line rounded bg-white p-2 space-y-1">
              <legend className="sr-only">Dealers this manager may administer</legend>
              {choices.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={edit.ids.has(d.id)} onChange={(e) => { const ids = new Set(edit.ids); if (e.target.checked) ids.add(d.id); else ids.delete(d.id); setEdit({ ...edit, ids }); }} /> {d.displayName} <span className="text-steel-500 font-mono text-[11.5px]">{d.dealerCode}</span></label>
              ))}
            </fieldset>
          )}
          <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-1" checked={edit.pricing} onChange={(e) => setEdit({ ...edit, pricing: e.target.checked })} /> <span>Allow changing dealer prices and product assignments<br /><span className="text-steel-500 text-[12px]">Off by default — pricing is a separate permission.</span></span></label>
          {msg && <p role="alert" className="text-[13px] text-sale">{msg}</p>}
          <div className="flex justify-end gap-2"><button type="button" className={btnOutline} onClick={() => setEdit(null)}>Cancel</button><button type="button" className={btnPrimary} disabled={busy || (!edit.allDealers && edit.ids.size === 0)} onClick={save}>{busy && <Spinner />} Save access</button></div>
        </div>
      )}
    </Modal>
  );
}
