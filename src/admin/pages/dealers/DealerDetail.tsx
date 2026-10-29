import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { ApiError } from "../../../dealer/lib/transport";
import { btnDanger, btnOutline, ErrorState, PageSkeleton, Spinner, useApi } from "../../../dealer/ui";
import { adminDealers, type DealerDetailData, type DealerStatus } from "./adminDealerApi";
import { ADMIN_ACCENT_STYLE, DealerStatusBadge, Modal, useAdminBase } from "./dealerAdminUi";
import { DealerForm, valuesFromDealer } from "./DealerForm";


export interface DetailContext {
  detail: DealerDetailData;
  reload: () => void;
}
export const useDealerDetail = () => useOutletContext<DetailContext>();

const TABS = [
  ["overview", "Overview"],
  ["catalog", "Catalogue & Pricing"],
  ["branding", "Branding"],
  ["access", "Access"],
  ["orders", "Orders"],
  ["activity", "Activity"],
] as const;

function SetupStepper({ detail, base }: { detail: DealerDetailData; base: string }) {
  const brandingDone = !!(detail.branding?.logo_path || detail.branding?.tagline);
  const pricingDone = !detail.readiness.some((i) => i.code === "no_products" || i.code === "missing_price");
  const steps = [
    { label: "Details", done: true, to: "overview" },
    { label: "Branding", done: brandingDone, to: "branding" },
    { label: "Products & Pricing", done: pricingDone, to: "catalog" },
    { label: "Review & Invite", done: detail.ready && detail.dealer.status !== "draft", to: "access" },
  ];
  return (
    <ol className="flex flex-wrap items-center gap-2 mb-5 text-[12.5px]" aria-label="Setup progress">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2">
          <Link to={`${base}/dealers/${detail.dealer.id}/${s.to}`} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${s.done ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-line bg-white text-steel-700"}`}>
            <span className={`w-5 h-5 rounded-full grid place-items-center text-[11px] font-semibold ${s.done ? "bg-emerald-600 text-white" : "bg-steel-100"}`}>{s.done ? <Check className="w-3 h-3" aria-hidden /> : i + 1}</span>
            {s.label}
          </Link>
          {i < steps.length - 1 && <span className="text-steel-300" aria-hidden>—</span>}
        </li>
      ))}
    </ol>
  );
}

export default function DealerDetail() {
  const { id = "" } = useParams();
  const base = useAdminBase();
  const { data, error, loading, reload } = useApi(() => adminDealers.get(id), [id]);
  const [confirm, setConfirm] = useState<DealerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && !data) return <div className="p-10" style={ADMIN_ACCENT_STYLE}><PageSkeleton rows={2} /></div>;
  if (error) return <div className="p-10" style={ADMIN_ACCENT_STYLE}><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return null;
  const { dealer } = data;

  const changeStatus = async (to: DealerStatus) => {
    setBusy(true);
    setActionError(null);
    try {
      await adminDealers.setStatus(dealer.id, to);
      setConfirm(null);
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't change status");
    } finally {
      setBusy(false);
    }
  };

  const canSuspend = dealer.status === "invited" || dealer.status === "active";
  const canReactivate = dealer.status === "suspended";
  const canArchive = dealer.status !== "archived";

  return (
    <div className="p-6 lg:p-10 max-w-7xl" style={ADMIN_ACCENT_STYLE}>
      <Link to={`${base}/dealers`} className="inline-flex items-center gap-1 text-[13px] text-steel-700 hover:underline mb-3"><ArrowLeft className="w-4 h-4" aria-hidden /> All dealers</Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display uppercase text-[18px] leading-tight">{dealer.display_name}</h2>
          <p className="text-[12.5px] text-steel-500 mt-1"><span className="font-mono">{dealer.dealer_code}</span> · {dealer.legal_name} · <DealerStatusBadge status={dealer.status} /></p>
        </div>
        <div className="flex gap-2">
          {canReactivate && <button type="button" className={btnOutline} onClick={() => changeStatus("active")} disabled={busy}>Reactivate</button>}
          {canSuspend && <button type="button" className={btnDanger} onClick={() => setConfirm("suspended")}>Suspend</button>}
          {canArchive && <button type="button" className={btnOutline} onClick={() => setConfirm("archived")}>Archive</button>}
        </div>
      </div>
      {actionError && <p role="alert" className="mb-3 text-[13px] text-sale">{actionError}</p>}
      {dealer.status === "draft" && <SetupStepper detail={data} base={base} />}

      <nav aria-label="Dealer sections" className="flex gap-1 border-b border-line mb-6 overflow-x-auto">
        {TABS.map(([path, label]) => (
          <NavLink key={path} to={`${base}/dealers/${dealer.id}/${path}`} className={({ isActive }) => `px-4 py-2.5 text-[13.5px] whitespace-nowrap border-b-2 -mb-px ${isActive ? "border-ink font-semibold" : "border-transparent text-steel-700 hover:text-ink"}`}>{label}</NavLink>
        ))}
      </nav>
      <Outlet context={{ detail: data, reload } satisfies DetailContext} />

      {confirm && (
        <Modal title={confirm === "suspended" ? "Suspend this dealer?" : "Archive this dealer?"} onClose={() => setConfirm(null)}>
          <p className="text-[13.5px] mb-4">
            {confirm === "suspended" ? "They lose purchasing access immediately. Orders and prices are kept, and you can reactivate them." : "Archiving closes the account permanently. Order history stays visible to admins. This can't be undone."}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnOutline} onClick={() => setConfirm(null)}>Cancel</button>
            <button type="button" className={btnDanger} disabled={busy} onClick={() => changeStatus(confirm)}>{busy && <Spinner />} {confirm === "suspended" ? "Suspend" : "Archive"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function DealerNew() {
  const base = useAdminBase();
  const navigate = useNavigate();
  return (
    <div className="p-6 lg:p-10 max-w-7xl" style={ADMIN_ACCENT_STYLE}>
      <Link to={`${base}/dealers`} className="inline-flex items-center gap-1 text-[13px] text-steel-700 hover:underline mb-3"><ArrowLeft className="w-4 h-4" aria-hidden /> All dealers</Link>
      <h2 className="font-display uppercase text-[18px] mb-1">Add dealer</h2>
      <p className="text-[12.5px] text-steel-500 mb-5">Step 1 of 4 — Details. Next you'll set branding, assign products with prices, then invite.</p>
      <DealerForm
        initial={valuesFromDealer()}
        submitLabel="Save draft & continue"
        onSubmit={async (v) => {
          const res = await adminDealers.create({ ...v, contactName: v.contactName || undefined, contactPhone: v.contactPhone || undefined, gstin: v.gstin || undefined });
          navigate(`${base}/dealers/${res.dealer.id}/branding`);
        }}
      />
    </div>
  );
}
