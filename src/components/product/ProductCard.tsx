import { Link } from "react-router-dom";
import { Heart, Plus, Star } from "lucide-react";
import type { Product } from "../../data/types";
import { ProductMedia } from "./ProductMedia";
import { productImages } from "../../lib/productImages";
import { formatINR } from "../../lib/format";
import { categoryBySlug } from "../../data/categories";
import { useCart } from "../../context/CartContext";
import { useLang } from "../../i18n/LanguageContext";
import { productRequiresSelection } from "../../lib/recommendations/variants";
import clsx from "clsx";

interface ProductCardProps {
  product: Product;
  className?: string;
  /** "cart-recommendation" is the compact single-row layout used by CartRecommendations — never the full card inside the drawer. */
  variant?: "default" | "cart-recommendation";
  /** cart-recommendation only: called instead of the default `addToCart(product)` when Quick Add is clicked. */
  onQuickAdd?: () => void;
  /** cart-recommendation only: called when the product image/name is clicked (navigates to the PDP either way). */
  onView?: () => void;
}

/**
 * The single shared product card — used on Home (all carousels), Shop's grid, Product Detail's
 * "You might also like", and (via `variant="cart-recommendation"`) the cart drawer's cross-sell
 * rail. Previously two unrelated implementations existed (`components/ProductCard.tsx` on the old
 * dark theme, `components/home/HomeProductCard.tsx` on the Figma redesign); this file replaces
 * both — see `Documentations MD/figma-shop-product-odoo-integration.md` and
 * `Documentations MD/personalized-product-recommendations.md`.
 */
export function ProductCard({ product, className = "", variant = "default", onQuickAdd, onView }: ProductCardProps) {
  const { addToCart, toggleWishlist, isWishlisted } = useCart();
  const { t, dict } = useLang();
  const wishlisted = isWishlisted(product.id);
  const category = categoryBySlug(product.categorySlug);
  const eyebrow = category ? dict.categories[category.slug as keyof typeof dict.categories]?.name : "";
  const hasRating = product.rating != null && !!product.reviewCount;

  if (variant === "cart-recommendation") {
    const requiresSelection = productRequiresSelection(product);
    return (
      <div className={clsx("flex items-center gap-3 py-1.5", className)}>
        <Link to={`/product/${product.slug}`} onClick={onView} className="shrink-0">
          <ProductMedia src={productImages[product.id]} alt={product.name} icon={product.icon} className="w-11 h-11 rounded-lg border border-line" iconClassName="w-4 h-4" />
        </Link>
        <Link to={`/product/${product.slug}`} onClick={onView} className="flex-1 min-w-0">
          <div className="text-[12.5px] font-medium leading-snug line-clamp-1 hover:text-brand-700 transition-colors">{product.name}</div>
          <span className="price text-[12px] font-semibold text-steel-700">{formatINR(product.price)}</span>
        </Link>
        {requiresSelection ? (
          <Link
            to={`/product/${product.slug}`}
            onClick={onView}
            className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-brand-700 border border-brand-500 rounded-full px-3 py-1.5 hover:bg-brand-50 transition-colors"
          >
            {t("cart.selectOptions")}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => (onQuickAdd ? onQuickAdd() : addToCart(product))}
            className="shrink-0 inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] font-semibold text-white bg-ink rounded-full px-3 py-1.5 hover:bg-ink/85 transition-colors"
          >
            <Plus className="w-3 h-3" /> {t("cart.quickAdd")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={clsx("group relative flex flex-col bg-white border border-line rounded-2xl overflow-hidden shadow-card transition-shadow hover:shadow-lift", className)}>
      <Link to={`/product/${product.slug}`} className="block">
        <ProductMedia src={productImages[product.id]} alt={product.name} icon={product.icon} className="aspect-square w-full" />
      </Link>
      <button
        type="button"
        onClick={() => toggleWishlist(product.id)}
        aria-pressed={wishlisted}
        aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
        className="absolute top-3 right-3 z-10 grid place-items-center w-8 h-8 rounded-full bg-white/90 backdrop-blur hover:bg-white transition-colors"
      >
        <Heart className={clsx("w-4 h-4", wishlisted ? "fill-sale text-sale" : "text-ink")} />
      </button>
      <div className="flex flex-col flex-1 p-5 gap-2">
        {eyebrow && <div className="font-mono text-[11px] uppercase tracking-widish text-steel-500">{eyebrow}</div>}
        <Link to={`/product/${product.slug}`} className="font-semibold text-[15px] leading-snug hover:text-brand-700 transition-colors line-clamp-2">
          {product.name}
        </Link>

        <div className="flex items-center gap-2 min-h-[18px]">
          {product.colors && product.colors.length > 0 && (
            <div className="flex items-center gap-1">
              {product.colors.slice(0, 4).map((c) => (
                <span key={c} className="w-3.5 h-3.5 rounded-full border border-line" style={{ backgroundColor: c }} aria-hidden />
              ))}
              {product.colors.length > 4 && <span className="text-[11px] text-steel-500">+{product.colors.length - 4}</span>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {hasRating ? (
            <>
              <Star className="w-3.5 h-3.5 fill-gold text-gold" />
              <span className="text-[12.5px] font-semibold">{product.rating!.toFixed(1)}</span>
              <span className="text-[11.5px] text-steel-500">({product.reviewCount})</span>
            </>
          ) : (
            <>
              <Star className="w-3.5 h-3.5 text-line" />
              <span className="text-[11.5px] text-steel-500">{t("product.noReviewsYet")}</span>
            </>
          )}
        </div>

        <div className="mt-auto flex items-baseline gap-2 pt-1">
          <span className="price text-[17px] font-bold text-sale">{formatINR(product.price)}</span>
          {product.mrp && <span className="price text-[13px] text-steel-500 line-through">{formatINR(product.mrp)}</span>}
        </div>

        <button type="button" onClick={() => addToCart(product)} className="btn-pill-outline w-full mt-1 !py-2.5">
          {t("home.addToCart")}
        </button>
      </div>
    </div>
  );
}
