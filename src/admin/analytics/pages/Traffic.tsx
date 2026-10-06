import { useMemo, useState } from "react";
import type { Audience, Overview, RecentSession, SegmentRow, SeriesPoint } from "../api";
import { useAnalyticsFilters } from "../filters";
import { usePeriodArgs, usePrevPeriodArgs, useRpc } from "../hooks";
import { PageHeader } from "../AnalyticsShell";
import { Async, Badge, MetricCard, Panel, Segmented } from "../ui";
import { RankedBars, TrendChart } from "../charts";
import { DataTable, type Column } from "../DataTable";
import { fmtDuration, fmtMoney, fmtNumber, fmtPercent, fmtSince } from "../format";
import { IdentityLabel, LocationText } from "../cells";
import { CustomerJourneyDrawer, SessionJourneyDrawer } from "../drawers";

export default function Traffic() {
  const { range, prevRange, rpcFilters } = useAnalyticsFilters();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [deviceGroup, setDeviceGroup] = useState<"device" | "browser" | "os">("device");

  const period = usePeriodArgs();
  const prevArgs = usePrevPeriodArgs();
  const o = useRpc<Overview>("admin_analytics_overview", period).data;
  const p = useRpc<Overview>("admin_analytics_overview", prevArgs).data;
  const series = useRpc<SeriesPoint[]>("admin_analytics_timeseries", usePeriodArgs({ p_bucket: range.bucket }));
  const audience = useRpc<Audience>("admin_analytics_audience", period);
  const devices = useRpc<SegmentRow[]>("admin_analytics_devices", usePeriodArgs({ p_group: deviceGroup }));
  const recentArgs = useMemo(() => ({ p_minutes: 120, p_filters: rpcFilters, p_limit: 50 }), [rpcFilters]);
  const recent = useRpc<RecentSession[]>("admin_analytics_recent_activity", recentArgs);
  const cmp = prevRange ? prevRange.label : "";
  const seg = audience.data?.segments;

  const columns: Column<RecentSession>[] = [
    { key: "who", label: "Visitor", render: (r) => <IdentityLabel identity={r.identity} />, sort: (r) => r.identity.kind },
    { key: "last", label: "Last activity", render: (r) => fmtSince((Date.now() - new Date(r.last_activity_at).getTime()) / 60000), sort: (r) => new Date(r.last_activity_at).getTime() },
    { key: "page", label: "Last page", render: (r) => <span className="font-mono text-[12px]">{r.last_path ?? "—"}</span> },
    { key: "loc", label: "Location", render: (r) => <LocationText country={r.country_name} region={r.region} city={r.city} /> },
    { key: "dev", label: "Device", render: (r) => r.device_type ?? "?", sort: (r) => r.device_type ?? "" },
    { key: "src", label: "Source", render: (r) => r.source_channel, sort: (r) => r.source_channel },
    { key: "pages", label: "Pages", align: "right", render: (r) => r.page_view_count, sort: (r) => r.page_view_count },
    { key: "eng", label: "Engaged", align: "right", render: (r) => fmtDuration(r.engaged_seconds), sort: (r) => Number(r.engaged_seconds) },
    { key: "cart", label: "Cart", align: "right", render: (r) => (r.cart_value ? fmtMoney(r.cart_value) : "—"), sort: (r) => r.cart_value ?? 0 },
    { key: "t", label: "", render: (r) => (r.is_test ? <Badge tone="warn">test</Badge> : null) },
  ];

  const deviceCols: Column<SegmentRow>[] = [
    { key: "label", label: deviceGroup === "device" ? "Device" : deviceGroup === "browser" ? "Browser" : "OS", render: (r) => <span className="capitalize font-medium">{r.label}</span>, sort: (r) => r.label },
    { key: "visitors", label: "Visitors", align: "right", render: (r) => fmtNumber(r.visitors), sort: (r) => r.visitors },
    { key: "sessions", label: "Sessions", align: "right", render: (r) => fmtNumber(r.sessions), sort: (r) => r.sessions },
    { key: "eng", label: "Avg engaged", align: "right", render: (r) => fmtDuration(r.avg_engaged), sort: (r) => Number(r.avg_engaged) },
    { key: "conv", label: "Conversion", align: "right", render: (r) => fmtPercent(r.purchase_sessions, r.sessions, 2), sort: (r) => (r.sessions ? r.purchase_sessions / r.sessions : 0) },
    { key: "rev", label: "Revenue", align: "right", render: (r) => fmtMoney(r.revenue), sort: (r) => Number(r.revenue) },
  ];

  return (
    <>
      <PageHeader title="Traffic" description="Who visits, how they behave once they arrive, and which devices and audiences are worth attention." />
      <div className="space-y-5">
        <section aria-label="Engagement metrics" className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <MetricCard label="Avg engaged / session" value={fmtDuration(o?.avg_engaged_per_session)} current={o?.avg_engaged_per_session} previous={prevRange ? p?.avg_engaged_per_session : undefined} compareLabel={cmp}
            help="Average active, visible time per session. Idle and hidden tabs are excluded, so an open tab left overnight doesn't inflate it." />
          <MetricCard label="Median engaged" value={fmtDuration(o?.median_engaged_per_session)} help="The middle session by engaged time (sessions with any recorded engagement). Less distorted by outliers than the average." />
          <MetricCard label="Avg engaged / visitor" value={fmtDuration(o?.avg_engaged_per_visitor)} help="Total engaged time ÷ unique visitors." />
          <MetricCard label="Pages / session" value={o?.pages_per_session ?? "—"} current={o?.pages_per_session} previous={prevRange ? p?.pages_per_session : undefined} compareLabel={cmp} help="Page views ÷ sessions." />
          <MetricCard label="Time to first product" value={o?.median_secs_to_first_product != null ? fmtDuration(o.median_secs_to_first_product) : "—"} help="Median time from session start to the first product page, among sessions that viewed one." />
          <MetricCard label="Low-engagement rate" value={o ? fmtPercent(o.low_engagement_sessions, o.sessions) : "—"} help="Our bounce definition: exactly one page view, under 10 seconds active, and no tracked interaction (no cart, search, wishlist or click)." />
        </section>

        <Panel title="Traffic trend" subtitle={`Per ${range.bucket}, IST`}>
          <Async state={series} empty={(d) => d.every((x) => x.sessions === 0)} rows={4}>
            {(d) => <TrendChart title="Traffic trend" data={d} bucket={range.bucket} yLabel={`Count per ${range.bucket}`} series={[{ key: "visitors", label: "Unique visitors" }, { key: "sessions", label: "Sessions" }, { key: "page_views", label: "Page views" }]} />}
          </Async>
        </Panel>

        <div className="grid lg:grid-cols-2 gap-5">
          <Panel title="New vs returning" help="A visitor is 'new' if this is their first tracked session; returning means we've seen that browser before (visitor ID only — no fingerprinting).">
            <Async state={audience} empty={(d) => d.segments.new_sessions + d.segments.returning_sessions === 0} rows={3}>
              {() => seg && <RankedBars format={(n) => fmtNumber(n)} rows={[
                { label: "New visitors' sessions", value: seg.new_sessions, sub: `${fmtPercent(seg.new_purchase_sessions, seg.new_sessions, 2)} converted` },
                { label: "Returning visitors' sessions", value: seg.returning_sessions, sub: `${fmtPercent(seg.returning_purchase_sessions, seg.returning_sessions, 2)} converted` }]} />}
            </Async>
          </Panel>
          <Panel title="Logged-in vs anonymous">
            <Async state={audience} empty={(d) => d.segments.anon_sessions + d.segments.user_sessions === 0} rows={3}>
              {() => seg && <RankedBars format={(n) => fmtNumber(n)} rows={[
                { label: "Anonymous sessions", value: seg.anon_sessions, sub: `${fmtPercent(seg.anon_purchase_sessions, seg.anon_sessions, 2)} converted` },
                { label: "Logged-in sessions", value: seg.user_sessions, sub: `${fmtPercent(seg.user_purchase_sessions, seg.user_sessions, 2)} converted` }]} />}
            </Async>
          </Panel>
          <Panel title="Purchase behaviour" subtitle="Only from tracked history — never estimated" className="lg:col-span-2">
            <Async state={audience} rows={2}>
              {(a) => a.purchasers === 0 ? <p className="text-[12.5px] text-steel-500">No purchases in this period yet, so there is nothing to derive lifecycle metrics from.</p> : (
                <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px]">
                  <div><dt className="text-steel-500">Purchasing visitors</dt><dd className="font-display text-[22px]">{a.purchasers}</dd></div>
                  <div><dt className="text-steel-500">Repeat purchasers</dt><dd className="font-display text-[22px]">{a.repeat_purchasers}</dd></div>
                  <div><dt className="text-steel-500">Avg sessions before purchase</dt><dd className="font-display text-[22px]">{a.avg_sessions_to_purchase ?? "—"}</dd></div>
                  <div><dt className="text-steel-500">Avg days to purchase</dt><dd className="font-display text-[22px]">{a.avg_days_to_purchase ?? "—"}</dd></div>
                </dl>
              )}
            </Async>
          </Panel>
        </div>

        <Panel title="Devices" actions={<Segmented label="Group by" value={deviceGroup} onChange={setDeviceGroup} options={[{ value: "device", label: "Device" }, { value: "browser", label: "Browser" }, { value: "os", label: "OS" }]} />}>
          <Async state={devices} empty={(d) => d.length === 0} rows={3}>{(d) => <DataTable columns={deviceCols} rows={d} rowKey={(r) => r.label} defaultSort={{ key: "sessions", dir: "desc" }} />}</Async>
        </Panel>

        <Panel title="Recent sessions" subtitle="Last 2 hours — click a row for the full journey" help="Sessions with any activity in the last two hours. It reflects what the collector has heard, not who is connected right now.">
          <Async state={recent} empty={(d) => d.length === 0} rows={4}>{(d) => <DataTable columns={columns} rows={d} rowKey={(r) => r.session_id} onRowClick={(r) => setSessionId(r.session_id)} defaultSort={{ key: "last", dir: "desc" }} />}</Async>
        </Panel>
      </div>
      <SessionJourneyDrawer sessionId={sessionId} onClose={() => setSessionId(null)} onCustomer={(u) => { setSessionId(null); setCustomerId(u); }} />
      <CustomerJourneyDrawer userId={customerId} onClose={() => setCustomerId(null)} onSession={(s) => { setCustomerId(null); setSessionId(s); }} />
    </>
  );
}
