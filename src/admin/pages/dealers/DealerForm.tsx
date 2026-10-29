import { useState, type FormEvent } from "react";
import type { Address } from "../../../dealer/lib/dealerApi";
import { ApiError } from "../../../dealer/lib/transport";
import { btnPrimary, inputClass, labelClass, Spinner } from "../../../dealer/ui";
import type { DealerRecord } from "./adminDealerApi";

export interface DealerFormValues {
  displayName: string;
  legalName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  gstin: string;
  billingAddress: Address;
  shippingAddress: Address;
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
      <p className="text-[12px] text-steel-500">Currency is INR. Saving a draft does <strong>not</strong> give the dealer any access.</p>
      {error && <p role="alert" className="text-[13px] text-sale">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className={btnPrimary}>{busy && <Spinner />} {submitLabel}</button>
        {saved && <span role="status" className="text-[13px] text-emerald-700">Saved</span>}
      </div>
    </form>
  );
}
