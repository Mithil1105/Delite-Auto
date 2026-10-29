import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { site } from "../../data/site";
import { dealerApi } from "../lib/dealerApi";
import { btnPrimary, ErrorState, formatDateTime, money, PageSkeleton, useApi } from "../ui";

/**
 * Printable order document (spec Phase 4 "PDFs/quotes"). It is a plain, paper-styled page: the browser's
 * "Save as PDF" turns it into a PDF with no server-side rendering, and the portal chrome is hidden for
 * print. Everything shown is the immutable price snapshot taken when the order was placed.
 */
export default function OrderPrint() {
  const { id = "" } = useParams();
  const { data, error, loading, reload } = useApi(() => dealerApi.order(id), [id]);
  if (loading) return <PageSkeleton rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const { order, items, dealer } = data;
  const a = order.shippingAddress;
  const b = dealer.billingAddress;
  const fmt = (x: typeof a) => [x.line1, x.line2, x.city, x.state, x.pincode].filter(Boolean).join(", ");

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <Link to={`/orders/${id}`} className="inline-flex items-center gap-1 text-[13px] text-steel-700 hover:underline"><ArrowLeft className="w-4 h-4" aria-hidden /> Back to order</Link>
        <button type="button" onClick={() => window.print()} className={btnPrimary}><Printer className="w-4 h-4" aria-hidden /> Print / Save as PDF</button>
      </div>
      <article className="bg-white border border-line rounded-lg p-8 print:border-0 print:p-0 text-[13px]">
        <header className="flex justify-between gap-6 border-b border-line pb-5 mb-5">
          <div>
            <div className="font-display uppercase text-[20px]">Delite Auto</div>
            <div className="text-steel-500">{site.email} · {site.phone}</div>
          </div>
          <div className="text-right">
            <div className="font-display uppercase text-[18px]">Order {order.orderNumber}</div>
            <div className="text-steel-500">{formatDateTime(order.createdAt)}</div>
            {order.odooOrderName && <div className="text-steel-500">Ref {order.odooOrderName}</div>}
          </div>
        </header>
        <div className="grid grid-cols-2 gap-6 mb-6">
          <section>
            <h2 className="text-[11px] uppercase tracking-wide text-steel-500 mb-1">Billed to</h2>
            <div className="font-semibold">{dealer.legalName}</div>
            {dealer.gstin && <div>GSTIN {dealer.gstin}</div>}
            <div>{fmt(b) || "—"}</div>
          </section>
          <section>
            <h2 className="text-[11px] uppercase tracking-wide text-steel-500 mb-1">Deliver to</h2>
            <div className="font-semibold">{[a.name, a.phone].filter(Boolean).join(" · ")}</div>
            <div>{fmt(a)}</div>
            {order.poReference && <div className="mt-1">Your PO: <strong>{order.poReference}</strong></div>}
          </section>
        </div>
        <table className="w-full mb-5">
          <thead className="text-left text-[11px] uppercase tracking-wide text-steel-500 border-b border-line">
            <tr><th className="py-2 font-medium">Product</th><th className="py-2 font-medium text-right">Qty</th><th className="py-2 font-medium text-right">Unit price</th><th className="py-2 font-medium text-right">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((i) => (
              <tr key={i.variantId}>
                <td className="py-2">{i.name}{i.sku && <div className="text-[11.5px] text-steel-500">SKU {i.sku}</div>}</td>
                <td className="py-2 text-right tabular-nums">{i.quantity}</td>
                <td className="py-2 text-right price">{money(i.unitPricePaise)} <span className="font-sans text-[11px] text-steel-500">{i.taxBasis === "inclusive" ? "incl." : "excl."}</span></td>
                <td className="py-2 text-right price">{money(i.totalPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto w-64 space-y-1">
          <div className="flex justify-between"><dt className="text-steel-500">Subtotal</dt><dd className="price">{money(order.subtotalPaise)}</dd></div>
          <div className="flex justify-between"><dt className="text-steel-500">Tax</dt><dd className="price">{money(order.taxPaise)}</dd></div>
          <div className="flex justify-between"><dt className="text-steel-500">Shipping</dt><dd>{order.shippingPaise ? money(order.shippingPaise) : "As agreed"}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-[15px] font-semibold"><dt>Total</dt><dd className="price">{money(order.totalPaise)}</dd></div>
        </dl>
        <footer className="mt-8 pt-4 border-t border-line text-[11.5px] text-steel-500">
          {dealer.paymentTerms && <p>Payment terms: {dealer.paymentTerms}.</p>}
          <p>This is a purchase request at your agreed prices, confirmed by Delite. Prices are fixed as of the order date and are not changed by later price updates.</p>
        </footer>
      </article>
    </div>
  );
}
