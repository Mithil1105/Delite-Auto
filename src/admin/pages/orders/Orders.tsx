import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { formatINR } from "../../../lib/format";
import { useLang } from "../../../i18n/LanguageContext";

interface OrderRow {
  id: string;
  user_id: string;
  odoo_sale_order_id: number | null;
  odoo_order_name: string | null;
  status: string;
  subtotal: number;
  shipping_name: string;
  created_at: string;
  payment_method: "online" | "cod";
  payment_status: string;
}

const PAGE_SIZE = 50;

/** Payment and fulfilment are different concepts — never conflated (spec #47). */
function PaymentBadge({ method, status }: { method: "online" | "cod"; status: string }) {
  if (method === "cod") return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-steel-100 text-steel-600">COD · {status}</span>;
  const color = status === "paid" ? "bg-emerald-100 text-emerald-700" : status === "failed" ? "bg-sale/10 text-sale" : status === "refunded" ? "bg-amber-100 text-amber-700" : "bg-steel-100 text-steel-600";
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${color}`}>{status}</span>;
}

/** Now supports search/filters/server pagination (spec #23) — row click opens Order Detail
 * (spec #24). "Open in Odoo" stays inline since it's a one-click external action, not detail. */
export default function AdminOrders() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"all" | "online" | "cod">("all");
  const [paymentStatus, setPaymentStatus] = useState<"all" | "created" | "pending" | "authorized" | "paid" | "failed" | "refunded">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "amount_desc" | "amount_asc">("newest");

  const load = async () => {
    if (!supabase) return;
    setOrders(null);
    const orderColumn = sort === "amount_desc" || sort === "amount_asc" ? "subtotal" : "created_at";
    const ascending = sort === "oldest" || sort === "amount_asc";
    let query = supabase
      .from("orders")
      .select("id, user_id, odoo_sale_order_id, odoo_order_name, status, subtotal, shipping_name, created_at, payment_method, payment_status", { count: "exact" })
      .order(orderColumn, { ascending })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (paymentMethod !== "all") query = query.eq("payment_method", paymentMethod);
    if (paymentStatus !== "all") query = query.eq("payment_status", paymentStatus);
    if (dateFrom) query = query.gte("created_at", new Date(dateFrom).toISOString());
    if (dateTo) query = query.lte("created_at", new Date(`${dateTo}T23:59:59`).toISOString());
    if (search.trim()) query = query.or(`shipping_name.ilike.%${search.trim()}%,odoo_order_name.ilike.%${search.trim()}%`);
    const { data, count } = await query;
    setOrders((data as OrderRow[] | null) ?? []);
    setTotal(count ?? 0);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, paymentMethod, paymentStatus, dateFrom, dateTo, search, sort]);

  useEffect(() => setPage(0), [paymentMethod, paymentStatus, dateFrom, dateTo, search, sort]);

  const openInOdoo = async (order: OrderRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!supabase || !order.odoo_sale_order_id) return;
    setOpeningId(order.id);
    const { data, error } = await supabase.functions.invoke<{ url?: string }>("admin-odoo-link", {
      body: { model: "sale.order", id: order.odoo_sale_order_id },
    });
    setOpeningId(null);
    if (error || !data?.url) return;
    window.open(data.url, "_blank", "noopener,noreferrer");
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 lg:p-10">
      <h2 className="font-display uppercase text-[13.5px] mb-4">{t("admin.ordersTab")}</h2>

      <div className="flex flex-wrap gap-3 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order / customer" className="h-9 px-2.5 border border-line text-[12.5px] min-w-[220px]" />
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)} className="h-9 px-2.5 border border-line text-[12.5px]">
          <option value="all">All methods</option>
          <option value="online">Online</option>
          <option value="cod">COD</option>
        </select>
        <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as typeof paymentStatus)} className="h-9 px-2.5 border border-line text-[12.5px]">
          <option value="all">All payment statuses</option>
          <option value="created">Created</option>
          <option value="pending">Pending</option>
          <option value="authorized">Authorized</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 px-2.5 border border-line text-[12.5px]" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 px-2.5 border border-line text-[12.5px]" />
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-9 px-2.5 border border-line text-[12.5px]">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="amount_desc">Total high → low</option>
          <option value="amount_asc">Total low → high</option>
        </select>
      </div>

      {orders === null && <p className="text-[13.5px] text-steel-500">{t("account.loadingOrders")}</p>}
      {orders !== null && orders.length === 0 && <p className="text-[13.5px] text-steel-500">{t("admin.noOrders")}</p>}

      {orders !== null && orders.length > 0 && (
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {orders.map((o) => (
            <div key={o.id} onClick={() => navigate(`/admin/orders/${o.id}`)} className="flex items-center justify-between py-4 text-[13.5px] cursor-pointer hover:bg-steel-50/50">
              <div>
                <div className="font-semibold flex items-center gap-2">
                  {o.odoo_order_name ?? o.id.slice(0, 8)}
                  <PaymentBadge method={o.payment_method} status={o.payment_status} />
                </div>
                <div className="text-steel-500 text-[12px]">
                  {o.shipping_name} · {new Date(o.created_at).toLocaleString()} · order: {o.status}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-semibold price">{formatINR(o.subtotal)}</span>
                {o.odoo_sale_order_id && (
                  <button
                    type="button"
                    disabled={openingId === o.id}
                    onClick={(e) => openInOdoo(o, e)}
                    className="flex items-center gap-1 text-[12.5px] font-semibold text-brand-700 hover:underline disabled:opacity-50"
                  >
                    {t("admin.openInOdoo")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-[13px]">
          <span className="text-steel-500">{total} orders · page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 0} onClick={() => setPage((p) => p - 1)} className="btn-ghost !px-3 !py-1.5 disabled:opacity-40">Prev</button>
            <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-ghost !px-3 !py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
