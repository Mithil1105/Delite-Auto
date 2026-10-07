import { useState } from "react";
import type { LandingExit, PageRow } from "../api";
import { usePeriodArgs, useRpc } from "../hooks";
import { PageHeader } from "../AnalyticsShell";
import { Async, Panel, Segmented } from "../ui";
import { DataTable, type Column } from "../DataTable";
import { fmtDuration, fmtMoney, fmtNumber, fmtPercent } from "../format";
import { PageDetailDrawer } from "../drawers";

type Tab = "pages" | "landing" | "exit";

export default function Pages() {
  const [tab, setTab] = useState<Tab>("pages");
  const [path, setPath] = useState<string | null>(null);
  const pages = useRpc<PageRow[]>("admin_analytics_pages", usePeriodArgs({ p_limit: 300 }));
  const landing = useRpc<LandingExit>("admin_analytics_landing_exit", usePeriodArgs({ p_limit: 100 }));

  const pageCols: Column<PageRow>[] = [
    { key: "path", label: "Page", render: (r) => <span className="font-mono text-[12.5px]">{r.path}</span>, sort: (r) => r.path },
    { key: "views", label: "Views", align: "right", render: (r) => fmtNumber(r.views), sort: (r) => r.views, help: "Every recorded view of the page (not unique)." },
    { key: "uv", label: "Unique visitors", align: "right", render: (r) => fmtNumber(r.unique_visitors), sort: (r) => r.unique_visitors },
    { key: "avg", label: "Avg engaged", align: "right", render: (r) => fmtDuration(r.avg_engaged), sort: (r) => Number(r.avg_engaged), help: "Active, visible time on the page." },
    { key: "med", label: "Median engaged", align: "right", render: (r) => fmtDuration(r.median_engaged), sort: (r) => Number(r.median_engaged) },
    { key: "scroll", label: "Avg scroll", align: "right", render: (r) => `${r.avg_scroll ?? 0}%`, sort: (r) => Number(r.avg_scroll) },
    { key: "ent", label: "Entrances", align: "right", render: (r) => fmtNumber(r.entrances), sort: (r) => r.entrances, help: "Sessions that began on this page." },
    { key: "exit", label: "Exits", align: "right", render: (r) => fmtNumber(r.exits), sort: (r) => r.exits, help: "Sessions whose last recorded page was this one. Not every exit is bad." },
    { key: "rate", label: "Exit rate", align: "right", render: (r) => fmtPercent(r.exits, r.views), sort: (r) => (r.views ? r.exits / r.views : 0) },
    { key: "atc", label: "Add-to-carts here", align: "right", render: (r) => fmtNumber(r.add_to_carts), sort: (r) => r.add_to_carts, help: "Add-to-cart actions taken while on this page." },
  ];

  return (
    <>
      <PageHeader title="Pages" description="Which pages get traffic, how long people stay, how far they scroll, and where sessions end. Click a page for its detail." />
      <Panel title={tab === "pages" ? "Page performance" : tab === "landing" ? "Landing pages" : "Exit pages"}
        actions={<Segmented label="Report" value={tab} onChange={setTab} options={[{ value: "pages", label: "Pages" }, { value: "landing", label: "Landing" }, { value: "exit", label: "Exit" }]} />}>
        {tab === "pages" && (
          <Async state={pages} empty={(d) => d.length === 0} rows={6}>
            {(d) => <DataTable caption="Page performance" columns={pageCols} rows={d} rowKey={(r) => r.path} defaultSort={{ key: "views", dir: "desc" }} onRowClick={(r) => setPath(r.path)} pageSize={20} />}
          </Async>
        )}
        {tab === "landing" && (
          <Async state={landing} empty={(d) => d.landing.length === 0} rows={6}>
            {(d) => (
              <>
                <p className="text-[12px] text-steel-500 mb-3">Low-engagement (bounce) = one page view, under 10 s active, no tracked interaction. Purchase rate is sessions that ended in an order.</p>
                <DataTable caption="Landing pages" rowKey={(r) => r.path} rows={d.landing} defaultSort={{ key: "sessions", dir: "desc" }} onRowClick={(r) => setPath(r.path)} columns={[
                  { key: "path", label: "Landing page", render: (r) => <span className="font-mono text-[12.5px]">{r.path}</span>, sort: (r) => r.path },
                  { key: "sessions", label: "Sessions", align: "right", render: (r) => fmtNumber(r.sessions), sort: (r) => r.sessions },
                  { key: "eng", label: "Avg engaged", align: "right", render: (r) => fmtDuration(r.avg_engaged), sort: (r) => Number(r.avg_engaged) },
                  { key: "low", label: "Low-engagement rate", align: "right", render: (r) => fmtPercent(r.low_engagement, r.sessions), sort: (r) => (r.sessions ? r.low_engagement / r.sessions : 0) },
                  { key: "atc", label: "Add-to-cart rate", align: "right", render: (r) => fmtPercent(r.add_sessions, r.sessions), sort: (r) => (r.sessions ? r.add_sessions / r.sessions : 0) },
                  { key: "conv", label: "Conversion", align: "right", render: (r) => fmtPercent(r.purchase_sessions, r.sessions, 2), sort: (r) => (r.sessions ? r.purchase_sessions / r.sessions : 0) },
                  { key: "rev", label: "Revenue", align: "right", render: (r) => fmtMoney(r.revenue), sort: (r) => Number(r.revenue) },
                ] as Column<LandingExit["landing"][number]>[]} />
              </>
            )}
          </Async>
        )}
        {tab === "exit" && (
          <Async state={landing} empty={(d) => d.exits.length === 0} rows={6}>
            {(d) => (
              <>
                <p className="text-[12px] text-steel-500 mb-3">Exiting after a purchase is expected. Cart and checkout exits are the ones worth investigating.</p>
                <DataTable caption="Exit pages" rowKey={(r) => r.path} rows={d.exits} defaultSort={{ key: "exits", dir: "desc" }} onRowClick={(r) => setPath(r.path)} columns={[
                  { key: "path", label: "Exit page", render: (r) => <span className="font-mono text-[12.5px]">{r.path}</span>, sort: (r) => r.path },
                  { key: "exits", label: "Sessions ending here", align: "right", render: (r) => fmtNumber(r.exits), sort: (r) => r.exits },
                  { key: "share", label: "Share of sessions", align: "right", render: (r) => fmtPercent(r.exits, d.total_sessions), sort: (r) => r.exits },
                  { key: "after", label: "…after a purchase", align: "right", render: (r) => fmtNumber(r.after_purchase), sort: (r) => r.after_purchase },
                ] as Column<LandingExit["exits"][number]>[]} />
              </>
            )}
          </Async>
        )}
      </Panel>
      <PageDetailDrawer path={path} onClose={() => setPath(null)} />
    </>
  );
}
