import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CartPairs, CartRow, CartsSummary } from "../api";
import { usePeriodArgs, useProductInfo, useRpc } from "../hooks";
import { PageHeader } from "../AnalyticsShell";
import { Async, Badge, MetricCard, Panel, Segmented } from "../ui";
import { RankedBars, SERIES_COLORS } from "../charts";
import { DataTable, type Column } from "../DataTable";
import { fmtDuration, fmtMoney, fmtNumber, fmtPercent, fmtSince } from "../format";
import { IdentityLabel, LocationText } from "../cells";
import { CartDetailDrawer, CustomerJourneyDrawer, SessionJourneyDrawer } from "../drawers";
import { useAnalyticsFilters } from "../filters";
import { formatBucket } from "../dateRange";

type Status = "abandoned" | "recovered" | "all";

/**
 * OFFICIAL ABANDONMENT RULE (single definition, applied in SQL): a cart is abandoned when it has at
 * least one item, was never converted to an order, and has had no activity for 30 minutes or more.
 * It is derived from timestamps at read time — no scheduled job involved.
 */
export default function Carts() {
  const { range } = useAnalyticsFilters();
  const [status, setStatus] = useState<Status>("abandoned");
  const [cartId, setCartId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);

  const summary = useRpc<CartsSummary>("admin_analytics_carts_summary", usePeriodArgs());
  const list = useRpc<{ total: number; rows: CartRow[] }>("admin_analytics_abandoned_carts", usePeriodArgs({ p_status: status, p_limit: 100 }));
  const pairs = useRpc<CartPairs>("admin_analytics_cart_pairs", usePeriodArgs({ p_min: 2, p_limit: 12 }));

  const ids = useMemo(() => [
    ...(list.data?.rows.flatMap((r) => r.items.map((i) => i.odoo_template_id)) ?? []),
    ...(pairs.data ? [...pairs.data.carted_together, ...pairs.data.purchased_together].flatMap((p) => [p.a, p.b]) : []),
  ], [list.data, pairs.data]);
  const info = useProductInfo(ids);
  const k = summary.data?.kpis;

  const columns: Column<CartRow>[] = [
    { key: "who", label: "Customer / Anonymous", render: (r) => <IdentityLabel identity={r.identity} visitorId={r.visitor_id} />, sort: (r) => r.identity.kind },
    { key: "last", label: "Last activity", render: (r) => new Date(r.last_activity_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }), sort: (r) => new Date(r.last_activity_at).getTime() },
    { key: "since", label: "Time since", render: (r) => fmtSince(r.minutes_since), sort: (r) => r.minutes_since },
    { key: "items", label: "Items", render: (r) => (
      <div className="flex items-center gap-1.5 min-w-0">
        {r.items.slice(0, 3).map((i) => <div key={i.odoo_template_id} className="w-8 h-8 bg-steel-50 overflow-hidden shrink-0" title={info.get(i.odoo_template_id)?.name}>{info.get(i.odoo_template_id)?.image && <img src={info.get(i.odoo_template_id)!.image} alt="" className="w-full h-full object-cover" loading="lazy" />}</div>)}
        {r.item_count > 3 && <span className="text-[11px] text-steel-500">+{r.item_count - 3}</span>}
      </div>) },
    { key: "count", label: "Qty", align: "right", render: (r) => r.item_count, sort: (r) => r.item_count },
    { key: "value", label: "Cart value", align: "right", render: (r) => fmtMoney(r.cart_value), sort: (r) => Number(r.cart_value), help: "Observed value when the cart was last touched (historical, not current pricing)." },
    { key: "co", label: "Checkout?", render: (r) => (r.checkout_started ? <Badge tone="info">Reached</Badge> : <span className="text-steel-500">No</span>), sort: (r) => (r.checkout_started ? 1 : 0) },
    { key: "loc", label: "Location", render: (r) => <LocationText country={r.country_name} region={r.region} city={r.city} /> },
    { key: "dev", label: "Device", render: (r) => r.device_type ?? "?", sort: (r) => r.device_type ?? "" },
    { key: "dur", label: "Session time", align: "right", render: (r) => fmtDuration(r.session_engaged_seconds), sort: (r) => Number(r.session_engaged_seconds ?? 0) },
    { key: "st", label: "Status", render: (r) => <Badge tone={r.status === "converted" ? "good" : r.status === "abandoned" ? "warn" : "neutral"}>{r.recovered ? "recovered" : r.status}</Badge> },
  ];

  const pairName = (a: number, b: number) => `${info.get(a)?.name ?? `#${a}`}  +  ${info.get(b)?.name ?? `#${b}`}`;

  return (
    <>
      <PageHeader title="Carts" description="Cart behaviour from first-party observation. Abandoned = at least one item, no order, and 30+ minutes without activity. Values are historical observed prices; Odoo remains the source of truth for products and orders." />
      <div className="space-y-5">
        <section aria-label="Cart metrics" className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <MetricCard label="Carts created" value={fmtNumber(summary.data?.created)} help="Carts first created in this period that had items (or later converted)." />
          <MetricCard label="Active carts" value={fmtNumber(k?.active)} help="Carts with items touched in the last 30 minutes." />
          <MetricCard label="Abandoned" value={fmtNumber(k?.abandoned)} help="Carts last touched in this period that meet the abandonment rule." />
          <MetricCard label="Converted" value={fmtNumber(k?.converted)} help="Carts that became a real order." sub={k ? `${fmtNumber(k.recovered)} recovered after going quiet` : undefined} />
          <MetricCard label="Abandonment rate" value={k ? fmtPercent(k.abandoned, k.abandoned + k.converted) : "—"} help="Abandoned ÷ (abandoned + converted) among carts last touched in this period. Carts still active are excluded." />
          <MetricCard label="Avg cart value" value={fmtMoney(k?.avg_cart_value)} help="Average observed value of carts touched in this period." sub={k ? `${fmtNumber(k.avg_items)} items avg` : undefined} />
          <MetricCard label="Abandoned value" value={fmtMoney(k?.abandoned_value)} help="Sum of observed value in abandoned carts. It is NOT revenue." sub={k ? `${fmtMoney(k.avg_abandoned_value)} avg` : undefined} />
        </section>

        <div className="grid lg:grid-cols-3 gap-5">
          <Panel title="Abandonment over time" subtitle="Carts per day by last activity (IST)" className="lg:col-span-2">
            <Async state={summary} empty={(d) => d.daily.length === 0} rows={4}>
              {(d) => (
                <div style={{ height: 240 }} role="img" aria-label="Abandoned and converted carts per day">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.daily} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="#e3e7e8" vertical={false} />
                      <XAxis dataKey="day" tickFormatter={(d: string) => formatBucket(`${d}T00:00:00`, "day")} tick={{ fill: "#56707c", fontSize: 11 }} axisLine={{ stroke: "#e3e7e8" }} tickLine={false} minTickGap={24} />
                      <YAxis allowDecimals={false} width={32} tick={{ fill: "#56707c", fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: "Carts", angle: -90, position: "insideLeft", fill: "#56707c", fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="abandoned" name="Abandoned" fill={SERIES_COLORS[1]} radius={[2, 2, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                      <Bar dataKey="converted" name="Converted" fill={SERIES_COLORS[0]} radius={[2, 2, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Async>
            <ul className="flex gap-4 mt-2 text-[12px]" aria-label="Legend"><li className="flex items-center gap-1.5"><span className="w-3 h-3 inline-block" style={{ background: SERIES_COLORS[1] }} />Abandoned</li><li className="flex items-center gap-1.5"><span className="w-3 h-3 inline-block" style={{ background: SERIES_COLORS[0] }} />Converted</li></ul>
          </Panel>
          <Panel title="How long ago" subtitle="Abandoned carts by time since last activity">
            <Async state={summary} rows={4}>{() => k && <RankedBars rows={[
              { label: "30 min – 6 h", value: k.age_30m_6h }, { label: "6 – 24 h", value: k.age_6h_24h }, { label: "1 – 3 days", value: k.age_1d_3d }, { label: "3+ days", value: k.age_3d_plus }]} />}</Async>
            {k && k.abandoned > 0 && <p className="text-[12px] text-steel-500 mt-3">{fmtPercent(k.abandoned_after_checkout, k.abandoned, 0)} of abandoned carts had already reached checkout.</p>}
          </Panel>
        </div>

        <Panel title="Carts" subtitle={list.data ? `${list.data.total} matching · click a row for the full journey` : undefined}
          actions={<Segmented label="Show" value={status} onChange={setStatus} options={[{ value: "abandoned", label: "Abandoned" }, { value: "recovered", label: "Recovered" }, { value: "all", label: "All" }]} />}>
          <Async state={list} empty={(d) => d.rows.length === 0} rows={5}>
            {(d) => <DataTable caption="Carts" columns={columns} rows={d.rows} rowKey={(r) => r.cart_id} defaultSort={{ key: "last", dir: "desc" }} onRowClick={(r) => setCartId(r.cart_id)} pageSize={15} />}
          </Async>
        </Panel>

        <div className="grid lg:grid-cols-2 gap-5">
          <Panel title="Frequently carted together" subtitle={`Pairs sharing a cart in at least ${pairs.data?.min_support ?? 2} carts`}
            help="Co-occurrence in carts (created in this period). It says what people put together, not what they bought.">
            <Async state={pairs} empty={(d) => d.carted_together.length === 0} rows={4}>
              {(d) => <RankedBars rows={d.carted_together.map((p) => ({ label: pairName(p.a, p.b), value: p.carts }))} format={(n) => `${n} carts`} />}
            </Async>
          </Panel>
          <Panel title="Frequently purchased together" subtitle="From completed orders only" help="Built from real order lines recorded after Odoo confirmed the order — separate from carted-together.">
            <Async state={pairs} empty={(d) => d.purchased_together.length === 0} rows={4}>
              {(d) => <RankedBars rows={d.purchased_together.map((p) => ({ label: pairName(p.a, p.b), value: p.orders }))} format={(n) => `${n} orders`} />}
            </Async>
          </Panel>
        </div>
        <p className="text-[12px] text-steel-500">Period: {range.label}. Recovery: a cart counts as “recovered” when it had gone quiet for 30+ minutes and was later touched again or converted; email/WhatsApp recovery campaigns are not part of this phase.</p>
      </div>
      {info.loading && <span className="sr-only">Resolving product names</span>}
      <CartDetailDrawer cartId={cartId} onClose={() => setCartId(null)} onSession={(s) => { setCartId(null); setSessionId(s); }} />
      <SessionJourneyDrawer sessionId={sessionId} onClose={() => setSessionId(null)} onCustomer={(u) => { setSessionId(null); setCustomerId(u); }} />
      <CustomerJourneyDrawer userId={customerId} onClose={() => setCustomerId(null)} onSession={(s) => { setCustomerId(null); setSessionId(s); }} />
    </>
  );
}
