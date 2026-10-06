import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ProductRow } from "../api";
import { usePeriodArgs, useProductInfo, useRpc } from "../hooks";
import { PageHeader } from "../AnalyticsShell";
import { Async, Panel } from "../ui";
import { DataTable, type Column } from "../DataTable";
import { fmtMoney, fmtNumber, fmtPercent } from "../format";
import { ProductCell } from "../cells";
import { ProductDetailDrawer } from "../drawers";

/** Quick rankings — each just presets the table's sort. */
const RANKS: { key: string; label: string; sort: string }[] = [
  { key: "views", label: "Most viewed", sort: "views" }, { key: "uv", label: "Most unique viewers", sort: "uv" },
  { key: "adds", label: "Most added to cart", sort: "adds" }, { key: "removes", label: "Most removed", sort: "removes" },
  { key: "conv", label: "Highest conversion", sort: "conv" }, { key: "aband", label: "Most abandoned", sort: "aband" },
  { key: "rev", label: "Top revenue", sort: "rev" }, { key: "ctr", label: "Highest recommendation CTR", sort: "ctr" },
];

export default function Products() {
  const [q, setQ] = useState("");
  const [rank, setRank] = useState("views");
  const [selected, setSelected] = useState<number | null>(null);
  const state = useRpc<ProductRow[]>("admin_analytics_products", usePeriodArgs({ p_limit: 500 }));
  const ids = useMemo(() => (state.data ?? []).map((p) => p.odoo_template_id), [state.data]);
  const info = useProductInfo(ids);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (state.data ?? []).filter((r) => !needle || String(r.odoo_template_id).includes(needle) || (info.get(r.odoo_template_id)?.name ?? "").toLowerCase().includes(needle) || (info.get(r.odoo_template_id)?.sku ?? "").toLowerCase().includes(needle));
  }, [state.data, q, info]);

  const columns: Column<ProductRow>[] = [
    { key: "product", label: "Product", render: (r) => <ProductCell id={r.odoo_template_id} info={info} />, sort: (r) => info.get(r.odoo_template_id)?.name ?? String(r.odoo_template_id) },
    { key: "views", label: "Views", align: "right", render: (r) => fmtNumber(r.views), sort: (r) => r.views, help: "Product page views (once per visit to the page)." },
    { key: "uv", label: "Unique viewers", align: "right", render: (r) => fmtNumber(r.unique_viewers), sort: (r) => r.unique_viewers },
    { key: "adds", label: "Adds", align: "right", render: (r) => fmtNumber(r.adds), sort: (r) => r.adds },
    { key: "addrate", label: "Add rate", align: "right", render: (r) => fmtPercent(r.add_sessions, r.view_sessions), sort: (r) => (r.view_sessions ? r.add_sessions / r.view_sessions : 0), help: "Sessions that added the product ÷ sessions that viewed it." },
    { key: "removes", label: "Removes", align: "right", render: (r) => fmtNumber(r.removes), sort: (r) => r.removes },
    { key: "aband", label: "In abandoned carts", align: "right", render: (r) => fmtNumber(r.abandoned_carts), sort: (r) => r.abandoned_carts },
    { key: "orders", label: "Orders", align: "right", render: (r) => fmtNumber(r.orders), sort: (r) => r.orders },
    { key: "conv", label: "View → order", align: "right", render: (r) => fmtPercent(r.orders, r.view_sessions, 2), sort: (r) => (r.view_sessions ? r.orders / r.view_sessions : 0), help: "Orders containing the product ÷ sessions that viewed it." },
    { key: "rev", label: "Revenue", align: "right", render: (r) => fmtMoney(r.revenue), sort: (r) => Number(r.revenue), help: "Observed line value of purchased units (historical)." },
    { key: "ctr", label: "Rec. CTR", align: "right", render: (r) => fmtPercent(r.rec_clicks, r.rec_impressions), sort: (r) => (r.rec_impressions ? r.rec_clicks / r.rec_impressions : 0) },
  ];
  const sortKey = RANKS.find((r) => r.key === rank)?.sort ?? "views";

  return (
    <>
      <PageHeader title="Product performance" description="Every number is keyed by the stable Odoo product id; names and images are resolved live from the current catalog. Click a product for its funnel." />
      <Panel title="Products" subtitle="Rank by a metric, or search by name, SKU or Odoo id"
        actions={<div className="relative"><Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-steel-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" aria-label="Search products" className="h-9 pl-8 pr-2.5 border border-line text-[13px] w-56 focus:outline-none focus:border-ink" /></div>}>
        <div className="flex flex-wrap gap-1.5 mb-4" role="group" aria-label="Rank by">
          {RANKS.map((r) => (
            <button key={r.key} type="button" onClick={() => setRank(r.key)} aria-pressed={rank === r.key}
              className={`px-2.5 py-1 text-[12px] font-semibold border ${rank === r.key ? "bg-ink text-white border-ink" : "border-line text-steel-700 hover:bg-steel-50"}`}>{r.label}</button>
          ))}
        </div>
        <Async state={state} empty={(d) => d.length === 0} rows={6}>
          {() => <DataTable key={sortKey} caption="Product performance" columns={columns} rows={rows} rowKey={(r) => String(r.odoo_template_id)} defaultSort={{ key: sortKey, dir: "desc" }} onRowClick={(r) => setSelected(r.odoo_template_id)} pageSize={20} />}
        </Async>
      </Panel>
      <ProductDetailDrawer templateId={selected} onClose={() => setSelected(null)} />
    </>
  );
}
