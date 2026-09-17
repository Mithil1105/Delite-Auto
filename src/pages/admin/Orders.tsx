import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { formatINR } from "../../lib/format";
import { useLang } from "../../i18n/LanguageContext";
import { AdminNav } from "./AdminNav";

interface OrderRow {
  id: string;
  user_id: string;
  odoo_sale_order_id: number | null;
  odoo_order_name: string | null;
  status: string;
  subtotal: number;
  shipping_name: string;
  created_at: string;
}

export default function AdminOrders() {
  const { t } = useLang();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("orders")
      .select("id, user_id, odoo_sale_order_id, odoo_order_name, status, subtotal, shipping_name, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => setOrders((data as OrderRow[] | null) ?? []));
  }, []);

  const openInOdoo = async (order: OrderRow) => {
    if (!supabase || !order.odoo_sale_order_id) return;
    setOpeningId(order.id);
    // functions.invoke() automatically attaches the signed-in admin's own session token —
    // admin-odoo-link re-verifies profiles.is_admin server-side before returning anything.
    const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>("admin-odoo-link", {
      body: { model: "sale.order", id: order.odoo_sale_order_id },
    });
    setOpeningId(null);
    if (error || !data?.url) return;
    window.open(data.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="container-page py-12">
      <h1 className="text-3xl font-semibold mb-2">{t("admin.title")}</h1>
      <AdminNav />

      {orders === null && <p className="text-[13.5px] text-steel-500">{t("account.loadingOrders")}</p>}
      {orders !== null && orders.length === 0 && <p className="text-[13.5px] text-steel-500">{t("admin.noOrders")}</p>}

      {orders !== null && orders.length > 0 && (
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between py-4 text-[13.5px]">
              <div>
                <div className="font-semibold">{o.odoo_order_name ?? o.id.slice(0, 8)}</div>
                <div className="text-steel-500 text-[12px]">
                  {o.shipping_name} · {new Date(o.created_at).toLocaleString()} · {o.status}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-semibold price">{formatINR(o.subtotal)}</span>
                {o.odoo_sale_order_id && (
                  <button
                    type="button"
                    disabled={openingId === o.id}
                    onClick={() => openInOdoo(o)}
                    className="flex items-center gap-1 text-[12.5px] font-semibold text-brand-700 hover:underline disabled:opacity-50"
                  >
                    {t("admin.openInOdoo")} <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
