import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronRight, Heart, Minus, Plus, Play, Share2, Star, TriangleAlert } from "lucide-react";
import { categoryBySlug } from "../data/categories";
import { catalogService } from "../services/catalog/catalogService";
import type { ProductDetail as ProductDetailDto } from "../data/types";
import { ProductMedia } from "../components/product/ProductMedia";
import { ProductCarousel } from "../components/product/ProductCarousel";
import { TrustBadgesRow } from "../components/home/TrustBadgesRow";
import { formatINR } from "../lib/format";
import { useCart } from "../context/CartContext";
import { useRecommendations } from "../hooks/useRecommendations";
import { useCatalogProducts } from "../hooks/useCatalogProducts";
import { useProductReviews } from "../hooks/useProductReviews";
import { ReviewsSection } from "../components/product/ReviewsSection";
import { recordProductView } from "../lib/recommendations/history";
import { useLang } from "../i18n/LanguageContext";
import clsx from "clsx";

type Tab = "description" | "reviews" | "returns" | "delivery";
type LoadState = "loading" | "not-found" | "error" | "ready";

/**
 * Fetches one product via `catalogService` (mock today; real Odoo data once
 * `VITE_CATALOG_SOURCE=http` — see Documentations MD/odoo-live-catalog-integration.md) instead of
 * importing `src/data/products.ts` directly. `getProductBySlug` resolving to `null` is a genuine
 * 404 (unknown slug/id) — distinct from a network/Odoo failure, which is `"error"` with a retry
 * option (spec section 18 — never silently substitute a different product).
 */
function useProductDetail(slug: string) {
  const [product, setProduct] = useState<ProductDetailDto | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    catalogService
      .getProductBySlug(slug)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setState("not-found");
          return;
        }
        setProduct(result);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [slug, reloadToken]);

  return { product, state, retry: () => setReloadToken((n) => n + 1) };
}

export default function ProductDetail() {
  const { slug = "" } = useParams();
  const { product, state, retry } = useProductDetail(slug);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<Tab>("description");
  const { addToCart, toggleWishlist, isWishlisted } = useCart();
  const { t, dict } = useLang();
  const navigate = useNavigate();

  // Feeds the cart-drawer's cart-cross-sell "recent affinity" signal — see
  // Documentations MD/personalized-product-recommendations.md. No early return before this hook:
  // it must run unconditionally, so it's guarded by `product` internally instead.
  useEffect(() => {
    if (product) recordProductView(product.id);
  }, [product]);

  // Real Odoo products can have multiple purchasable product.product variants (e.g. different
  // colours) — a single-variant product auto-selects; a multi-variant product must NOT silently
  // pick one, so Add to Cart stays disabled until the customer chooses. See
  // Documentations MD/odoo-real-catalog.md, "Variant selection".
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(undefined);
  useEffect(() => {
    const variants = product?.variants ?? [];
    setSelectedVariantId(variants.length === 1 ? variants[0].id : undefined);
  }, [product]);
  const [activeImage, setActiveImage] = useState(0);
  useEffect(() => setActiveImage(0), [product]);

  const catalogProducts = useCatalogProducts();
  const related = useRecommendations({ strategy: "pdp", currentProduct: product ?? undefined, limit: 4, candidates: catalogProducts });

  // Real Odoo products get a real review aggregate (Documentations MD/
  // delite-accounts-orders-reviews-admin.md); the local mock catalog has no odooId, so this hook
  // no-ops and the existing static product.rating/reviewCount fields drive the fallback below —
  // unchanged behavior for mock data. Called unconditionally (before the early returns) per the
  // Rules of Hooks — guarded internally by `product?.odooId` being undefined while loading.
  const { aggregate: reviewAggregate } = useProductReviews(product?.odooId);

  if (state === "loading") {
    return (
      <div className="bg-white">
        <div className="container-page py-24 flex flex-col items-center text-center text-steel-500 text-[14px]">
          {t("shop.loadingCatalog")}
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="bg-white">
        <div className="container-page py-24 flex flex-col items-center text-center">
          <TriangleAlert className="w-10 h-10 text-steel-300 mb-4" />
          <h1 className="font-display uppercase text-xl mb-2">{t("shop.catalogUnavailableTitle")}</h1>
          <p className="text-steel-500 text-[14px] mb-6 max-w-[40ch]">{t("shop.catalogUnavailableDesc")}</p>
          <button onClick={retry} className="btn-dark">{t("shop.retry")}</button>
        </div>
      </div>
    );
  }

  if (state === "not-found" || !product) {
    return (
      <div className="bg-white">
        <div className="container-page py-24 flex flex-col items-center text-center">
          <h1 className="font-display uppercase text-xl mb-2">{t("product.notFoundTitle")}</h1>
          <p className="text-steel-500 text-[14px] mb-6 max-w-[40ch]">{t("product.notFoundDesc")}</p>
          <Link to="/shop" className="btn-dark">{t("cart.continueShopping")}</Link>
        </div>
      </div>
    );
  }

  // `categoryBySlug` resolves the local mock catalog's curated categories (categorySlug is a real
  // string there); real Odoo products carry no single categorySlug (Odoo's category model is
  // flat and multi-tag — see Documentations MD/odoo-real-catalog.md), so `product.categories`
  // (real category id/name pairs) is the fallback breadcrumb source for those.
  const mockCategory = product.categorySlug ? categoryBySlug(product.categorySlug) : undefined;
  const mockCategoryLabel = mockCategory ? dict.categories[mockCategory.slug as keyof typeof dict.categories] : null;
  const realCategoryRef = product.categories?.[0];
  const wishlisted = isWishlisted(product.id);
  const realRatingAvailable = product.odooId != null && reviewAggregate.count > 0;
  const hasRating = realRatingAvailable || (product.rating != null && !!product.reviewCount);
  const displayRating = realRatingAvailable ? reviewAggregate.average! : (product.rating ?? 0);
  const displayReviewCount = realRatingAvailable ? reviewAggregate.count : (product.reviewCount ?? 0);
  // MRP has no backing Odoo field on this instance (see Documentations MD/odoo-real-catalog.md,
  // "MRP absence") — `product.mrp` is simply absent for every real product, so this block already
  // renders nothing for them; no separate "is this Odoo-backed" check needed.
  const savePercent = product.mrp ? Math.round(((product.mrp - product.price) / product.mrp) * 100) : null;

  // `product.media` — a real gallery (primary + product.image records) once Odoo-backed; the mock
  // service backfills a single-entry array from productImages.ts/categoryImages.ts. Only repeat
  // the hero image as filler when there's genuinely nothing else to show.
  const heroImage = product.media[activeImage]?.src ?? product.media[0]?.src;
  const galleryImages = product.media.length > 1 ? product.media.map((m) => m.src) : product.media[0] ? [product.media[0].src] : [];

  const variants = product.variants ?? [];
  const needsVariantSelection = variants.length > 1;
  const selectedVariant = variants.find((v) => v.id === selectedVariantId);
  // A variant (including the sole one on a single-variant product) can be genuinely unpurchasable
  // (e.g. archived in Odoo) — selecting one must not be enough on its own; the gate also has to
  // hold for a variant-less product, whose own `purchasable` is the only signal. See
  // Documentations MD/odoo-real-catalog.md, "Stock decision".
  const canAddToCart = variants.length > 0 ? !!selectedVariant && selectedVariant.purchasable !== false : product.purchasable !== false;
  const activePrice = selectedVariant?.price ?? product.price;

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
          {mockCategory && mockCategoryLabel ? (
            <>
              <Link to={`/shop?category=${mockCategory.slug}`} className="hover:text-ink">{mockCategoryLabel.name}</Link>
              <ChevronRight className="w-3 h-3" />
            </>
          ) : (
            realCategoryRef && (
              <>
                <Link to={`/shop?category=${realCategoryRef.id}`} className="hover:text-ink">{realCategoryRef.name}</Link>
                <ChevronRight className="w-3 h-3" />
              </>
            )
          )}
          <span className="text-ink">{product.name}</span>
        </nav>

        <div className="grid lg:grid-cols-2 gap-10 mb-14">
          {/* Gallery */}
          <div>
            <ProductMedia
              src={heroImage}
              alt={product.name}
              icon={product.icon}
              eager
              className="w-full aspect-square rounded-2xl border border-line"
              iconClassName="w-24 h-24"
            />
            {galleryImages.length > 1 && (
              <div className="flex items-center gap-2 mt-3 overflow-x-auto">
                {galleryImages.map((src, i) => (
                  <button
                    key={src + i}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    className={clsx("shrink-0 w-16 h-16 rounded-lg border overflow-hidden", i === activeImage ? "border-brand-500" : "border-line")}
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
                {(mockCategoryLabel?.name ?? realCategoryRef?.name) && (
                  <div className="font-mono text-[11px] uppercase tracking-widish text-steel-500 mb-1.5">
                    {mockCategoryLabel?.name ?? realCategoryRef?.name}
                  </div>
                )}
                <h1 className="text-2xl sm:text-3xl heading leading-tight">{product.name}</h1>
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
              <span className="price text-2xl font-bold text-sale">{formatINR(activePrice)}</span>
              {product.mrp && <span className="price text-[15px] text-steel-500 line-through">{formatINR(product.mrp)}</span>}
              {savePercent !== null && savePercent > 0 && (
                <span className="px-2 py-1 rounded-full bg-badge-new text-white text-[11px] font-semibold">
                  {t("product.saveBadge", { percent: savePercent })}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-3">
              {hasRating ? (
                <>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} className={clsx("w-4 h-4", i < Math.round(displayRating) ? "fill-gold text-gold" : "text-line")} />
                    ))}
                  </div>
                  <span className="text-[13px] font-semibold">{displayRating.toFixed(1)}</span>
                  <span className="text-[12.5px] text-steel-500">({displayReviewCount})</span>
                </>
              ) : (
                <span className="text-[12.5px] text-steel-500">{t("product.noReviewsYet")}</span>
              )}
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

            {variants.length > 0 && (
              <div className="mt-6 pt-6 border-t border-line">
                <label className="text-[13px] font-semibold mb-2 block">{t("product.selectCarVariant")}</label>
                <select
                  value={selectedVariantId ?? ""}
                  onChange={(e) => setSelectedVariantId(e.target.value || undefined)}
                  className="w-full sm:w-72 h-11 border border-line px-3 text-[13.5px] bg-white focus:outline-none focus:border-brand-500"
                >
                  {needsVariantSelection && (
                    <option value="" disabled>
                      {t("product.chooseOptionPlaceholder")}
                    </option>
                  )}
                  {variants.map((v) => (
                    <option key={v.id} value={v.id} disabled={v.purchasable === false}>
                      {v.label}
                      {v.purchasable === false ? ` (${t("shop.outOfStock")})` : ""}
                    </option>
                  ))}
                </select>
                {needsVariantSelection && !selectedVariant && (
                  <p className="text-[12px] text-sale mt-1.5">{t("product.selectionRequired")}</p>
                )}
              </div>
            )}

            {product.fitment && product.fitment.length > 0 && (
              <div className="mt-6 pt-6 border-t border-line">
                <div className="text-[13px] font-semibold mb-2">{t("product.fitmentHeading")}</div>
                <div className="flex flex-wrap gap-2">
                  {product.fitment.map((f) => (
                    <span key={f.id} className="px-2.5 py-1 rounded-full border border-line text-[12px] text-ink/80">
                      {f.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

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
              <button
                type="button"
                disabled={!canAddToCart}
                onClick={() => addToCart(product, qty, { variantId: selectedVariantId })}
                className="btn-pill-dark w-full justify-center !py-3.5 disabled:opacity-40 disabled:pointer-events-none"
              >
                {t("product.addToCart")}
              </button>
              <button
                type="button"
                disabled={!canAddToCart}
                onClick={() => {
                  // Buy Now adds the product but must NOT trigger cart feedback (drawer/mobile
                  // "Added" indicator) — it's navigating straight to checkout, a distinct action
                  // from Add to Cart. See Documentations MD/responsive-cart-drawer.md.
                  addToCart(product, qty, { feedback: false, variantId: selectedVariantId });
                  navigate("/cart");
                }}
                className="btn-pill-gold w-full justify-center !py-3.5 disabled:opacity-40 disabled:pointer-events-none"
              >
                {t("product.payWith")}
              </button>
              <span className="text-[12.5px] font-semibold text-steel-500 self-center">{t("product.morePaymentOptions")}</span>
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
          <div className="mb-16">
            <ReviewsSection odooTemplateId={product.odooId} />
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
            <h2 className="text-xl sm:text-2xl heading mb-5">{t("product.youMightAlsoLike")}</h2>
            <ProductCarousel products={related} />
          </section>
        )}

        <div className="pt-10 border-t border-line">
          <TrustBadgesRow />
        </div>
      </div>
    </div>
  );
}
