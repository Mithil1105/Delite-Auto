import { useEffect } from "react";
import { useCart } from "../../context/CartContext";
import { useRecommendations } from "../../hooks/useRecommendations";
import { trackRecommendationEvent } from "../../lib/recommendations/analytics";
import { ProductCard } from "../product/ProductCard";
import { useLang } from "../../i18n/LanguageContext";

const STRATEGY = "cart-cross-sell" as const;
const SURFACE = "cart_drawer" as const;

/**
 * "YOU MIGHT ALSO NEED" rail inside the cart drawer's scrollable body, between the cart lines and
 * the sticky subtotal/checkout footer. Reads cart state itself (no props) so CartDrawer only has
 * to render `<CartRecommendations />` — see Documentations MD/personalized-product-recommendations.md.
 * Renders nothing when the cart is empty or nothing scores above the relevance threshold (never
 * pads with weak matches — see engine.ts).
 */
export function CartRecommendations() {
  const { lines, addToCart } = useCart();
  const { t } = useLang();
  const recommendations = useRecommendations({ strategy: STRATEGY, cartLines: lines, limit: 4 });

  // Impression fires once per distinct recommendation set, not on every unrelated re-render —
  // keyed on the actual product ids shown, not the array reference.
  const recommendationIds = recommendations.map((p) => p.id).join(",");
  useEffect(() => {
    if (!recommendationIds) return;
    for (const product of recommendations) {
      trackRecommendationEvent({ type: "recommendation_impression", productId: product.id, strategy: STRATEGY, surface: SURFACE });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendationIds]);

  if (lines.length === 0 || recommendations.length === 0) return null;

  return (
    <div className="border-t border-line px-5 py-4">
      <h3 className="font-display uppercase text-[11.5px] tracking-widish text-steel-500 mb-3">{t("cart.youMightAlsoNeed")}</h3>
      <div className="flex flex-col gap-1">
        {recommendations.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            variant="cart-recommendation"
            onView={() => trackRecommendationEvent({ type: "recommendation_click", productId: product.id, strategy: STRATEGY, surface: SURFACE })}
            onQuickAdd={() => {
              // Default feedback (drawer highlight/scroll-into-view) is fine to keep here — the
              // drawer is already open, so `addToCart`'s "open the drawer" side effect is a no-op
              // (setting an already-true flag), not a re-trigger of the open animation.
              addToCart(product);
              trackRecommendationEvent({ type: "recommendation_add_to_cart", productId: product.id, strategy: STRATEGY, surface: SURFACE });
            }}
          />
        ))}
      </div>
    </div>
  );
}
