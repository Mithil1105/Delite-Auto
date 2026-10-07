import { useMemo, useState } from "react";
import type { RecRow } from "../api";
import { usePeriodArgs, useProductInfo, useRpc } from "../hooks";
import { PageHeader } from "../AnalyticsShell";
import { Async, MetricCard, Panel, Segmented } from "../ui";
import { DataTable, type Column } from "../DataTable";
import { fmtNumber, fmtPercent } from "../format";
import { ProductCell } from "../cells";
import { ProductDetailDrawer } from "../drawers";

type Group = "surface" | "strategy" | "product";
const SURFACE_LABELS: Record<string, string> = {
  product_detail: "Product page — “You might also like”", cart_drawer: "Cart drawer — “You might also need”",
  home_trending: "Home — Trending", home_featured: "Home — Featured / Popular", home_new_arrivals: "Home — New arrivals",
};

export default function Recommendations() {
  const [group, setGroup] = useState<Group>("surface");
  const [selected, setSelected] = useState<number | null>(null);
  const totals = useRpc<RecRow[]>("admin_analytics_recommendations", usePeriodArgs({ p_group: "surface" }));
  const state = useRpc<RecRow[]>("admin_analytics_recommendations", usePeriodArgs({ p_group: group, p_limit: 200 }));
  const info = useProductInfo(useMemo(() => (group === "product" ? (state.data ?? []).map((r) => Number(r.label)) : []), [group, state.data]));
  const sum = (key: "impressions" | "clicks" | "adds") => (totals.data ?? []).reduce((n, r) => n + Number(r[key]), 0);

  const columns: Column<RecRow>[] = [
    { key: "label", label: group === "surface" ? "Surface" : group === "strategy" ? "Strategy" : "Product",
      render: (r) => group === "product" ? <ProductCell id={Number(r.label)} info={info} /> : <span className="font-medium">{group === "surface" ? SURFACE_LABELS[r.label] ?? r.label : r.label}</span>,
      sort: (r) => (group === "product" ? info.get(Number(r.label))?.name ?? r.label : r.label) },
    { key: "impr", label: "Impressions", align: "right", render: (r) => fmtNumber(r.impressions), sort: (r) => r.impressions, help: "Times the rail was shown on screen (once per product per page view)." },
    { key: "clicks", label: "Clicks", align: "right", render: (r) => fmtNumber(r.clicks), sort: (r) => r.clicks },
    { key: "ctr", label: "CTR", align: "right", render: (r) => fmtPercent(r.clicks, r.impressions), sort: (r) => (r.impressions ? r.clicks / r.impressions : 0), help: "Clicks ÷ impressions." },
    { key: "adds", label: "Adds", align: "right", render: (r) => fmtNumber(r.adds), sort: (r) => r.adds },
    { key: "addrate", label: "Add rate", align: "right", render: (r) => fmtPercent(r.adds, r.impressions), sort: (r) => (r.impressions ? r.adds / r.impressions : 0), help: "Add-to-carts made from the placement ÷ impressions." },
  ];

  return (
    <>
      <PageHeader title="Recommendations" description="Which recommendation placements are seen, clicked and added to cart. Surfaces: product page, cart drawer, and the curated homepage rails." />
      <div className="space-y-5">
        <section aria-label="Recommendation totals" className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Impressions" value={fmtNumber(sum("impressions"))} help="Recommendation products shown on screen." />
          <MetricCard label="Clicks" value={fmtNumber(sum("clicks"))} help="Clicks on a recommended product." sub={`${fmtPercent(sum("clicks"), sum("impressions"))} CTR`} />
          <MetricCard label="Adds to cart" value={fmtNumber(sum("adds"))} help="Add-to-carts made from a recommendation placement." sub={`${fmtPercent(sum("adds"), sum("impressions"))} add rate`} />
        </section>
        <Panel title="Placement performance" actions={<Segmented label="Group by" value={group} onChange={setGroup} options={[{ value: "surface", label: "Surface" }, { value: "strategy", label: "Strategy" }, { value: "product", label: "Product" }]} />}>
          <Async state={state} empty={(d) => d.length === 0} rows={4}>
            {(d) => <DataTable key={group} caption="Recommendation performance" columns={columns} rows={d} rowKey={(r) => r.label} defaultSort={{ key: "impr", dir: "desc" }} onRowClick={group === "product" ? (r) => setSelected(Number(r.label)) : undefined} pageSize={20} />}
          </Async>
        </Panel>
      </div>
      <ProductDetailDrawer templateId={selected} onClose={() => setSelected(null)} />
    </>
  );
}
