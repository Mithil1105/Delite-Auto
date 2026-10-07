import { useState } from "react";
import type { SearchRow, Searches } from "../api";
import { usePeriodArgs, useRpc } from "../hooks";
import { PageHeader } from "../AnalyticsShell";
import { Async, MetricCard, Panel, Segmented } from "../ui";
import { DataTable, type Column } from "../DataTable";
import { fmtNumber, fmtPercent } from "../format";
import { QueryDetailDrawer } from "../drawers";

type View = "top" | "zero" | "opportunity";

export default function Search() {
  const [view, setView] = useState<View>("top");
  const [query, setQuery] = useState<string | null>(null);
  const state = useRpc<Searches>("admin_analytics_searches", usePeriodArgs({ p_limit: 300 }));
  const k = state.data?.kpis;

  const columns: Column<SearchRow>[] = [
    { key: "q", label: "Query", render: (r) => <span className="font-medium">{r.display}</span>, sort: (r) => r.query },
    { key: "n", label: "Searches", align: "right", render: (r) => fmtNumber(r.searches), sort: (r) => r.searches },
    { key: "u", label: "Unique searchers", align: "right", render: (r) => fmtNumber(r.unique_searchers), sort: (r) => r.unique_searchers },
    { key: "zero", label: "Zero results", align: "right", render: (r) => (r.zero_results ? <span className="text-accent-700 font-semibold">{r.zero_results}</span> : 0), sort: (r) => r.zero_results },
    { key: "ctr", label: "Click-through", align: "right", render: (r) => fmtPercent(r.clicks, r.searches), sort: (r) => (r.searches ? r.clicks / r.searches : 0), help: "Searches followed by a click on a result, in the same visit." },
    { key: "add", label: "→ Add to cart", align: "right", render: (r) => fmtPercent(r.adds, r.searches), sort: (r) => (r.searches ? r.adds / r.searches : 0), help: "Searches followed by any add-to-cart later in the same visit." },
    { key: "buy", label: "→ Purchase", align: "right", render: (r) => fmtPercent(r.purchases, r.searches, 2), sort: (r) => (r.searches ? r.purchases / r.searches : 0), help: "Searches followed by an order later in the same visit." },
  ];

  const all = state.data?.queries ?? [];
  const rows = view === "zero" ? all.filter((r) => r.zero_results > 0)
    : view === "opportunity" ? all.filter((r) => r.searches >= 3 && r.adds === 0 && r.zero_results < r.searches)
    : all;

  return (
    <>
      <PageHeader title="Search" description="What shoppers search for, what they can't find, and which searches turn into carts and orders. Queries are grouped case- and spacing-insensitively; sensitive-looking text is never recorded." />
      <div className="space-y-5">
        <section aria-label="Search metrics" className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard label="Total searches" value={fmtNumber(k?.searches)} help="Distinct searches submitted (one per query per visit)." />
          <MetricCard label="Unique searchers" value={fmtNumber(k?.unique_searchers)} help="Distinct visitors who searched." />
          <MetricCard label="Search CTR" value={k ? fmtPercent(k.clicks, k.searches) : "—"} help="Searches with a result click ÷ searches." />
          <MetricCard label="Zero-result rate" value={k ? fmtPercent(k.zero_results, k.searches) : "—"} help="Searches that returned no products ÷ searches." />
          <MetricCard label="Search → add" value={k ? fmtPercent(k.adds, k.searches) : "—"} help="Searches followed by an add-to-cart in the same visit." sub={k ? `${fmtPercent(k.purchases, k.searches, 2)} → purchase` : undefined} />
        </section>
        <Panel title={view === "top" ? "Top queries" : view === "zero" ? "Zero-result queries" : "High search, low conversion"}
          subtitle={view === "opportunity" ? "Searched 3+ times with results, but never led to an add-to-cart" : "Click a query to see what people clicked and added afterwards"}
          actions={<Segmented label="View" value={view} onChange={setView} options={[{ value: "top", label: "Top" }, { value: "zero", label: "Zero results" }, { value: "opportunity", label: "Low conversion" }]} />}>
          <Async state={state} empty={(d) => d.queries.length === 0} rows={5}>
            {() => <DataTable key={view} caption="Search queries" columns={columns} rows={rows} rowKey={(r) => r.query} defaultSort={{ key: view === "zero" ? "zero" : "n", dir: "desc" }} onRowClick={(r) => setQuery(r.query)} pageSize={20}
              empty={<p className="text-[12.5px] text-steel-500 py-6 text-center">Nothing matches this view for the period.</p>} />}
          </Async>
        </Panel>
      </div>
      <QueryDetailDrawer query={query} onClose={() => setQuery(null)} />
    </>
  );
}
