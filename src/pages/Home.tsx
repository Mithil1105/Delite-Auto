import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Product } from "../data/types";
import { Hero, type HeroContentOverride } from "../components/Hero";
import { PageContainer } from "../components/layout/PageContainer";
import { FullBleedSection } from "../components/layout/FullBleedSection";
import { PillTabs } from "../components/home/PillTabs";
import { ProductCarousel } from "../components/product/ProductCarousel";
import { HomeCategoryProductSection } from "../components/home/HomeCategoryProductSection";
import { CategoryIconStrip } from "../components/home/CategoryIconStrip";
import { VehicleShopSplit } from "../components/home/VehicleShopSplit";
import { VehicleBrandGrid } from "../components/home/VehicleBrandGrid";
import { CarModelGrid } from "../components/home/CarModelGrid";
import { HomeImageBanner } from "../components/home/HomeImageBanner";
import { HomeBlogLatest } from "../components/home/HomeBlogLatest";
import { HomeFeatureBlock } from "../components/home/HomeFeatureBlock";
import { PromoBannerPair } from "../components/home/PromoBannerPair";
import { TestimonialCarousel } from "../components/home/TestimonialCarousel";
import { GetInTouchBox } from "../components/home/GetInTouchBox";
import { TrustBadgesRow } from "../components/home/TrustBadgesRow";
import { SeoHead } from "../components/SeoHead";
import { products as fallbackProducts } from "../data/products";
import { productImages } from "../lib/productImages";
import { useCatalogProducts } from "../hooks/useCatalogProducts";
import { useCategoryTabProducts, type CategoryTabSpec } from "../hooks/useCategoryTabProducts";
import { catalogService } from "../services/catalog/catalogService";
import { useLang } from "../i18n/LanguageContext";
import { useHomepageCms } from "../hooks/useHomepageCms";
import { useMerchandisingCms, useMerchandisedProducts, useResolvedCategorySelections, type CategorySelection } from "../hooks/useMerchandisingCms";
import { usePromotions } from "../hooks/usePromotions";
import { Reveal } from "../components/motion/Reveal";

/** Matches the `homepage` cms_page's section_key rows, in the same order Home.tsx has always
 * rendered them — a published reorder/hide changes this at render time; absent CMS data (loading,
 * or nothing published yet) renders every section in this exact default order, unchanged. */
const DEFAULT_ORDER = [
  "hero",
  "vehicle-shop-split",
  "category-strip",
  "image-banner-1",
  "trending",
  "trending-accessories",
  "feature-block-1",
  "perfect-vehicle",
  "brands",
  "feature-block-2",
  "car-models",
  "top-categories-car",
  "image-banner-2",
  "promo-banners",
  "feature-block-3",
  "top-categories-bike",
  "image-banner-3",
  "feature-block-4",
  "blog-latest",
  "testimonials",
  "get-in-touch",
];

const IS_REAL_CATALOG = import.meta.env.VITE_CATALOG_SOURCE === "supabase";

/** Live-catalog lookup for each "Shop by Top Categories" tab when the admin hasn't hand-picked products for it. Real Odoo
 * products carry no category slug, so tabs use the Odoo category id (Car Mats, Car Care) or a name search. */
/** Trending Accessories falls back to Odoo's trending category (id 18) when the admin hasn't picked products. */
const TRENDING_ACCESSORIES_SPEC: CategoryTabSpec = { categoryId: 18 };

const CAR_TAB_SPECS: Record<string, CategoryTabSpec> = {
  "seat-covers": { vehicle: "car", queries: ["seat cover"] },
  "dash-cams": { vehicle: "car", queries: ["dash cam", "dvr"] },
  mats: { vehicle: "car", categoryId: 59 },
  care: { vehicle: "car", categoryId: 17 },
};
const BIKE_TAB_SPECS: Record<string, CategoryTabSpec> = {
  // Built from what the bike catalog really contains (bike-tagged products only): everything, seat covers, mats, covers.
  all: { vehicle: "bike", exact: true },
  "seat-covers": { vehicle: "bike", exact: true, queries: ["seat cover"] },
  mats: { vehicle: "bike", exact: true, queries: ["mat"] },
  covers: { vehicle: "bike", exact: true, queries: ["cover"] },
};

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
  const navigate = useNavigate();

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

  // Fire-and-forget, as early as possible: getCategories() is cached/deduped (see
  // supabaseCatalogService.ts), so this just starts the real network request immediately instead
  // of leaving it to start only once useResolvedCategorySelections (below, via
  // useMerchandisingCms) happens to get around to it — confirmed live via a production network
  // waterfall to otherwise delay that request by ~700ms for no real reason (it doesn't actually
  // depend on merchandising CMS data, only incidentally runs after it resolves).
  useEffect(() => {
    catalogService.getCategories().catch(() => {});
  }, []);

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
  const bikeAllIds = sectionIds("top-categories-bike", "allIds");
  const bikeSeatIds = sectionIds("top-categories-bike", "seatCoversIds");
  const bikeMatsIds = sectionIds("top-categories-bike", "matsIds");
  const bikeCoversIds = sectionIds("top-categories-bike", "coversIds");
  const { products: carSeatProducts } = useMerchandisedProducts(carSeatIds);
  const { products: carDashProducts } = useMerchandisedProducts(carDashIds);
  const { products: carMatsProducts } = useMerchandisedProducts(carMatsIds);
  const { products: carCareProducts } = useMerchandisedProducts(carCareIds);
  const { products: bikeAllProducts } = useMerchandisedProducts(bikeAllIds);
  const { products: bikeSeatProducts } = useMerchandisedProducts(bikeSeatIds);
  const { products: bikeMatsProducts } = useMerchandisedProducts(bikeMatsIds);
  const { products: bikeCoversProducts } = useMerchandisedProducts(bikeCoversIds);

  const [trendingVehicle, setTrendingVehicle] = useState<"car" | "bike">("car");
  const [vehicleTab, setVehicleTab] = useState<"popular" | "new">("popular");
  const [brandsVehicle, setBrandsVehicle] = useState<"car" | "bike">("car");
  const [carCategoryTab, setCarCategoryTab] = useState<"seat-covers" | "dash-cams" | "mats" | "care">("seat-covers");
  const [bikeCategoryTab, setBikeCategoryTab] = useState<"all" | "seat-covers" | "mats" | "covers">("all");
  // One "Shop by Top Categories" block with a Car / Bike switch (it takes the car section's slot in the page order).
  const [catVehicle, setCatVehicle] = useState<"car" | "bike">("car");

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

  const trendingAccIds = sectionIds("trending-accessories", "productIds");
  const { products: trendingAccCurated } = useMerchandisedProducts(trendingAccIds);
  const trendingAccLive = useCategoryTabProducts(IS_REAL_CATALOG && trendingAccIds.length === 0 ? TRENDING_ACCESSORIES_SPEC : null);
  const trendingAccessories: Product[] =
    trendingAccIds.length > 0 ? trendingAccCurated ?? [] : IS_REAL_CATALOG ? (trendingAccLive ?? []).slice(0, 8) : products.filter((p) => p.tag === "trending" || p.tag === "bestseller").slice(0, 8);

  const carHasCurated = (carCategoryTab === "seat-covers" ? carSeatIds : carCategoryTab === "dash-cams" ? carDashIds : carCategoryTab === "mats" ? carMatsIds : carCareIds).length > 0;
  const bikeHasCurated = (bikeCategoryTab === "all" ? bikeAllIds : bikeCategoryTab === "seat-covers" ? bikeSeatIds : bikeCategoryTab === "mats" ? bikeMatsIds : bikeCoversIds).length > 0;
  const carLive = useCategoryTabProducts(IS_REAL_CATALOG && catVehicle === "car" && !carHasCurated ? CAR_TAB_SPECS[carCategoryTab] : null);
  const bikeLive = useCategoryTabProducts(IS_REAL_CATALOG && catVehicle === "bike" && !bikeHasCurated ? BIKE_TAB_SPECS[bikeCategoryTab] : null);

  const carCategoryProducts = (() => {
    if (IS_REAL_CATALOG && !carHasCurated) return carLive ?? [];
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
    if (IS_REAL_CATALOG && !bikeHasCurated) return bikeLive ?? [];
    const curated = bikeCategoryTab === "all" ? [bikeAllIds, bikeAllProducts] as const : bikeCategoryTab === "seat-covers" ? [bikeSeatIds, bikeSeatProducts] as const : bikeCategoryTab === "mats" ? [bikeMatsIds, bikeMatsProducts] as const : [bikeCoversIds, bikeCoversProducts] as const;
    if (curated[0].length) return curated[1] ?? [];
    let list: typeof products = [];
    if (bikeCategoryTab === "seat-covers") list = products.filter((p) => p.vehicle === "bike" && p.categorySlug === "seat-covers");
    else if (bikeCategoryTab === "mats") list = products.filter((p) => p.vehicle === "bike" && p.categorySlug === "floor-mats");
    else if (bikeCategoryTab === "covers") list = products.filter((p) => p.categorySlug === "bike-covers");
    if (list.length > 0) return list;
    return products.filter((p) => p.vehicle === "bike").slice(0, 8);
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

    "trending-accessories": trendingAccessories.length > 0 ? (
      <FullBleedSection spacing="normal" containerSize="wide">
        <SectionHead
          title={sectionText("trending-accessories", "title", t("home.trendingAccessoriesTitle"))}
          cta={sectionText("trending-accessories", "ctaLabel", t("home.viewAll"))}
          onCta={() => navigate(sectionLink("trending-accessories", "ctaLink", "/shop"))}
        />
        <ProductCarousel products={trendingAccessories} />
      </FullBleedSection>
    ) : null,

    "feature-block-1": <HomeFeatureBlock content={homeSections.get("feature-block-1")?.content} />,
    "feature-block-2": <HomeFeatureBlock content={homeSections.get("feature-block-2")?.content} />,
    "feature-block-3": <HomeFeatureBlock content={homeSections.get("feature-block-3")?.content} />,
    "feature-block-4": <HomeFeatureBlock content={homeSections.get("feature-block-4")?.content} />,

    "blog-latest": <HomeBlogLatest title={sectionText("blog-latest", "title", "")} ctaLabel={sectionText("blog-latest", "ctaLabel", "")} />,

    "image-banner-1": <HomeImageBanner content={homeSections.get("image-banner-1")?.content} />,
    "image-banner-2": <HomeImageBanner content={homeSections.get("image-banner-2")?.content} />,
    "image-banner-3": <HomeImageBanner content={homeSections.get("image-banner-3")?.content} />,

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

    // Static car-model tiles (src/data/carModels.ts) — not a CMS-seeded section, so it has no row in
    // the admin Homepage editor; its default position (right after "brands") is derived below.
    "car-models": (
      <FullBleedSection spacing="normal" containerSize="wide" className="bg-steel-50">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h2 className="text-2xl sm:text-3xl heading">{sectionText("car-models", "title", t("home.carModelsTitle"))}</h2>
          <Link to="/cars" className="text-[13px] font-semibold text-brand-700 hover:underline whitespace-nowrap">
            {t("home.viewAll")}
          </Link>
        </div>
        <CarModelGrid />
      </FullBleedSection>
    ),

    "top-categories-car": (
      <HomeCategoryProductSection
        title={catVehicle === "car" ? sectionText("top-categories-car", "title", t("home.topCategoriesCarTitle")) : sectionText("top-categories-bike", "title", t("home.topCategoriesBikeTitle"))}
        ctaLabel={sectionText(catVehicle === "car" ? "top-categories-car" : "top-categories-bike", "ctaLabel", t("home.viewAll"))}
        ctaHref={catVehicle === "car" ? sectionLink("top-categories-car", "ctaLink", "/shop?vehicle=car") : sectionLink("top-categories-bike", "ctaLink", "/shop?vehicle=bike")}
        topSlot={
          <PillTabs
            value={catVehicle}
            onChange={(v) => setCatVehicle(v as "car" | "bike")}
            options={[
              { value: "car", label: t("home.tabCar"), icon: "Car" },
              { value: "bike", label: t("home.tabBike"), icon: "Bike" },
            ]}
          />
        }
        activeTab={catVehicle === "car" ? carCategoryTab : bikeCategoryTab}
        onTabChange={(v) => (catVehicle === "car" ? setCarCategoryTab(v as typeof carCategoryTab) : setBikeCategoryTab(v as typeof bikeCategoryTab))}
        tabs={
          catVehicle === "car"
            ? [
                { value: "seat-covers", label: sectionText("top-categories-car", "seatCoversLabel", t("home.tabSeatCovers")), icon: "Armchair" },
                { value: "dash-cams", label: sectionText("top-categories-car", "dashCamsLabel", t("home.tabDashCams")), icon: "Camera" },
                { value: "mats", label: sectionText("top-categories-car", "matsLabel", t("home.tabMats")), icon: "Grid2x2" },
                { value: "care", label: sectionText("top-categories-car", "careLabel", t("home.tabCare")), icon: "SprayCan" },
              ]
            : [
                { value: "all", label: sectionText("top-categories-bike", "allLabel", t("home.tabBikeAll")), icon: "Bike" },
                { value: "seat-covers", label: sectionText("top-categories-bike", "seatCoversLabel", t("home.tabSeatCovers")), icon: "Armchair" },
                { value: "mats", label: sectionText("top-categories-bike", "matsLabel", t("home.tabMats")), icon: "Grid2x2" },
                { value: "covers", label: sectionText("top-categories-bike", "coversLabel", t("home.tabCovers")), icon: "Umbrella" },
              ]
        }
        products={catVehicle === "car" ? carCategoryProducts : bikeCategoryProducts}
        loading={IS_REAL_CATALOG && (catVehicle === "car" ? !carHasCurated && carLive === null : !bikeHasCurated && bikeLive === null)}
        emptyLabel={t("home.categoryEmpty")}
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

    // Shown inside the combined "Shop by Top Categories" block above (Car / Bike switch) - nothing to render on its own.
    "top-categories-bike": null,

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

  // "car-models" has no CMS row, so when the CMS supplies explicit display orders for the other
  // sections it sits just after "brands" (half a step later) instead of at an index that would
  // collide with a CMS-assigned number.
  const sectionPosition = (key: string) => {
    const cms = homeSections.get(key)?.displayOrder;
    if (cms !== undefined) return cms;
    if (key === "car-models") return (homeSections.get("brands")?.displayOrder ?? DEFAULT_ORDER.indexOf("brands")) + 0.5;
    return DEFAULT_ORDER.indexOf(key);
  };

  const order = [...DEFAULT_ORDER]
    .filter((key) => homeSections.get(key)?.visible ?? true)
    .sort((a, b) => sectionPosition(a) - sectionPosition(b));

  return (
    <>
      <SeoHead routeKey="home" />
      {order.map((key) => (
        // The hero is the first paint and must never wait on an animation; every later section fades in as it scrolls into view.
        <Fragment key={key}>{key === "hero" ? blocks[key] : <Reveal>{blocks[key]}</Reveal>}</Fragment>
      ))}
    </>
  );
}
