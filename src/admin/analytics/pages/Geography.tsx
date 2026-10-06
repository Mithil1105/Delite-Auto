import { useMemo, useState } from "react";
import type { GeoRow, Health } from "../api";
import { useAnalyticsFilters } from "../filters";
import { usePeriodArgs, useRpc } from "../hooks";
import { PageHeader } from "../AnalyticsShell";
import { Async, Panel, Segmented } from "../ui";
import { RankedBars } from "../charts";
import { DataTable, type Column } from "../DataTable";
import { fmtMoney, fmtNumber, fmtPercent } from "../format";

type Level = "country" | "region" | "city";

/**
 * Coarse geography only (country / state / city) — resolved once per session from the visitor's IP
 * on the server; the IP itself is never stored. Drill down by clicking a country, then a state.
 */
export default function Geography() {
  const { filters, setFilters, rpcFilters } = useAnalyticsFilters();
  const [level, setLevel] = useState<Level>("country");
  const [region, setRegion] = useState("");
  const extra = useMemo(() => ({ p_level: level, p_limit: 200, p_filters: { ...rpcFilters, ...(region ? { region } : {}) } }), [level, rpcFilters, region]);
  const state = useRpc<GeoRow[]>("admin_analytics_geography", usePeriodArgs(extra));
  const health = useRpc<Health>("admin_analytics_health", useMemo(() => ({}), []));

  const columns: Column<GeoRow>[] = [
    { key: "label", label: level === "country" ? "Country" : level === "region" ? "State / region" : "City", sort: (r) => r.label,
      render: (r) => <div><div className="font-medium">{r.label}</div>{r.parent && <div className="text-[11px] text-steel-500">{r.parent}</div>}</div> },
    { key: "visitors", label: "Visitors", align: "right", render: (r) => fmtNumber(r.visitors), sort: (r) => r.visitors },
    { key: "sessions", label: "Sessions", align: "right", render: (r) => fmtNumber(r.sessions), sort: (r) => r.sessions },
    { key: "pv", label: "Page views", align: "right", render: (r) => fmtNumber(r.page_views), sort: (r) => Number(r.page_views) },
    { key: "atc", label: "Sessions with add-to-cart", align: "right", render: (r) => fmtNumber(r.add_sessions), sort: (r) => r.add_sessions },
    { key: "orders", label: "Orders", align: "right", render: (r) => fmtNumber(r.orders), sort: (r) => Number(r.orders) },
    { key: "conv", label: "Conversion", align: "right", render: (r) => fmtPercent(r.purchase_sessions, r.sessions, 2), sort: (r) => (r.sessions ? r.purchase_sessions / r.sessions : 0) },
    { key: "rev", label: "Revenue", align: "right", render: (r) => fmtMoney(r.revenue), sort: (r) => Number(r.revenue) },
  ];

  const drill = (r: GeoRow) => {
    if (r.label === "Unknown") return;
    if (level === "country" && r.country_code) { setFilters({ country: r.country_code }); setLevel("region"); setRegion(""); }
    else if (level === "region") { setRegion(r.label); setLevel("city"); }
  };
  const reset = () => { setFilters({ country: "" }); setRegion(""); setLevel("country"); };
  const pct = health.data?.geo_resolved_pct;

  return (
    <>
      <PageHeader title="Geography" description="Where visitors come from — country, state and city. For India, drill from country into states and cities." />
      <Panel title="Locations" subtitle={[filters.country && `Country: ${filters.country}`, region && `State: ${region}`].filter(Boolean).join(" · ") || "All locations"}
        actions={<div className="flex items-center gap-2">
          {(filters.country || region) && <button type="button" className="btn-ghost !px-3 !py-1.5" onClick={reset}>Reset drill-down</button>}
          <Segmented label="Level" value={level} onChange={(l) => { setLevel(l); if (l === "country") reset(); }} options={[{ value: "country", label: "Country" }, { value: "region", label: "State" }, { value: "city", label: "City" }]} />
        </div>}>
        {pct != null && <p className="text-[12px] text-steel-500 mb-3">Location was resolved for {pct}% of sessions. “Unknown” covers sessions where the lookup wasn't available (e.g. blocked or private networks).</p>}
        <Async state={state} empty={(d) => d.length === 0} rows={5}>
          {(d) => (
            <div className="space-y-5">
              <RankedBars rows={d.slice(0, 10).map((r) => ({ label: r.label, sub: r.parent || undefined, value: r.sessions, onClick: level !== "city" && r.label !== "Unknown" ? () => drill(r) : undefined }))} format={(n) => `${fmtNumber(n)} sessions`} />
              <DataTable caption="Locations" columns={columns} rows={d} rowKey={(r) => `${r.parent}|${r.label}`} defaultSort={{ key: "sessions", dir: "desc" }} onRowClick={level !== "city" ? drill : undefined} pageSize={15} />
            </div>
          )}
        </Async>
      </Panel>
    </>
  );
}
