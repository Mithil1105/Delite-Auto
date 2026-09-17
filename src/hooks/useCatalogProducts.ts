import { useEffect, useState } from "react";
import type { Product } from "../data/types";
import { catalogService } from "../services/catalog/catalogService";

// Module-level cache — the catalog is read-heavy and effectively static within a browsing
// session, so every recommendation rail sharing one fetch avoids N independent network calls
// (see Documentations MD/odoo-live-catalog-integration.md, "Recommendation engine": "do not
// create multiple independent fetching systems").
let cachedCatalog: Promise<Product[]> | null = null;

function loadCatalog(): Promise<Product[]> {
  if (!cachedCatalog) cachedCatalog = catalogService.getProducts();
  return cachedCatalog;
}

/**
 * Loads the full catalog once per session for use as recommendation-engine candidates. Returns
 * `undefined` while loading (or if the fetch fails) — callers pass that straight to
 * `useRecommendations`, which falls back to the engine's built-in local-catalog candidates in
 * that case (see `RecommendationRequest.candidates` in `lib/recommendations/types.ts`). A
 * recommendation rail briefly using the local catalog while the real one loads is an acceptable
 * tradeoff for secondary cross-sell content — unlike Shop/PDP's own product data, which always
 * waits for and surfaces a real load/error state.
 */
export function useCatalogProducts(): Product[] | undefined {
  const [products, setProducts] = useState<Product[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loadCatalog()
      .then((list) => {
        if (!cancelled) setProducts(list);
      })
      .catch(() => {
        // Swallow — degrades to the engine's local-catalog fallback, not a page-level error.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return products;
}
