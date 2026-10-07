import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Hero, type HeroContentOverride } from "../components/Hero";
import { PageContainer } from "../components/layout/PageContainer";
import { FullBleedSection } from "../components/layout/FullBleedSection";
import { PillTabs } from "../components/home/PillTabs";
import { ProductCarousel } from "../components/product/ProductCarousel";
import { HomeCategoryProductSection } from "../components/home/HomeCategoryProductSection";
import { CategoryIconStrip } from "../components/home/CategoryIconStrip";
import { VehicleShopSplit } from "../components/home/VehicleShopSplit";
import { VehicleBrandGrid } from "../components/home/VehicleBrandGrid";
import { PromoBannerPair } from "../components/home/PromoBannerPair";
import { TestimonialCarousel } from "../components/home/TestimonialCarousel";
import { GetInTouchBox } from "../components/home/GetInTouchBox";
import { TrustBadgesRow } from "../components/home/TrustBadgesRow";
import { SeoHead } from "../components/SeoHead";
import { products as fallbackProducts } from "../data/products";
import { productImages } from "../lib/productImages";
import { useCatalogProducts } from "../hooks/useCatalogProducts";
import { useLang } from "../i18n/LanguageContext";
import { useHomepageCms } from "../hooks/useHomepageCms";
import { useMerchandisingCms, useMerchandisedProducts, useResolvedCategorySelections, type CategorySelection } from "../hooks/useMerchandisingCms";
import { usePromotions } from "../hooks/usePromotions";

/** Matches the `homepage` cms_page's section_key rows, in the same order Home.tsx has always
 * rendered them — a published reorder/hide changes this at render time; absent CMS data (loading,
 * or nothing published yet) renders every section in this exact default order, unchanged. */
const DEFAULT_ORDER = [
  "hero",
  "vehicle-shop-split",
  "category-strip",
  "trending",
  "perfect-vehicle",
  "brands",
  "top-categories-car",
  "promo-banners",
  "top-categories-bike",
  "testimonials",
  "get-in-touch",
];

function SectionHead({ title, cta, onCta }: { title: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-5">
      <h2 className="text-2xl sm:text-3xl heading">{title}</h2>
      {cta && (
        <button type="button" onClick={onCta} className="text-[13px] font-semibold text-brand-700 hover:underline whitespace-nowrap">
          {cta}
        </button>
      )}
    </div>
  );
}

export default function Home() {
  const { t } = useLang();

  // Real catalog data via catalogService (mock by default; real Odoo data via Supabase Edge
  // Functions once VITE_CATALOG_SOURCE=supabase — see Documentations MD/odoo-real-catalog.md).
  // Falls back to the local catalog as a same-shape placeholder while loading (or, in production, if the
  // real fetch fails) rather than rendering empty carousels — a deliberate exception to "never
  // silently show mock data on a configured-but-failed Odoo call" for this specific surface: Home
  // is promotional (Shop/PDP/Cart remain the actual purchase path and DO show a real error state
  // on failure), and briefly-stale product cards in a marketing carousel don't carry the same
  // fake-price/fake-stock purchasing risk. Homepage layout/geometry is unaffected either way — the
  // same product-card components render regardless of which array backs them.
  const catalogProducts = useCatalogProducts();
  const products = catalogProducts ?? fallbackProducts;

  const { bySectionKey: homeSections } = useHomepageCms();
  const sectionText = (section: string, key: string, fallback: string) => {
    const value = homeSections.get(section)?.content[key];
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  };
  const sectionLink = (section: string, key: string, fallback: string) => {
    const value = sectionText(section, key, fallback);
    return value.startsWith("/") && !value.startsWith("//") ? value : fallback;
  };
  const sectionIds = (section: string, key: string): number[] => {
    const value = homeSections.get(section)?.content[key];
    return Array.isArray(value) ? value.filter((id): id is number => Number.isSafeInteger(id) && id > 0).slice(0, 8) : [];
  };
  const { bySectionKey: merchSections } = useMerchandisingCms();
  const { promotions } = usePromotions();

  const featuredIds = (merchSections.get("featured")?.content.productIds as number[] | undefined) ?? [];
  const newArrivalIds = (merchSections.get("new-arrivals")?.content.productIds as number[] | undefined) ?? [];
  const trendingIds = (merchSections.get("trending")?.content.productIds as number[] | undefined) ?? [];
  const categorySelections = (merchSections.get("categories")?.content.categorySelections as CategorySelection[] | undefined) ?? [];

  const { products: featuredCmsProducts } = useMerchandisedProducts(featuredIds);
  const { products: newArrivalCmsProducts } = useMerchandisedProducts(newArrivalIds);
  const { products: trendingCmsProducts } = useMerchandisedProducts(trendingIds);
  const resolvedCategories = useResolvedCategorySelections(categorySelections);
  const carSeatIds = sectionIds("top-categories-car", "seatCoversIds");
  const carDashIds = sectionIds("top-categories-car", "dashCamsIds");
  const carMatsIds = sectionIds("top-categories-car", "matsIds");
  const carCareIds = sectionIds("top-categories-car", "careIds");
  const bikeHelmetsIds = sectionIds("top-categories-bike", "helmetsIds");
  const bikeCoversIds = sectionIds("top-categories-bike", "coversIds");
  const bikeSaddlebagsIds = sectionIds("top-categories-bike", "saddlebagsIds");
  const bikeGuardsIds = sectionIds("top-categories-bike", "guardsIds");
  const { products: carSeatProducts } = useMerchandisedProducts(carSeatIds);
  const { products: carDashProducts } = useMerchandisedProducts(carDashIds);
  const { products: carMatsProducts } = useMerchandisedProducts(carMatsIds);
  const { products: carCareProducts } = useMerchandisedProducts(carCareIds);
  const { products: bikeHelmetsProducts } = useMerchandisedProducts(bikeHelmetsIds);
  const { products: bikeCoversProducts } = useMerchandisedProducts(bikeCoversIds);
  const { products: bikeSaddlebagsProducts } = useMerchandisedProducts(bikeSaddlebagsIds);
  const { products: bikeGuardsProducts } = useMerchandisedProducts(bikeGuardsIds);

  const [trendingVehicle, setTrendingVehicle] = useState<"car" | "bike">("car");
  const [vehicleTab, setVehicleTab] = useState<"popular" | "new">("popular");
  const [brandsVehicle, setBrandsVehicle] = useState<"car" | "bike">("car");
  const [carCategoryTab, setCarCategoryTab] = useState<"seat-covers" | "dash-cams" | "mats" | "care">("seat-covers");
  const [bikeCategoryTab, setBikeCategoryTab] = useState<"helmets" | "covers" | "saddlebags" | "guards">("helmets");

  const trending = useMemo(() => {
    if (trendingIds.length > 0) {
      if (!trendingCmsProducts) return [];
      const byVehicle = trendingCmsProducts.filter((p) => !p.vehicleTypes || p.vehicleTypes.length === 0 || p.vehicleTypes.includes(trendingVehicle));
      return (byVehicle.length > 0 ? byVehicle : trendingCmsProducts).slice(0, 8);
    }
    const base = products.filter((p) => p.vehicle === trendingVehicle);
    const tagged = base.filter((p) => p.tag === "trending" || p.tag === "bestseller");
    return (tagged.length >= 6 ? tagged : base).slice(0, 8);
  }, [products, trendingVehicle, trendingCmsProducts, trendingIds.length]);

  // `categorySlug`/`tag` are mock-catalog-only concepts — always "" / undefined on real
  // Odoo-backed products (see Documentations MD/odoo-real-catalog.md), so every branch below
  // falls back to a plain vehicle-filtered slice rather than rendering an empty rail. This is the
  // same graceful-degradation shape `trending` below already established: show real products
  // honestly, never fabricate a "popular"/"new"/category match that isn't backed by real data.
  const perfectVehicles = useMemo(() => {
    const curatedIds = vehicleTab === "popular" ? featuredIds : newArrivalIds;
    const curated = vehicleTab === "popular" ? featuredCmsProducts : newArrivalCmsProducts;
    if (curatedIds.length > 0) {
      if (!curated) return [];
      return curated.slice(0, 8);
    }
    const tagged = vehicleTab === "popular" ? products.filter((p) => p.tag === "bestseller" || p.tag === "trending") : products.filter((p) => p.tag === "new");
    return (tagged.length > 0 ? tagged : products).slice(0, 8);
  }, [products, vehicleTab, featuredCmsProducts, newArrivalCmsProducts, featuredIds.length, newArrivalIds.length]);

  const carCategoryProducts = (() => {
    const curated = carCategoryTab === "seat-covers" ? [carSeatIds, carSeatProducts] as const : carCategoryTab === "dash-cams" ? [carDashIds, carDashProducts] as const : carCategoryTab === "mats" ? [carMatsIds, carMatsProducts] as const : [carCareIds, carCareProducts] as const;
    if (curated[0].length) return curated[1] ?? [];
    let list: typeof products = [];
    if (carCategoryTab === "seat-covers") list = products.filter((p) => p.categorySlug === "seat-covers");
    else if (carCategoryTab === "dash-cams") list = products.filter((p) => p.categorySlug === "audio-dashcams" && /cam|dvr/i.test(p.name));
    else if (carCategoryTab === "mats") list = products.filter((p) => p.categorySlug === "floor-mats");
    else list = products.filter((p) => p.categorySlug === "car-care");
    if (list.length > 0) return list;
    return products.filter((p) => p.vehicle === "car" || p.vehicle === "universal" || p.vehicle === "unknown").slice(0, 8);
  })();

  const bikeCategoryProducts = (() => {
    const curated = bikeCategoryTab === "helmets" ? [bikeHelmetsIds, bikeHelmetsProducts] as const : bikeCategoryTab === "covers" ? [bikeCoversIds, bikeCoversProducts] as const : bikeCategoryTab === "saddlebags" ? [bikeSaddlebagsIds, bikeSaddlebagsProducts] as const : [bikeGuardsIds, bikeGuardsProducts] as const;
    if (curated[0].length) return curated[1] ?? [];
    let list: typeof products = [];
    if (bikeCategoryTab === "helmets") list = products.filter((p) => p.categorySlug === "helmets");
    else if (bikeCategoryTab === "covers") list = products.filter((p) => p.categorySlug === "bike-covers");
    else if (bikeCategoryTab === "saddlebags") list = products.filter((p) => p.categorySlug === "saddlebags");
    else list = products.filter((p) => p.categorySlug === "bike-guards");
    if (list.length > 0) return list;
    return products.filter((p) => p.vehicle === "bike" || p.vehicle === "universal" || p.vehicle === "unknown").slice(0, 8);
  })();

  // Real photo for the default (no-CMS-promotion) PromoBannerPair cards — the same curated
  // bestseller/new-arrival products "Best Combo Deals"/"New Launch" already link to (never an
  // arbitrary or unrelated product), falling back to the mock catalog's tag when no CMS
  // curation is published. Undefined (no matching product has a photo) renders PromoArt's
  // abstract fallback instead of a fake/misleading image.
  const productImage = (p: (typeof products)[number]) => p.primaryImage ?? productImages[p.id];
  const comboImage = (featuredCmsProducts && featuredCmsProducts.length > 0 ? featuredCmsProducts : products.filter((p) => p.tag === "bestseller" || p.tag === "trending"))
    .map(productImage)
    .find(Boolean);
  const newLaunchImage = (newArrivalCmsProducts && newArrivalCmsProducts.length > 0 ? newArrivalCmsProducts : products.filter((p) => p.tag === "new"))
    .map(productImage)
    .find(Boolean);

  const heroContent = (homeSections.get("hero")?.content as HeroContentOverride | undefined) ?? {};

  const blocks: Record<string, ReactNode> = {
    hero: <Hero {...heroContent} />,

    "vehicle-shop-split": <VehicleShopSplit content={homeSections.get("vehicle-shop-split")?.content} />,

    "category-strip": (
      <FullBleedSection spacing="compact" containerSize="wide" className="bg-white">
        {homeSections.get("category-strip")?.content.title ? <h2 className="heading text-2xl mb-4">{sectionText("category-strip", "title", "")}</h2> : null}
        <CategoryIconStrip cmsItems={resolvedCategories && resolvedCategories.length > 0 ? resolvedCategories : undefined} />
      </FullBleedSection>
    ),

    // Deliberately asymmetric, not one of the section-pad-* tokens — sits directly under the
    // category strip above and shouldn't repeat its top spacing.
    trending: (
      <section className="pt-2 sm:pt-4 pb-16 sm:pb-20 lg:pb-24">
        <PageContainer size="wide">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <h2 className="text-2xl sm:text-3xl heading">{sectionText("trending", "title", t("home.trendingTitle"))}</h2>
            <Link to={sectionLink("trending", "ctaLink", "/shop")} className="text-[13px] font-semibold text-brand-700 hover:underline whitespace-nowrap">
              {sectionText("trending", "ctaLabel", t("home.viewAllTrendings"))}
            </Link>
          </div>
          <div className="mb-6">
            <PillTabs
              value={trendingVehicle}
              onChange={(v) => setTrendingVehicle(v as "car" | "bike")}
              options={[
                { value: "car", label: sectionText("trending", "carLabel", t("home.tabCar")), icon: "Car" },
                { value: "bike", label: sectionText("trending", "bikeLabel", t("home.tabBike")), icon: "Bike" },
              ]}
            />
          </div>
          <ProductCarousel products={trending} tracking={{ surface: "home_trending", strategy: trendingIds.length > 0 ? "curated" : "default" }} />
        </PageContainer>
      </section>
    ),

    "perfect-vehicle": (
      <FullBleedSection spacing="normal" containerSize="wide" className="bg-steel-50">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
          <h2 className="text-2xl sm:text-3xl heading">{sectionText("perfect-vehicle", "title", t("home.perfectVehicleTitle"))}</h2>
          <Link to={sectionLink("perfect-vehicle", "ctaLink", "/shop")} className="text-[13px] font-semibold text-brand-700 hover:underline whitespace-nowrap">
            {sectionText("perfect-vehicle", "ctaLabel", t("home.viewAll"))}
          </Link>
        </div>
        <div className="mb-6">
          <PillTabs
            value={vehicleTab}
            onChange={(v) => setVehicleTab(v as "popular" | "new")}
            options={[
              { value: "popular", label: sectionText("perfect-vehicle", "popularLabel", t("home.tabPopular")), icon: "Flame" },
              { value: "new", label: sectionText("perfect-vehicle", "newLabel", t("home.tabNewlyLaunched")), icon: "Sparkles" },
            ]}
          />
        </div>
        <ProductCarousel
          products={perfectVehicles}
          tracking={{
            surface: vehicleTab === "popular" ? "home_featured" : "home_new_arrivals",
            strategy: (vehicleTab === "popular" ? featuredIds : newArrivalIds).length > 0 ? "curated" : "default",
          }}
        />
      </FullBleedSection>
    ),

    brands: (
      <FullBleedSection spacing="normal" containerSize="wide">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
          <h2 className="text-2xl sm:text-3xl heading">{sectionText("brands", "title", t("home.brandsSectionTitle"))}</h2>
          <Link to={sectionLink("brands", "ctaLink", "/brands")} className="text-[13px] font-semibold text-brand-700 hover:underline whitespace-nowrap">
            {sectionText("brands", "ctaLabel", t("home.viewAll"))}
          </Link>
        </div>
        <div className="mb-6">
          <PillTabs
            value={brandsVehicle}
            onChange={(v) => setBrandsVehicle(v as "car" | "bike")}
            options={[
              { value: "car", label: sectionText("brands", "carLabel", t("home.tabCar")), icon: "Car" },
              { value: "bike", label: sectionText("brands", "bikeLabel", t("home.tabBike")), icon: "Bike" },
            ]}
          />
        </div>
        <VehicleBrandGrid vehicle={brandsVehicle} names={(() => {
          const raw = homeSections.get("brands")?.content[brandsVehicle === "car" ? "carBrands" : "bikeBrands"];
          return typeof raw === "string" ? raw.split("\n").map((name) => name.trim()).filter(Boolean).slice(0, 24) : undefined;
        })()} />
      </FullBleedSection>
    ),

    "top-categories-car": (
      <HomeCategoryProductSection
        title={sectionText("top-categories-car", "title", t("home.topCategoriesCarTitle"))}
        ctaLabel={sectionText("top-categories-car", "ctaLabel", t("home.viewAll"))}
        ctaHref={sectionLink("top-categories-car", "ctaLink", "/shop?vehicle=car")}
        activeTab={carCategoryTab}
        onTabChange={(v) => setCarCategoryTab(v as typeof carCategoryTab)}
        tabs={[
          { value: "seat-covers", label: sectionText("top-categories-car", "seatCoversLabel", t("home.tabSeatCovers")), icon: "Armchair" },
          { value: "dash-cams", label: sectionText("top-categories-car", "dashCamsLabel", t("home.tabDashCams")), icon: "Camera" },
          { value: "mats", label: sectionText("top-categories-car", "matsLabel", t("home.tabMats")), icon: "Grid2x2" },
          { value: "care", label: sectionText("top-categories-car", "careLabel", t("home.tabCare")), icon: "SprayCan" },
        ]}
        products={carCategoryProducts}
      />
    ),

    "promo-banners": (
      <FullBleedSection spacing="compact" containerSize="wide">
        {homeSections.get("promo-banners")?.content.title ? <h2 className="heading text-2xl mb-4">{sectionText("promo-banners", "title", "")}</h2> : null}
        <PromoBannerPair
          promotions={promotions && promotions.length > 0 ? promotions : undefined}
          comboImage={comboImage}
          newLaunchImage={newLaunchImage}
        />
      </FullBleedSection>
    ),

    "top-categories-bike": (
      <HomeCategoryProductSection
        title={sectionText("top-categories-bike", "title", t("home.topCategoriesBikeTitle"))}
        ctaLabel={sectionText("top-categories-bike", "ctaLabel", t("home.viewAll"))}
        ctaHref={sectionLink("top-categories-bike", "ctaLink", "/shop?vehicle=bike")}
        activeTab={bikeCategoryTab}
        onTabChange={(v) => setBikeCategoryTab(v as typeof bikeCategoryTab)}
        tabs={[
          { value: "helmets", label: sectionText("top-categories-bike", "helmetsLabel", t("home.tabHelmets")), icon: "HardHat" },
          { value: "covers", label: sectionText("top-categories-bike", "coversLabel", t("home.tabCovers")), icon: "Umbrella" },
          { value: "saddlebags", label: sectionText("top-categories-bike", "saddlebagsLabel", t("home.tabSaddlebags")), icon: "Backpack" },
          { value: "guards", label: sectionText("top-categories-bike", "guardsLabel", t("home.tabGuards")), icon: "ShieldCheck" },
        ]}
        products={bikeCategoryProducts}
      />
    ),

    testimonials: (
      <FullBleedSection spacing="normal" containerSize="wide">
        <SectionHead title={sectionText("testimonials", "title", t("home.testimonialsTitle"))} />
        <TestimonialCarousel items={homeSections.get("testimonials")?.content.items} />
      </FullBleedSection>
    ),

    "get-in-touch": (
      <FullBleedSection spacing="normal" containerSize="wide" className="bg-steel-50">
        <GetInTouchBox content={homeSections.get("get-in-touch")?.content} />
        <div className="mt-12">
          <TrustBadgesRow />
        </div>
      </FullBleedSection>
    ),
  };

  const order = [...DEFAULT_ORDER]
    .filter((key) => homeSections.get(key)?.visible ?? true)
    .sort((a, b) => (homeSections.get(a)?.displayOrder ?? DEFAULT_ORDER.indexOf(a)) - (homeSections.get(b)?.displayOrder ?? DEFAULT_ORDER.indexOf(b)));

  return (
    <>
      <SeoHead routeKey="home" />
      {order.map((key) => (
        <Fragment key={key}>{blocks[key]}</Fragment>
      ))}
    </>
  );
}
