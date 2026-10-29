import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Minus, Plus, Trash2 } from "lucide-react";
import { dealerApi, type Address, type LineIssue, type Quote, type QuoteLine } from "../lib/dealerApi";
import { ApiError } from "../lib/transport";
import { useMe } from "../DealerShell";
import { btnOutline, btnPrimary, EmptyState, ErrorState, inputClass, labelClass, money, PageSkeleton, ProductThumb, Spinner, useApi } from "../ui";

const ISSUE_TEXT: Record<LineIssue, string> = {
  not_assigned: "No longer in your catalogue",
  hidden: "No longer in your catalogue",
  not_orderable: "Can't be ordered right now",
  no_price: "No current price — can't be ordered",
  unavailable: "Currently unavailable",
  below_min: "Below the minimum order quantity",
  bad_multiple: "Quantity must be in whole packs",
  tax_unsupported: "Can't be priced right now — contact Delite",
};

function LineIssues({ line }: { line: QuoteLine }) {
  if (line.issues.length === 0) return null;
  return <p className="text-[12.5px] text-sale mt-1">{[...new Set(line.issues.map((i) => ISSUE_TEXT[i]))].join(" · ")}</p>;
}

function PriceChange({ line }: { line: QuoteLine }) {
  if (!line.priceChanged || line.previousPricePaise === null || line.unitPricePaise === null) return null;
  const up = line.unitPricePaise > line.previousPricePaise;
  return (
    <p className="text-[12.5px] mt-1 inline-flex items-center gap-1 text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
      <AlertTriangle className="w-3.5 h-3.5" aria-hidden /> Price {up ? "increased" : "decreased"}: <s>{money(line.previousPricePaise)}</s> → <strong>{money(line.unitPricePaise)}</strong>
    </p>
  );
}

function Totals({ quote }: { quote: Quote }) {
  return (
    <dl className="text-[14px] space-y-2">
      <div className="flex justify-between"><dt className="text-steel-500">Subtotal</dt><dd className="price">{money(quote.subtotalPaise)}</dd></div>
      <div className="flex justify-between"><dt className="text-steel-500">Tax</dt><dd className="price">{money(quote.taxPaise)}</dd></div>
      <div className="flex justify-between gap-4"><dt className="text-steel-500">Shipping</dt><dd className="text-steel-500 text-right">{quote.shippingPaise ? money(quote.shippingPaise) : "As agreed with Delite"}</dd></div>
      <div className="flex justify-between border-t border-line pt-3 text-[16px] font-semibold"><dt>Total</dt><dd className="price">{money(quote.totalPaise)}</dd></div>
    </dl>
  );
}

export function Cart() {
  const { setCartLines } = useMe();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi(() => dealerApi.cart(), []);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState<number | "ack" | "clean" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setQuote(data.quote);
      setCartLines(data.quote.lines.length);
    }
  }, [data, setCartLines]);

  const run = async (key: number | "ack" | "clean", fn: () => Promise<{ quote: Quote }>) => {
    setBusy(key);
    setActionError(null);
    try {
      const res = await fn();
      setQuote(res.quote);
      setCartLines(res.quote.lines.length);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  if (loading && !quote) return <PageSkeleton rows={2} />;
  if (error && !quote) return <ErrorState error={error} onRetry={reload} />;
  if (!quote) return null;
  if (quote.lines.length === 0) {
    return <EmptyState title="Your cart is empty" action={<Link to="/catalog" className={btnPrimary}>Browse your catalogue</Link>}>Add products from your catalogue to place an order.</EmptyState>;
  }

  const hasIssues = quote.lines.some((l) => l.issues.length > 0);
  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold mb-5">Your cart</h1>
      {quote.needsAcknowledgement && (
        <div role="alert" className="mb-4 border border-amber-300 bg-amber-50 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13.5px]"><strong>Prices have changed</strong> since you added these items. Review the new prices below before ordering.</p>
          <button type="button" className={btnPrimary} disabled={busy === "ack"} onClick={() => run("ack", dealerApi.acknowledge)}>{busy === "ack" && <Spinner />} Accept updated prices</button>
        </div>
      )}
      {hasIssues && (
        <div role="alert" className="mb-4 border border-sale/30 bg-sale/5 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13.5px]"><strong>Some items can't be ordered.</strong> Remove them to continue.</p>
          <button type="button" className={btnOutline} disabled={busy === "clean"} onClick={() => run("clean", dealerApi.removeInvalid)}>{busy === "clean" && <Spinner />} Remove unavailable items</button>
        </div>
      )}
      {actionError && <p role="alert" className="mb-3 text-[13px] text-sale">{actionError}</p>}

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <ul className="lg:col-span-2 card-surface rounded-lg divide-y divide-line">
          {quote.lines.map((l) => (
            <li key={l.variantId} className="p-4 flex gap-4">
              <ProductThumb url={l.imageUrl} name={l.name} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium leading-snug">{l.name}</div>
                    <div className="text-[12px] text-steel-500">{l.sku ? `SKU ${l.sku} · ` : ""}{l.unitPricePaise !== null ? `${money(l.unitPricePaise)} each` : "No price"}</div>
                  </div>
                  <div className="price font-semibold shrink-0">{l.unitPricePaise !== null ? money(l.subtotalPaise) : "—"}</div>
                </div>
                <PriceChange line={l} />
                <LineIssues line={l} />
                <div className="mt-3 flex items-center gap-3">
                  <div className="inline-flex items-center border border-line rounded-md" role="group" aria-label={`Quantity for ${l.name}`}>
                    <button type="button" className="w-8 h-8 grid place-items-center disabled:opacity-40" aria-label="Decrease quantity" disabled={busy !== null || l.quantity - l.qtyMultiple < l.minQty} onClick={() => run(l.variantId, () => dealerApi.setItem(l.variantId, l.quantity - l.qtyMultiple))}><Minus className="w-3.5 h-3.5" /></button>
                    <span className="w-12 text-center text-[13.5px] tabular-nums">{l.quantity}</span>
                    <button type="button" className="w-8 h-8 grid place-items-center disabled:opacity-40" aria-label="Increase quantity" disabled={busy !== null} onClick={() => run(l.variantId, () => dealerApi.setItem(l.variantId, l.quantity + l.qtyMultiple))}><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  <button type="button" className="text-[12.5px] text-steel-500 hover:text-sale inline-flex items-center gap-1" disabled={busy !== null} onClick={() => run(l.variantId, () => dealerApi.setItem(l.variantId, 0))}>
                    {busy === l.variantId ? <Spinner className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" aria-hidden />} Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <aside className="card-surface rounded-lg p-5 space-y-4 lg:sticky lg:top-24">
          <h2 className="font-semibold">Order summary</h2>
          <Totals quote={quote} />
          <button type="button" className={`${btnPrimary} w-full`} disabled={!quote.canOrder || quote.needsAcknowledgement || busy !== null} onClick={() => navigate("/checkout")}>Continue to checkout</button>
          {!quote.canOrder && <p className="text-[12px] text-steel-500">Resolve the items above to continue.</p>}
          <button type="button" className="text-[12.5px] text-steel-500 underline" onClick={() => run("clean", dealerApi.clearCart)}>Clear cart</button>
        </aside>
      </div>
    </div>
  );
}

const EMPTY_ADDRESS: Address = { name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" };

export function Checkout() {
  const { setCartLines, me } = useMe();
  const navigate = useNavigate();
  const cart = useApi(() => dealerApi.cart(), []);
  const account = useApi(() => dealerApi.account(), []);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [po, setPo] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefilled = useRef(false);
  // One key per checkout attempt, kept across reloads/back-button so a retry can never double-order.
  const keyRef = useRef<string>(
    (() => {
      try {
        const existing = sessionStorage.getItem("dealer-order-key");
        if (existing) return existing;
        const fresh = crypto.randomUUID();
        sessionStorage.setItem("dealer-order-key", fresh);
        return fresh;
      } catch {
        return crypto.randomUUID();
      }
    })()
  );

  useEffect(() => {
    if (cart.data) setQuote(cart.data.quote);
  }, [cart.data]);
  useEffect(() => {
    if (account.data && !prefilled.current) {
      prefilled.current = true;
      setAddress({ ...EMPTY_ADDRESS, ...account.data.dealer.shippingAddress, name: account.data.dealer.shippingAddress.name || account.data.dealer.displayName, phone: account.data.dealer.shippingAddress.phone || account.data.dealer.contactPhone || "" });
    }
  }, [account.data]);

  if ((cart.loading || account.loading) && !quote) return <PageSkeleton rows={2} />;
  if (cart.error) return <ErrorState error={cart.error} onRetry={cart.reload} />;
  if (!quote) return null;
  if (quote.lines.length === 0) return <EmptyState title="Your cart is empty" action={<Link to="/catalog" className={btnPrimary}>Browse your catalogue</Link>} />;

  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) => setAddress((a) => ({ ...a, [k]: e.target.value }));

  const place = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      let fingerprint = quote.fingerprint;
      if (quote.needsAcknowledgement) {
        const acked = await dealerApi.acknowledge();
        setQuote(acked.quote);
        fingerprint = acked.quote.fingerprint;
      }
      const res = await dealerApi.placeOrder({ idempotencyKey: keyRef.current, acceptedFingerprint: fingerprint, shippingAddress: address, poReference: po.trim() || undefined, notes: notes.trim() || undefined });
      try {
        sessionStorage.removeItem("dealer-order-key");
      } catch {
        /* ignore */
      }
      setCartLines(0);
      navigate(`/orders/${res.order.id}`, { replace: true, state: { placed: true, synced: res.odooSynced } });
    } catch (err) {
      if (err instanceof ApiError && (err.code === "CHECKOUT_CHANGED" || err.code === "QUOTE_INVALID")) {
        const fresh = (err.details as { quote?: Quote } | undefined)?.quote;
        if (fresh) {
          setQuote(fresh);
          setCartLines(fresh.lines.length);
        }
        setError(err.code === "CHECKOUT_CHANGED" ? "Prices or availability changed while you were checking out. Review the updated total below, then confirm." : err.message);
      } else setError(err instanceof ApiError ? err.message : "We couldn't place your order. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const field = (id: keyof Address, label: string, props: { required?: boolean; maxLength?: number; inputMode?: "numeric" | "tel" } = {}) => (
    <div>
      <label htmlFor={`addr-${id}`} className={labelClass}>{label}</label>
      <input id={`addr-${id}`} value={address[id] ?? ""} onChange={set(id)} className={inputClass} required={props.required} maxLength={props.maxLength} inputMode={props.inputMode} />
    </div>
  );

  return (
    <form onSubmit={place} className="max-w-5xl" noValidate={false}>
      <h1 className="text-2xl font-semibold mb-5">Checkout</h1>
      {error && <div role="alert" className="mb-4 border border-amber-300 bg-amber-50 rounded-lg p-4 text-[13.5px]">{error} {quote.lines.some((l) => l.issues.length) && <Link to="/cart" className="underline font-semibold">Go to cart</Link>}</div>}
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <section className="card-surface rounded-lg p-5">
            <h2 className="font-semibold mb-4">Delivery address</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {field("name", "Contact name", { required: true })}
              {field("phone", "Phone", { required: true, inputMode: "tel" })}
              <div className="sm:col-span-2">{field("line1", "Street address", { required: true })}</div>
              <div className="sm:col-span-2">{field("line2", "Apartment, area (optional)")}</div>
              {field("city", "City", { required: true })}
              {field("state", "State", { required: true })}
              {field("pincode", "PIN code", { required: true, maxLength: 6, inputMode: "numeric" })}
            </div>
          </section>
          <section className="card-surface rounded-lg p-5 grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="po" className={labelClass}>Your PO reference (optional)</label>
              <input id="po" value={po} onChange={(e) => setPo(e.target.value)} maxLength={60} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="notes" className={labelClass}>Notes for Delite (optional)</label>
              <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} className={`${inputClass} h-auto py-2`} />
            </div>
          </section>
          <section className="card-surface rounded-lg p-5">
            <h2 className="font-semibold mb-3">How this order works</h2>
            <p className="text-[13.5px] text-steel-500">This places a <strong>purchase request</strong> at your agreed prices. The Delite team confirms it and arranges payment and delivery with {me.dealer.legalName} — you won't be charged online.</p>
          </section>
        </div>
        <aside className="card-surface rounded-lg p-5 space-y-4 lg:sticky lg:top-24">
          <h2 className="font-semibold">Order summary</h2>
          <ul className="text-[13px] space-y-2">
            {quote.lines.map((l) => (
              <li key={l.variantId} className="flex justify-between gap-3">
                <span className="min-w-0">{l.name} <span className="text-steel-500">× {l.quantity}</span>{l.priceChanged && l.previousPricePaise !== null && l.unitPricePaise !== null && <span className="block text-[12px] text-amber-800"><s>{money(l.previousPricePaise)}</s> → {money(l.unitPricePaise)} each</span>}</span>
                <span className="price shrink-0">{money(l.subtotalPaise)}</span>
              </li>
            ))}
          </ul>
          <Totals quote={quote} />
          <button type="submit" disabled={busy || !quote.canOrder} className={`${btnPrimary} w-full`}>{busy && <Spinner />} {quote.needsAcknowledgement ? "Accept updated prices & place order" : "Place order"}</button>
          <p className="text-[12px] text-steel-500">By placing this order you agree to Delite's dealer terms.</p>
        </aside>
      </div>
    </form>
  );
}
