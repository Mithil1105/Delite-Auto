import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { formatINR } from "../lib/format";
import { useLang } from "../i18n/LanguageContext";

interface OrderRow {
  id: string;
  odoo_order_name: string | null;
  status: string;
  subtotal: number;
}

export default function OrderConfirmation() {
  const { id = "" } = useParams();
  const { t } = useLang();
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || id === "placed") {
      setLoading(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("orders")
      .select("id, odoo_order_name, status, subtotal")
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
  }, [id]);

  return (
    <div className="container-page py-24 flex flex-col items-center text-center">
      <CheckCircle2 className="w-14 h-14 text-accent mb-5" />
      <h1 className="text-2xl font-semibold mb-2">{t("order.confirmedTitle")}</h1>
      <p className="text-steel-500 text-[14.5px] mb-6 max-w-[45ch]">{t("order.confirmedDesc")}</p>

      {!loading && order && (
        <div className="card-surface p-6 mb-8 w-full max-w-sm text-left">
          <div className="flex justify-between text-[13.5px] py-1.5">
            <span className="text-steel-500">{t("order.orderNumber")}</span>
            <span className="font-semibold">{order.odoo_order_name ?? order.id.slice(0, 8)}</span>
          </div>
          <div className="flex justify-between text-[13.5px] py-1.5">
            <span className="text-steel-500">{t("cart.total")}</span>
            <span className="font-semibold price">{formatINR(order.subtotal)}</span>
          </div>
        </div>
      )}

      <p className="text-[12px] text-steel-500 mb-6 max-w-[45ch]">{t("checkout.payOnDeliveryNote")}</p>

      <div className="flex gap-3">
        <Link to="/account" className="btn-outline">{t("account.title")}</Link>
        <Link to="/shop" className="btn-dark">{t("cart.continueShopping")}</Link>
      </div>
    </div>
  );
}
