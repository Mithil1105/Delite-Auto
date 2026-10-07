import { useEffect, useMemo, useRef, useState } from "react";
import { analyticsRpc } from "./api";
import { useAnalyticsFilters } from "./filters";
import { catalogService } from "../../services/catalog/catalogService";

export interface RpcState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads one analytics RPC. Re-runs when the function, its arguments or the global refresh key
 * change; a stale response never overwrites a newer one. `args === null` skips the call.
 */
export function useRpc<T>(fn: string, args: Record<string, unknown> | null): RpcState<T> {
  const { refreshKey } = useAnalyticsFilters();
  const key = useMemo(() => (args ? `${fn}|${refreshKey}|${JSON.stringify(args)}` : null), [fn, args, refreshKey]);
  const [state, setState] = useState<RpcState<T> & { key: string | null }>({ data: null, loading: !!key, error: null, key });

  useEffect(() => {
    if (!key || !args) {
      setState({ data: null, loading: false, error: null, key });
      return;
    }
    let cancelled = false;
    setState((s) => ({ data: s.key === key ? s.data : null, loading: true, error: null, key }));
    analyticsRpc<T>(fn, args)
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null, key }); })
      .catch((e: unknown) => { if (!cancelled) setState({ data: null, loading: false, error: e instanceof Error ? e.message : "Couldn't load this report.", key }); });
    return () => { cancelled = true; };
    // `key` fully captures fn + args + refresh; `args` itself is a fresh object every render.
  }, [key]);

  return { data: state.key === key ? state.data : null, loading: state.key !== key || state.loading, error: state.key === key ? state.error : null };
}

/** Standard period arguments for the RPCs (current window). */
export function usePeriodArgs(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const { range, rpcFilters } = useAnalyticsFilters();
  const extraKey = JSON.stringify(extra);
  return useMemo(
    () => ({ p_start: range.start.toISOString(), p_end: range.end.toISOString(), p_filters: rpcFilters, ...JSON.parse(extraKey) }),
    [range, rpcFilters, extraKey]
  );
}

/** Same, for the comparison window (null when comparison is off). */
export function usePrevPeriodArgs(extra: Record<string, unknown> = {}): Record<string, unknown> | null {
  const { prevRange, rpcFilters } = useAnalyticsFilters();
  const extraKey = JSON.stringify(extra);
  return useMemo(
    () => (prevRange ? { p_start: prevRange.start.toISOString(), p_end: prevRange.end.toISOString(), p_filters: rpcFilters, ...JSON.parse(extraKey) } : null),
    [prevRange, rpcFilters, extraKey]
  );
}

// ---- live Odoo identity for product ids -------------------------------------------------------
export interface ProductInfo { id: number; name: string; image?: string; sku?: string; slug: string }
const productCache = new Map<number, ProductInfo | null>();

/**
 * Analytics stores only stable Odoo ids; names/images are resolved live from the current catalog
 * (one bulk request for everything not already cached) — never persisted as analytics truth.
 * An id that no longer resolves (archived/unpublished in Odoo) returns null.
 */
export function useProductInfo(ids: number[]): { get: (id: number) => ProductInfo | null | undefined; loading: boolean } {
  const key = useMemo(() => [...new Set(ids)].filter((n) => Number.isSafeInteger(n) && n > 0).sort((a, b) => a - b).join(","), [ids]);
  const [, bump] = useState(0);
  const [loading, setLoading] = useState(false);
  const inflight = useRef(false);

  useEffect(() => {
    const missing = key ? key.split(",").map(Number).filter((id) => !productCache.has(id)) : [];
    if (missing.length === 0 || inflight.current) return;
    inflight.current = true;
    setLoading(true);
    const batches: number[][] = [];
    for (let i = 0; i < missing.length; i += 50) batches.push(missing.slice(i, i + 50));
    Promise.all(
      batches.map((batch) =>
        catalogService
          .getProductsPage({ page: 1, pageSize: batch.length, ids: batch })
          .then((r) => {
            const found = new Set<number>();
            for (const p of r.items) {
              if (p.odooId === undefined) continue;
              found.add(p.odooId);
              productCache.set(p.odooId, { id: p.odooId, name: p.name, image: p.primaryImage, sku: p.sku, slug: p.slug });
            }
            for (const id of batch) if (!found.has(id)) productCache.set(id, null);
          })
          .catch(() => undefined)      // catalog down: leave uncached so a later render retries
      )
    ).finally(() => {
      inflight.current = false;
      setLoading(false);
      bump((n) => n + 1);
    });
  }, [key]);

  return { get: (id) => productCache.get(id), loading };
}
