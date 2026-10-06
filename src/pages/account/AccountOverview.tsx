import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { formatINR } from "../../lib/format";

interface OrderSummary {
  source: "delite" | "legacy";
  id: string | null;
  odooSaleOrderId: number | null;
  odooOrderName: string | null;
  status: string;
  total: number;
  date: string;
}

export default function AccountOverview() {
  const { profile, user } = useAuth();
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
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}</h1>
        <p className="text-[13.5px] text-steel-500">{user?.email}</p>
      </div>

      <section className="card-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display uppercase text-[13.5px]">Recent Orders</h2>
          <Link to="/account/orders" className="text-[12.5px] font-semibold text-brand-700 hover:underline">View all</Link>
        </div>
        {orders === null && <p className="text-[13.5px] text-steel-500">Loading…</p>}
        {orders !== null && orders.length === 0 && <p className="text-[13.5px] text-steel-500">You haven't placed any orders yet.</p>}
        {orders !== null && orders.length > 0 && (
          <div className="flex flex-col divide-y divide-line">
            {orders.slice(0, 3).map((o) => (
              <Link
                key={o.id ?? `legacy-${o.odooSaleOrderId}`}
                to={o.id ? `/account/orders/${o.id}` : `/account/orders/legacy-${o.odooSaleOrderId}`}
                className="flex items-center justify-between py-3 text-[13.5px] hover:text-brand-700"
              >
                <div>
                  <div className="font-semibold">{o.odooOrderName ?? "—"}</div>
                  <div className="text-steel-500 text-[12px]">{o.date ? new Date(o.date).toLocaleDateString() : ""} · {o.status}</div>
                </div>
                <div className="font-semibold price">{formatINR(o.total)}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid sm:grid-cols-3 gap-4">
        <Link to="/account/returns" className="card-surface p-5 hover:border-ink border border-transparent transition-colors">
          <div className="font-semibold text-[14px] mb-1">Returns & Exchanges</div>
          <div className="text-[12.5px] text-steel-500">Track or start a request</div>
        </Link>
        <Link to="/account/addresses" className="card-surface p-5 hover:border-ink border border-transparent transition-colors">
          <div className="font-semibold text-[14px] mb-1">Addresses</div>
          <div className="text-[12.5px] text-steel-500">Manage delivery addresses</div>
        </Link>
        <Link to="/account/profile" className="card-surface p-5 hover:border-ink border border-transparent transition-colors">
          <div className="font-semibold text-[14px] mb-1">Profile</div>
          <div className="text-[12.5px] text-steel-500">Name, phone, email</div>
        </Link>
      </div>
    </div>
  );
}
