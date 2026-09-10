import type { Product } from "../../data/types";

/**
 * One engine, multiple contexts — see Documentations MD/personalized-product-recommendations.md.
 * "personalized" (a future Home surface) is intentionally not implemented yet; only the two
 * strategies actually wired up today are typed here.
 */
export type RecommendationStrategy = "pdp" | "cart-cross-sell";

export type RecommendationSurface = "product_detail" | "cart_drawer";

export interface CartLineInput {
  product: Product;
  qty: number;
}

export interface RecommendationRequest {
  strategy: RecommendationStrategy;
  /** Required for strategy "pdp". */
  currentProduct?: Product;
  /** Required for strategy "cart-cross-sell". */
  cartLines?: CartLineInput[];
  /** Clamped to [2, 4] regardless of what's passed — see spec: recommendations are secondary cross-sell content, not a second catalog grid. */
  limit?: number;
  /**
   * Test/DI seam only — production callers should omit this and let the engine read
   * `getRecentlyViewedCategories()` itself. Exists so engine.test.ts can assert the affinity
   * signal's effect on ranking without depending on localStorage/jsdom.
   */
  recentlyViewedCategories?: Set<string>;
}

export interface ScoredCandidate {
  product: Product;
  score: number;
  /** Which signals fired, for debugging — never shown to the customer. */
  reasons: string[];
}
