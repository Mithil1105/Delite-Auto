import { useEffect, useState, type FormEvent } from "react";
import { Mail, Phone } from "lucide-react";
import { site } from "../../data/site";
import { dealerApi, type Address } from "../lib/dealerApi";
import { ApiError } from "../lib/transport";
import { useMe } from "../DealerShell";
import { btnPrimary, ErrorState, inputClass, labelClass, PageSkeleton, Spinner, useApi } from "../ui";

export function Account() {
  const { reloadMe } = useMe();
  const { data, error, loading, reload } = useApi(() => dealerApi.account(), []);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [addr, setAddr] = useState<Address>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (data) {
      setContactName(data.dealer.contactName ?? "");
      setContactPhone(data.dealer.contactPhone ?? "");
      setAddr(data.dealer.shippingAddress);
    }
  }, [data]);

  if (loading && !data) return <PageSkeleton rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const d = data.dealer;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await dealerApi.updateAccount({ contactName: contactName.trim() || null, contactPhone: contactPhone.trim() || null, shippingAddress: addr });
      setMsg({ ok: true, text: "Saved" });
      reloadMe();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Couldn't save" });
    } finally {
      setBusy(false);
    }
  };
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) => setAddr((a) => ({ ...a, [k]: e.target.value }));
  const fmt = (a: Address) => [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(", ") || "—";

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Account</h1>
      <section className="card-surface rounded-lg p-5 grid sm:grid-cols-2 gap-x-6 gap-y-4 text-[14px]">
        <div><div className={labelClass}>Business</div>{d.legalName}</div>
        <div><div className={labelClass}>Dealer code</div><span className="font-mono">{d.code}</span></div>
        <div><div className={labelClass}>GSTIN</div>{d.gstin ?? "—"}</div>
        <div><div className={labelClass}>Sign-in email</div>{d.contactEmail}</div>
        <div className="sm:col-span-2"><div className={labelClass}>Billing address</div>{fmt(d.billingAddress)}</div>
        <p className="sm:col-span-2 text-[12.5px] text-steel-500">Legal name, GSTIN and billing address are managed by Delite — contact your representative to change them.</p>
      </section>
      <form onSubmit={save} className="card-surface rounded-lg p-5 space-y-4">
        <h2 className="font-semibold">Contact &amp; delivery details</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label htmlFor="cn" className={labelClass}>Contact name</label><input id="cn" value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} maxLength={120} /></div>
          <div><label htmlFor="cp" className={labelClass}>Phone</label><input id="cp" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputClass} /></div>
          <div className="sm:col-span-2"><label htmlFor="a1" className={labelClass}>Delivery street address</label><input id="a1" value={addr.line1 ?? ""} onChange={set("line1")} className={inputClass} /></div>
          <div><label htmlFor="a2" className={labelClass}>Area / apartment</label><input id="a2" value={addr.line2 ?? ""} onChange={set("line2")} className={inputClass} /></div>
          <div><label htmlFor="ac" className={labelClass}>City</label><input id="ac" value={addr.city ?? ""} onChange={set("city")} className={inputClass} /></div>
          <div><label htmlFor="as" className={labelClass}>State</label><input id="as" value={addr.state ?? ""} onChange={set("state")} className={inputClass} /></div>
          <div><label htmlFor="ap" className={labelClass}>PIN code</label><input id="ap" value={addr.pincode ?? ""} onChange={set("pincode")} className={inputClass} maxLength={6} inputMode="numeric" /></div>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className={btnPrimary}>{busy && <Spinner />} Save changes</button>
          {msg && <span role={msg.ok ? "status" : "alert"} className={`text-[13px] ${msg.ok ? "text-emerald-700" : "text-sale"}`}>{msg.text}</span>}
        </div>
      </form>
      <section className="card-surface rounded-lg p-5">
        <h2 className="font-semibold mb-2">Sign-in security</h2>
        <p className="text-[13.5px] text-steel-500">To change your password, sign out and use <strong>Forgot your password?</strong> on the sign-in page — you'll get a single-use link by email.</p>
      </section>
    </div>
  );
}

export function Support() {
  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold">Support</h1>
      <div className="card-surface rounded-lg p-6 space-y-4 text-[14px]">
        <p className="text-steel-500">Your dedicated Delite dealer team can help with orders, pricing questions, deliveries and account changes.</p>
        <p className="flex items-center gap-3"><Mail className="w-4 h-4 text-steel-500" aria-hidden /><a className="underline" href={`mailto:${site.email}`}>{site.email}</a></p>
        <p className="flex items-center gap-3"><Phone className="w-4 h-4 text-steel-500" aria-hidden /><a className="underline" href={`tel:${site.phone.replace(/\s/g, "")}`}>{site.phone}</a> <span className="text-steel-500">· {site.phoneAlt}</span></p>
        <p className="text-[12.5px] text-steel-500">When you contact us, quote your order number (for example DLR-001234) so we can find it immediately.</p>
      </div>
    </div>
  );
}
