import { useMemo } from "react";
import type { Product } from "../data/types";
import { getRecommendations } from "../lib/recommendations/engine";
import type { CartLineInput, RecommendationStrategy } from "../lib/recommendations/types";

interface UseRecommendationsOptions {
  strategy: RecommendationStrategy;
  currentProduct?: Product;
  cartLines?: CartLineInput[];
  limit?: number;
  /** See `RecommendationRequest.candidates` — omit to use the engine's local-catalog fallback. */
  candidates?: Product[];
}

/**
 * Thin memoized wrapper around the shared recommendation engine (`getRecommendations`) — see
 * Documentations MD/personalized-product-recommendations.md. Memoization relies on `currentProduct`
 * and each `cartLines[].product` being stable object references (they come straight from the
 * static `products` array / CartContext's `lines` state, never freshly spread per render), so this
 * intentionally does NOT deep-compare — recomputation only happens when the actual product
 * identity/quantity set changes, not on unrelated re-renders. `candidates` is likewise expected to
 * be a stable reference once loaded — see `useCatalogProducts`, which caches it module-wide.
 */
export function useRecommendations({ strategy, currentProduct, cartLines, limit, candidates }: UseRecommendationsOptions): Product[] {
  return useMemo(
    () => getRecommendations({ strategy, currentProduct, cartLines, limit, candidates }),
    [strategy, currentProduct, cartLines, limit, candidates]
  );
}
