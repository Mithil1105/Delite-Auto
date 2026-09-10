import type { RecommendationStrategy, RecommendationSurface } from "./types";

export type RecommendationAnalyticsEventType =
  | "recommendation_impression"
  | "recommendation_click"
  | "recommendation_add_to_cart";

export interface RecommendationAnalyticsEvent {
  type: RecommendationAnalyticsEventType;
  productId: string;
  strategy: RecommendationStrategy;
  surface: RecommendationSurface;
}

/**
 * No analytics backend is wired up yet — this is the single seam a real provider (Segment, GA,
 * etc.) plugs into later without touching any call site. Deliberately carries only
 * product/strategy/surface metadata, never anything personally-identifying.
 */
export function trackRecommendationEvent(event: RecommendationAnalyticsEvent) {
  if (import.meta.env.DEV) {
    console.debug("[recommendation]", event);
  }
}
