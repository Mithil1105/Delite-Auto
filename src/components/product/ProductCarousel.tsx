import { forwardRef, useRef } from "react";
import type { Product } from "../../data/types";
import { Rail, RailItem, type RailHandle } from "../Rail";
import { ProductCard } from "./ProductCard";
import { trackRecommendationEvent, type RecommendationAnalyticsEvent } from "../../lib/recommendations/analytics";
import { useOnVisible } from "../../lib/analytics/useOnVisible";

/**
 * Collapses the repeated <Rail>{products.map(p => <RailItem><ProductCard/></RailItem>)}</Rail>
 * pattern (previously duplicated across Home's 4 carousels + Product Detail's related products)
 * into one call.
 *
 * `tracking` (optional) attributes a rail to an analytics surface: one impression per product the
 * first time the rail is ~40% on screen, plus clicks and add-to-carts made from its cards. Rails
 * without it behave exactly as before.
 */
export interface CarouselTracking {
  surface: RecommendationAnalyticsEvent["surface"];
  strategy: RecommendationAnalyticsEvent["strategy"];
}

interface ProductCarouselProps {
  products: Product[];
  tracking?: CarouselTracking;
  /** "default" (unchanged) or "home-category" — a denser card width matching the Figma
   * "Shop by Top Categories" rails (~5 cards visible on desktop), used only by
   * HomeCategoryProductSection. Never affects Shop/PDP/Cart-drawer, which always pass "default". */
  variant?: "default" | "home-category";
  /** Hides Rail's own edge-overlay arrows — for a section rendering its own scroll controls (via
   * the forwarded ref) next to its header instead. */
  hideArrows?: boolean;
  onBoundsChange?: (bounds: { canScrollPrev: boolean; canScrollNext: boolean }) => void;
}

const RAIL_ITEM_WIDTH: Record<NonNullable<ProductCarouselProps["variant"]>, string> = {
  default: "w-[260px] sm:w-[280px]",
  "home-category": "w-[198px] sm:w-[216px] lg:w-[232px]",
};

export const ProductCarousel = forwardRef<RailHandle, ProductCarouselProps>(function ProductCarousel(
  { products, tracking, variant = "default", hideArrows = false, onBoundsChange },
  railRef
) {
  const ref = useRef<HTMLDivElement>(null);
  // Re-arms when the product set / surface changes (e.g. switching a tab).
  const key = `${tracking?.surface}|${tracking?.strategy}|${products.map((p) => p.id).join(",")}`;

  useOnVisible(
    ref,
    () => {
      if (!tracking) return;
      for (const p of products) {
        trackRecommendationEvent({ type: "recommendation_impression", productId: p.id, strategy: tracking.strategy, surface: tracking.surface });
      }
    },
    key,
    !!tracking && products.length > 0
  );

  return (
    <div ref={ref}>
      <Rail ref={railRef} hideEdgeArrows={hideArrows} onBoundsChange={onBoundsChange}>
        {products.map((p) => (
          <RailItem key={p.id} className={RAIL_ITEM_WIDTH[variant]}>
            <ProductCard
              product={p}
              onView={tracking ? () => trackRecommendationEvent({ type: "recommendation_click", productId: p.id, strategy: tracking.strategy, surface: tracking.surface }) : undefined}
              onAdd={tracking ? () => trackRecommendationEvent({ type: "recommendation_add_to_cart", productId: p.id, strategy: tracking.strategy, surface: tracking.surface }) : undefined}
            />
          </RailItem>
        ))}
      </Rail>
    </div>
  );
});
