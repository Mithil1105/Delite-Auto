import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronRight, Heart, Minus, Plus, Share2, Star, TriangleAlert } from "lucide-react";
import { PaymentMethods } from "../components/product/PaymentMethods";
import { ProductTrustStrip } from "../components/product/TrustStrip";
import { categoryBySlug } from "../data/categories";
import { catalogService } from "../services/catalog/catalogService";
import type { ProductDetail as ProductDetailDto } from "../data/types";
import { ProductMedia } from "../components/product/ProductMedia";
import { ProductMediaGallery } from "../components/product/ProductMediaGallery";
import { ProductCarousel } from "../components/product/ProductCarousel";
import { TrustBadgesRow } from "../components/home/TrustBadgesRow";
import { formatINR } from "../lib/format";
import { useCart } from "../context/CartContext";
import { useRecommendations } from "../hooks/useRecommendations";
import { useCatalogProducts } from "../hooks/useCatalogProducts";
import { useProductReviews } from "../hooks/useProductReviews";
import { ReviewsSection } from "../components/product/ReviewsSection";
import { AccordionPanel } from "../components/ui/AccordionPanel";
import { ProductFaq } from "../components/faq/Faq";
import { recordProductView } from "../lib/recommendations/history";
import { useLang } from "../i18n/LanguageContext";
import clsx from "clsx";
import { Reveal } from "../components/motion/Reveal";
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
  const [openTabs, setOpenTabs] = useState<Set<Tab>>(() => new Set<Tab>(["description"]));
  const toggleTab = (id: Tab) =>
    setOpenTabs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
  const [shareCopied, setShareCopied] = useState(false);
  const shareProduct = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: product?.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1800);
    } catch {
      // Share sheet dismissed or clipboard blocked — nothing to recover.
    }
  };
  useEffect(() => {
    const variants = product?.variants ?? [];
    setSelectedVariantId(variants.length === 1 ? variants[0].id : undefined);
  }, [product]);

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
  const heroImage = product.media[0]?.src;

  const variants = product.variants ?? [];
  // The selector's label/UI follow how Odoo names the variant attribute: a colour attribute shows
  // colour chips ("Select Colour"), another single attribute shows "Select <attribute>", and the
  // generic/mixed case (Delite free-text "Model" attribute) keeps "Select Car Variant".
  const variantAttrNames = Array.from(new Set(variants.flatMap((v) => (v.attributes ?? []).map((a) => a.attribute))));
  const singleVariantAttr = variantAttrNames.length === 1 ? variantAttrNames[0] : null;
  const isColourVariant = singleVariantAttr !== null && /colou?r/i.test(singleVariantAttr);
  const variantSelectLabel = isColourVariant
    ? t("product.selectColour")
    : singleVariantAttr && !/^(model|variant|car ?variant)$/i.test(singleVariantAttr)
      ? t("product.selectAttribute", { name: singleVariantAttr })
      : t("product.selectCarVariant");
  const variantOptionText = (v: (typeof variants)[number]) =>
    isColourVariant ? (v.attributes?.find((a) => /colou?r/i.test(a.attribute))?.value ?? v.label) : v.label;
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
      <div className="container-page py-6">
        <nav className="flex items-center gap-1.5 text-[12.5px] text-steel-500 mb-4 flex-wrap">
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

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 mb-12">
          {/* Gallery — thumbnail rail + scrolling image viewer + click-to-zoom (ported from the Hasto
              storefront); sticky on desktop so it stays beside the info column while you read. */}
          <div data-pdp-gallery className="min-w-0 lg:sticky lg:top-[calc(var(--header-height,110px)+16px)] lg:self-start">
            <ProductMediaGallery
              key={product.id}
              media={product.media}
              productName={product.name}
              fallback={
                <ProductMedia
                  src={heroImage}
                  alt={product.name}
                  icon={product.icon}
                  eager
                  className="w-full aspect-square rounded-2xl border border-line"
                  iconClassName="w-24 h-24"
                />
              }
            />
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
                <h1 className="text-2xl sm:text-[28px] heading leading-tight">{product.name}</h1>
              </div>
              <div className="flex flex-col items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleWishlist(product.id)}
                  aria-pressed={wishlisted}
                  aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
                  className="grid place-items-center w-9 h-9 rounded-full border border-line hover:border-ink transition-colors"
                >
                  <Heart className={clsx("w-4 h-4", wishlisted ? "fill-sale text-sale" : "text-ink")} />
                </button>
                <button
                  type="button"
                  onClick={shareProduct}
                  aria-label={t("product.shareLabel")}
                  title={shareCopied ? t("product.linkCopied") : t("product.shareLabel")}
                  className="relative grid place-items-center w-9 h-9 rounded-full border border-line hover:border-ink transition-colors"
                >
                  <Share2 className="w-4 h-4 text-ink" />
                  <span aria-live="polite" className="sr-only">{shareCopied ? t("product.linkCopied") : ""}</span>
                  {shareCopied && (
                    <span aria-hidden="true" className="absolute top-full mt-1.5 right-0 whitespace-nowrap rounded-md bg-ink text-white text-[11px] font-medium px-2 py-1">
                      {t("product.linkCopied")}
                    </span>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-3 mt-3">
              {product.mrp && product.mrp > activePrice ? (
                <>
                  <span className="price text-xl font-bold text-sale">{formatINR(activePrice)}</span>
                  <span className="price text-[15px] text-ink line-through">{formatINR(product.mrp)}</span>
                </>
              ) : (
                <span className="price text-xl font-bold text-ink">{formatINR(activePrice)}</span>
              )}
              {savePercent !== null && savePercent > 0 && (
                <span className="px-2 py-1 rounded-full bg-badge-new text-white text-[11px] font-semibold">
                  {t("product.saveBadge", { percent: savePercent })}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-2">
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
              <button
                type="button"
                onClick={() => {
                  setOpenTabs((prev) => new Set(prev).add("reviews"));
                  document.getElementById("product-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="text-[12.5px] font-semibold text-steel-700 hover:text-ink hover:underline ml-1"
              >
                + {t("product.writeReview")}
              </button>
            </div>

            {product.colors && product.colors.length > 0 && (
              <div className="mt-4 pt-4 border-t border-line">
                <div className="text-[13px] font-semibold mb-2">{t("product.coloursLabel")}</div>
                <div className="flex items-center gap-2">
                  {product.colors.map((c) => (
                    <span key={c} className="w-6 h-6 rounded-full border border-line" style={{ backgroundColor: c }} aria-label={c} />
                  ))}
                </div>
              </div>
            )}

            {variants.length > 0 && (
              <div className="mt-4 pt-4 border-t border-line">
                <label className="text-[13px] font-semibold mb-2 block">{variantSelectLabel}</label>
                {isColourVariant ? (
                  <div role="radiogroup" aria-label={variantSelectLabel} className="flex flex-wrap gap-2">
                    {variants.map((v) => {
                      const text = variantOptionText(v);
                      const selected = v.id === selectedVariantId;
                      const unavailable = v.purchasable === false;
                      const swatch = typeof CSS !== "undefined" && CSS.supports("color", text) ? text : null;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={unavailable}
                          onClick={() => setSelectedVariantId(v.id)}
                          className={clsx(
                            "inline-flex items-center gap-2 h-10 px-3.5 rounded-full border text-[13px] font-medium transition-colors disabled:opacity-40 disabled:line-through",
                            selected ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line hover:border-ink"
                          )}
                        >
                          {swatch && <span className="w-4 h-4 rounded-full border border-line" style={{ backgroundColor: swatch }} aria-hidden="true" />}
                          {text}
                        </button>
                      );
                    })}
                  </div>
                ) : (
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
                )}
                {needsVariantSelection && !selectedVariant && (
                  <p className="text-[12px] text-sale mt-1.5">{t("product.selectionRequired")}</p>
                )}
              </div>
            )}

            {product.fitment && product.fitment.length > 0 && (
              <div className="mt-4 pt-4 border-t border-line">
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

            {/* Stacked: a compact quantity stepper, then full-width Add to Cart, then full-width Buy Now (accepted-payment
                logos sit inside it on the right), then one rotating promise strip (admin: Website → Header & footer → Product strip). */}
            <div className="mt-5 flex flex-col gap-3">
              <div>
                <span id="pdp-qty-label" className="sr-only">{t("product.quantityLabel")}</span>
                <div role="group" aria-labelledby="pdp-qty-label" className="flex h-9 w-fit items-center overflow-hidden rounded-full border border-line">
                  <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))} className="grid h-full w-9 place-items-center transition-colors hover:bg-steel-50 active:bg-steel-100" aria-label="Decrease quantity">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-7 text-center font-mono text-[13px]" aria-live="polite">{qty}</span>
                  <button type="button" onClick={() => setQty((n) => n + 1)} className="grid h-full w-9 place-items-center transition-colors hover:bg-steel-50 active:bg-steel-100" aria-label="Increase quantity">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                disabled={!canAddToCart}
                onClick={() => addToCart(product, qty, { variantId: selectedVariantId })}
                className="btn-pill-dark w-full justify-center !py-3.5 disabled:opacity-40 disabled:pointer-events-none"
              >
                {t("product.addToCart")}
              </button>
              <div>
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
                  className="btn-pill-gold relative w-full justify-center !py-3.5 disabled:opacity-40 disabled:pointer-events-none"
                >
                  {t("product.buyNow")}
                  <PaymentMethods className="absolute right-4 top-1/2 hidden -translate-y-1/2 min-[381px]:flex" />
                </button>
                {/* Very narrow screens: the logos drop below the button instead of crowding the label. */}
                <div className="mt-2 flex justify-center min-[381px]:hidden">
                  <PaymentMethods />
                </div>
              </div>
              <ProductTrustStrip />
            </div>

          </div>
        </div>

        {/* Product details: quick-facts chips + accordion (Feature details / Reviews / Return &
            Exchange / Delivery & Payment). Multiple sections can be open at once. */}
        <div id="product-tabs" className="mb-16 max-w-3xl">
          <div className="border-t border-line">
            {tabs.map((tb) => {
              const isOpen = openTabs.has(tb.id);
              return (
                <section key={tb.id} className="border-b border-line">
                  <h3>
                    <button
                      type="button"
                      id={`pd-${tb.id}-btn`}
                      aria-expanded={isOpen}
                      aria-controls={`pd-${tb.id}-panel`}
                      onClick={() => toggleTab(tb.id)}
                      className="w-full flex items-center justify-between gap-4 py-5 text-left"
                    >
                      <span className={clsx("text-[20px] font-semibold transition-colors sm:text-[22px]", isOpen ? "text-brand-700" : "text-ink")}>{tb.label}</span>
                      {isOpen ? <Minus className="w-4 h-4 shrink-0 text-steel-500" /> : <Plus className="w-4 h-4 shrink-0 text-steel-500" />}
                    </button>
                  </h3>
                  <AccordionPanel open={isOpen} id={`pd-${tb.id}-panel`} labelledBy={`pd-${tb.id}-btn`}>
                    <div>
                      {tb.id === "description" && (
                        <div>
                          <p className="text-[14.5px] text-ink/75 leading-relaxed max-w-[75ch] mb-6">{product.description}</p>
                          {product.specs.length > 0 && (
                            <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-2 mb-6">
                              {product.specs.map((s) => (
                                <div key={s.label} className="flex justify-between gap-4 text-[13.5px] py-1.5 border-b border-line/70">
                                  <dt className="text-steel-500">{s.label}</dt>
                                  <dd className="font-medium text-right">{s.value}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </div>
                      )}
                      {tb.id === "reviews" && <ReviewsSection odooTemplateId={product.odooId} />}
                      {tb.id === "returns" && <p className="text-[14.5px] text-ink/75 leading-relaxed max-w-2xl">{t("product.returnExchangeBody")}</p>}
                      {tb.id === "delivery" && <p className="text-[14.5px] text-ink/75 leading-relaxed max-w-2xl">{t("product.deliveryPaymentBody")}</p>}
                    </div>
                  </AccordionPanel>
                </section>
              );
            })}
          </div>
        </div>

        <ProductFaq />

        {related.length > 0 && (
          <Reveal as="section" className="mb-16">
            <h2 className="text-xl sm:text-2xl heading mb-5">{t("product.youMightAlsoLike")}</h2>
            <ProductCarousel products={related} tracking={{ surface: "product_detail", strategy: "pdp" }} />
          </Reveal>
        )}

        <Reveal className="pt-10 border-t border-line">
          <TrustBadgesRow />
        </Reveal>
      </div>
    </div>
  );
}
