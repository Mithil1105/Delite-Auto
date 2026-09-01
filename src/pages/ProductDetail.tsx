import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Heart, Minus, Plus, ShoppingCart, Zap, ShieldCheck, RotateCcw, Truck, ChevronRight } from "lucide-react";
import { productBySlug, relatedProducts } from "../data/products";
import { brandBySlug } from "../data/brands";
import { categoryBySlug } from "../data/categories";
import { ProductArt } from "../components/ProductArt";
import { ProductCard } from "../components/ProductCard";
import { SectionHeading } from "../components/SectionHeading";
import { formatINR } from "../lib/format";
import { useCart } from "../context/CartContext";
import { useLang } from "../i18n/LanguageContext";

export default function ProductDetail() {
  const { slug = "" } = useParams();
  const product = productBySlug(slug);
  const [qty, setQty] = useState(1);
  const { addToCart, toggleWishlist, isWishlisted } = useCart();
  const { t, dict } = useLang();

  if (!product) return <Navigate to="/shop" replace />;

  const brand = brandBySlug(product.brandSlug);
  const category = categoryBySlug(product.categorySlug);
  const categoryLabel = category ? dict.categories[category.slug as keyof typeof dict.categories] : null;
  const wishlisted = isWishlisted(product.id);
  const related = relatedProducts(product);

  return (
    <div className="container-page py-10">
      <nav className="flex items-center gap-1.5 text-[12.5px] text-steel-500 mb-8 flex-wrap">
        <Link to="/shop" className="hover:text-ink">{t("product.allProductsCrumb")}</Link>
        <ChevronRight className="w-3 h-3" />
        {category && categoryLabel && (
          <>
            <Link to={`/shop?category=${category.slug}`} className="hover:text-ink">{categoryLabel.name}</Link>
            <ChevronRight className="w-3 h-3" />
          </>
        )}
        <span className="text-ink">{product.name}</span>
      </nav>

      <div className="grid lg:grid-cols-2 gap-12 mb-16">
        <ProductArt
          icon={product.icon}
          categorySlug={product.categorySlug}
          productId={product.id}
          alt={product.name}
          className="w-full aspect-square"
          iconClassName="w-24 h-24"
        />

        <div className="flex flex-col">
          {brand && (
            <Link to={`/shop?brand=${brand.slug}`} className="font-mono text-[12px] uppercase tracking-widish text-accent mb-2 w-fit hover:underline">
              {brand.name}
            </Link>
          )}
          <h1 className="text-2xl sm:text-3xl font-semibold mb-3 leading-tight">{product.name}</h1>

          <div className="flex items-baseline gap-3 mb-5">
            <span className="price text-2xl font-semibold">{formatINR(product.price)}</span>
            {product.mrp && <span className="price text-base text-steel-500 line-through">{formatINR(product.mrp)}</span>}
            <span className="text-[12.5px] text-steel-500">{t("product.taxIncluded")}</span>
          </div>

          <p className="text-[14.5px] text-ink/75 leading-relaxed mb-6 max-w-[58ch]">{product.description}</p>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center border border-line">
              <button
                type="button"
                onClick={() => setQty((n) => Math.max(1, n - 1))}
                className="w-10 h-11 grid place-items-center hover:bg-steel-50"
                aria-label="Decrease quantity"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-10 text-center font-mono text-[14px]">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((n) => n + 1)}
                className="w-10 h-11 grid place-items-center hover:bg-steel-50"
                aria-label="Increase quantity"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <button type="button" onClick={() => toggleWishlist(product.id)} className="flex items-center gap-2 h-11 px-4 border border-line hover:border-ink transition-colors">
              <Heart className={wishlisted ? "w-4 h-4 fill-accent text-accent" : "w-4 h-4"} />
              <span className="text-[13px] font-medium">{wishlisted ? t("product.wishlisted") : t("product.wishlistBtn")}</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <button type="button" onClick={() => addToCart(product, qty)} className="btn-dark flex-1 justify-center">
              <ShoppingCart className="w-4 h-4" /> {t("product.addToCart")}
            </button>
            <button type="button" onClick={() => addToCart(product, qty)} className="btn-primary flex-1 justify-center">
              <Zap className="w-4 h-4" /> {t("product.buyNow")}
            </button>
          </div>

          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mb-8 border-t border-line pt-6">
            {product.specs.map((s) => (
              <div key={s.label} className="flex justify-between sm:justify-start gap-4 text-[13.5px] py-1.5 border-b border-line/70 sm:border-none">
                <dt className="text-steel-500">{s.label}</dt>
                <dd className="font-medium text-right sm:text-left">{s.value}</dd>
              </div>
            ))}
          </dl>

          <div className="grid sm:grid-cols-3 gap-3 border-t border-line pt-6">
            <div className="flex items-start gap-2.5 text-[12.5px] text-steel-500">
              <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" /> {t("product.moneyBack")}
            </div>
            <div className="flex items-start gap-2.5 text-[12.5px] text-steel-500">
              <Truck className="w-4 h-4 text-accent shrink-0 mt-0.5" /> {t("product.shipping")}
            </div>
            <div className="flex items-start gap-2.5 text-[12.5px] text-steel-500">
              <RotateCcw className="w-4 h-4 text-accent shrink-0 mt-0.5" /> {t("product.easyReturns")}{" "}
              <Link to="/refund-policy" className="underline">{t("product.refundPolicyLink")}</Link>
            </div>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section>
          <SectionHeading eyebrow={t("product.pairsWith")} title={t("product.mightAlsoNeed")} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
