import { useEffect, useState, type FormEvent } from "react";
import { Mail, Phone } from "lucide-react";
import { site } from "../../data/site";
import { dealerApi, type Address, type TeamUser } from "../lib/dealerApi";
import { ApiError } from "../lib/transport";
import { useMe } from "../DealerShell";
import { btnDanger, btnOutline, btnPrimary, ErrorState, formatDateTime, inputClass, labelClass, PageSkeleton, Spinner, useApi } from "../ui";

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
  const owner = data.role === "owner";

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
        <div><div className={labelClass}>Ordering</div>{d.purchaseMethod === "po_required" ? "Purchase order required" : "Purchase request"}</div>
        <div><div className={labelClass}>Payment terms</div>{d.paymentTerms ?? "As agreed with Delite"}</div>
        <div className="sm:col-span-2"><div className={labelClass}>Billing address</div>{fmt(d.billingAddress)}</div>
        <p className="sm:col-span-2 text-[12.5px] text-steel-500">Legal name, GSTIN, billing address and terms are managed by Delite — contact your representative to change them.</p>
      </section>

      <form onSubmit={save} className="card-surface rounded-lg p-5 space-y-4">
        <h2 className="font-semibold">Contact &amp; delivery details</h2>
        {!owner && <p className="text-[12.5px] text-steel-500">Only the account owner can change these details.</p>}
        <fieldset disabled={!owner} className="grid sm:grid-cols-2 gap-4 disabled:opacity-70">
          <div><label htmlFor="cn" className={labelClass}>Contact name</label><input id="cn" value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} maxLength={120} /></div>
          <div><label htmlFor="cp" className={labelClass}>Phone</label><input id="cp" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputClass} /></div>
          <div className="sm:col-span-2"><label htmlFor="a1" className={labelClass}>Delivery street address</label><input id="a1" value={addr.line1 ?? ""} onChange={set("line1")} className={inputClass} /></div>
          <div><label htmlFor="a2" className={labelClass}>Area / apartment</label><input id="a2" value={addr.line2 ?? ""} onChange={set("line2")} className={inputClass} /></div>
          <div><label htmlFor="ac" className={labelClass}>City</label><input id="ac" value={addr.city ?? ""} onChange={set("city")} className={inputClass} /></div>
          <div><label htmlFor="as" className={labelClass}>State</label><input id="as" value={addr.state ?? ""} onChange={set("state")} className={inputClass} /></div>
          <div><label htmlFor="ap" className={labelClass}>PIN code</label><input id="ap" value={addr.pincode ?? ""} onChange={set("pincode")} className={inputClass} maxLength={6} inputMode="numeric" /></div>
        </fieldset>
        {owner && (
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy} className={btnPrimary}>{busy && <Spinner />} Save changes</button>
            {msg && <span role={msg.ok ? "status" : "alert"} className={`text-[13px] ${msg.ok ? "text-emerald-700" : "text-sale"}`}>{msg.text}</span>}
          </div>
        )}
      </form>

      <TeamPanel />

      <section className="card-surface rounded-lg p-5">
        <h2 className="font-semibold mb-2">Sign-in security</h2>
        <p className="text-[13.5px] text-steel-500">To change your password, sign out and use <strong>Forgot your password?</strong> on the sign-in page — you'll get a single-use link by email. Passwords need at least 10 characters with a letter and a number.</p>
      </section>
    </div>
  );
}

function TeamPanel() {
  const { data, error, loading, reload } = useApi(() => dealerApi.team(), []);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: done });
      reload();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Something went wrong" });
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <PageSkeleton rows={1} />;
  if (error || !data) return error ? <ErrorState error={error} onRetry={reload} /> : null;
  const label = (u: TeamUser) => (u.status === "disabled" ? "Access removed" : u.status === "invited" ? "Invited" : "Active");

  return (
    <section className="card-surface rounded-lg p-5 space-y-4" aria-labelledby="team-title">
      <div>
        <h2 id="team-title" className="font-semibold">Your team</h2>
        <p className="text-[12.5px] text-steel-500">Buyers can browse and place orders. Only the owner can change account details or manage the team.</p>
      </div>
      <ul className="divide-y divide-line border border-line rounded-md">
        {data.users.map((u) => (
          <li key={u.id} className="p-3 flex flex-wrap items-center justify-between gap-3 text-[13.5px]">
            <div className="min-w-0">
              <div className="font-medium truncate">{u.email}{u.isYou && <span className="text-steel-500 font-normal"> (you)</span>}</div>
              <div className="text-[12px] text-steel-500 capitalize">{u.role} · {label(u)}{u.lastLoginAt ? ` · last sign-in ${formatDateTime(u.lastLoginAt)}` : ""}</div>
            </div>
            {data.canManage && u.role === "buyer" && (
              u.status === "disabled" ? (
                <button type="button" className={btnOutline} disabled={busy === u.id} onClick={() => run(u.id, () => dealerApi.setTeamUserStatus(u.id, "active"), "Access restored")}>Restore access</button>
              ) : (
                <button type="button" className={btnDanger} disabled={busy === u.id} onClick={() => run(u.id, () => dealerApi.setTeamUserStatus(u.id, "disabled"), "Access removed — they've been signed out")}>Remove access</button>
              )
            )}
          </li>
        ))}
      </ul>
      {data.canManage && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run("invite", () => dealerApi.inviteTeamUser(email.trim()), `Invite sent to ${email.trim()}`).then(() => setEmail(""));
          }}
        >
          <div className="grow max-w-sm"><label htmlFor="team-email" className={labelClass}>Add a buyer by email</label><input id="team-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} /></div>
          <button type="submit" className={btnPrimary} disabled={busy === "invite" || !email}>{busy === "invite" && <Spinner />} Send invite</button>
        </form>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-[13px] ${msg.ok ? "text-emerald-700" : "text-sale"}`}>{msg.text}</p>}
    </section>
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
