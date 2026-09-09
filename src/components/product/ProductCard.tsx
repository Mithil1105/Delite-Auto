import { Link } from "react-router-dom";
import { Heart, Star } from "lucide-react";
import type { Product } from "../../data/types";
import { ProductArt } from "../ProductArt";
import { formatINR } from "../../lib/format";
import { categoryBySlug } from "../../data/categories";
import { useCart } from "../../context/CartContext";
import { useLang } from "../../i18n/LanguageContext";
import clsx from "clsx";

/**
 * The single shared product card — used on Home (all carousels), Shop's grid, and Product
 * Detail's "You might also like". Previously two unrelated implementations existed
 * (`components/ProductCard.tsx` on the old dark theme, `components/home/HomeProductCard.tsx` on
 * the Figma redesign); this file replaces both — see
 * `Documentations MD/figma-shop-product-odoo-integration.md`.
 */
export function ProductCard({ product, className = "" }: { product: Product; className?: string }) {
  const { addToCart, toggleWishlist, isWishlisted } = useCart();
  const { t, dict } = useLang();
  const wishlisted = isWishlisted(product.id);
  const category = categoryBySlug(product.categorySlug);
  const eyebrow = category ? dict.categories[category.slug as keyof typeof dict.categories]?.name : "";
  const rating = product.rating ?? 4.0;
  const reviewCount = product.reviewCount ?? 0;

  return (
    <div className={clsx("group flex flex-col bg-white border border-line rounded-2xl overflow-hidden shadow-card transition-shadow hover:shadow-lift", className)}>
      <Link to={`/product/${product.slug}`} className="block relative">
        <ProductArt icon={product.icon} categorySlug={product.categorySlug} productId={product.id} alt={product.name} className="aspect-square w-full" />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            toggleWishlist(product.id);
          }}
          aria-pressed={wishlisted}
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          className="absolute top-3 right-3 grid place-items-center w-8 h-8 rounded-full bg-white/90 backdrop-blur hover:bg-white transition-colors"
        >
          <Heart className={clsx("w-4 h-4", wishlisted ? "fill-sale text-sale" : "text-ink")} />
        </button>
      </Link>
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
          <Star className="w-3.5 h-3.5 fill-gold text-gold" />
          <span className="text-[12.5px] font-semibold">{rating.toFixed(1)}</span>
          <span className="text-[11.5px] text-steel-500">({reviewCount})</span>
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
