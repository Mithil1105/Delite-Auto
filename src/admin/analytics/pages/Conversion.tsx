import { useState } from "react";
import type { Audience, Funnel, Overview, SegmentRow } from "../api";
import { useAnalyticsFilters } from "../filters";
import { usePeriodArgs, usePrevPeriodArgs, useRpc } from "../hooks";
import { PageHeader } from "../AnalyticsShell";
import { Async, MetricCard, Panel, Segmented } from "../ui";
import { FunnelBars, RankedBars } from "../charts";
import { DataTable, type Column } from "../DataTable";
import { fmtMoney, fmtNumber, fmtPercent, ratio } from "../format";

export default function Conversion() {
  const { prevRange } = useAnalyticsFilters();
  const [unit, setUnit] = useState<"sessions" | "visitors">("sessions");
  const period = usePeriodArgs();
  const funnel = useRpc<Funnel>("admin_analytics_funnel", period);
  const overview = useRpc<Overview>("admin_analytics_overview", period);
  const prev = useRpc<Overview>("admin_analytics_overview", usePrevPeriodArgs()).data;
  const devices = useRpc<SegmentRow[]>("admin_analytics_devices", usePeriodArgs({ p_group: "device" }));
  const audience = useRpc<Audience>("admin_analytics_audience", period);
  const o = overview.data;
  const cmp = prevRange ? prevRange.label : "";
  const perSession = (d: Overview | null | undefined) => (d ? ratio(d.revenue, d.sessions) : null);
  const perVisitor = (d: Overview | null | undefined) => (d ? ratio(d.revenue, d.unique_visitors) : null);
  const conv = (d: Overview | null | undefined) => (d ? ratio(d.purchase_sessions, d.sessions) : null);

  const deviceCols: Column<SegmentRow>[] = [
    { key: "label", label: "Device", render: (r) => <span className="capitalize font-medium">{r.label}</span>, sort: (r) => r.label },
    { key: "sessions", label: "Sessions", align: "right", render: (r) => fmtNumber(r.sessions), sort: (r) => r.sessions },
    { key: "atc", label: "Add-to-cart rate", align: "right", render: (r) => fmtPercent(r.add_sessions, r.sessions), sort: (r) => (r.sessions ? r.add_sessions / r.sessions : 0) },
    { key: "co", label: "Checkout rate", align: "right", render: (r) => fmtPercent(r.checkout_sessions, r.sessions), sort: (r) => (r.sessions ? r.checkout_sessions / r.sessions : 0) },
    { key: "conv", label: "Conversion", align: "right", render: (r) => fmtPercent(r.purchase_sessions, r.sessions, 2), sort: (r) => (r.sessions ? r.purchase_sessions / r.sessions : 0) },
    { key: "rev", label: "Revenue", align: "right", render: (r) => fmtMoney(r.revenue), sort: (r) => Number(r.revenue) },
  ];

  return (
    <>
      <PageHeader title="Conversion" description="How far visitors get from arriving to ordering. Every step counts distinct sessions or visitors — event counts are never mixed in." />
      <div className="space-y-5">
        <section aria-label="Conversion metrics" className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Conversion rate" value={o ? fmtPercent(o.purchase_sessions, o.sessions, 2) : "—"} current={conv(o) ?? undefined} previous={prevRange ? conv(prev) : undefined} compareLabel={cmp} help="Sessions with an order ÷ all sessions." />
          <MetricCard label="Revenue / session" value={perSession(o) !== null ? fmtMoney(perSession(o)) : "—"} current={perSession(o) ?? undefined} previous={prevRange ? perSession(prev) : undefined} compareLabel={cmp} help="Order revenue ÷ sessions." />
          <MetricCard label="Revenue / visitor" value={perVisitor(o) !== null ? fmtMoney(perVisitor(o)) : "—"} current={perVisitor(o) ?? undefined} previous={prevRange ? perVisitor(prev) : undefined} compareLabel={cmp} help="Order revenue ÷ unique visitors." />
          <MetricCard label="Cart removal rate" value={o ? fmtPercent(o.removes, o.add_to_carts) : "—"} help="Remove-from-cart actions ÷ add-to-cart actions." />
          <MetricCard label="Cart → checkout" value={o ? fmtPercent(o.checkout_sessions, o.add_sessions) : "—"} help="Sessions that started checkout ÷ sessions that added to cart." />
          <MetricCard label="Checkout → order" value={o ? fmtPercent(o.purchase_sessions, o.checkout_sessions) : "—"} help="Sessions with an order ÷ sessions that started checkout. The complement is checkout abandonment." />
          <MetricCard label="Wishlist → cart" value={o ? fmtPercent(o.add_sessions, o.wishlist_sessions) : "—"} help="Rough indicator only: sessions that added to cart ÷ sessions that saved to a wishlist (the two aren't linked per product)." />
          <MetricCard label="Avg order value" value={o?.orders ? fmtMoney(o.revenue / o.orders) : "—"} help="Revenue ÷ orders." />
        </section>

        <Panel title="Conversion funnel" subtitle={`Distinct ${unit} reaching each step`} actions={<Segmented label="Count" value={unit} onChange={setUnit} options={[{ value: "sessions", label: "Sessions" }, { value: "visitors", label: "Visitors" }]} />}
          help="Sessions → product viewers → add to cart → cart viewers → checkout starters → purchasers. Steps are not forced to be strictly sequential (someone can reach the cart without a tracked add).">
          <Async state={funnel} empty={(d) => d.steps[0].sessions === 0} rows={6}>{(d) => <FunnelBars steps={d.steps.map((s) => ({ label: s.label, value: s[unit] }))} />}</Async>
        </Panel>

        <div className="grid lg:grid-cols-2 gap-5">
          <Panel title="Checkout" subtitle="What happened once customers reached checkout">
            <Async state={funnel} rows={4}>
              {(d) => d.checkout.started === 0 ? <p className="text-[12.5px] text-steel-500">No checkouts started in this period.</p> : (
                <>
                  <RankedBars format={fmtNumber} rows={[
                    { label: "Checkout started", value: d.checkout.started },
                    ...Object.entries(d.checkout.step_views).map(([step, n]) => ({ label: `Step viewed: ${step}`, value: n })),
                    { label: "Order placed (server-confirmed)", value: d.checkout.purchased },
                    { label: "Order failed", value: d.checkout.failed },
                  ]} />
                  <p className="text-[12px] text-steel-500 mt-3">Checkout abandonment: {fmtPercent(d.checkout.started - d.checkout.purchased, d.checkout.started)} of checkouts did not end in an order.</p>
                </>
              )}
            </Async>
          </Panel>
          <Panel title="Logged-in vs anonymous conversion">
            <Async state={audience} empty={(d) => d.segments.anon_sessions + d.segments.user_sessions === 0} rows={3}>
              {(a) => <RankedBars format={fmtNumber} rows={[
                { label: "Anonymous sessions", value: a.segments.anon_sessions, sub: `${fmtPercent(a.segments.anon_purchase_sessions, a.segments.anon_sessions, 2)} converted` },
                { label: "Logged-in sessions", value: a.segments.user_sessions, sub: `${fmtPercent(a.segments.user_purchase_sessions, a.segments.user_sessions, 2)} converted` }]} />}
            </Async>
          </Panel>
        </div>

        <Panel title="Conversion by device" subtitle="Where the mobile experience may be losing shoppers">
          <Async state={devices} empty={(d) => d.length === 0} rows={3}>{(d) => <DataTable columns={deviceCols} rows={d} rowKey={(r) => r.label} defaultSort={{ key: "sessions", dir: "desc" }} />}</Async>
        </Panel>
      </div>
    </>
  );
}
