import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Heart, Plus, Star, Video } from "lucide-react";
import type { Product } from "../../data/types";
import { ProductMedia } from "./ProductMedia";
import { productImages } from "../../lib/productImages";
import { formatINR } from "../../lib/format";
import { useReviewStat } from "../../lib/reviews/reviewStats";
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
  /** default variant: called after the card's own Add to Cart, so a rail can attribute the add to itself. */
  onAdd?: () => void;
  /** default variant only: "list" renders a horizontal row (image left, details right) — used by Shop's list view. */
  layout?: "grid" | "list";
}

/**
 * The single shared product card — used on Home (all carousels), Shop's grid, Product Detail's
 * "You might also like", and (via `variant="cart-recommendation"`) the cart drawer's cross-sell
 * rail. Previously two unrelated implementations existed (`components/ProductCard.tsx` on the old
 * dark theme, `components/home/HomeProductCard.tsx` on the Figma redesign); this file replaces
 * both — see `Documentations MD/figma-shop-product-odoo-integration.md` and
 * `Documentations MD/personalized-product-recommendations.md`.
 */
export function ProductCard({ product, className = "", variant = "default", onQuickAdd, onView, onAdd, layout = "grid" }: ProductCardProps) {
  const isList = layout === "list";
  const { addToCart, toggleWishlist, isWishlisted } = useCart();
  const { t, dict } = useLang();
  const wishlisted = isWishlisted(product.id);
  const category = product.categorySlug ? categoryBySlug(product.categorySlug) : undefined;
  const eyebrow = category ? dict.categories[category.slug as keyof typeof dict.categories]?.name : (product.brand?.name ?? product.categories?.[0]?.name ?? "");
  // Real review stars: the approved-review average/count from the database (batched across all cards on the page), falling
  // back to the built-in rating the mock catalog carries. Only the default card shows them, so only it asks for them.
  const stat = useReviewStat(variant === "default" ? product.odooId : undefined);
  const rating = stat?.average ?? product.rating;
  const reviewCount = stat?.count ?? product.reviewCount;
  const hasRating = rating != null && !!reviewCount;

  const imageSrc = product.primaryImage ?? productImages[product.id];

  // Transient "Added to Cart" success state for the default variant's button — CartContext's
  // `lines` stay the source of truth for the actual cart; this is local, visual-only feedback
  // (spec: "local visual state is acceptable ONLY for transient feedback"). addToCart is
  // synchronous and cannot fail today, so the state flips right after the real mutation, never
  // optimistically before it.
  const [justAdded, setJustAdded] = useState(false);
  const addedTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(addedTimerRef.current), []);

  if (variant === "cart-recommendation") {
    const requiresSelection = productRequiresSelection(product);
    return (
      <div data-product-card className={clsx("flex items-center gap-3 py-1.5", className)}>
        <Link to={`/product/${product.slug}`} onClick={onView} className="shrink-0">
          <ProductMedia src={imageSrc} alt={product.name} icon={product.icon} className="w-11 h-11 rounded-lg border border-line" iconClassName="w-4 h-4" />
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
    <div
      data-product-card
      className={clsx(
        "group relative flex bg-white border border-line rounded-2xl overflow-hidden shadow-card transition-[box-shadow,transform] duration-300 hover:shadow-lift hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
        isList ? "flex-row" : "flex-col",
        className
      )}
    >
      <Link to={`/product/${product.slug}`} onClick={onView} className={clsx("block", isList && "w-32 sm:w-52 shrink-0 self-stretch")}>
        <ProductMedia src={imageSrc} alt={product.name} icon={product.icon} className={clsx("w-full", isList ? "h-full min-h-[8rem]" : "aspect-square")} />
      </Link>
      {product.hasVideo && (
        <span
          title="Has video"
          className="pointer-events-none absolute top-3 left-3 z-10 inline-flex items-center gap-1 rounded-full bg-ink/80 px-2 py-1 text-white backdrop-blur"
        >
          <Video className="w-3.5 h-3.5" aria-hidden />
          <span className="sr-only">This product has a video</span>
        </span>
      )}
      <button
        type="button"
        onClick={() => toggleWishlist(product.id)}
        aria-pressed={wishlisted}
        aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
        className="absolute top-3 right-3 z-10 grid place-items-center w-8 h-8 rounded-full bg-white/90 backdrop-blur hover:bg-white transition-colors"
      >
        <Heart className={clsx("w-4 h-4", wishlisted ? "fill-sale text-sale" : "text-ink")} />
      </button>
      <div className={clsx("flex flex-col flex-1 min-w-0 gap-2", isList ? "p-3.5 sm:p-5 sm:justify-center pr-12" : "p-5")}>
        {eyebrow && <div className="font-mono text-[11px] uppercase tracking-widish text-steel-500">{eyebrow}</div>}
        <Link to={`/product/${product.slug}`} onClick={onView} className="font-semibold text-[15px] leading-snug hover:text-brand-700 transition-colors line-clamp-2">
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
              <span className="text-[12.5px] font-semibold">{rating!.toFixed(1)}</span>
              <span className="text-[11.5px] text-steel-500">({reviewCount})</span>
            </>
          ) : (
            <>
              <Star className="w-3.5 h-3.5 text-line" />
              <span className="text-[11.5px] text-steel-500">{t("product.noReviewsYet")}</span>
            </>
          )}
        </div>

        <div className="mt-auto flex items-baseline gap-2 pt-1">
          {product.mrp && product.mrp > product.price ? (
            // On sale: the new price in red, the old price struck through in black (like H&M).
            <>
              <span className="price text-[15px] font-bold text-sale">{formatINR(product.price)}</span>
              <span className="price text-[13px] text-ink line-through">{formatINR(product.mrp)}</span>
            </>
          ) : (
            <span className="price text-[15px] font-bold text-ink">{formatINR(product.price)}</span>
          )}
        </div>

        {productRequiresSelection(product) ? (
          // Never silently pick a default variant — route to the PDP to select one, same
          // correct behaviour the cart-recommendation variant already uses above.
          <Link
            to={`/product/${product.slug}`}
            onClick={onView}
            className={clsx("btn-pill-outline mt-1 !py-2.5", isList ? "w-full sm:w-auto sm:self-start sm:!px-6" : "w-full")}
          >
            {t("cart.selectOptions")}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              addToCart(product);
              onAdd?.();
              window.clearTimeout(addedTimerRef.current);
              setJustAdded(true);
              addedTimerRef.current = window.setTimeout(() => setJustAdded(false), 1500);
            }}
            className={clsx(
              "mt-1 !py-2.5 transition-colors duration-200 motion-reduce:transition-none",
              isList ? "w-full sm:w-auto sm:self-start sm:!px-6" : "w-full",
              justAdded ? "btn-pill-solid-brand" : "btn-pill-outline"
            )}
          >
            <span aria-live="polite" className="inline-flex items-center gap-1.5">
              {justAdded ? (
                <>
                  <Check className="w-4 h-4" /> {t("home.addedToCart")}
                </>
              ) : (
                t("home.addToCart")
              )}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
