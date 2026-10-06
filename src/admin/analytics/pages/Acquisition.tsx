import { useState } from "react";
import type { SegmentRow } from "../api";
import { useAnalyticsFilters } from "../filters";
import { usePeriodArgs, useRpc } from "../hooks";
import { PageHeader } from "../AnalyticsShell";
import { Async, KeyValue, Panel, Segmented } from "../ui";
import { FunnelBars } from "../charts";
import { DataTable, type Column } from "../DataTable";
import { fmtDuration, fmtMoney, fmtNumber, fmtPercent } from "../format";

type Group = "channel" | "source_medium" | "campaign" | "referrer";
const LABELS: Record<Group, string> = { channel: "Channel", source_medium: "Source / medium", campaign: "Campaign", referrer: "Referrer" };

export default function Acquisition() {
  const { setFilters } = useAnalyticsFilters();
  const [group, setGroup] = useState<Group>("channel");
  const [selected, setSelected] = useState<SegmentRow | null>(null);
  const state = useRpc<SegmentRow[]>("admin_analytics_sources", usePeriodArgs({ p_group: group, p_limit: 200 }));

  const columns: Column<SegmentRow>[] = [
    { key: "label", label: LABELS[group], render: (r) => <span className="font-medium">{r.label}</span>, sort: (r) => r.label },
    { key: "sessions", label: "Sessions", align: "right", render: (r) => fmtNumber(r.sessions), sort: (r) => r.sessions },
    { key: "visitors", label: "Visitors", align: "right", render: (r) => fmtNumber(r.visitors), sort: (r) => r.visitors },
    { key: "eng", label: "Avg engaged", align: "right", render: (r) => fmtDuration(r.avg_engaged), sort: (r) => Number(r.avg_engaged) },
    { key: "atc", label: "Add-to-cart", align: "right", render: (r) => fmtPercent(r.add_sessions, r.sessions), sort: (r) => (r.sessions ? r.add_sessions / r.sessions : 0), help: "Sessions that added to cart ÷ sessions." },
    { key: "co", label: "Checkout", align: "right", render: (r) => fmtPercent(r.checkout_sessions, r.sessions), sort: (r) => (r.sessions ? r.checkout_sessions / r.sessions : 0) },
    { key: "orders", label: "Orders", align: "right", render: (r) => fmtNumber(r.orders), sort: (r) => Number(r.orders) },
    { key: "rev", label: "Revenue", align: "right", render: (r) => fmtMoney(r.revenue), sort: (r) => Number(r.revenue) },
    { key: "conv", label: "Conversion", align: "right", render: (r) => fmtPercent(r.purchase_sessions, r.sessions, 2), sort: (r) => (r.sessions ? r.purchase_sessions / r.sessions : 0) },
  ];

  return (
    <>
      <PageHeader title="Acquisition" description="Where sessions come from and which sources actually produce orders. Attribution is the visit's first landing (referrer and UTM), never overwritten by later pages." />
      <Panel title="Sources" subtitle="Click a row to drill in"
        help="Direct = no referrer or UTM. Google Organic / Search = search engines. Campaign = UTM-tagged or paid/email traffic. Instagram, Facebook and WhatsApp are detected from referrer or utm_source."
        actions={<Segmented label="Group by" value={group} onChange={(g) => { setGroup(g); setSelected(null); }} options={(Object.keys(LABELS) as Group[]).map((g) => ({ value: g, label: LABELS[g] }))} />}>
        <Async state={state} empty={(d) => d.length === 0} rows={5}>
          {(d) => (
            <>
              {group === "campaign" && <p className="text-[12px] text-steel-500 mb-3">Campaigns come from the <code>utm_campaign</code> parameter on landing URLs.</p>}
              <DataTable key={group} caption="Acquisition" columns={columns} rows={d} rowKey={(r) => r.label} defaultSort={{ key: "sessions", dir: "desc" }} onRowClick={setSelected} pageSize={20} />
            </>
          )}
        </Async>
      </Panel>
      {selected && (
        <Panel className="mt-5" title={selected.label} subtitle={`${LABELS[group]} drill-down`} actions={
          <div className="flex gap-2">
            {group === "channel" && <button type="button" className="btn-outline !px-3 !py-1.5" onClick={() => setFilters({ source: selected.label })}>Filter all reports to this channel</button>}
            <button type="button" className="btn-ghost !px-3 !py-1.5" onClick={() => setSelected(null)}>Close</button>
          </div>}>
          <div className="grid md:grid-cols-2 gap-6">
            <FunnelBars steps={[
              { label: "Sessions", value: selected.sessions }, { label: "Added to cart", value: selected.add_sessions },
              { label: "Started checkout", value: selected.checkout_sessions }, { label: "Purchased", value: selected.purchase_sessions }]} />
            <KeyValue rows={[
              ["Sessions / visitors", `${fmtNumber(selected.sessions)} / ${fmtNumber(selected.visitors)}`],
              ["Average engaged time", fmtDuration(selected.avg_engaged)],
              ["Orders", fmtNumber(selected.orders)], ["Revenue", fmtMoney(selected.revenue)],
              ["Revenue per session", selected.sessions ? fmtMoney(Number(selected.revenue) / selected.sessions) : "—"],
              ...(selected.utm_source ? [["utm_source", selected.utm_source] as [string, string]] : []),
              ...(selected.utm_medium ? [["utm_medium", selected.utm_medium] as [string, string]] : []),
            ]} />
          </div>
        </Panel>
      )}
    </>
  );
}
