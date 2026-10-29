import { Link } from "react-router-dom";
import { ArrowRight, ClipboardList, Package, ShoppingCart } from "lucide-react";
import { site } from "../../data/site";
import { brandingImageUrl } from "../lib/media";
import { useMe } from "../DealerShell";
import { btnPrimary, EmptyState, formatDateTime, money, OrderStatusBadge, ProductThumb } from "../ui";

export default function Dashboard() {
  const { me, cartLines } = useMe();
  const cover = brandingImageUrl(me.branding?.coverPath);
  const accent = me.branding?.accentColor ?? "#10148F";

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
              <Link key={p.templateId} to={`/catalog/${p.templateId}`} className="card-surface rounded-lg p-4 flex flex-col gap-3 hover:shadow-lift transition-shadow">
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
