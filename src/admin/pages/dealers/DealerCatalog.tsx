import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, FileUp, History, Layers, Plus, Trash2, UploadCloud } from "lucide-react";
import { rupeesToPaise } from "../../../../supabase/functions/_shared/dealer/pricing";
import { ApiError } from "../../../dealer/lib/transport";
import { brandingImageUrl } from "../../../dealer/lib/media";
import { btnDanger, btnOutline, btnPrimary, EmptyState, ErrorState, formatDateTime, inputClass, labelClass, money, PageSkeleton, Spinner, useApi } from "../../../dealer/ui";
import { adminDealers, type GridRow, type GridState, type ImportRow, type MasterProduct, type TaxBasis } from "./adminDealerApi";
import { useDealerDetail } from "./DealerDetail";
import { adminInput, fromDateInput, Modal, toDateInput } from "./dealerAdminUi";

interface Edit {
  price: string;
  basis: TaxBasis;
  from: string;
  to: string;
}

const STATE_BADGE: Record<GridState, { label: string; cls: string }> = {
  ok: { label: "Priced", cls: "bg-emerald-100 text-emerald-800" },
  missing_price: { label: "Missing price", cls: "bg-sale/10 text-sale" },
  draft_only: { label: "Draft only", cls: "bg-amber-100 text-amber-800" },
  draft_pending: { label: "Change pending", cls: "bg-sky-100 text-sky-800" },
  expiring: { label: "Expiring soon", cls: "bg-orange-100 text-orange-800" },
};

function baseline(row: GridRow): Edit {
  const p = row.draftPrice ?? row.activePrice;
  return { price: p ? (p.pricePaise / 100).toFixed(2) : "", basis: p?.taxBasis ?? "exclusive", from: toDateInput(p?.startsAt ?? null), to: toDateInput(p?.endsAt ?? null) };
}

function sameEdit(a: Edit, b: Edit): boolean {
  return Number(a.price || 0) === Number(b.price || 0) && a.basis === b.basis && a.from === b.from && a.to === b.to;
}

export default function DealerCatalog() {
  const { detail, reload: reloadDetail } = useDealerDetail();
  const dealerId = detail.dealer.id;
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [edits, setEdits] = useState<Map<number, Edit>>(new Map());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<null | "pick" | "import" | "copy" | "preview" | "adjust" | "remove" | "publish">(null);
  const [historyFor, setHistoryFor] = useState<GridRow | null>(null);
  const [tiersFor, setTiersFor] = useState<GridRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [filter, debouncedQ]);

  const { data, error, loading, reload } = useApi(() => adminDealers.catalog({ dealerId, filter, q: debouncedQ || undefined, page, pageSize: 50 }), [dealerId, filter, debouncedQ, page, tick]);
  const refresh = () => {
    setTick((t) => t + 1);
    reloadDetail();
  };
  const fail = (err: unknown) => setNotice({ ok: false, text: err instanceof ApiError ? err.message : "Something went wrong" });

  const setEdit = (row: GridRow, next: Edit) =>
    setEdits((m) => {
      const copy = new Map(m);
      if (sameEdit(next, baseline(row))) copy.delete(row.variantId);
      else copy.set(row.variantId, next);
      return copy;
    });

  const rows = data?.rows ?? [];
  const draftCount = detail.stats.draftPrices;

  const saveDrafts = async () => {
    setBusy(true);
    setNotice(null);
    try {
      for (const [variantId, e] of edits) {
        const row = rows.find((r) => r.variantId === variantId);
        const rupees = Number(e.price.replace(/,/g, ""));
        if (!Number.isFinite(rupees) || rupees <= 0) throw new ApiError("VALIDATION", `Enter a valid price for ${row?.name ?? variantId}`);
        await adminDealers.saveDraft({ dealerId, variantId, pricePaise: rupeesToPaise(rupees), taxBasis: e.basis, startsAt: fromDateInput(e.from), endsAt: fromDateInput(e.to) });
      }
      setNotice({ ok: true, text: `${edits.size} draft price${edits.size === 1 ? "" : "s"} saved. They go live when you publish.` });
      setEdits(new Map());
      refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await adminDealers.publish(dealerId);
      setNotice({ ok: true, text: `Published ${res.published} price${res.published === 1 ? "" : "s"}${res.expired ? `, replacing ${res.expired} previous` : ""}. Future carts use them immediately; placed orders keep their original prices.` });
      setModal(null);
      refresh();
    } catch (err) {
      setModal(null);
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const changeAccess = async (row: GridRow, patch: Record<string, unknown>) => {
    try {
      await adminDealers.updateAccess({ dealerId, variantId: row.variantId, ...patch });
      refresh();
    } catch (err) {
      fail(err);
    }
  };

  const bulkRemove = async () => {
    setBusy(true);
    try {
      await adminDealers.unassign(dealerId, [...selected]);
      setSelected(new Set());
      setModal(null);
      refresh();
    } catch (err) {
      setModal(null);
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const discardSelected = async () => {
    try {
      await adminDealers.discardDraft(dealerId, [...selected]);
      setEdits(new Map());
      setSelected(new Set());
      refresh();
    } catch (err) {
      fail(err);
    }
  };

  /** Pasting several lines (e.g. a column copied from Excel) into a price cell fills that cell and the rows below it. */
  const pastePrices = (startIndex: number, text: string) => {
    const values = text.split(/\r?\n/).map((l) => l.split("\t")[0].replace(/[₹,\s]/g, "")).filter((v, i, arr) => v !== "" || i < arr.length - 1);
    let applied = 0;
    values.forEach((v, i) => {
      const row = rows[startIndex + i];
      if (!row || !Number.isFinite(Number(v)) || Number(v) <= 0) return;
      setEdit(row, { ...(edits.get(row.variantId) ?? baseline(row)), price: Number(v).toFixed(2) });
      applied += 1;
    });
    setNotice({ ok: applied > 0, text: applied > 0 ? `Pasted ${applied} price${applied === 1 ? "" : "s"}. Review them, then Save draft.` : "Nothing valid to paste — copy a column of numbers." });
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.variantId));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.variantId)));
  const toggle = (id: number) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <div className="pb-24">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label className="sr-only" htmlFor="cg-q">Search assigned products</label>
        <input id="cg-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products or SKU" className={`${adminInput} w-60`} />
        <label className="sr-only" htmlFor="cg-f">Filter</label>
        <select id="cg-f" value={filter} onChange={(e) => setFilter(e.target.value)} className={adminInput}>
          <option value="all">All assigned</option>
          <option value="missing_price">Missing price</option>
          <option value="expiring">Expiring deals</option>
          <option value="drafts">Has draft changes</option>
        </select>
        <div className="flex flex-wrap gap-2 ml-auto">
          <button type="button" className={btnPrimary} onClick={() => setModal("pick")}><Plus className="w-4 h-4" aria-hidden /> Add products</button>
          <button type="button" className={btnOutline} onClick={() => setModal("import")}><FileUp className="w-4 h-4" aria-hidden /> Import CSV</button>
          <button type="button" className={btnOutline} onClick={() => setModal("copy")}><Copy className="w-4 h-4" aria-hidden /> Copy from dealer</button>
          <button type="button" className={btnOutline} onClick={() => setModal("preview")}><Eye className="w-4 h-4" aria-hidden /> Preview as dealer</button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 bg-steel-50 border border-line rounded-lg px-3 py-2 text-[13px]">
          <strong>{selected.size} selected</strong>
          <button type="button" className={btnOutline} onClick={() => setModal("adjust")}>Adjust prices by %</button>
          <button type="button" className={btnOutline} onClick={discardSelected}>Discard drafts</button>
          <button type="button" className={btnDanger} onClick={() => setModal("remove")}><Trash2 className="w-4 h-4" aria-hidden /> Remove from dealer</button>
        </div>
      )}
      {notice && <p role={notice.ok ? "status" : "alert"} className={`mb-3 text-[13px] rounded px-3 py-2 border ${notice.ok ? "text-emerald-800 bg-emerald-50 border-emerald-200" : "text-sale bg-sale/5 border-sale/30"}`}>{notice.text}</p>}

      {loading && !data && <PageSkeleton rows={4} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && rows.length === 0 && (
        filter === "all" && !debouncedQ ? (
          <EmptyState title="No products assigned" action={<button type="button" className={btnPrimary} onClick={() => setModal("pick")}>Add products</button>}>Dealers see nothing until you assign products. Nothing is ever assigned automatically.</EmptyState>
        ) : <EmptyState title="No matching products" />
      )}
      {data && rows.length > 0 && (
        <>
          <div className="bg-white border border-line rounded-lg overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-steel-500 border-b border-line">
                <tr>
                  <th className="p-2.5 w-8"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" /></th>
                  <th className="p-2.5 font-medium">Product / Variant</th><th className="p-2.5 font-medium text-right">Public ref.</th>
                  <th className="p-2.5 font-medium">Dealer price (₹)</th><th className="p-2.5 font-medium">Tax basis</th><th className="p-2.5 font-medium">From</th><th className="p-2.5 font-medium">Until</th>
                  <th className="p-2.5 font-medium">MOQ</th><th className="p-2.5 font-medium">Pack</th><th className="p-2.5 font-medium">Visible</th><th className="p-2.5 font-medium">Status</th><th className="p-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row, index) => (
                  <GridLine key={row.variantId} row={row} onPaste={(text) => pastePrices(index, text)} onTiers={() => setTiersFor(row)} edit={edits.get(row.variantId)} selected={selected.has(row.variantId)} onSelect={() => toggle(row.variantId)} onEdit={(e) => setEdit(row, e)} onAccess={(patch) => changeAccess(row, patch)} onHistory={() => setHistoryFor(row)} />
                ))}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-[13px]">
              <span className="text-steel-500">{data.total} products · page {page} of {data.totalPages}</span>
              <div className="flex gap-2"><button type="button" className={btnOutline} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button><button type="button" className={btnOutline} disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button></div>
            </div>
          )}
        </>
      )}

      <div className={`fixed bottom-0 inset-x-0 lg:left-64 z-30 bg-white/95 backdrop-blur border-t border-line px-6 py-3 flex flex-wrap items-center justify-between gap-3`} role="region" aria-label="Pricing actions">
        <span className="text-[13px] text-steel-700">
          {edits.size > 0 ? <strong>{edits.size} unsaved change{edits.size === 1 ? "" : "s"}</strong> : "No unsaved changes"} · {draftCount} draft price{draftCount === 1 ? "" : "s"} waiting to publish
        </span>
        <div className="flex gap-2">
          <button type="button" className={btnOutline} disabled={edits.size === 0 || busy} onClick={() => setEdits(new Map())}>Discard edits</button>
          <button type="button" className={btnOutline} disabled={edits.size === 0 || busy} onClick={saveDrafts}>{busy && <Spinner />} Save draft</button>
          <button type="button" className={btnPrimary} disabled={draftCount === 0 || edits.size > 0 || busy} onClick={() => setModal("publish")} title={edits.size > 0 ? "Save your edits first" : undefined}>Publish changes</button>
        </div>
      </div>

      {modal === "pick" && <PickerModal dealerId={dealerId} onClose={() => setModal(null)} onDone={(n) => { setModal(null); setNotice({ ok: true, text: `${n} product${n === 1 ? "" : "s"} assigned. Set a price for each, then publish.` }); refresh(); }} />}
      {modal === "import" && <ImportModal dealerId={dealerId} onClose={() => setModal(null)} onDone={(text) => { setModal(null); setNotice({ ok: true, text }); refresh(); }} />}
      {modal === "copy" && <CopyModal dealerId={dealerId} onClose={() => setModal(null)} onDone={(text) => { setModal(null); setNotice({ ok: true, text }); refresh(); }} />}
      {modal === "preview" && <PreviewModal dealerId={dealerId} onClose={() => setModal(null)} />}
      {modal === "adjust" && <AdjustModal dealerId={dealerId} variantIds={[...selected]} onClose={() => setModal(null)} onDone={(text) => { setModal(null); setSelected(new Set()); setNotice({ ok: true, text }); refresh(); }} />}
      {modal === "remove" && (
        <Modal title="Remove from this dealer?" onClose={() => setModal(null)}>
          <p className="text-[13.5px] mb-4">{selected.size} product{selected.size === 1 ? "" : "s"} will disappear from {detail.dealer.display_name}'s catalogue and any carts immediately. Published price history is kept.</p>
          <div className="flex justify-end gap-2"><button type="button" className={btnOutline} onClick={() => setModal(null)}>Cancel</button><button type="button" className={btnDanger} disabled={busy} onClick={bulkRemove}>{busy && <Spinner />} Remove</button></div>
        </Modal>
      )}
      {modal === "publish" && (
        <Modal title="Publish price changes?" onClose={() => setModal(null)}>
          <p className="text-[13.5px] mb-4">{draftCount} draft price{draftCount === 1 ? "" : "s"} will go live for {detail.dealer.display_name}. Open carts are re-priced and flagged for the dealer to confirm; orders already placed are never changed.</p>
          <div className="flex justify-end gap-2"><button type="button" className={btnOutline} onClick={() => setModal(null)}>Cancel</button><button type="button" className={btnPrimary} disabled={busy} onClick={publish}>{busy && <Spinner />} Publish</button></div>
        </Modal>
      )}
      {tiersFor && <TiersModal dealerId={dealerId} row={tiersFor} onClose={() => setTiersFor(null)} onChanged={(text) => { setTiersFor(null); if (text) setNotice({ ok: true, text }); refresh(); }} />}
      {historyFor && <HistoryModal dealerId={dealerId} row={historyFor} onClose={() => setHistoryFor(null)} onRestored={() => { setHistoryFor(null); setNotice({ ok: true, text: "Previous price restored as a new, audited price." }); refresh(); }} />}
    </div>
  );
}

function GridLine({ row, edit, selected, onSelect, onEdit, onAccess, onHistory, onPaste, onTiers }: { onPaste: (text: string) => void; onTiers: () => void; row: GridRow; edit: Edit | undefined; selected: boolean; onSelect: () => void; onEdit: (e: Edit) => void; onAccess: (patch: Record<string, unknown>) => void; onHistory: () => void }) {
  const current = edit ?? baseline(row);
  const [moq, setMoq] = useState(String(row.minQty));
  const [pack, setPack] = useState(String(row.qtyMultiple));
  useEffect(() => { setMoq(String(row.minQty)); setPack(String(row.qtyMultiple)); }, [row.minQty, row.qtyMultiple]);
  const badge = STATE_BADGE[row.state];
  const commit = (key: "minQty" | "qtyMultiple", value: string, original: number) => {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 1 && n !== original) onAccess({ [key]: n });
    else { setMoq(String(row.minQty)); setPack(String(row.qtyMultiple)); }
  };
  return (
    <tr className={`${edit ? "bg-amber-50/50" : ""} ${row.isVisible ? "" : "opacity-60"}`}>
      <td className="p-2.5"><input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${row.name}`} /></td>
      <td className="p-2.5 max-w-[240px]"><div className="font-medium leading-snug">{row.name}</div><div className="text-[11px] text-steel-500">{row.sku ? `SKU ${row.sku}` : `#${row.variantId}`}{row.availableInOdoo === false && <span className="text-sale"> · unavailable in Odoo</span>}</div></td>
      <td className="p-2.5 text-right price text-steel-700">{row.publicPricePaise !== null ? money(row.publicPricePaise) : "—"}</td>
      <td className="p-2.5">
        <label className="sr-only" htmlFor={`price-${row.variantId}`}>Dealer price for {row.name}</label>
        <input id={`price-${row.variantId}`} value={current.price} inputMode="decimal" placeholder="Not set" onChange={(e) => onEdit({ ...current, price: e.target.value })} onPaste={(e) => { const t = e.clipboardData.getData("text"); if (/[\r\n]\s*\S/.test(t.trim() ? t : "") ) { e.preventDefault(); onPaste(t); } }} className={`${adminInput} w-28 text-right price`} />
        {row.draftPrice && row.activePrice && !edit && <div className="text-[11px] text-steel-500 mt-0.5">live {money(row.activePrice.pricePaise)}</div>}
      </td>
      <td className="p-2.5">
        <label className="sr-only" htmlFor={`basis-${row.variantId}`}>Tax basis</label>
        <select id={`basis-${row.variantId}`} value={current.basis} onChange={(e) => onEdit({ ...current, basis: e.target.value as TaxBasis })} className={`${adminInput} w-24`}><option value="exclusive">excl. tax</option><option value="inclusive">incl. tax</option></select>
      </td>
      <td className="p-2.5"><label className="sr-only" htmlFor={`from-${row.variantId}`}>Valid from</label><input id={`from-${row.variantId}`} type="date" value={current.from} onChange={(e) => onEdit({ ...current, from: e.target.value })} className={`${adminInput} w-32`} /></td>
      <td className="p-2.5"><label className="sr-only" htmlFor={`to-${row.variantId}`}>Valid until</label><input id={`to-${row.variantId}`} type="date" value={current.to} onChange={(e) => onEdit({ ...current, to: e.target.value })} className={`${adminInput} w-32`} /></td>
      <td className="p-2.5"><label className="sr-only" htmlFor={`moq-${row.variantId}`}>Minimum quantity</label><input id={`moq-${row.variantId}`} value={moq} inputMode="numeric" onChange={(e) => setMoq(e.target.value)} onBlur={() => commit("minQty", moq, row.minQty)} className={`${adminInput} w-14 text-right`} /></td>
      <td className="p-2.5"><label className="sr-only" htmlFor={`pack-${row.variantId}`}>Quantity multiple</label><input id={`pack-${row.variantId}`} value={pack} inputMode="numeric" onChange={(e) => setPack(e.target.value)} onBlur={() => commit("qtyMultiple", pack, row.qtyMultiple)} className={`${adminInput} w-14 text-right`} /></td>
      <td className="p-2.5"><label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={row.isVisible} onChange={(e) => onAccess({ isVisible: e.target.checked })} /><span className="sr-only">Visible to dealer</span></label></td>
      <td className="p-2.5"><span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${badge.cls}`}>{badge.label}</span></td>
      <td className="p-2.5 whitespace-nowrap"><button type="button" onClick={onTiers} className="p-1.5 text-steel-500 hover:text-ink relative" aria-label={`Volume pricing for ${row.name}`}><Layers className="w-4 h-4" />{row.tiers.some((t) => t.minQty > 1) && <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-gold" aria-hidden />}</button><button type="button" onClick={onHistory} className="p-1.5 text-steel-500 hover:text-ink" aria-label={`Price history for ${row.name}`}><History className="w-4 h-4" /></button></td>
    </tr>
  );
}

function TiersModal({ dealerId, row, onClose, onChanged }: { dealerId: string; row: GridRow; onClose: () => void; onChanged: (text: string) => void }) {
  const tiers = row.tiers.filter((t) => t.minQty > 1).sort((a, b) => a.minQty - b.minQty);
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [basis, setBasis] = useState<TaxBasis>(row.draftPrice?.taxBasis ?? row.activePrice?.taxBasis ?? "exclusive");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<string | void>, done: string) => {
    setBusy(true);
    setErr(null);
    try {
      const msg = await fn();
      onChanged(msg || done);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Something went wrong");
      setBusy(false);
    }
  };
  const add = () => {
    const n = Number(qty);
    const rupees = Number(price.replace(/,/g, ""));
    if (!Number.isInteger(n) || n < 2) return setErr("Quantity must be a whole number of 2 or more.");
    if (!Number.isFinite(rupees) || rupees <= 0) return setErr("Enter a valid unit price.");
    void run(() => adminDealers.saveDraft({ dealerId, variantId: row.variantId, pricePaise: rupeesToPaise(rupees), taxBasis: basis, minQuantity: n }).then(() => undefined), `Volume price saved as a draft for ${row.name}. Publish to make it live.`);
  };

  return (
    <Modal title={`Volume pricing — ${row.name}`} onClose={onClose} wide>
      <p className="text-[13px] text-steel-500 mb-4">Set a lower unit price once the dealer orders at least a given quantity. The base price above applies below the first tier. Tier prices go live when you publish.</p>
      {tiers.length === 0 ? <p className="text-[13px] mb-4">No volume tiers yet.</p> : (
        <table className="w-full text-[13px] mb-4 border border-line rounded-lg">
          <thead className="text-left text-[11.5px] uppercase tracking-wide text-steel-500 border-b border-line"><tr><th className="p-2 font-medium">From qty</th><th className="p-2 font-medium text-right">Unit price</th><th className="p-2 font-medium">Status</th><th className="p-2" /></tr></thead>
          <tbody className="divide-y divide-line">
            {tiers.map((t) => (
              <tr key={t.id}><td className="p-2">{t.minQty}+</td><td className="p-2 text-right price">{money(t.pricePaise)} <span className="text-[11px] text-steel-500 font-sans">{t.taxBasis === "inclusive" ? "incl." : "excl."} tax</span></td><td className="p-2 capitalize">{t.status}</td>
                <td className="p-2 text-right"><button type="button" className="underline text-sale text-[12.5px]" disabled={busy} onClick={() => run(() => adminDealers.removeTier(dealerId, t.id).then(() => undefined), "Volume price removed.")}>Remove</button></td></tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="grid sm:grid-cols-4 gap-3 items-end">
        <div><label className={labelClass} htmlFor="tier-qty">From quantity</label><input id="tier-qty" inputMode="numeric" className={inputClass} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 10" /></div>
        <div><label className={labelClass} htmlFor="tier-price">Unit price (₹)</label><input id="tier-price" inputMode="decimal" className={inputClass} value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        <div><label className={labelClass} htmlFor="tier-basis">Tax</label><select id="tier-basis" className={adminInput} value={basis} onChange={(e) => setBasis(e.target.value as TaxBasis)}><option value="exclusive">excl. tax</option><option value="inclusive">incl. tax</option></select></div>
        <button type="button" className={btnPrimary} disabled={busy} onClick={add}>{busy && <Spinner />} Add tier</button>
      </div>
      {err && <p role="alert" className="mt-3 text-[13px] text-sale">{err}</p>}
      <div className="mt-6 pt-4 border-t border-line">
        <p className="text-[13px] text-steel-500 mb-2">Other sizes or colours of this product can start from this variant's price.</p>
        <button type="button" className={btnOutline} disabled={busy} onClick={() => run(() => adminDealers.applyToVariants(dealerId, row.variantId).then((r) => `Copied this price to ${r.drafted} other variant${r.drafted === 1 ? "" : "s"} as drafts.`), "")}>Apply this price to all variants of the product</button>
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------------------------------------------
// Modals
// -------------------------------------------------------------------------------------------------

function PickerModal({ dealerId, onClose, onDone }: { dealerId: string; onClose: () => void; onDone: (n: number) => void }) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { setDq(q); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading, reload } = useApi(() => adminDealers.searchMaster({ dealerId, q: dq || undefined, page, unassignedOnly }), [dealerId, dq, page, unassignedOnly]);
  const toggle = (id: number) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const assign = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await adminDealers.assign(dealerId, [...picked]);
      onDone(res.assigned);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't assign");
      setBusy(false);
    }
  };
  return (
    <Modal title="Add products to this dealer" onClose={onClose} wide>
      <div className="space-y-3">
        <div><label className={labelClass} htmlFor="pk-q">Search the master catalogue</label><input id="pk-q" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or SKU" className={inputClass} /></div>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={unassignedOnly} onChange={(e) => { setUnassignedOnly(e.target.checked); setPage(1); }} /> Only products not assigned to any dealer yet</label>
        {loading && <PageSkeleton rows={2} />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data && data.items.length === 0 && <p className="text-[13px] text-steel-500">No published products match.</p>}
        {data && (
          <ul className="divide-y divide-line border border-line rounded-lg max-h-[46vh] overflow-y-auto">
            {data.items.map((p: MasterProduct) => (
              <li key={p.templateId} className="p-3">
                <div className="text-[13.5px] font-medium">{p.name}</div>
                <div className="mt-1.5 space-y-1">
                  {p.variants.map((v) => (
                    <label key={v.variantId} className={`flex items-center gap-2 text-[12.5px] ${v.assigned ? "opacity-50" : ""}`}>
                      <input type="checkbox" disabled={v.assigned || !v.purchasable} checked={picked.has(v.variantId)} onChange={() => toggle(v.variantId)} />
                      <span>{v.attributes.length ? v.attributes.map((a) => a.value).join(", ") : "Standard"}{v.sku ? ` · ${v.sku}` : ""}</span>
                      <span className="text-steel-500">public {money(v.publicPricePaise)}</span>
                      {v.assigned && <span className="text-emerald-700">already assigned</span>}
                      {!v.purchasable && <span className="text-sale">unavailable</span>}
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && data.totalPages > 1 && (
          <div className="flex justify-between text-[12.5px]"><span className="text-steel-500">Page {page} of {data.totalPages}</span><span className="flex gap-2"><button type="button" className={btnOutline} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button><button type="button" className={btnOutline} disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button></span></div>
        )}
        {err && <p role="alert" className="text-[13px] text-sale">{err}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" className={btnOutline} onClick={onClose}>Cancel</button><button type="button" className={btnPrimary} disabled={picked.size === 0 || busy} onClick={assign}>{busy && <Spinner />} Assign {picked.size || ""} selected</button></div>
      </div>
    </Modal>
  );
}

const CSV_TEMPLATE = "sku,price,tax,moq,multiple,start,end,note\nMAT-BAL-BLK,3800,exclusive,1,1,,,Diwali deal\n";

function ImportModal({ dealerId, onClose, onDone }: { dealerId: string; onClose: () => void; onDone: (text: string) => void }) {
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const preview = async () => {
    setBusy(true);
    setErr(null);
    setRows(null);
    try {
      const res = await adminDealers.importPreview(dealerId, csv);
      setFatal(res.fatal);
      setRows(res.rows);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't read the file");
    } finally {
      setBusy(false);
    }
  };
  const commit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await adminDealers.importCommit(dealerId, csv, skipInvalid);
      onDone(`Imported: ${res.drafted} draft price${res.drafted === 1 ? "" : "s"}, ${res.assigned} newly assigned${res.skipped ? `, ${res.skipped} row${res.skipped === 1 ? "" : "s"} skipped` : ""}. Review, then publish.`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Import failed");
      setBusy(false);
    }
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1_000_000) return setErr("File is too large (limit 1 MB)");
    setCsv(await f.text());
    setRows(null);
  };
  const errorCount = rows?.filter((r) => r.status === "error").length ?? 0;
  const okCount = (rows?.length ?? 0) - errorCount;
  return (
    <Modal title="Import prices from CSV" onClose={onClose} wide>
      <div className="space-y-3">
        <p className="text-[12.5px] text-steel-500">Columns: <code>sku</code>, <code>price</code> (₹), optional <code>tax</code> (exclusive/inclusive), <code>moq</code>, <code>multiple</code>, <code>start</code>, <code>end</code>, <code>note</code>. Imported rows become <strong>drafts</strong>; nothing is live until you publish. <a className="underline" download="dealer-prices-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}>Download template</a></p>
        <div className="flex items-center gap-3"><label className={`${btnOutline} cursor-pointer`}><UploadCloud className="w-4 h-4" aria-hidden /> Choose file<input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} /></label><span className="text-[12.5px] text-steel-500">or paste from a spreadsheet below</span></div>
        <label className="sr-only" htmlFor="csv-text">CSV contents</label>
        <textarea id="csv-text" value={csv} onChange={(e) => { setCsv(e.target.value); setRows(null); }} rows={6} className={`${inputClass} h-auto py-2 font-mono text-[12px]`} placeholder={CSV_TEMPLATE} />
        <button type="button" className={btnOutline} disabled={!csv.trim() || busy} onClick={preview}>{busy && !rows && <Spinner />} Preview import</button>
        {fatal && <p role="alert" className="text-[13px] text-sale">{fatal}</p>}
        {rows && !fatal && (
          <>
            <p className="text-[13px]"><strong className="text-emerald-700">{okCount} valid</strong>{errorCount > 0 && <> · <strong className="text-sale">{errorCount} with errors</strong></>}</p>
            <div className="border border-line rounded-lg max-h-[34vh] overflow-auto">
              <table className="w-full text-[12px]">
                <thead className="text-left text-[11px] uppercase tracking-wide text-steel-500 border-b border-line sticky top-0 bg-white"><tr><th className="p-2 font-medium">Line</th><th className="p-2 font-medium">SKU</th><th className="p-2 font-medium">Product</th><th className="p-2 font-medium text-right">Current</th><th className="p-2 font-medium text-right">New</th><th className="p-2 font-medium">Result</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.line} className={r.status === "error" ? "bg-sale/5" : ""}>
                      <td className="p-2">{r.line}</td><td className="p-2 font-mono">{r.sku}</td><td className="p-2">{r.productName ?? "—"}</td>
                      <td className="p-2 text-right price">{r.currentPricePaise !== null ? money(r.currentPricePaise) : "—"}</td><td className="p-2 text-right price">{r.newPricePaise !== null ? money(r.newPricePaise) : "—"}</td>
                      <td className="p-2">{r.status === "error" ? <span className="text-sale">{r.errors.join("; ")}</span> : <span className="capitalize text-emerald-700">{r.action}{!r.assigned ? " + assign" : ""}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {errorCount > 0 && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={skipInvalid} onChange={(e) => setSkipInvalid(e.target.checked)} /> Skip the {errorCount} invalid row{errorCount === 1 ? "" : "s"} and import the rest</label>}
          </>
        )}
        {err && <p role="alert" className="text-[13px] text-sale">{err}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" className={btnOutline} onClick={onClose}>Cancel</button><button type="button" className={btnPrimary} disabled={!rows || !!fatal || busy || okCount === 0 || (errorCount > 0 && !skipInvalid)} onClick={commit}>{busy && rows && <Spinner />} Import {okCount || ""} row{okCount === 1 ? "" : "s"} as drafts</button></div>
      </div>
    </Modal>
  );
}

function CopyModal({ dealerId, onClose, onDone }: { dealerId: string; onClose: () => void; onDone: (text: string) => void }) {
  const { data, error } = useApi(() => adminDealers.list({ pageSize: 100 }), []);
  const [from, setFrom] = useState("");
  const [withPrices, setWithPrices] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const others = useMemo(() => (data?.rows ?? []).filter((d) => d.id !== dealerId && d.assignedCount > 0), [data, dealerId]);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await adminDealers.copyFrom(dealerId, from, withPrices);
      onDone(`Copied ${res.assigned} product${res.assigned === 1 ? "" : "s"}${withPrices ? ` and ${res.drafted} draft price${res.drafted === 1 ? "" : "s"}` : ""}. Review, then publish.`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't copy");
      setBusy(false);
    }
  };
  return (
    <Modal title="Copy terms from another dealer" onClose={onClose}>
      <div className="space-y-3">
        {error && <p role="alert" className="text-sale text-[13px]">{error.message}</p>}
        <div><label className={labelClass} htmlFor="cp-from">Copy from</label><select id="cp-from" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)}><option value="">Choose a dealer…</option>{others.map((d) => <option key={d.id} value={d.id}>{d.displayName} ({d.assignedCount} products)</option>)}</select></div>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={withPrices} onChange={(e) => setWithPrices(e.target.checked)} /> Also copy their current prices (as drafts)</label>
        <p className="text-[12.5px] text-steel-500">Only products this dealer doesn't already have are added; existing assignments and prices are untouched.</p>
        {err && <p role="alert" className="text-[13px] text-sale">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnOutline} onClick={onClose}>Cancel</button><button type="button" className={btnPrimary} disabled={!from || busy} onClick={go}>{busy && <Spinner />} Copy</button></div>
      </div>
    </Modal>
  );
}

function AdjustModal({ dealerId, variantIds, onClose, onDone }: { dealerId: string; variantIds: number[]; onClose: () => void; onDone: (text: string) => void }) {
  const [percent, setPercent] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = Number(percent);
  const valid = percent.trim() !== "" && Number.isFinite(n) && n > -100 && n <= 1000 && n !== 0;
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await adminDealers.bulkAdjust(dealerId, variantIds, n);
      onDone(`${res.drafted} price${res.drafted === 1 ? "" : "s"} adjusted by ${n > 0 ? "+" : ""}${n}% as drafts${res.skipped.length ? ` (${res.skipped.length} skipped — no current price)` : ""}. Publish to apply.`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't adjust");
      setBusy(false);
    }
  };
  return (
    <Modal title="Adjust prices by a percentage" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[13px]">Applies to the <strong>current published price</strong> of {variantIds.length} selected product{variantIds.length === 1 ? "" : "s"}. Results are saved as drafts — nothing changes for the dealer until you publish.</p>
        <div><label className={labelClass} htmlFor="adj-p">Percentage (negative to reduce)</label><input id="adj-p" className={inputClass} value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="e.g. -5 or 7.5" inputMode="decimal" autoFocus /></div>
        {err && <p role="alert" className="text-[13px] text-sale">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnOutline} onClick={onClose}>Cancel</button><button type="button" className={btnPrimary} disabled={!valid || busy} onClick={go}>{busy && <Spinner />} {valid ? `Apply ${n > 0 ? "+" : ""}${n}% as drafts` : "Apply"}</button></div>
      </div>
    </Modal>
  );
}

function PreviewModal({ dealerId, onClose }: { dealerId: string; onClose: () => void }) {
  const { data, error, loading, reload } = useApi(() => adminDealers.previewCatalog(dealerId), [dealerId]);
  const accent = data?.branding?.accent_color ?? "#10148F";
  const logo = brandingImageUrl(data?.branding?.logo_path);
  return (
    <Modal title="Preview as dealer (read-only)" onClose={onClose} wide>
      <p className="text-[12.5px] bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">Preview only — shows exactly what this dealer would see <strong>including your unpublished draft prices</strong>. Orders can't be placed from here.</p>
      {loading && <PageSkeleton rows={2} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="border border-line rounded-lg overflow-hidden bg-paper">
          <div className="bg-white border-b border-line h-12 px-4 flex items-center gap-2">
            {logo ? <img src={logo} alt="" className="h-7 object-contain" /> : <span className="w-7 h-7 rounded grid place-items-center text-white text-sm font-display" style={{ background: accent }} aria-hidden>{data.dealer.displayName.charAt(0)}</span>}
            <span className="font-semibold text-[13px]">{data.dealer.displayName}</span>
          </div>
          <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.catalog.items.length === 0 && <p className="text-[13px] text-steel-500 col-span-full">This dealer would currently see no products.</p>}
            {data.catalog.items.map((p) => (
              <div key={p.templateId} className="bg-white border border-line rounded-lg p-3">
                <div className="text-[13px] font-medium leading-snug">{p.name}</div>
                <ul className="mt-2 space-y-1">
                  {p.variants.map((v) => <li key={v.variantId} className="flex justify-between text-[12.5px]"><span className="text-steel-700">{v.attributes.length ? v.attributes.map((a) => a.value).join(", ") : "Standard"}</span>{v.pricePaise !== null ? <span className="price font-semibold">{money(v.pricePaise)}</span> : <span className="text-sale">no price</span>}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

function HistoryModal({ dealerId, row, onClose, onRestored }: { dealerId: string; row: GridRow; onClose: () => void; onRestored: () => void }) {
  const { data, error, loading, reload } = useApi(() => adminDealers.history(dealerId, row.variantId), [dealerId, row.variantId]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const restore = async (ruleId: string) => {
    setBusyId(ruleId);
    setErr(null);
    try {
      await adminDealers.revert(dealerId, ruleId);
      onRestored();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't restore");
      setBusyId(null);
    }
  };
  return (
    <Modal title={`Price history — ${row.name}`} onClose={onClose} wide>
      {loading && <PageSkeleton rows={2} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {err && <p role="alert" className="text-[13px] text-sale mb-2">{err}</p>}
      {data && data.rules.length === 0 && <p className="text-[13px] text-steel-500">No prices recorded yet.</p>}
      {data && data.rules.length > 0 && (
        <table className="w-full text-[12.5px]">
          <thead className="text-left text-[11px] uppercase tracking-wide text-steel-500 border-b border-line"><tr><th className="py-2 font-medium">Created</th><th className="py-2 font-medium">Status</th><th className="py-2 font-medium text-right">Price</th><th className="py-2 font-medium">Window</th><th className="py-2" /></tr></thead>
          <tbody className="divide-y divide-line">
            {data.rules.map((r) => {
              const isCurrent = r.status === "active";
              return (
                <tr key={r.id}>
                  <td className="py-2">{formatDateTime(r.createdAt)}</td>
                  <td className="py-2 capitalize">{r.status}</td>
                  <td className="py-2 text-right price">{money(r.pricePaise)} <span className="text-steel-500 font-sans">{r.taxBasis === "inclusive" ? "incl." : "excl."}</span></td>
                  <td className="py-2 text-steel-700">{r.startsAt ? formatDateTime(r.startsAt) : "—"} → {r.endsAt ? formatDateTime(r.endsAt) : "open"}</td>
                  <td className="py-2 text-right">{r.status !== "draft" && !isCurrent && <button type="button" className={btnOutline} disabled={busyId !== null} onClick={() => restore(r.id)}>{busyId === r.id && <Spinner />} Restore</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="text-[12px] text-steel-500 mt-3">Restoring creates a <em>new</em> price effective now; history is never edited or deleted.</p>
    </Modal>
  );
}
