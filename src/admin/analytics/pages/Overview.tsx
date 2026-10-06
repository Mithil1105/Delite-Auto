import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Lightbulb } from "lucide-react";
import type { CartRow, Funnel, GeoRow, Insight, Overview as OverviewData, ProductRow, RecentSession, SearchRow, Searches, SegmentRow, SeriesPoint } from "../api";
import { useAnalyticsFilters } from "../filters";
import { usePeriodArgs, usePrevPeriodArgs, useProductInfo, useRpc } from "../hooks";
import { PageHeader } from "../AnalyticsShell";
import { Async, Badge, EmptyState, MetricCard, Panel } from "../ui";
import { FunnelBars, RankedBars, TrendChart } from "../charts";
import { fmtDuration, fmtMoney, fmtNumber, fmtPercent, fmtSince, ratio } from "../format";
import { IdentityLabel, LocationText, ProductCell } from "../cells";
import { CartDetailDrawer, CustomerJourneyDrawer, SessionJourneyDrawer } from "../drawers";

function insightText(i: Insight, name: (id: number) => string): string {
  const p = i.params;
  switch (i.code) {
    case "product_high_views_low_adds": return `${name(Number(p.odoo_template_id))} was viewed in ${p.view_sessions} sessions but added to a cart in only ${p.add_sessions}.`;
    case "mobile_checkout_gap": return `Mobile converts materially worse than desktop: ${p.mobile_purchases} of ${p.mobile_sessions} mobile sessions purchased vs ${p.desktop_purchases} of ${p.desktop_sessions} on desktop.`;
    case "zero_result_search": return `“${p.query}” was searched ${p.searches} times and returned no results every time.`;
    case "abandoned_value": return `${fmtMoney(Number(p.value))} of carts were abandoned in this period (${p.carts} carts).`;
    case "source_growth": return `${p.channel} traffic grew ${p.change_pct}% (${p.previous} → ${p.current} sessions) versus the previous period.`;
    default: return i.code;
  }
}

export default function AnalyticsOverview() {
  const { range, prevRange, rpcFilters } = useAnalyticsFilters();
  const location = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [cartId, setCartId] = useState<string | null>(null);

  const period = usePeriodArgs();
  const prevArgs = usePrevPeriodArgs();
  const overview = useRpc<OverviewData>("admin_analytics_overview", period);
  const prev = useRpc<OverviewData>("admin_analytics_overview", prevArgs);
  const series = useRpc<SeriesPoint[]>("admin_analytics_timeseries", usePeriodArgs({ p_bucket: range.bucket }));
  const funnel = useRpc<Funnel>("admin_analytics_funnel", period);
  const products = useRpc<ProductRow[]>("admin_analytics_products", usePeriodArgs({ p_limit: 6 }));
  const sources = useRpc<SegmentRow[]>("admin_analytics_sources", usePeriodArgs({ p_group: "channel", p_limit: 6 }));
  const geo = useRpc<GeoRow[]>("admin_analytics_geography", usePeriodArgs({ p_level: "city", p_limit: 6 }));
  const carts = useRpc<{ total: number; rows: CartRow[] }>("admin_analytics_abandoned_carts", usePeriodArgs({ p_status: "abandoned", p_limit: 5 }));
  const searches = useRpc<Searches>("admin_analytics_searches", usePeriodArgs({ p_limit: 100 }));
  const recentArgs = useMemo(() => ({ p_minutes: 15, p_filters: rpcFilters, p_limit: 8 }), [rpcFilters]);
  const recent = useRpc<RecentSession[]>("admin_analytics_recent_activity", recentArgs);
  const insights = useRpc<Insight[]>("admin_analytics_insights", period);

  const insightIds = useMemo(() => (insights.data ?? []).map((i) => Number(i.params.odoo_template_id)).filter(Boolean), [insights.data]);
  const productIds = useMemo(() => [...(products.data ?? []).map((p) => p.odoo_template_id), ...(carts.data?.rows.flatMap((c) => c.items.map((i) => i.odoo_template_id)) ?? []), ...insightIds], [products.data, carts.data, insightIds]);
  const info = useProductInfo(productIds);
  const nameOf = (id: number) => info.get(id)?.name ?? `Product #${id}`;

  const o = overview.data;
  const p = prev.data;
  const compareLabel = prevRange?.label ?? "";
  const noDataAtAll = o && o.sessions === 0 && !o.first_tracked_at;
  const noVisits = o && o.sessions === 0;
  const conv = (d: OverviewData | null) => (d ? ratio(d.purchase_sessions, d.sessions) : null);
  const aov = (d: OverviewData | null) => (d ? ratio(d.revenue, d.orders) : null);
  const shortcut = (pathname: string) => ({ pathname, search: location.search });

  const zeroQueries = useMemo(() => (searches.data?.queries ?? []).filter((q: SearchRow) => q.zero_results > 0).sort((a, b) => b.zero_results - a.zero_results).slice(0, 5), [searches.data]);

  return (
    <>
      <PageHeader title="Analytics" description="First-party store analytics from Delite's own collector — visits, shopping behaviour, carts and revenue. Product data always comes live from Odoo." />

      {noDataAtAll ? (
        <Panel title="Analytics"><EmptyState title="No analytics collected yet" body="The collector is live. Numbers appear here as soon as real visitors browse the store (localhost and automated traffic are never counted). Use “Include test data” to verify the pipeline." /></Panel>
      ) : (
        <div className="space-y-5">
          {overview.error && <div role="alert" className="text-accent-700 text-[13px]">{overview.error}</div>}
          {noVisits && <p className="text-[13px] text-steel-500" data-testid="no-visits">No visits were recorded in this period.</p>}

          <section aria-label="Key metrics" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <MetricCard label="Unique visitors" value={fmtNumber(o?.unique_visitors)} current={o?.unique_visitors} previous={prevRange ? p?.unique_visitors : undefined} compareLabel={compareLabel}
              help="Distinct anonymous visitor IDs (one per browser). Not the same as sessions or page views." />
            <MetricCard label="Sessions" value={fmtNumber(o?.sessions)} current={o?.sessions} previous={prevRange ? p?.sessions : undefined} compareLabel={compareLabel}
              help="A visit: one browsing session, which ends after 30 minutes of inactivity." />
            <MetricCard label="Page views" value={fmtNumber(o?.page_views)} current={o?.page_views} previous={prevRange ? p?.page_views : undefined} compareLabel={compareLabel}
              help="Every page the storefront displayed. One visitor can generate many." />
            <MetricCard label="Product views" value={fmtNumber(o?.product_views)} current={o?.product_views} previous={prevRange ? p?.product_views : undefined} compareLabel={compareLabel}
              help="Product detail pages opened. Counted once per visit to that page." />
            <MetricCard label="Add to carts" value={fmtNumber(o?.add_to_carts)} current={o?.add_to_carts} previous={prevRange ? p?.add_to_carts : undefined} compareLabel={compareLabel}
              help="Add-to-cart actions across every surface (product page, rails, cart suggestions)." />
            <MetricCard label="Checkout starts" value={fmtNumber(o?.checkout_starts)} current={o?.checkout_starts} previous={prevRange ? p?.checkout_starts : undefined} compareLabel={compareLabel}
              help="Times a customer reached checkout with items in the cart. Not a purchase." />
            <MetricCard label="Orders" value={fmtNumber(o?.orders)} current={o?.orders} previous={prevRange ? p?.orders : undefined} compareLabel={compareLabel}
              help="Real orders confirmed by the server after Odoo accepted them. The browser can never create one." />
            <MetricCard label="Conversion rate" value={o ? fmtPercent(o.purchase_sessions, o.sessions, 2) : "—"} current={conv(o) ?? undefined} previous={prevRange ? conv(p) : undefined} compareLabel={compareLabel}
              help="Share of sessions that ended in an order (sessions with a purchase ÷ all sessions)." />
            <MetricCard label="Revenue" value={fmtMoney(o?.revenue)} current={o?.revenue} previous={prevRange ? p?.revenue : undefined} compareLabel={compareLabel}
              help="Odoo order totals at the time of purchase. Abandoned-cart value is never counted as revenue." />
            <MetricCard label="Avg order value" value={o?.orders ? fmtMoney(o.revenue / o.orders) : "—"} current={aov(o) ?? undefined} previous={prevRange ? aov(p) : undefined} compareLabel={compareLabel}
              help="Revenue ÷ orders." />
            <MetricCard label="Abandoned carts" value={fmtNumber(o?.abandoned_carts)} current={o?.abandoned_carts} previous={prevRange ? p?.abandoned_carts : undefined} goodWhenDown compareLabel={compareLabel}
              help="Carts with items, no order, and no activity for 30+ minutes, last touched in this period." sub={o ? `${fmtMoney(o.abandoned_value)} observed value` : undefined} />
            <MetricCard label="Avg engaged time" value={fmtDuration(o?.avg_engaged_per_session)} current={o?.avg_engaged_per_session} previous={prevRange ? p?.avg_engaged_per_session : undefined} compareLabel={compareLabel}
              help="Average time per session that a page was visible AND the visitor was active (idle or hidden tabs don't count)." />
          </section>

          <Panel title="Traffic trend" subtitle={`Unique visitors, sessions and page views per ${range.bucket}`}>
            <Async state={series} empty={(d) => d.every((x) => x.sessions === 0 && x.page_views === 0)} rows={4}>
              {(d) => <TrendChart title="Traffic trend" data={d} bucket={range.bucket} yLabel={`Count per ${range.bucket}`} series={[
                { key: "visitors", label: "Unique visitors" }, { key: "sessions", label: "Sessions" }, { key: "page_views", label: "Page views" }]} />}
            </Async>
          </Panel>

          <div className="grid lg:grid-cols-2 gap-5">
            <Panel title="Conversion funnel" subtitle="Distinct sessions reaching each step" actions={<Link to={shortcut("/admin/analytics/conversion")} className="text-[12px] font-semibold text-brand-500 hover:underline">Full funnel</Link>}
              help="Each step counts distinct sessions, never raw events. Steps are not forced to be strictly sequential.">
              <Async state={funnel} empty={(d) => d.steps[0].sessions === 0} rows={5}>{(d) => <FunnelBars steps={d.steps.map((s) => ({ label: s.label, value: s.sessions }))} />}</Async>
            </Panel>
            <Panel title="Top products" subtitle="By product views" actions={<Link to={shortcut("/admin/analytics/products")} className="text-[12px] font-semibold text-brand-500 hover:underline">All products</Link>}>
              <Async state={products} empty={(d) => d.length === 0} rows={5}>
                {(d) => <ul className="divide-y divide-line">{d.map((r) => (
                  <li key={r.odoo_template_id} className="py-2 flex items-center justify-between gap-3">
                    <ProductCell id={r.odoo_template_id} info={info} />
                    <span className="text-[12px] text-steel-500 tabular-nums shrink-0 text-right">{fmtNumber(r.views)} views<br />{fmtNumber(r.add_sessions)} added</span>
                  </li>))}</ul>}
              </Async>
            </Panel>
            <Panel title="Traffic sources" actions={<Link to={shortcut("/admin/analytics/acquisition")} className="text-[12px] font-semibold text-brand-500 hover:underline">Acquisition</Link>}>
              <Async state={sources} empty={(d) => d.length === 0} rows={4}>{(d) => <RankedBars rows={d.map((r) => ({ label: r.label, value: r.sessions, sub: `${fmtNumber(r.orders)} orders` }))} />}</Async>
            </Panel>
            <Panel title="Top cities" actions={<Link to={shortcut("/admin/analytics/geography")} className="text-[12px] font-semibold text-brand-500 hover:underline">Geography</Link>}>
              <Async state={geo} empty={(d) => d.length === 0} rows={4}>{(d) => <RankedBars rows={d.map((r) => ({ label: r.label, sub: r.parent || undefined, value: r.sessions }))} />}</Async>
            </Panel>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <Panel title="Abandoned carts" subtitle={carts.data ? `${carts.data.total} in this period` : undefined} actions={<Link to={shortcut("/admin/analytics/carts")} className="text-[12px] font-semibold text-brand-500 hover:underline">View abandoned carts</Link>}>
              <Async state={carts} empty={(d) => d.rows.length === 0} rows={4}>
                {(d) => <ul className="divide-y divide-line">{d.rows.map((c) => (
                  <li key={c.cart_id}>
                    <button type="button" onClick={() => setCartId(c.cart_id)} className="w-full py-2.5 flex items-center justify-between gap-3 text-left hover:bg-steel-50/60">
                      <IdentityLabel identity={c.identity} visitorId={c.visitor_id} />
                      <span className="text-right text-[12.5px] shrink-0"><strong>{fmtMoney(c.cart_value)}</strong><br /><span className="text-steel-500">{c.item_count} item(s) · {fmtSince(c.minutes_since)}</span></span>
                    </button>
                  </li>))}</ul>}
              </Async>
            </Panel>
            <Panel title="Search opportunities" subtitle="Searches that returned nothing" actions={<Link to={shortcut("/admin/analytics/search")} className="text-[12px] font-semibold text-brand-500 hover:underline">Zero-result searches</Link>}>
              <Async state={searches} rows={4}>
                {() => zeroQueries.length === 0 ? <p className="text-[12.5px] text-steel-500">No searches returned zero results in this period.</p> : <RankedBars rows={zeroQueries.map((q) => ({ label: q.display, value: q.zero_results }))} format={(n) => `${n} searches`} />}
              </Async>
            </Panel>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <Panel title="Active recently" subtitle="Sessions with activity in the last 15 minutes — not a live-presence count"
              help="The collector only hears from a visitor when they act or a tab is hidden, so this shows recent activity, not who is online this second.">
              <Async state={recent} empty={(d) => d.length === 0} rows={4}>
                {(d) => <ul className="divide-y divide-line">{d.map((s) => (
                  <li key={s.session_id}>
                    <button type="button" onClick={() => setSessionId(s.session_id)} className="w-full py-2.5 grid grid-cols-[1fr_auto] gap-3 text-left hover:bg-steel-50/60 text-[12.5px]">
                      <div className="min-w-0">
                        <IdentityLabel identity={s.identity} />
                        <div className="text-steel-500 truncate">{s.last_path ?? "—"} · <LocationText country={s.country_name} region={s.region} city={s.city} /> · {s.device_type ?? "?"}</div>
                      </div>
                      <div className="text-right text-steel-500 shrink-0">{fmtSince((Date.now() - new Date(s.last_activity_at).getTime()) / 60000)}<br />{s.page_view_count} {s.page_view_count === 1 ? "page" : "pages"}{s.cart_value ? " · " + fmtMoney(s.cart_value) + " cart" : ""}{s.is_test && <> <Badge tone="warn">test</Badge></>}</div>
                    </button>
                  </li>))}</ul>}
              </Async>
            </Panel>
            <Panel title="Insights" subtitle="Rule-based, from real data only — each needs a minimum sample size" help="Deterministic thresholds (documented in delite-analytics.md). Nothing here is model-generated.">
              <Async state={insights} empty={(d) => d.length === 0} rows={3}>
                {(d) => <ul className="space-y-2.5">{d.map((i, idx) => (
                  <li key={idx} className="flex gap-2 text-[13px]">
                    <Lightbulb className={`w-4 h-4 shrink-0 mt-0.5 ${i.severity === "warning" ? "text-accent" : i.severity === "positive" ? "text-badge-new" : "text-steel-500"}`} aria-hidden />
                    <span>{insightText(i, nameOf)}</span>
                  </li>))}</ul>}
              </Async>
            </Panel>
          </div>

          <section aria-label="Shortcuts" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {[
              ["View abandoned carts", "/admin/analytics/carts"], ["View top products", "/admin/analytics/products"], ["View zero-result searches", "/admin/analytics/search"],
              ["View traffic sources", "/admin/analytics/acquisition"], ["View cities", "/admin/analytics/geography"], ["View checkout funnel", "/admin/analytics/conversion"],
            ].map(([label, to]) => (
              <Link key={to} to={shortcut(to)} className="card-surface p-3.5 flex items-center justify-between gap-2 text-[13px] font-semibold hover:shadow-lift transition-shadow">{label}<ArrowRight className="w-4 h-4 text-brand-500 shrink-0" /></Link>
            ))}
          </section>
        </div>
      )}

      <SessionJourneyDrawer sessionId={sessionId} onClose={() => setSessionId(null)} onCustomer={(u) => { setSessionId(null); setCustomerId(u); }} />
      <CustomerJourneyDrawer userId={customerId} onClose={() => setCustomerId(null)} onSession={(s) => { setCustomerId(null); setSessionId(s); }} />
      <CartDetailDrawer cartId={cartId} onClose={() => setCartId(null)} onSession={(s) => { setCartId(null); setSessionId(s); }} />
    </>
  );
}
