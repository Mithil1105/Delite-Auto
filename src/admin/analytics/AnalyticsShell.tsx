import { useMemo, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { AnalyticsFilterProvider, useAnalyticsFilters } from "./filters";
import { describeRange, PRESET_LABELS, type CompareMode, type RangePreset } from "./dateRange";
import { usePeriodArgs, useRpc } from "./hooks";
import type { GeoRow, Health } from "./api";
import { InfoTip } from "./ui";
import { useAuth } from "../../context/AuthContext";

const selectClass = "h-9 border border-line bg-white px-2.5 text-[12.5px] focus:outline-none focus:border-ink";

function FilterBar() {
  const { filters, setFilters, range, prevRange, refresh } = useAnalyticsFilters();
  const period = usePeriodArgs({ p_level: "country", p_limit: 40 });
  // Country options come from what was actually observed in this period (not a hardcoded list).
  const countries = useRpc<GeoRow[]>("admin_analytics_geography", useMemo(() => ({ ...period, p_filters: { ...(period.p_filters as object), country: undefined } }), [period]));
  const health = useRpc<Health>("admin_analytics_health", useMemo(() => ({}), []));

  return (
    <div className="card-surface p-3.5 mb-5" data-testid="analytics-filters">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="text-[11px] uppercase tracking-wide text-steel-500">
          Date range
          <select aria-label="Date range" className={`${selectClass} block mt-1`} value={filters.preset} onChange={(e) => setFilters({ preset: e.target.value as RangePreset })}>
            {(Object.keys(PRESET_LABELS) as RangePreset[]).map((p) => <option key={p} value={p}>{PRESET_LABELS[p]}</option>)}
          </select>
        </label>
        {filters.preset === "custom" && (
          <div className="flex items-end gap-2">
            <label className="text-[11px] uppercase tracking-wide text-steel-500">From<input type="date" aria-label="From date" className={`${selectClass} block mt-1`} value={filters.from} onChange={(e) => setFilters({ from: e.target.value })} /></label>
            <label className="text-[11px] uppercase tracking-wide text-steel-500">To<input type="date" aria-label="To date" className={`${selectClass} block mt-1`} value={filters.to} onChange={(e) => setFilters({ to: e.target.value })} /></label>
          </div>
        )}
        <label className="text-[11px] uppercase tracking-wide text-steel-500">
          Compare
          <select aria-label="Compare" className={`${selectClass} block mt-1`} value={filters.compare} onChange={(e) => setFilters({ compare: e.target.value as CompareMode })}>
            <option value="previous">Previous period</option><option value="year">Same period last year</option><option value="off">Off</option>
          </select>
        </label>
        <label className="text-[11px] uppercase tracking-wide text-steel-500">
          Traffic
          <select aria-label="Traffic type" className={`${selectClass} block mt-1`} value={filters.audience} onChange={(e) => setFilters({ audience: e.target.value as typeof filters.audience })}>
            <option value="all">All traffic</option><option value="logged_in">Logged-in</option><option value="anonymous">Anonymous</option>
          </select>
        </label>
        <label className="text-[11px] uppercase tracking-wide text-steel-500">
          Device
          <select aria-label="Device" className={`${selectClass} block mt-1`} value={filters.device} onChange={(e) => setFilters({ device: e.target.value })}>
            <option value="">All devices</option><option value="mobile">Mobile</option><option value="desktop">Desktop</option><option value="tablet">Tablet</option>
          </select>
        </label>
        <label className="text-[11px] uppercase tracking-wide text-steel-500">
          Country
          <select aria-label="Country" className={`${selectClass} block mt-1`} value={filters.country} onChange={(e) => setFilters({ country: e.target.value })}>
            <option value="">All countries</option>
            {(countries.data ?? []).filter((c) => c.country_code).map((c) => <option key={c.label} value={c.country_code ?? ""}>{c.label}</option>)}
          </select>
        </label>
        <label className="text-[11px] uppercase tracking-wide text-steel-500">
          Source
          <select aria-label="Traffic source" className={`${selectClass} block mt-1`} value={filters.source} onChange={(e) => setFilters({ source: e.target.value })}>
            <option value="">All sources</option>
            {["Direct", "Google Organic", "Search", "Instagram", "Facebook", "WhatsApp", "Referral", "Campaign", "Other"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-4 pb-1.5">
          <label className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={filters.includeInternal} onChange={(e) => setFilters({ includeInternal: e.target.checked })} />Include internal
            <InfoTip text="Sessions from signed-in staff (any admin role) and visitors you've marked as internal are excluded by default." /></label>
          <label className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={filters.includeTest} onChange={(e) => setFilters({ includeTest: e.target.checked })} />Include test data
            <InfoTip text="Automated-test and developer traffic is stored separately and excluded by default. Turn on only to verify the collection pipeline." /></label>
        </div>
        <button type="button" onClick={refresh} className="btn-outline !px-3 !py-2 ml-auto flex items-center gap-1.5" aria-label="Refresh data"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
      </div>
      <p className="text-[12px] text-steel-500 mt-3" data-testid="range-summary">
        Showing {describeRange(range)} (IST){prevRange ? ` · compared with ${describeRange(prevRange)}` : ""}
        {health.data?.first_tracked_at ? ` · Analytics collecting since ${new Date(health.data.first_tracked_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}` : health.data ? " · No live traffic has been collected yet" : ""}
        {health.data?.test_sessions ? (filters.includeTest ? ` · including ${health.data.test_sessions} test session(s)` : ` · ${health.data.test_sessions} test session(s) hidden`) : ""}
      </p>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-brand-500">Delite analytics</p>
        <h1 className="font-display text-[28px] leading-tight mt-0.5">{title}</h1>
        <p className="text-[12.5px] text-steel-500 mt-1 max-w-3xl">{description}</p>
      </div>
      {actions}
    </div>
  );
}

/** Wraps every /admin/analytics/* page: shared, URL-synced filters + the filter bar. */
export function AnalyticsShell() {
  const { adminRole } = useAuth();
  // Roles that can read any analytics report; anyone else just gets the route-level denial below.
  const canRead = adminRole === "owner" || adminRole === "admin" || adminRole === "analytics" || adminRole === "support";
  return (
    <AnalyticsFilterProvider>
      <div className="p-5 lg:p-8 max-w-[1500px] mx-auto">
        {canRead && <FilterBar />}
        <Outlet />
      </div>
    </AnalyticsFilterProvider>
  );
}
