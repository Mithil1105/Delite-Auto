import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ChevronRight, Heart, Minus, Plus, Play, Share2, Star } from "lucide-react";
import { productBySlug, relatedProducts } from "../data/products";
import { categoryBySlug } from "../data/categories";
import { productImages } from "../lib/productImages";
import { categoryImages } from "../lib/categoryImages";
import { ProductArt } from "../components/ProductArt";
import { ProductCard } from "../components/product/ProductCard";
import { Rail, RailItem } from "../components/Rail";
import { TrustBadgesRow } from "../components/home/TrustBadgesRow";
import { formatINR } from "../lib/format";
import { useCart } from "../context/CartContext";
import { useLang } from "../i18n/LanguageContext";
import clsx from "clsx";

type Tab = "description" | "reviews" | "returns" | "delivery";

export default function ProductDetail() {
  const { slug = "" } = useParams();
  const product = productBySlug(slug);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<Tab>("description");
  const { addToCart, toggleWishlist, isWishlisted } = useCart();
  const { t, dict } = useLang();

  if (!product) return <Navigate to="/shop" replace />;

  const category = categoryBySlug(product.categorySlug);
  const categoryLabel = category ? dict.categories[category.slug as keyof typeof dict.categories] : null;
  const wishlisted = isWishlisted(product.id);
  const related = relatedProducts(product);
  const rating = product.rating ?? 4.0;
  const reviewCount = product.reviewCount ?? 0;
  const savePercent = product.mrp ? Math.round(((product.mrp - product.price) / product.mrp) * 100) : null;

  // Only one real photo exists per product today (see productImages.ts) — the thumbnail strip
  // repeats it rather than showing fake alternate angles. A real gallery needs per-product media
  // from Odoo (ProductMedia[]) — see Documentations MD/figma-shop-product-odoo-integration.md.
  const heroImage = productImages[product.id] ?? categoryImages[product.categorySlug];
  const thumbnails = heroImage ? Array.from({ length: Math.min(4, 4) }, () => heroImage) : [];

  const tabs: { id: Tab; label: string }[] = [
    { id: "description", label: t("product.descriptionTab") },
    { id: "reviews", label: t("product.reviewsTab") },
    { id: "returns", label: t("product.returnExchangeTab") },
    { id: "delivery", label: t("product.deliveryPaymentTab") },
  ];

  return (
    <div className="bg-white">
      <div className="container-page py-8">
        <nav className="flex items-center gap-1.5 text-[12.5px] text-steel-500 mb-6 flex-wrap">
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

        <div className="grid lg:grid-cols-2 gap-10 mb-14">
          {/* Gallery */}
          <div>
            <ProductArt
              icon={product.icon}
              categorySlug={product.categorySlug}
              productId={product.id}
              alt={product.name}
              className="w-full aspect-square rounded-2xl border border-line"
              iconClassName="w-24 h-24"
            />
            {thumbnails.length > 0 && (
              <div className="flex items-center gap-2 mt-3 overflow-x-auto">
                {thumbnails.map((src, i) => (
                  <button
                    key={i}
                    type="button"
                    className={clsx("shrink-0 w-16 h-16 rounded-lg border overflow-hidden", i === 0 ? "border-brand-500" : "border-line")}
                  >
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                {categoryLabel && <div className="font-mono text-[11px] uppercase tracking-widish text-steel-500 mb-1.5">{categoryLabel.name}</div>}
                <h1 className="text-2xl sm:text-3xl font-display normal-case leading-tight">{product.name}</h1>
              </div>
              <button
                type="button"
                onClick={() => toggleWishlist(product.id)}
                aria-pressed={wishlisted}
                aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
                className="grid place-items-center w-9 h-9 rounded-full border border-line hover:border-ink transition-colors shrink-0"
              >
                <Heart className={clsx("w-4 h-4", wishlisted ? "fill-sale text-sale" : "text-ink")} />
              </button>
            </div>

            <div className="flex items-center flex-wrap gap-3 mt-4">
              <span className="price text-2xl font-bold text-sale">{formatINR(product.price)}</span>
              {product.mrp && <span className="price text-[15px] text-steel-500 line-through">{formatINR(product.mrp)}</span>}
              {savePercent !== null && savePercent > 0 && (
                <span className="px-2 py-1 rounded-full bg-badge-new text-white text-[11px] font-semibold">
                  {t("product.saveBadge", { percent: savePercent })}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-3">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} className={clsx("w-4 h-4", i < Math.round(rating) ? "fill-gold text-gold" : "text-line")} />
                ))}
              </div>
              <span className="text-[13px] font-semibold">{rating.toFixed(1)}</span>
              <span className="text-[12.5px] text-steel-500">
                ({reviewCount}) {reviewCount === 0 && t("product.noReviewsYet")}
              </span>
              <button type="button" onClick={() => setTab("reviews")} className="text-[12.5px] font-semibold text-brand-700 hover:underline ml-1">
                + {t("product.writeReview")}
              </button>
            </div>

            {product.colors && product.colors.length > 0 && (
              <div className="mt-6 pt-6 border-t border-line">
                <div className="text-[13px] font-semibold mb-2">{t("product.coloursLabel")}</div>
                <div className="flex items-center gap-2">
                  {product.colors.map((c) => (
                    <span key={c} className="w-6 h-6 rounded-full border border-line" style={{ backgroundColor: c }} aria-label={c} />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-line">
              <label className="text-[13px] font-semibold mb-2 block">{t("product.selectCarVariant")}</label>
              <select className="w-full sm:w-72 h-11 border border-line px-3 text-[13.5px] bg-white focus:outline-none focus:border-brand-500">
                <option>{product.name}</option>
              </select>
            </div>

            <div className="mt-6">
              <label className="text-[13px] font-semibold mb-2 block">{t("product.quantityLabel")}</label>
              <div className="flex items-center border border-line w-fit">
                <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))} className="w-10 h-11 grid place-items-center hover:bg-steel-50" aria-label="Decrease quantity">
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-10 text-center font-mono text-[14px]">{qty}</span>
                <button type="button" onClick={() => setQty((n) => n + 1)} className="w-10 h-11 grid place-items-center hover:bg-steel-50" aria-label="Increase quantity">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-6">
              <button type="button" onClick={() => addToCart(product, qty)} className="btn-pill-dark w-full justify-center !py-3.5">
                {t("product.addToCart")}
              </button>
              <button type="button" onClick={() => addToCart(product, qty)} className="btn-pill-gold w-full justify-center !py-3.5">
                {t("product.payWith")}
              </button>
              <button type="button" className="text-[12.5px] font-semibold text-brand-700 hover:underline self-center">
                {t("product.morePaymentOptions")}
              </button>
            </div>

            <div className="flex items-center gap-2 mt-6 pt-6 border-t border-line">
              <Share2 className="w-4 h-4 text-steel-500" />
              <span className="text-[12.5px] text-steel-500">{t("product.shareLabel")}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-line mb-8 overflow-x-auto">
          <div className="flex gap-6 min-w-max">
            {tabs.map((tb) => (
              <button
                key={tb.id}
                type="button"
                onClick={() => setTab(tb.id)}
                className={clsx(
                  "pb-3 text-[13.5px] font-semibold whitespace-nowrap border-b-2 transition-colors",
                  tab === tb.id ? "border-brand-500 text-brand-700" : "border-transparent text-steel-500 hover:text-ink"
                )}
              >
                {tb.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "description" && (
          <div className="mb-16">
            <p className="text-[14.5px] text-ink/75 leading-relaxed max-w-[75ch] mb-6">{product.description}</p>
            {product.specs.length > 0 && (
              <div className="mb-8">
                <h3 className="font-display uppercase text-[13px] tracking-widish text-steel-500 mb-3">{t("product.featureDetails")}</h3>
                <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-2 max-w-3xl">
                  {product.specs.map((s) => (
                    <div key={s.label} className="flex justify-between gap-4 text-[13.5px] py-1.5 border-b border-line/70">
                      <dt className="text-steel-500">{s.label}</dt>
                      <dd className="font-medium text-right">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {heroImage && (
              <div className="grid sm:grid-cols-2 gap-4 max-w-3xl">
                <div className="relative rounded-2xl overflow-hidden border border-line aspect-video">
                  <img src={heroImage} alt="" className="w-full h-full object-cover" />
                  <span className="absolute inset-0 grid place-items-center bg-ink/10">
                    <span className="grid place-items-center w-12 h-12 rounded-full bg-white/90">
                      <Play className="w-5 h-5 text-ink ml-0.5" fill="currentColor" />
                    </span>
                  </span>
                </div>
                <div className="rounded-2xl overflow-hidden border border-line aspect-video">
                  <img src={heroImage} alt="" className="w-full h-full object-cover" />
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "reviews" && (
          <div className="mb-16 max-w-2xl">
            {reviewCount > 0 ? (
              <p className="text-[14.5px] text-ink/75">
                {rating.toFixed(1)} ★ average from {reviewCount} reviews.
              </p>
            ) : (
              <p className="text-[14.5px] text-ink/75">{t("product.noReviewsYet")}</p>
            )}
          </div>
        )}

        {tab === "returns" && (
          <div className="mb-16 max-w-2xl">
            <p className="text-[14.5px] text-ink/75 leading-relaxed">{t("product.returnExchangeBody")}</p>
          </div>
        )}

        {tab === "delivery" && (
          <div className="mb-16 max-w-2xl">
            <p className="text-[14.5px] text-ink/75 leading-relaxed">{t("product.deliveryPaymentBody")}</p>
          </div>
        )}

        {related.length > 0 && (
          <section className="mb-16">
            <h2 className="text-xl sm:text-2xl font-display normal-case mb-5">{t("product.youMightAlsoLike")}</h2>
            <Rail>
              {related.map((p) => (
                <RailItem key={p.id}>
                  <ProductCard product={p} />
                </RailItem>
              ))}
            </Rail>
          </section>
        )}

        <div className="pt-10 border-t border-line">
          <TrustBadgesRow />
        </div>
      </div>
    </div>
  );
}
