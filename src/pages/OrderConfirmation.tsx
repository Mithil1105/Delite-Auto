import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { formatINR } from "../lib/format";
import { useLang } from "../i18n/LanguageContext";
import { track } from "../lib/analytics/client";

interface OrderRow {
  id: string;
  odoo_order_name: string | null;
  status: string;
  subtotal: number;
  payment_method: "online" | "cod";
  payment_status: string;
}

interface CheckoutNavState {
  odooOrderName?: string | null;
  orderId?: string | null;
  subtotal?: number;
  paymentMethod?: "online" | "cod";
  shippingAddress?: string;
}

/**
 * Order status honesty (spec #44-45): only ever displays fields that actually exist/are real —
 * never a fabricated Processing/Shipped/Delivered progress bar. `orders.status` today is always
 * `'placed'` (nothing in this codebase updates it yet — see Documentations MD/delite-payments.md),
 * so this shows it as "Order received — current status: <real value>" rather than inventing
 * lifecycle steps that aren't backed by real data.
 *
 * Guest orders (spec #10-11) have no Supabase session at all, so RLS can never let this page
 * re-fetch the order by id the way a signed-in customer's confirmation can — instead, the data
 * Checkout.tsx already has in hand right after a successful order is passed via router `state`,
 * which this page prefers when present. Refreshing the page as a guest loses that state (no way
 * to re-derive it without a session) and falls back to the honest "finalizing" message rather than
 * a broken/empty page.
 */
export default function OrderConfirmation() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navState = (location.state as CheckoutNavState | null) ?? null;
  const { session } = useAuth();
  const { t } = useLang();
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    track("checkout_step_viewed", { metadata: { step: "confirmation" } });
  }, []);

  useEffect(() => {
    if (navState?.odooOrderName !== undefined) {
      setOrder({
        id: navState.orderId ?? id,
        odoo_order_name: navState.odooOrderName ?? null,
        status: "placed",
        subtotal: navState.subtotal ?? 0,
        payment_method: navState.paymentMethod ?? "cod",
        payment_status: navState.paymentMethod === "online" ? "paid" : "pending",
      });
      setLoading(false);
      return;
    }
    // No router state (e.g. a page refresh) — only a signed-in customer can re-fetch via RLS; a
    // guest simply sees the honest "finalizing" fallback below rather than an error.
    if (!supabase || id === "placed" || !session) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("orders")
      .select("id, odoo_order_name, status, subtotal, payment_method, payment_status")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setOrder((data as OrderRow | null) ?? null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, session, navState]);

  return (
    <div className="container-page py-24 flex flex-col items-center text-center">
      <CheckCircle2 className="w-14 h-14 text-accent mb-5" />
      <h1 className="text-2xl font-semibold mb-2">{t("order.confirmedTitle")}</h1>
      <p className="text-steel-500 text-[14.5px] mb-6 max-w-[45ch]">{t("order.confirmedDesc")}</p>

      {!loading && order ? (
        <div className="card-surface p-6 mb-8 w-full max-w-sm text-left">
          <div className="flex justify-between text-[13.5px] py-1.5">
            <span className="text-steel-500">{t("order.orderNumber")}</span>
            <span className="font-semibold">{order.odoo_order_name ?? order.id.slice(0, 8)}</span>
          </div>
          <div className="flex justify-between text-[13.5px] py-1.5">
            <span className="text-steel-500">{t("cart.total")}</span>
            <span className="font-semibold price">{formatINR(order.subtotal)}</span>
          </div>
          <div className="flex justify-between text-[13.5px] py-1.5">
            <span className="text-steel-500">{t("order.payment")}</span>
            <span className="font-semibold">
              {order.payment_method === "online" ? t("order.paidOnline") : t("checkout.payCod")}
            </span>
          </div>
          <div className="flex justify-between text-[13.5px] py-1.5 border-t border-line mt-1 pt-2.5">
            <span className="text-steel-500">{t("order.status")}</span>
            <span className="font-semibold capitalize">{order.status}</span>
          </div>
        </div>
      ) : (
        !loading && (
          <p className="text-[13.5px] text-steel-500 mb-8 max-w-[40ch]">{t("order.finalizingNote")}</p>
        )
      )}

      {!loading && order?.payment_method === "cod" && <p className="text-[12px] text-steel-500 mb-6 max-w-[45ch]">{t("checkout.payOnDeliveryNote")}</p>}

      <div className="flex gap-3">
        {session ? (
          <Link to="/account/orders" className="btn-outline">My Orders</Link>
        ) : (
          <Link to="/account" className="btn-outline">{t("account.title")}</Link>
        )}
        <Link to="/shop" className="btn-dark">{t("cart.continueShopping")}</Link>
      </div>
    </div>
  );
}
