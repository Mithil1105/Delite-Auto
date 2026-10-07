import type { RecommendationStrategy, RecommendationSurface } from "./types";
import { track } from "../analytics/client";

export type RecommendationAnalyticsEventType =
  | "recommendation_impression"
  | "recommendation_click"
  | "recommendation_add_to_cart";

export interface RecommendationAnalyticsEvent {
  type: RecommendationAnalyticsEventType;
  productId: string;
  /** "curated" = CMS-curated homepage rail, "default" = the rail's automatic fallback. */
  strategy: RecommendationStrategy | "curated" | "default";
  surface: RecommendationSurface | "home_trending" | "home_featured" | "home_new_arrivals";
}

/**
 * The single recommendation-event seam (call sites unchanged): forwards to the first-party
 * analytics client. Deliberately carries only product/strategy/surface metadata, never anything
 * personally-identifying. Only real Odoo template ids are recorded (mock-catalog ids aren't numeric).
 */
export function trackRecommendationEvent(event: RecommendationAnalyticsEvent) {
  const templateId = Number(event.productId);
  if (!Number.isSafeInteger(templateId) || templateId <= 0) return;
  track(event.type, { odoo_template_id: templateId, strategy: event.strategy, surface: event.surface });
}
