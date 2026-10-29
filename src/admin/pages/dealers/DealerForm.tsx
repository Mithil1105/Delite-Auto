import { useState, type FormEvent } from "react";
import type { Address } from "../../../dealer/lib/dealerApi";
import { ApiError } from "../../../dealer/lib/transport";
import { btnPrimary, inputClass, labelClass, Spinner } from "../../../dealer/ui";
import type { DealerRecord } from "./adminDealerApi";
import { adminInput } from "./dealerAdminUi";

export interface DealerFormValues {
  displayName: string;
  legalName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  gstin: string;
  billingAddress: Address;
  shippingAddress: Address;
  purchaseMethod: "request_order" | "po_required";
  shippingPolicy: "as_agreed" | "free" | "flat";
  flatShippingRupees: string;
  paymentTerms: string;
  creditLimitRupees: string;
  isPilot: boolean;
}

/** Form values -> the API payload fields for commercial terms (rupees are converted to integer paise). */
export function termsPayload(v: DealerFormValues) {
  const rupees = (x: string) => Math.round(Number(x) * 100);
  return {
    purchaseMethod: v.purchaseMethod,
    shippingPolicy: v.shippingPolicy,
    flatShippingPaise: v.shippingPolicy === "flat" ? rupees(v.flatShippingRupees || "0") : 0,
    paymentTerms: v.paymentTerms.trim() || null,
    creditLimitPaise: v.creditLimitRupees.trim() ? rupees(v.creditLimitRupees) : null,
    isPilot: v.isPilot,
  };
}

export function valuesFromDealer(d?: DealerRecord): DealerFormValues {
  return {
    displayName: d?.display_name ?? "",
    legalName: d?.legal_name ?? "",
    contactName: d?.contact_name ?? "",
    contactEmail: d?.contact_email ?? "",
    contactPhone: d?.contact_phone ?? "",
    gstin: d?.gstin ?? "",
    billingAddress: d?.billing_address ?? {},
    shippingAddress: d?.shipping_address ?? {},
    purchaseMethod: d?.purchase_method ?? "request_order",
    shippingPolicy: d?.shipping_policy ?? "as_agreed",
    flatShippingRupees: d && d.flat_shipping_paise ? String(d.flat_shipping_paise / 100) : "",
    paymentTerms: d?.payment_terms ?? "",
    creditLimitRupees: d?.credit_limit_paise ? String(d.credit_limit_paise / 100) : "",
    isPilot: d?.is_pilot ?? false,
  };
}

function AddressFields({ legend, value, onChange }: { legend: string; value: Address; onChange: (a: Address) => void }) {
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  const id = (k: string) => `${legend.replace(/\s/g, "-").toLowerCase()}-${k}`;
  return (
    <fieldset className="border border-line rounded-lg p-4">
      <legend className="px-2 text-[12px] font-medium uppercase tracking-wide text-steel-500">{legend}</legend>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><label className={labelClass} htmlFor={id("l1")}>Street address</label><input id={id("l1")} className={inputClass} value={value.line1 ?? ""} onChange={set("line1")} /></div>
        <div><label className={labelClass} htmlFor={id("l2")}>Area / apartment</label><input id={id("l2")} className={inputClass} value={value.line2 ?? ""} onChange={set("line2")} /></div>
        <div><label className={labelClass} htmlFor={id("c")}>City</label><input id={id("c")} className={inputClass} value={value.city ?? ""} onChange={set("city")} /></div>
        <div><label className={labelClass} htmlFor={id("s")}>State</label><input id={id("s")} className={inputClass} value={value.state ?? ""} onChange={set("state")} /></div>
        <div><label className={labelClass} htmlFor={id("p")}>PIN code</label><input id={id("p")} className={inputClass} value={value.pincode ?? ""} onChange={set("pincode")} maxLength={6} inputMode="numeric" /></div>
      </div>
    </fieldset>
  );
}

export function DealerForm({ initial, submitLabel, onSubmit }: { initial: DealerFormValues; submitLabel: string; onSubmit: (v: DealerFormValues) => Promise<void> }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const field = <K extends keyof DealerFormValues>(k: K, val: DealerFormValues[K]) => {
    setSaved(false);
    setV((x) => ({ ...x, [k]: val }));
  };
  const text = (k: keyof DealerFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false);
    setV((x) => ({ ...x, [k]: e.target.value }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(v);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5 max-w-3xl">
      <div className="grid sm:grid-cols-2 gap-4">
        <div><label className={labelClass} htmlFor="df-display">Display name *</label><input id="df-display" required className={inputClass} value={v.displayName} onChange={text("displayName")} maxLength={120} /></div>
        <div><label className={labelClass} htmlFor="df-legal">Legal business name *</label><input id="df-legal" required className={inputClass} value={v.legalName} onChange={text("legalName")} maxLength={200} /></div>
        <div><label className={labelClass} htmlFor="df-contact">Contact person</label><input id="df-contact" className={inputClass} value={v.contactName} onChange={text("contactName")} maxLength={120} /></div>
        <div><label className={labelClass} htmlFor="df-email">Owner email (sign-in) *</label><input id="df-email" type="email" required className={inputClass} value={v.contactEmail} onChange={text("contactEmail")} /></div>
        <div><label className={labelClass} htmlFor="df-phone">Phone</label><input id="df-phone" className={inputClass} value={v.contactPhone} onChange={text("contactPhone")} /></div>
        <div><label className={labelClass} htmlFor="df-gstin">GSTIN (optional)</label><input id="df-gstin" className={`${inputClass} uppercase`} value={v.gstin} onChange={text("gstin")} maxLength={15} /></div>
      </div>
      <AddressFields legend="Billing address" value={v.billingAddress} onChange={(a) => { setSaved(false); setV((x) => ({ ...x, billingAddress: a })); }} />
      <AddressFields legend="Shipping address" value={v.shippingAddress} onChange={(a) => { setSaved(false); setV((x) => ({ ...x, shippingAddress: a })); }} />
      <fieldset className="border border-line rounded-lg p-4">
        <legend className="px-2 text-[12px] font-medium uppercase tracking-wide text-steel-500">Commercial terms</legend>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={labelClass} htmlFor="df-method">Ordering</label>
            <select id="df-method" className={adminInput} value={v.purchaseMethod} onChange={(e) => field("purchaseMethod", e.target.value as DealerFormValues["purchaseMethod"])}><option value="request_order">Purchase request (no PO needed)</option><option value="po_required">Purchase order number required</option></select></div>
          <div><label className={labelClass} htmlFor="df-ship">Shipping</label>
            <select id="df-ship" className={adminInput} value={v.shippingPolicy} onChange={(e) => field("shippingPolicy", e.target.value as DealerFormValues["shippingPolicy"])}><option value="as_agreed">As agreed after the order</option><option value="free">Free shipping</option><option value="flat">Flat fee per order</option></select></div>
          {v.shippingPolicy === "flat" && <div><label className={labelClass} htmlFor="df-flat">Flat shipping per order (₹)</label><input id="df-flat" type="number" min="0" step="1" className={inputClass} value={v.flatShippingRupees} onChange={text("flatShippingRupees")} /></div>}
          <div><label className={labelClass} htmlFor="df-terms">Payment terms</label><input id="df-terms" className={inputClass} placeholder="e.g. Net 30" maxLength={120} value={v.paymentTerms} onChange={text("paymentTerms")} /></div>
          <div><label className={labelClass} htmlFor="df-credit">Credit limit (₹, optional)</label><input id="df-credit" type="number" min="0" step="1" className={inputClass} value={v.creditLimitRupees} onChange={text("creditLimitRupees")} /></div>
          <div className="sm:col-span-2"><label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-1" checked={v.isPilot} onChange={(e) => field("isPilot", e.target.checked)} /> <span>Pilot dealer<br /><span className="text-[12px] text-steel-500">While the portal rollout is set to “Pilot only”, only dealers with this box ticked can sign in.</span></span></label></div>
        </div>
      </fieldset>
      <p className="text-[12px] text-steel-500">Currency is INR (fixed). Saving a draft does <strong>not</strong> give the dealer any access.</p>
      {error && <p role="alert" className="text-[13px] text-sale">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className={btnPrimary}>{busy && <Spinner />} {submitLabel}</button>
        {saved && <span role="status" className="text-[13px] text-emerald-700">Saved</span>}
      </div>
    </form>
  );
}
