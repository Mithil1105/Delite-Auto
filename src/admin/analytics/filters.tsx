import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { comparisonRange, resolveRange, type CompareMode, type DateRange, type RangePreset } from "./dateRange";
import type { RpcFilters } from "./api";

/**
 * Report filters, held in the URL (so a view is shareable/bookmarkable and survives navigating
 * between analytics pages) and turned into RPC arguments in one place.
 */
export interface AnalyticsFilters {
  preset: RangePreset;
  from: string;
  to: string;
  compare: CompareMode;
  audience: RpcFilters["audience"];
  device: string;
  country: string;
  source: string;
  includeInternal: boolean;
  includeTest: boolean;
}

const PRESETS: RangePreset[] = ["today", "yesterday", "7d", "30d", "90d", "custom"];

interface Ctx {
  filters: AnalyticsFilters;
  setFilters: (patch: Partial<AnalyticsFilters>) => void;
  range: DateRange;
  prevRange: DateRange | null;
  rpcFilters: RpcFilters;
  refreshKey: number;
  refresh: () => void;
}
const FilterContext = createContext<Ctx | null>(null);

export function AnalyticsFilterProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  // The "now" the presets resolve against — fixed per refresh so charts don't shift on every render.
  const [anchor, setAnchor] = useState(() => Date.now());
  const [refreshKey, setRefreshKey] = useState(0);

  const rawPreset = params.get("r") as RangePreset | null;
  const filters: AnalyticsFilters = useMemo(
    () => ({
      preset: rawPreset && PRESETS.includes(rawPreset) ? rawPreset : "30d",
      from: params.get("from") ?? "",
      to: params.get("to") ?? "",
      compare: (["off", "previous", "year"] as const).includes(params.get("cmp") as CompareMode) ? (params.get("cmp") as CompareMode) : "previous",
      audience: (["all", "logged_in", "anonymous"] as const).includes(params.get("aud") as RpcFilters["audience"]) ? (params.get("aud") as RpcFilters["audience"]) : "all",
      device: params.get("dev") ?? "",
      country: params.get("cty") ?? "",
      source: params.get("src") ?? "",
      includeInternal: params.get("int") === "1",
      includeTest: params.get("test") === "1",
    }),
    [params, rawPreset]
  );

  const setFilters = useCallback(
    (patch: Partial<AnalyticsFilters>) => {
      const next = { ...filters, ...patch };
      const p = new URLSearchParams(params);
      const put = (key: string, value: string, fallback: string) => (value && value !== fallback ? p.set(key, value) : p.delete(key));
      put("r", next.preset, "30d");
      put("from", next.preset === "custom" ? next.from : "", "");
      put("to", next.preset === "custom" ? next.to : "", "");
      put("cmp", next.compare, "previous");
      put("aud", next.audience, "all");
      put("dev", next.device, "");
      put("cty", next.country, "");
      put("src", next.source, "");
      put("int", next.includeInternal ? "1" : "", "");
      put("test", next.includeTest ? "1" : "", "");
      setParams(p, { replace: true });
    },
    [filters, params, setParams]
  );

  const range = useMemo(() => resolveRange(filters.preset, anchor, { from: filters.from, to: filters.to }), [filters.preset, filters.from, filters.to, anchor]);
  const prevRange = useMemo(() => comparisonRange(range, filters.compare), [range, filters.compare]);
  const rpcFilters: RpcFilters = useMemo(
    () => ({
      audience: filters.audience,
      ...(filters.device ? { device: filters.device } : {}),
      ...(filters.country ? { country: filters.country } : {}),
      ...(filters.source ? { source: filters.source } : {}),
      include_internal: filters.includeInternal,
      include_test: filters.includeTest,
    }),
    [filters]
  );
  const refresh = useCallback(() => {
    setAnchor(Date.now());
    setRefreshKey((k) => k + 1);
  }, []);

  const value = useMemo<Ctx>(() => ({ filters, setFilters, range, prevRange, rpcFilters, refreshKey, refresh }), [filters, setFilters, range, prevRange, rpcFilters, refreshKey, refresh]);
  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useAnalyticsFilters(): Ctx {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useAnalyticsFilters must be used inside AnalyticsFilterProvider");
  return ctx;
}
