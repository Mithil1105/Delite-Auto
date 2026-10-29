import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Mail } from "lucide-react";
import { ApiError } from "../../../dealer/lib/transport";
import { brandingImageUrl } from "../../../dealer/lib/media";
import { btnOutline, btnPrimary, EmptyState, ErrorState, formatDateTime, labelClass, inputClass, money, OrderStatusBadge, PageSkeleton, Spinner, useApi } from "../../../dealer/ui";
import { AdminMediaField } from "../../components/AdminMediaPicker";
import { adminDealers, type AdminOrderRow, type AuditEntry, type DealerUserView, type OfferView, type ReconcileReport } from "./adminDealerApi";
import { useDealerDetail } from "./DealerDetail";
import { DealerForm, termsPayload, valuesFromDealer } from "./DealerForm";
import { adminInput, Modal, useAdminBase } from "./dealerAdminUi";

// -------------------------------------------------------------------------------------------------
// Overview
// -------------------------------------------------------------------------------------------------

export function DealerOverview() {
  const { detail, reload } = useDealerDetail();
  const base = useAdminBase();
  const d = detail.dealer;
  const orderTotal = Object.values(detail.stats.orders).reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-8">
      <section aria-label="Summary" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ["Assigned products", detail.stats.assigned],
          ["Published prices", detail.stats.activePrices],
          ["Draft prices", detail.stats.draftPrices],
          ["Orders", orderTotal],
        ].map(([label, value]) => (
          <div key={label as string} className="bg-white border border-line rounded-lg p-4">
            <div className="text-[24px] font-semibold leading-none">{value}</div>
            <div className="text-[12px] text-steel-500 mt-1">{label}</div>
          </div>
        ))}
      </section>
      {d.status === "draft" && (
        <section className={`rounded-lg border p-4 text-[13.5px] ${detail.ready ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
          {detail.ready ? <>Ready to activate. <Link className="underline font-semibold" to={`${base}/dealers/${d.id}/access`}>Review &amp; send invite</Link></> : <><strong>Not ready to activate:</strong> {detail.readiness.map((i) => i.message).join(" · ")}. <Link className="underline font-semibold" to={`${base}/dealers/${d.id}/catalog`}>Open Catalogue &amp; Pricing</Link></>}
        </section>
      )}
      <OffersPanel dealerId={d.id} offers={detail.offers} onChanged={reload} />
      <section>
        <h3 className="font-semibold mb-4">Dealer details</h3>
        <DealerForm
          key={d.updated_at}
          initial={valuesFromDealer(d)}
          submitLabel="Save changes"
          onSubmit={async (v) => {
            await adminDealers.update({ id: d.id, expectedUpdatedAt: d.updated_at, ...v, contactName: v.contactName || null, contactPhone: v.contactPhone || null, gstin: v.gstin || null, ...termsPayload(v) });
            reload();
          }}
        />
      </section>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// Access (readiness + invite + users)
// -------------------------------------------------------------------------------------------------

export function DealerAccess() {
  const { detail, reload } = useDealerDetail();
  const base = useAdminBase();
  const d = detail.dealer;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const invite = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await adminDealers.invite(d.id);
      setMsg({ ok: true, text: res.existingAccount ? `An account already exists for ${d.contact_email} — a password-setup link was sent instead of a new invite.` : `Invite sent to ${d.contact_email}. The link works once and expires.` });
      reload();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Couldn't send the invite" });
    } finally {
      setBusy(false);
    }
  };

  const canInvite = d.status === "draft" || d.status === "invited";
  return (
    <div className="space-y-8 max-w-3xl">
      <section>
        <h3 className="font-semibold mb-3">Activation checklist</h3>
        <ul className="bg-white border border-line rounded-lg divide-y divide-line text-[13.5px]">
          {[
            { ok: !!d.contact_email, text: "Owner email set" },
            { ok: !detail.readiness.some((i) => i.code === "no_products"), text: "At least one product assigned" },
            { ok: !detail.readiness.some((i) => i.code === "missing_price"), text: "Every assigned product has a published price" },
          ].map((c) => (
            <li key={c.text} className="p-3 flex items-center gap-2">{c.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden /> : <AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden />}{c.text}</li>
          ))}
        </ul>
        {detail.readiness.map((i) => <p key={i.code} className="text-[12.5px] text-amber-800 mt-2">{i.message}. <Link className="underline" to={`${base}/dealers/${d.id}/catalog`}>Fix in Catalogue &amp; Pricing</Link></p>)}
      </section>

      <section>
        <h3 className="font-semibold mb-2">Invitation</h3>
        <p className="text-[13px] text-steel-500 mb-3">The dealer receives a single-use, expiring link to set their own password. Passwords are never shown or emailed in plain text.</p>
        {canInvite ? (
          <button type="button" className={btnPrimary} disabled={busy || !detail.ready} onClick={invite}>{busy ? <Spinner /> : <Mail className="w-4 h-4" aria-hidden />} {d.status === "draft" ? "Activate & send invite" : "Resend invite"}</button>
        ) : (
          <p className="text-[13px] text-steel-700">{d.status === "active" ? "This dealer is active. To help them sign in, they can use “Forgot your password?” on the portal." : `Invites aren't available while the dealer is ${d.status}.`}</p>
        )}
        {!detail.ready && canInvite && <p className="text-[12.5px] text-steel-500 mt-2">Complete the checklist above first.</p>}
        {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-3 text-[13px] ${msg.ok ? "text-emerald-700" : "text-sale"}`}>{msg.text}</p>}
      </section>

      <UsersPanel dealerId={d.id} users={detail.users} dealerActive={d.status === "active" || d.status === "invited"} onChanged={reload} />
    </div>
  );
}

function UsersPanel({ dealerId, users, dealerActive, onChanged }: { dealerId: string; users: DealerUserView[]; dealerActive: boolean; onChanged: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: done });
      onChanged();
      return true;
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Something went wrong" });
      return false;
    } finally {
      setBusy(null);
    }
  };
  return (
    <section aria-labelledby="users-title">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 id="users-title" className="font-semibold">Users</h3>
        {users.some((u) => u.status !== "disabled") && (
          <button type="button" className={btnOutline} disabled={busy === "revoke"} onClick={() => run("revoke", () => adminDealers.revokeSessions(dealerId), "Everyone at this dealer has been signed out.")}>{busy === "revoke" && <Spinner />} Sign everyone out</button>
        )}
      </div>
      {users.length === 0 ? (
        <p className="text-[13px] text-steel-500">No sign-in user yet — one is created when you send the invite.</p>
      ) : (
        <div className="bg-white border border-line rounded-lg overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[11.5px] uppercase tracking-wide text-steel-500 border-b border-line"><tr><th className="p-3 font-medium">Email</th><th className="p-3 font-medium">Role</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Last sign-in</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3 capitalize">{u.role}</td>
                  <td className="p-3 capitalize">{u.status}</td>
                  <td className="p-3">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</td>
                  <td className="p-3 text-right whitespace-nowrap space-x-2">
                    {u.status !== "disabled" && <button type="button" className="underline text-[12.5px]" disabled={busy === u.id} onClick={() => run(u.id, () => adminDealers.sendReset(dealerId, u.id), `Password-reset link sent to ${u.email}.`)}>Send reset link</button>}
                    {u.role === "buyer" && (u.status === "disabled"
                      ? <button type="button" className="underline text-[12.5px]" disabled={busy === u.id} onClick={() => run(u.id, () => adminDealers.setUserStatus(dealerId, u.id, "active"), `${u.email} can sign in again.`)}>Enable</button>
                      : <button type="button" className="underline text-[12.5px] text-sale" disabled={busy === u.id} onClick={() => run(u.id, () => adminDealers.setUserStatus(dealerId, u.id, "disabled"), `${u.email} was disabled and signed out.`)}>Disable</button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dealerActive && (
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void run("add", () => adminDealers.addUser(dealerId, email.trim()), `Invite sent to ${email.trim()}.`).then((ok) => ok && setEmail("")); }}>
          <div className="grow max-w-sm"><label htmlFor="add-buyer" className={labelClass}>Add a buyer by email</label><input id="add-buyer" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} /></div>
          <button type="submit" className={btnPrimary} disabled={busy === "add" || !email}>{busy === "add" && <Spinner />} Send invite</button>
        </form>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-3 text-[13px] ${msg.ok ? "text-emerald-700" : "text-sale"}`}>{msg.text}</p>}
      <p className="text-[12px] text-steel-500 mt-2">Suspending a dealer or disabling a user blocks their next request immediately and ends their sessions.</p>
    </section>
  );
}

function OffersPanel({ dealerId, offers, onChanged }: { dealerId: string; offers: OfferView[]; onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await adminDealers.saveOffer({ dealerId, title: title.trim(), body: body.trim() || undefined, startsAt: startsAt ? new Date(startsAt).toISOString() : undefined, endsAt: endsAt ? new Date(endsAt).toISOString() : undefined });
      setTitle(""); setBody(""); setStartsAt(""); setEndsAt("");
      onChanged();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Could not save the announcement");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="offers-title">
      <h3 id="offers-title" className="font-semibold mb-1">Dealer announcements</h3>
      <p className="text-[12.5px] text-steel-500 mb-3">Short notices shown on this dealer's dashboard — a new range, a promotion, a lead-time warning.</p>
      {offers.length > 0 && (
        <ul className="bg-white border border-line rounded-lg divide-y divide-line mb-4 text-[13px]">
          {offers.map((o) => (
            <li key={o.id} className="p-3 flex items-start justify-between gap-3">
              <div><div className="font-medium">{o.title}</div>{o.body && <div className="text-steel-500">{o.body}</div>}<div className="text-[11.5px] text-steel-500 mt-0.5">{o.starts_at ? `From ${formatDateTime(o.starts_at)}` : "Live now"}{o.ends_at ? ` · until ${formatDateTime(o.ends_at)}` : ""}</div></div>
              <button type="button" className="underline text-sale text-[12.5px] shrink-0" onClick={async () => { await adminDealers.deleteOffer(dealerId, o.id); onChanged(); }}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid sm:grid-cols-2 gap-3 max-w-3xl">
        <div className="sm:col-span-2"><label htmlFor="of-title" className={labelClass}>Title</label><input id="of-title" required maxLength={120} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="sm:col-span-2"><label htmlFor="of-body" className={labelClass}>Details (optional)</label><input id="of-body" maxLength={500} className={inputClass} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <div><label htmlFor="of-from" className={labelClass}>Show from (optional)</label><input id="of-from" type="datetime-local" className={inputClass} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
        <div><label htmlFor="of-to" className={labelClass}>Show until (optional)</label><input id="of-to" type="datetime-local" className={inputClass} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div>
        <div className="sm:col-span-2 flex items-center gap-3"><button type="submit" className={btnOutline} disabled={busy || !title.trim()}>{busy && <Spinner />} Add announcement</button>{err && <span role="alert" className="text-[13px] text-sale">{err}</span>}</div>
      </form>
    </section>
  );
}

// -------------------------------------------------------------------------------------------------
// Branding
// -------------------------------------------------------------------------------------------------

const PALETTE = ["#10148F", "#0B5FFF", "#0A7F5A", "#B42318", "#7A3E00", "#5B2D90", "#1F2937", "#C2410C"];

export function DealerBranding() {
  const { detail, reload } = useDealerDetail();
  const b = detail.branding;
  const d = detail.dealer;
  const [logo, setLogo] = useState<string | undefined>(b?.logo_path ?? undefined);
  const [cover, setCover] = useState<string | undefined>(b?.cover_path ?? undefined);
  const [accent, setAccent] = useState(b?.accent_color ?? "#10148F");
  const [tagline, setTagline] = useState(b?.tagline ?? "");
  const [welcome, setWelcome] = useState(b?.welcome_text ?? "");
  const [showPublic, setShowPublic] = useState(b?.show_public_price ?? false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await adminDealers.branding({ id: d.id, logoPath: logo ?? null, coverPath: cover ?? null, accentColor: accent, tagline: tagline || null, welcomeText: welcome || null, showPublicPrice: showPublic });
      setMsg({ ok: true, text: "Branding saved — live for the dealer on their next page load." });
      reload();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Couldn't save" });
    } finally {
      setBusy(false);
    }
  };
  const logoUrl = brandingImageUrl(logo);
  const coverUrl = brandingImageUrl(cover);
  const validHex = /^#[0-9A-Fa-f]{6}$/.test(accent);
  const safeAccent = validHex ? accent : "#10148F";

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <div className="space-y-5 max-w-xl">
        <AdminMediaField label="Logo" value={logo} onChange={setLogo} />
        <AdminMediaField label="Cover image" value={cover} onChange={setCover} />
        <p className="text-[12px] text-steel-500 -mt-2">Logo: PNG/WebP with a transparent background, ~400×120. Cover: wide photo, at least 1600×500. JPG/PNG/WebP up to 8 MB.</p>
        <div>
          <span className={labelClass}>Accent colour</span>
          <div className="flex flex-wrap items-center gap-2">
            {PALETTE.map((c) => <button key={c} type="button" aria-label={`Use ${c}`} aria-pressed={accent.toUpperCase() === c} onClick={() => setAccent(c)} className={`w-8 h-8 rounded-full border-2 ${accent.toUpperCase() === c ? "border-ink" : "border-white ring-1 ring-line"}`} style={{ background: c }} />)}
            <input aria-label="Accent colour hex" value={accent} onChange={(e) => setAccent(e.target.value)} className={`${adminInput} w-28 font-mono uppercase`} maxLength={7} />
          </div>
          {!validHex && <p className="text-[12px] text-sale mt-1">Enter a colour like #0B5FFF.</p>}
        </div>
        <div><label className={labelClass} htmlFor="br-tag">Tagline</label><input id="br-tag" className={inputClass} value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={140} /></div>
        <div><label className={labelClass} htmlFor="br-wel">Welcome message</label><textarea id="br-wel" className={`${inputClass} h-auto py-2`} rows={3} value={welcome} onChange={(e) => setWelcome(e.target.value)} maxLength={400} /></div>
        <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-1" checked={showPublic} onChange={(e) => setShowPublic(e.target.checked)} /> <span>Show the public reference price to this dealer<br /><span className="text-steel-500 text-[12px]">Off by default — dealers normally see only their contract price.</span></span></label>
        <div className="flex items-center gap-3">
          <button type="button" className={btnPrimary} disabled={busy || !validHex} onClick={save}>{busy && <Spinner />} Save &amp; publish</button>
          {msg && <span role={msg.ok ? "status" : "alert"} className={`text-[13px] ${msg.ok ? "text-emerald-700" : "text-sale"}`}>{msg.text}</span>}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-[14px]">Preview</h3>
          <div className="inline-flex border border-line rounded-md overflow-hidden text-[12.5px]" role="group" aria-label="Preview size">
            {(["desktop", "mobile"] as const).map((x) => <button key={x} type="button" aria-pressed={device === x} onClick={() => setDevice(x)} className={`px-3 py-1.5 capitalize ${device === x ? "bg-ink text-white" : "bg-white"}`}>{x}</button>)}
          </div>
        </div>
        <div className={`mx-auto border border-line rounded-lg overflow-hidden bg-paper ${device === "mobile" ? "max-w-[320px]" : "w-full"}`}>
          <div className="bg-white border-b border-line h-12 px-3 flex items-center gap-2">
            {logoUrl ? <img src={logoUrl} alt="" className="h-7 w-auto object-contain" /> : <span className="w-7 h-7 rounded grid place-items-center text-white text-sm font-display" style={{ background: safeAccent }} aria-hidden>{d.display_name.charAt(0)}</span>}
            <span className="font-semibold text-[13px] truncate">{d.display_name}</span>
          </div>
          <div className="p-3">
            <div className="rounded-lg text-white p-5 min-h-[130px] flex flex-col justify-end" style={{ background: coverUrl ? `linear-gradient(90deg, rgba(10,14,20,.78), rgba(10,14,20,.25)), url(${coverUrl}) center/cover` : `linear-gradient(120deg, ${safeAccent}, #0f1214)` }}>
              <div className="font-display uppercase text-[18px] leading-tight">Welcome back, {d.display_name}</div>
              {tagline && <div className="text-[12px] text-white/80 mt-1">{tagline}</div>}
              {welcome && <div className="text-[11.5px] text-white/70 mt-1">{welcome}</div>}
              <span className="mt-3 inline-block self-start text-[12px] font-semibold bg-white text-ink rounded-full px-4 py-1.5">Browse your catalogue</span>
            </div>
            <div className="mt-3 flex gap-2"><span className="text-[12px] text-white rounded-md px-3 py-1.5 font-semibold" style={{ background: safeAccent }}>Add to cart</span><span className="text-[12px] border border-line rounded-md px-3 py-1.5 bg-white">Orders</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// Orders (per dealer and global)
// -------------------------------------------------------------------------------------------------

export function OrdersPanel({ dealerId, showDealer }: { dealerId?: string; showDealer: boolean }) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi(() => adminDealers.orders({ dealerId, status: status || undefined, page, pageSize: 25 }), [dealerId, status, page]);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <label className="sr-only" htmlFor="ord-status">Status</label>
        <select id="ord-status" className={adminInput} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="pending_sync">Received (Odoo sync pending)</option>
          <option value="quotation">Quotation in Odoo</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      {loading && <PageSkeleton rows={3} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!loading && data && data.rows.length === 0 && <EmptyState title="No dealer orders">Orders placed from the dealer portal appear here.</EmptyState>}
      {!loading && data && data.rows.length > 0 && (
        <>
          <div className="bg-white border border-line rounded-lg overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11.5px] uppercase tracking-wide text-steel-500 border-b border-line">
                <tr><th className="p-3 font-medium">Order</th>{showDealer && <th className="p-3 font-medium">Dealer</th>}<th className="p-3 font-medium">Placed</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Odoo</th><th className="p-3 font-medium text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((o) => (
                  <tr key={o.id} className="hover:bg-steel-50/50 cursor-pointer" onClick={() => setOpenId(o.id)}>
                    <td className="p-3 font-semibold">{o.orderNumber}{o.poReference && <div className="font-normal text-[11.5px] text-steel-500">PO {o.poReference}</div>}</td>
                    {showDealer && <td className="p-3">{o.dealerName}</td>}
                    <td className="p-3 text-steel-700">{formatDateTime(o.createdAt)}</td>
                    <td className="p-3"><OrderStatusBadge status={o.status} /></td>
                    <td className="p-3">{o.odooOrderName ?? (o.syncPending ? <span className="text-amber-700 font-medium">Sync pending</span> : "—")}</td>
                    <td className="p-3 text-right price font-semibold">{money(o.totalPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-[13px]">
              <span className="text-steel-500">{data.total} orders · page {page} of {totalPages}</span>
              <div className="flex gap-2"><button type="button" className={btnOutline} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button><button type="button" className={btnOutline} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button></div>
            </div>
          )}
        </>
      )}
      {openId && <OrderModal id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  );
}

function OrderModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data, error, loading, reload } = useApi(() => adminDealers.order(id), [id]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const retry = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await adminDealers.retrySync(id);
      setMsg(res.synced ? "Synced to Odoo as a draft quotation." : "Odoo still isn't accepting the order — see the error below.");
      reload();
      onChanged();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Retry failed");
    } finally {
      setBusy(false);
    }
  };
  const o: AdminOrderRow | undefined = data?.order;
  return (
    <Modal title={o ? `Order ${o.orderNumber}` : "Order"} onClose={onClose} wide>
      {loading && <PageSkeleton rows={2} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {o && data && (
        <div className="space-y-4 text-[13px]">
          <div className="flex flex-wrap items-center gap-3"><OrderStatusBadge status={o.status} /><span className="text-steel-500">{o.dealerName} · {formatDateTime(o.createdAt)}</span>{o.odooOrderName && <span>Odoo: <strong>{o.odooOrderName}</strong></span>}</div>
          {o.syncPending && (
            <div role="alert" className="border border-amber-300 bg-amber-50 rounded-lg p-3">
              <p className="font-semibold">Not yet in Odoo{o.retryCount ? ` (${o.retryCount} failed attempt${o.retryCount === 1 ? "" : "s"})` : ""}</p>
              {o.lastSyncError && <p className="text-amber-900 mt-1 break-words">{o.lastSyncError}</p>}
              <button type="button" className={`${btnPrimary} mt-3`} disabled={busy} onClick={retry}>{busy && <Spinner />} Retry Odoo sync</button>
            </div>
          )}
          {msg && <p role="status" className="text-steel-700">{msg}</p>}
          <table className="w-full">
            <thead className="text-left text-[11.5px] uppercase tracking-wide text-steel-500 border-b border-line"><tr><th className="py-2 font-medium">Product</th><th className="py-2 font-medium text-right">Qty</th><th className="py-2 font-medium text-right">Unit (snapshot)</th><th className="py-2 font-medium text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-line">{data.items.map((i) => <tr key={i.variantId}><td className="py-2">{i.name}<div className="text-[11.5px] text-steel-500">{i.sku ? `SKU ${i.sku} · ` : ""}{i.taxBasis} of tax</div></td><td className="py-2 text-right">{i.quantity}</td><td className="py-2 text-right price">{money(i.unitPricePaise)}</td><td className="py-2 text-right price">{money(i.totalPaise)}</td></tr>)}</tbody>
          </table>
          <div className="flex justify-between border-t border-line pt-3 font-semibold"><span>Total (incl. {money(o.taxPaise)} tax)</span><span className="price">{money(o.totalPaise)}</span></div>
          <p className="text-steel-500">Ship to: {[o.shippingAddress.name, o.shippingAddress.phone, o.shippingAddress.line1, o.shippingAddress.line2, o.shippingAddress.city, o.shippingAddress.state, o.shippingAddress.pincode].filter(Boolean).join(", ")}</p>
          {o.notes && <p className="text-steel-500">Notes: {o.notes}</p>}
        </div>
      )}
    </Modal>
  );
}

export function DealerOrdersTab() {
  const { detail } = useDealerDetail();
  return <OrdersPanel dealerId={detail.dealer.id} showDealer={false} />;
}

function ReconcilePanel() {
  const [report, setReport] = useState<ReconcileReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      setReport(await adminDealers.reconcile());
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Reconciliation failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="rec-title" className="mb-6 bg-white border border-line rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 id="rec-title" className="font-semibold text-[14px]">Odoo reconciliation</h3><p className="text-[12.5px] text-steel-500">Compares recent dealer orders with their Odoo quotations and flags missing, cancelled or mismatched ones.</p></div>
        <button type="button" className={btnOutline} disabled={busy} onClick={run}>{busy && <Spinner />} Run check</button>
      </div>
      {err && <p role="alert" className="mt-3 text-[13px] text-sale">{err}</p>}
      {report && (
        <div className="mt-3 text-[13px]" role="status">
          {!report.odooReachable ? <p className="text-amber-800">Odoo could not be reached, so nothing was compared. Try again shortly.</p>
            : report.issues.length === 0 ? <p className="text-emerald-700">All {report.checked} recent order{report.checked === 1 ? "" : "s"} match Odoo.</p>
            : <><p className="mb-2">{report.issues.length} of {report.checked} order{report.checked === 1 ? "" : "s"} need attention:</p>
              <ul className="divide-y divide-line border border-line rounded">{report.issues.map((i) => <li key={i.orderId + i.kind} className="p-2"><strong>{i.orderNumber}</strong> · {i.dealerName} — {i.detail}</li>)}</ul></>}
        </div>
      )}
    </section>
  );
}

export function AllDealerOrders() {
  return (
    <div className="p-6 lg:p-10 max-w-7xl">
      <h2 className="font-display uppercase text-[15px] mb-1">Dealer orders</h2>
      <p className="text-[12.5px] text-steel-500 mb-5">Every order placed through the dealer portal. Prices are the contract-price snapshot taken at order time.</p>
      <ReconcilePanel />
      <OrdersPanel showDealer />
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// Activity
// -------------------------------------------------------------------------------------------------

function summarise(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const text = JSON.stringify(v);
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

export function DealerActivity() {
  const { detail } = useDealerDetail();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi(() => adminDealers.audit(detail.dealer.id, page), [detail.dealer.id, page]);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div>
      {loading && <PageSkeleton rows={3} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!loading && data && data.rows.length === 0 && <EmptyState title="No activity yet" />}
      {!loading && data && data.rows.length > 0 && (
        <>
          <div className="bg-white border border-line rounded-lg overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="text-left text-[11.5px] uppercase tracking-wide text-steel-500 border-b border-line"><tr><th className="p-3 font-medium">When</th><th className="p-3 font-medium">Who</th><th className="p-3 font-medium">Event</th><th className="p-3 font-medium">Before</th><th className="p-3 font-medium">After</th></tr></thead>
              <tbody className="divide-y divide-line align-top">
                {data.rows.map((r: AuditEntry) => (
                  <tr key={r.id}>
                    <td className="p-3 whitespace-nowrap">{formatDateTime(r.at)}</td>
                    <td className="p-3 capitalize">{r.actorType}</td>
                    <td className="p-3 font-mono text-[12px]">{r.event}</td>
                    <td className="p-3 text-steel-700 break-all max-w-[260px]">{summarise(r.oldValue)}</td>
                    <td className="p-3 text-steel-700 break-all max-w-[260px]">{summarise(r.newValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-[13px]">
              <span className="text-steel-500">{data.total} events · page {page} of {totalPages}</span>
              <div className="flex gap-2"><button type="button" className={btnOutline} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button><button type="button" className={btnOutline} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
