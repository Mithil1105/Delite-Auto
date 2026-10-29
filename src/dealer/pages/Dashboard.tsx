import { Link } from "react-router-dom";
import { ArrowRight, ClipboardList, Gift, Package, ShoppingCart } from "lucide-react";
import { site } from "../../data/site";
import { brandingImageUrl } from "../lib/media";
import { dealerApi } from "../lib/dealerApi";
import { productPath } from "../lib/slug";
import { useMe } from "../DealerShell";
import { btnPrimary, EmptyState, formatDateTime, money, OrderStatusBadge, ProductThumb, Skeleton, useApi } from "../ui";

export default function Dashboard() {
  const { me, cartLines } = useMe();
  const cover = brandingImageUrl(me.branding?.coverPath);
  const accent = me.branding?.accentColor ?? "#10148F";
  const insights = useApi(() => dealerApi.insights(90), []);

  return (
    <div className="space-y-8 max-w-6xl">
      <section
        className="relative overflow-hidden rounded-xl text-white p-7 sm:p-10 min-h-[200px] flex flex-col justify-end"
        style={{ background: cover ? `linear-gradient(90deg, rgba(10,14,20,.78), rgba(10,14,20,.25)), url(${cover}) center/cover` : `linear-gradient(120deg, ${accent}, #0f1214)` }}
      >
        <h1 className="font-display uppercase text-[28px] sm:text-[38px] tracking-tightish leading-tight">Welcome back, {me.dealer.displayName}</h1>
        {me.branding?.tagline && <p className="text-white/80 text-[14px] mt-1">{me.branding.tagline}</p>}
        {me.branding?.welcomeText && <p className="text-white/70 text-[13px] mt-2 max-w-[60ch]">{me.branding.welcomeText}</p>}
        <div className="mt-5">
          <Link to="/catalog" className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-white text-ink font-semibold text-[14px] hover:bg-steel-50">
            Browse your catalogue <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
        </div>
      </section>


      {me.offers.length > 0 && (
        <section aria-label="Offers for you" className="space-y-3">
          {me.offers.map((o) => (
            <div key={o.id} className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <Gift className="w-5 h-5 shrink-0 text-amber-700 mt-0.5" aria-hidden />
              <div><div className="font-semibold text-[14px]">{o.title}</div>{o.body && <p className="text-[13px] text-steel-700">{o.body}</p>}{o.endsAt && <p className="text-[12px] text-steel-500 mt-1">Until {new Date(o.endsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>}</div>
            </div>
          ))}
        </section>
      )}

      {me.credit && (
        <section aria-label="Credit" className="card-surface rounded-lg p-5">
          <div className="flex flex-wrap justify-between gap-2 text-[13.5px] mb-2"><span className="font-semibold">Credit available</span><span className="price">{money(me.credit.availablePaise)} <span className="text-steel-500 font-sans">of {money(me.credit.limitPaise)}</span></span></div>
          <div className="h-2 rounded-full bg-steel-100 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={me.credit.limitPaise} aria-valuenow={me.credit.usedPaise} aria-label="Credit used"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (me.credit.usedPaise / me.credit.limitPaise) * 100)}%`, background: accent }} /></div>
          <p className="text-[12px] text-steel-500 mt-2">{money(me.credit.usedPaise)} is tied up in open orders.{me.terms.paymentTerms ? ` Terms: ${me.terms.paymentTerms}.` : ""}</p>
        </section>
      )}

      <section aria-label="Spend insights">
        <h2 className="font-semibold text-[16px] mb-3">Your last 90 days</h2>
        {insights.loading && <Skeleton className="h-24" />}
        {insights.data && (insights.data.orders === 0 ? (
          <p className="text-[13.5px] text-steel-500">No orders in this period yet.</p>
        ) : (
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="card-surface rounded-lg p-5">
              <div className="text-[12px] uppercase tracking-wide text-steel-500">Spend</div>
              <div className="price text-[22px] font-semibold">{money(insights.data.spendPaise)}</div>
              <div className="text-[12.5px] text-steel-500">{insights.data.orders} order{insights.data.orders === 1 ? "" : "s"} · avg {money(insights.data.averageOrderPaise)}</div>
              <ul className="mt-3 space-y-1 text-[12.5px]">{insights.data.monthly.map((m) => <li key={m.month} className="flex justify-between"><span className="text-steel-500">{m.month}</span><span className="price">{money(m.spendPaise)}</span></li>)}</ul>
            </div>
            <div className="card-surface rounded-lg p-5 lg:col-span-2">
              <div className="text-[12px] uppercase tracking-wide text-steel-500 mb-2">Top products</div>
              <ol className="space-y-2 text-[13.5px]">{insights.data.topProducts.map((p) => <li key={p.name} className="flex justify-between gap-3"><span className="truncate">{p.name} <span className="text-steel-500">× {p.qty}</span></span><span className="price shrink-0">{money(p.spendPaise)}</span></li>)}</ol>
            </div>
          </div>
        ))}
      </section>

      <section aria-label="Summary" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Products available", value: me.stats.orderableProducts, icon: Package, to: "/catalog" },
          { label: "Total orders", value: me.stats.totalOrders, icon: ClipboardList, to: "/orders" },
          { label: "Open orders", value: me.stats.openOrders, icon: ClipboardList, to: "/orders" },
          { label: "In your cart", value: cartLines, icon: ShoppingCart, to: "/cart" },
        ].map((s) => (
          <Link key={s.label} to={s.to} className="card-surface rounded-lg p-5 hover:shadow-lift transition-shadow">
            <s.icon className="w-5 h-5 mb-3 text-steel-500" aria-hidden />
            <div className="text-[26px] font-semibold leading-none">{s.value}</div>
            <div className="text-[12.5px] text-steel-500 mt-1">{s.label}</div>
          </Link>
        ))}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold text-[16px]">Your exclusive catalogue</h2>
          <Link to="/catalog" className="text-[13px] font-semibold underline">View all</Link>
        </div>
        {me.featured.length === 0 ? (
          <EmptyState title="No products assigned yet">Delite hasn't opened any products for your account yet. Contact your representative.</EmptyState>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {me.featured.map((p) => (
              <Link key={p.templateId} to={productPath(p)} className="card-surface rounded-lg p-4 flex flex-col gap-3 hover:shadow-lift transition-shadow">
                <ProductThumb url={p.imageUrl} name={p.name} className="w-full h-28" />
                <div className="text-[13.5px] font-medium leading-snug line-clamp-2">{p.name}</div>
                <div className="price font-semibold mt-auto">{p.fromPricePaise !== null ? `${p.variants.length > 1 ? "From " : ""}${money(p.fromPricePaise)}` : <span className="text-steel-500 font-normal text-[12.5px]">Price on request</span>}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2">
          <h2 className="font-semibold text-[16px] mb-3">Recent orders</h2>
          {me.recentOrders.length === 0 ? (
            <EmptyState title="No orders yet" action={<Link to="/catalog" className={btnPrimary}>Start an order</Link>}>Your orders and their status will appear here.</EmptyState>
          ) : (
            <div className="card-surface rounded-lg divide-y divide-line">
              {me.recentOrders.map((o) => (
                <Link key={o.id} to={`/orders/${o.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-steel-50/60">
                  <div>
                    <div className="font-semibold text-[14px]">{o.orderNumber}</div>
                    <div className="text-[12px] text-steel-500">{formatDateTime(o.createdAt)}</div>
                  </div>
                  <OrderStatusBadge status={o.status} />
                  <div className="price font-semibold">{money(o.totalPaise)}</div>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section>
          <h2 className="font-semibold text-[16px] mb-3">Need help?</h2>
          <div className="card-surface rounded-lg p-5 text-[13.5px] space-y-2">
            <p className="text-steel-500">Your dedicated Delite dealer team:</p>
            <p><a href={`mailto:${site.email}`} className="underline">{site.email}</a></p>
            <p><a href={`tel:${site.phone.replace(/\s/g, "")}`} className="underline">{site.phone}</a></p>
            <Link to="/support" className="inline-block mt-2 font-semibold underline">Support details</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
