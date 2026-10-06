import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { formatINR } from "../../lib/format";
import { RETURNS_WINDOW_DAYS } from "../../lib/policy";

interface OrderLine {
  odooVariantId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  alreadyRequestedQty: number;
}

interface OrderDetail {
  source: "delite" | "legacy";
  odooOrderName: string;
  odooState: string;
  date: string;
  total: number;
  tax: number;
  lines: OrderLine[];
  shippingAddress: { line1: string; line2: string } | null;
  hasInvoice: boolean;
  delivery: { state: string | null; doneAt: string | null; trackingRef: string | null; trackingUrl: string | null } | null;
  returnEligible: boolean;
  returnDeadline: string | null;
  payment: { method: string; status: string } | null;
}

const REASONS = [
  { value: "wrong_item", label: "Wrong item" },
  { value: "damaged", label: "Damaged" },
  { value: "defective", label: "Defective" },
  { value: "does_not_fit", label: "Does not fit" },
  { value: "no_longer_needed", label: "No longer needed" },
  { value: "other", label: "Other" },
];

const DELIVERY_LABELS: Record<string, string> = {
  draft: "Order received",
  waiting: "Preparing",
  confirmed: "Preparing",
  assigned: "Ready for dispatch",
  done: "Delivered",
  cancel: "Cancelled",
};

export default function AccountOrderDetail() {
  const { id = "" } = useParams();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returnLine, setReturnLine] = useState<number | null>(null);

  const isLegacy = id.startsWith("legacy-");
  const realOrderId = isLegacy ? undefined : id;
  const odooSaleOrderId = isLegacy ? Number(id.replace("legacy-", "")) : undefined;

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.functions
      .invoke<OrderDetail | { error: string }>("customer-order-detail", { method: "POST", body: { orderId: realOrderId, odooSaleOrderId } })
      .then(({ data }) => {
        if (cancelled) return;
        if (!data || "error" in data) {
          setError((data as { error?: string })?.error ?? "Order not found");
        } else {
          setOrder(data);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) {
    return (
      <div className="card-surface p-8 text-center">
        <p className="text-[13.5px] text-steel-500 mb-4">{error}</p>
        <Link to="/account/orders" className="btn-outline">Back to My Orders</Link>
      </div>
    );
  }

  if (!order) return <p className="text-[13.5px] text-steel-500">Loading…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{order.odooOrderName}</h1>
        <Link to="/account/orders" className="text-[12.5px] font-semibold text-brand-700 hover:underline">Back to My Orders</Link>
      </div>

      {order.delivery && (
        <section className="card-surface p-5">
          <h2 className="font-display uppercase text-[12.5px] mb-2 text-steel-500">Delivery</h2>
          <p className="text-[14px] font-medium">{DELIVERY_LABELS[order.delivery.state ?? ""] ?? order.delivery.state ?? "—"}</p>
          {order.delivery.trackingRef && (
            <p className="text-[13px] mt-1">
              Tracking: {order.delivery.trackingUrl ? (
                <a href={order.delivery.trackingUrl} target="_blank" rel="noreferrer" className="underline text-brand-700">Track Shipment ({order.delivery.trackingRef})</a>
              ) : order.delivery.trackingRef}
            </p>
          )}
        </section>
      )}

      <section className="card-surface p-5">
        <h2 className="font-display uppercase text-[12.5px] mb-3 text-steel-500">Items</h2>
        <div className="flex flex-col divide-y divide-line">
          {order.lines.map((l) => {
            const remaining = l.quantity - l.alreadyRequestedQty;
            const canReturn = order.returnEligible && remaining > 0;
            return (
              <div key={l.odooVariantId} className="py-3">
                <div className="flex items-center justify-between text-[13.5px]">
                  <span>{l.name} × {l.quantity}</span>
                  <span className="price font-medium">{formatINR(l.subtotal)}</span>
                </div>
                {canReturn && (
                  <button type="button" onClick={() => setReturnLine(returnLine === l.odooVariantId ? null : l.odooVariantId)} className="text-[12px] font-semibold text-brand-700 hover:underline mt-1">
                    {returnLine === l.odooVariantId ? "Cancel" : "Return / Exchange"}
                  </button>
                )}
                {returnLine === l.odooVariantId && (
                  <ReturnForm orderId={realOrderId ?? ""} variantId={l.odooVariantId} maxQty={remaining} onDone={() => setReturnLine(null)} />
                )}
              </div>
            );
          })}
        </div>
        {order.returnDeadline && !order.returnEligible && (
          <p className="text-[12px] text-steel-500 mt-3">The {RETURNS_WINDOW_DAYS}-day return window for this order has closed.</p>
        )}
      </section>

      <section className="card-surface p-5 grid sm:grid-cols-2 gap-5">
        <div>
          <h2 className="font-display uppercase text-[12.5px] mb-2 text-steel-500">Delivery Address</h2>
          <p className="text-[13.5px]">{order.shippingAddress ? `${order.shippingAddress.line1}${order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ""}` : "—"}</p>
        </div>
        <div>
          <h2 className="font-display uppercase text-[12.5px] mb-2 text-steel-500">Payment</h2>
          <p className="text-[13.5px]">
            {order.payment ? `${order.payment.method === "online" ? "Paid online" : "Cash on Delivery"} · ${order.payment.status}` : "Placed via Odoo"}
          </p>
          <p className="text-[13.5px] font-semibold mt-2">Total: {formatINR(order.total)}</p>
        </div>
      </section>
    </div>
  );
}

function ReturnForm({ orderId, variantId, maxQty, onDone }: { orderId: string; variantId: number; maxQty: number; onDone: () => void }) {
  const [quantity, setQuantity] = useState(1);
  const [type, setType] = useState<"return" | "exchange">("return");
  const [reason, setReason] = useState("wrong_item");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!supabase || !orderId) return;
    setSubmitting(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke("return-request", {
      body: { orderId, odooVariantId: variantId, quantity, type, reason, note: note.trim() || undefined },
    });
    setSubmitting(false);
    if (invokeError || data?.error) {
      setError(data?.error ?? invokeError?.message ?? "Could not submit your request");
      return;
    }
    onDone();
  };

  return (
    <div className="mt-2 p-3 bg-steel-50 flex flex-col gap-2.5 text-[13px]">
      <div className="flex gap-2">
        <button type="button" onClick={() => setType("return")} className={`px-3 py-1.5 border text-[12.5px] font-medium ${type === "return" ? "border-ink bg-ink text-white" : "border-line"}`}>Return</button>
        <button type="button" onClick={() => setType("exchange")} className={`px-3 py-1.5 border text-[12.5px] font-medium ${type === "exchange" ? "border-ink bg-ink text-white" : "border-line"}`}>Exchange</button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-steel-500">Quantity</label>
        <input type="number" min={1} max={maxQty} value={quantity} onChange={(e) => setQuantity(Math.min(maxQty, Math.max(1, Number(e.target.value))))} className="w-16 h-8 px-2 border border-line" />
      </div>
      <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 px-2 border border-line bg-white">
        {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={reason === "other" ? "Please describe the reason (required)" : "Optional note"}
        rows={2}
        className="px-2 py-1.5 border border-line"
      />
      {type === "exchange" && <p className="text-[11.5px] text-steel-500">A team member will follow up to confirm the replacement variant.</p>}
      {error && <p className="text-sale text-[12px]">{error}</p>}
      <button type="button" disabled={submitting} onClick={submit} className="btn-dark !py-2 !text-[12.5px] disabled:opacity-50">
        {submitting ? "Submitting…" : "Submit request"}
      </button>
    </div>
  );
}
