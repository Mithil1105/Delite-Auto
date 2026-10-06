import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { formatINR } from "../../lib/format";

interface OrderSummary {
  source: "delite" | "legacy";
  id: string | null;
  odooSaleOrderId: number | null;
  odooOrderName: string | null;
  status: string;
  total: number;
  paymentMethod: "online" | "cod" | null;
  paymentStatus: string | null;
  date: string;
}

/** Merges Delite-tracked orders with any legacy Odoo orders under the same customer (spec #24/#50)
 * — the Edge Function already dedupes/merges; this page just renders what it returns. */
export default function AccountOrders() {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.functions.invoke<{ orders: OrderSummary[] }>("customer-orders", { method: "POST" }).then(({ data }) => {
      if (!cancelled) setOrders(data?.orders ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">My Orders</h1>
      {orders === null && <p className="text-[13.5px] text-steel-500">Loading…</p>}
      {orders !== null && orders.length === 0 && (
        <div className="card-surface p-8 text-center">
          <p className="text-[13.5px] text-steel-500 mb-4">You haven't placed any orders yet.</p>
          <Link to="/shop" className="btn-dark">Browse the catalog</Link>
        </div>
      )}
      {orders !== null && orders.length > 0 && (
        <div className="card-surface divide-y divide-line">
          {orders.map((o) => (
            <Link
              key={o.id ?? `legacy-${o.odooSaleOrderId}`}
              to={o.id ? `/account/orders/${o.id}` : `/account/orders/legacy-${o.odooSaleOrderId}`}
              className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-steel-50 transition-colors"
            >
              <div className="min-w-0">
                <div className="font-semibold text-[14px]">{o.odooOrderName ?? "—"}</div>
                <div className="text-steel-500 text-[12px]">
                  {o.date ? new Date(o.date).toLocaleDateString() : ""} · {o.status}
                  {o.paymentStatus && ` · ${o.paymentMethod === "online" ? "Paid online" : "Cash on Delivery"}`}
                </div>
              </div>
              <div className="font-semibold price shrink-0">{formatINR(o.total)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
