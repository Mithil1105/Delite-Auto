import { Link } from "react-router-dom";
import { Heart, ShoppingCart } from "lucide-react";
import type { Product } from "../data/types";
import { ProductArt } from "./ProductArt";
import { formatINR } from "../lib/format";
import { brandBySlug } from "../data/brands";
import { useCart } from "../context/CartContext";
import { useLang } from "../i18n/LanguageContext";
import clsx from "clsx";

const tagStyles: Record<string, string> = {
  new: "bg-badge-new text-white",
  trending: "bg-accent text-white",
  bestseller: "bg-ink text-white",
};

export function ProductCard({ product, className = "" }: { product: Product; className?: string }) {
  const { addToCart, toggleWishlist, isWishlisted } = useCart();
  const { t } = useLang();
  const brand = brandBySlug(product.brandSlug);
  const wishlisted = isWishlisted(product.id);
  const tagLabel: Record<string, string> = {
    new: t("product.tagNew"),
    trending: t("product.tagTrending"),
    bestseller: t("product.tagBestseller"),
  };

  return (
    <div className={clsx("group flex flex-col bg-white border border-line shadow-card transition-shadow hover:shadow-lift", className)}>
      <Link to={`/product/${product.slug}`} className="block relative">
        <ProductArt
          icon={product.icon}
          categorySlug={product.categorySlug}
          productId={product.id}
          alt={product.name}
          className="aspect-[4/3] w-full"
        />
        {product.tag && (
          <span className={clsx("absolute top-3 left-3 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide", tagStyles[product.tag])}>
            {tagLabel[product.tag]}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            toggleWishlist(product.id);
          }}
          aria-pressed={wishlisted}
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          className="absolute top-3 right-3 grid place-items-center w-8 h-8 bg-white/90 backdrop-blur hover:bg-white transition-colors"
        >
          <Heart className={clsx("w-4 h-4", wishlisted ? "fill-accent text-accent" : "text-ink")} />
        </button>
      </Link>
      <div className="flex flex-col flex-1 p-4">
        {brand && <div className="font-mono text-[11px] uppercase tracking-widish text-steel-500 mb-1">{brand.name}</div>}
        <Link to={`/product/${product.slug}`} className="font-semibold text-[14.5px] leading-snug mb-2 hover:text-accent transition-colors">
          {product.name}
        </Link>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="flex items-baseline gap-2">
            <span className="price text-[15px] font-semibold">{formatINR(product.price)}</span>
            {product.mrp && <span className="price text-[12px] text-steel-500 line-through">{formatINR(product.mrp)}</span>}
          </div>
          <button
            type="button"
            onClick={() => addToCart(product)}
            aria-label="Add to cart"
            className="grid place-items-center w-9 h-9 bg-ink text-white hover:bg-accent transition-colors shrink-0"
          >
            <ShoppingCart className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
