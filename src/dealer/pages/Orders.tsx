import { useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock, Printer, RotateCcw } from "lucide-react";
import { dealerApi } from "../lib/dealerApi";
import { ApiError } from "../lib/transport";
import { useMe } from "../DealerShell";
import { btnOutline, btnPrimary, EmptyState, ErrorState, formatDateTime, money, OrderStatusBadge, PageSkeleton, Spinner, useApi } from "../ui";

export function Orders() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const status = params.get("status") ?? "";
  const { data, error, loading, reload } = useApi(() => dealerApi.orders({ page, pageSize: 15, status: status || undefined }), [page, status]);

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <label className="text-[13px] flex items-center gap-2">
          <span className="text-steel-500">Status</span>
          <select value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})} className="h-9 px-2.5 border border-line rounded-md bg-white text-[13px]">
            <option value="">All</option>
            <option value="pending_sync">Received</option>
            <option value="quotation">Awaiting confirmation</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>
      {loading && <PageSkeleton rows={4} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!loading && data && data.rows.length === 0 && <EmptyState title="No orders found" action={<Link to="/catalog" className={btnPrimary}>Start an order</Link>}>{status ? "No orders with that status." : "Orders you place will appear here."}</EmptyState>}
      {!loading && data && data.rows.length > 0 && (
        <>
          <div className="card-surface rounded-lg overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead className="text-left text-[12px] uppercase tracking-wide text-steel-500 border-b border-line">
                <tr><th className="p-4 font-medium">Order</th><th className="p-4 font-medium">Placed</th><th className="p-4 font-medium">Status</th><th className="p-4 font-medium text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((o) => (
                  <tr key={o.id} className="hover:bg-steel-50/60">
                    <td className="p-4"><Link to={`/orders/${o.id}`} className="font-semibold underline">{o.orderNumber}</Link>{o.poReference && <div className="text-[12px] text-steel-500">PO {o.poReference}</div>}</td>
                    <td className="p-4 text-steel-700">{formatDateTime(o.createdAt)}</td>
                    <td className="p-4"><OrderStatusBadge status={o.status} /></td>
                    <td className="p-4 text-right price font-semibold">{money(o.totalPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-[13px]">
              <span className="text-steel-500">{data.total} orders · page {data.page} of {data.totalPages}</span>
              <div className="flex gap-2">
                <button type="button" className={btnOutline} disabled={page <= 1} onClick={() => setParams({ ...(status ? { status } : {}), page: String(page - 1) })}>Previous</button>
                <button type="button" className={btnOutline} disabled={page >= data.totalPages} onClick={() => setParams({ ...(status ? { status } : {}), page: String(page + 1) })}>Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function OrderDetail() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { setCartLines } = useMe();
  const justPlaced = (location.state as { placed?: boolean; synced?: boolean } | null)?.placed === true;
  const { data, error, loading, reload } = useApi(() => dealerApi.order(id), [id]);
  const [reordering, setReordering] = useState(false);
  const [reorderMsg, setReorderMsg] = useState<string | null>(null);

  const reorder = async () => {
    setReordering(true);
    setReorderMsg(null);
    try {
      const res = await dealerApi.reorder(id);
      const cart = await dealerApi.cart();
      setCartLines(cart.quote.lines.length);
      if (res.skipped.length === 0) navigate("/cart");
      else setReorderMsg(`Added ${res.added.length} item(s). Skipped: ${res.skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}`);
    } catch (err) {
      setReorderMsg(err instanceof ApiError ? err.message : "Couldn't reorder");
    } finally {
      setReordering(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <Link to="/orders" className="inline-flex items-center gap-1 text-[13px] text-steel-700 hover:underline mb-4"><ArrowLeft className="w-4 h-4" aria-hidden /> All orders</Link>
      {loading && <PageSkeleton rows={2} />}
      {error && (error.code === "NOT_FOUND" ? <EmptyState title="Order not found" action={<Link to="/orders" className={btnPrimary}>Back to orders</Link>}>This order doesn't exist or isn't on your account.</EmptyState> : <ErrorState error={error} onRetry={reload} />)}
      {data && (
        <>
          {justPlaced && (
            <div role="status" className="mb-5 border border-emerald-300 bg-emerald-50 rounded-lg p-4 flex gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden />
              <div className="text-[13.5px]"><strong>Order {data.order.orderNumber} received.</strong> Our team will confirm it shortly{data.order.syncPending ? " — it's safely recorded and is still being passed to our order system; no action is needed from you." : "."}</div>
            </div>
          )}
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <h1 className="text-2xl font-semibold">{data.order.orderNumber}</h1>
              <p className="text-[13px] text-steel-500">Placed {formatDateTime(data.order.createdAt)}{data.order.poReference ? ` · PO ${data.order.poReference}` : ""}</p>
            </div>
            <div className="flex items-center gap-3">
              <OrderStatusBadge status={data.order.status} />
              <Link to={`/orders/${id}/print`} className={btnOutline}><Printer className="w-4 h-4" aria-hidden /> PDF / Print</Link>
              <button type="button" className={btnOutline} onClick={reorder} disabled={reordering}>{reordering ? <Spinner /> : <RotateCcw className="w-4 h-4" aria-hidden />} Reorder</button>
            </div>
          </div>
          {reorderMsg && <p role="status" className="mb-4 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">{reorderMsg} <Link to="/cart" className="underline font-semibold">View cart</Link></p>}
          {data.order.syncPending && !justPlaced && <p className="mb-4 text-[13px] inline-flex items-center gap-2 text-amber-800"><Clock className="w-4 h-4" aria-hidden /> Received — being passed to our order system.</p>}

          <div className="card-surface rounded-lg overflow-x-auto mb-5">
            <table className="w-full text-[13.5px]">
              <thead className="text-left text-[12px] uppercase tracking-wide text-steel-500 border-b border-line">
                <tr><th className="p-4 font-medium">Product</th><th className="p-4 font-medium text-right">Qty</th><th className="p-4 font-medium text-right">Unit price</th><th className="p-4 font-medium text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((i) => (
                  <tr key={i.variantId}>
                    <td className="p-4">{i.name}{i.sku && <div className="text-[12px] text-steel-500">SKU {i.sku}</div>}</td>
                    <td className="p-4 text-right tabular-nums">{i.quantity}</td>
                    <td className="p-4 text-right price">{money(i.unitPricePaise)}</td>
                    <td className="p-4 text-right price font-semibold">{money(i.totalPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <section className="card-surface rounded-lg p-5 text-[13.5px]">
              <h2 className="font-semibold mb-2">Delivery address</h2>
              <p className="text-steel-700">{[data.order.shippingAddress.name, data.order.shippingAddress.phone].filter(Boolean).join(" · ")}<br />{[data.order.shippingAddress.line1, data.order.shippingAddress.line2].filter(Boolean).join(", ")}<br />{[data.order.shippingAddress.city, data.order.shippingAddress.state, data.order.shippingAddress.pincode].filter(Boolean).join(", ")}</p>
              {data.order.notes && <p className="mt-3 text-steel-500">Notes: {data.order.notes}</p>}
            </section>
            <section className="card-surface rounded-lg p-5 text-[13.5px] space-y-2">
              <div className="flex justify-between"><span className="text-steel-500">Subtotal</span><span className="price">{money(data.order.subtotalPaise)}</span></div>
              <div className="flex justify-between"><span className="text-steel-500">Tax</span><span className="price">{money(data.order.taxPaise)}</span></div>
              <div className="flex justify-between"><span className="text-steel-500">Shipping</span><span>{data.order.shippingPaise ? money(data.order.shippingPaise) : "As agreed"}</span></div>
              <div className="flex justify-between border-t border-line pt-2 font-semibold text-[15px]"><span>Total</span><span className="price">{money(data.order.totalPaise)}</span></div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
