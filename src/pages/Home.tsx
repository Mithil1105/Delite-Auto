import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Hero } from "../components/Hero";
import { PageContainer } from "../components/layout/PageContainer";
import { FullBleedSection } from "../components/layout/FullBleedSection";
import { PillTabs } from "../components/home/PillTabs";
import { ProductCarousel } from "../components/product/ProductCarousel";
import { CategoryIconStrip } from "../components/home/CategoryIconStrip";
import { VehicleShopSplit } from "../components/home/VehicleShopSplit";
import { VehicleBrandGrid } from "../components/home/VehicleBrandGrid";
import { PromoBannerPair } from "../components/home/PromoBannerPair";
import { TestimonialCarousel } from "../components/home/TestimonialCarousel";
import { GetInTouchBox } from "../components/home/GetInTouchBox";
import { TrustBadgesRow } from "../components/home/TrustBadgesRow";
import { products } from "../data/products";
import { useLang } from "../i18n/LanguageContext";

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

  const [trendingVehicle, setTrendingVehicle] = useState<"car" | "bike">("car");
  const [vehicleTab, setVehicleTab] = useState<"popular" | "new">("popular");
  const [brandsVehicle, setBrandsVehicle] = useState<"car" | "bike">("car");
  const [carCategoryTab, setCarCategoryTab] = useState<"seat-covers" | "dash-cams" | "mats" | "care">("seat-covers");
  const [bikeCategoryTab, setBikeCategoryTab] = useState<"helmets" | "covers" | "saddlebags" | "guards">("helmets");

  const trending = useMemo(() => {
    const base = products.filter((p) => p.vehicle === trendingVehicle);
    const tagged = base.filter((p) => p.tag === "trending" || p.tag === "bestseller");
    return (tagged.length >= 6 ? tagged : base).slice(0, 8);
  }, [trendingVehicle]);

  const perfectVehicles = useMemo(() => {
    if (vehicleTab === "popular") return products.filter((p) => p.tag === "bestseller" || p.tag === "trending").slice(0, 8);
    return products.filter((p) => p.tag === "new").slice(0, 8);
  }, [vehicleTab]);

  const carCategoryProducts = useMemo(() => {
    if (carCategoryTab === "seat-covers") return products.filter((p) => p.categorySlug === "seat-covers");
    if (carCategoryTab === "dash-cams")
      return products.filter((p) => p.categorySlug === "audio-dashcams" && /cam|dvr/i.test(p.name));
    if (carCategoryTab === "mats") return products.filter((p) => p.categorySlug === "floor-mats");
    return products.filter((p) => p.categorySlug === "car-care");
  }, [carCategoryTab]);

  const bikeCategoryProducts = useMemo(() => {
    if (bikeCategoryTab === "helmets") return products.filter((p) => p.categorySlug === "helmets");
    if (bikeCategoryTab === "covers") return products.filter((p) => p.categorySlug === "bike-covers");
    if (bikeCategoryTab === "saddlebags") return products.filter((p) => p.categorySlug === "saddlebags");
    return products.filter((p) => p.categorySlug === "bike-guards");
  }, [bikeCategoryTab]);

  return (
    <>
      <Hero />

      <VehicleShopSplit />

      <FullBleedSection spacing="compact" containerSize="wide">
        <CategoryIconStrip />
      </FullBleedSection>

      {/* Deliberately asymmetric, not one of the section-pad-* tokens — sits directly under the
          category strip above and shouldn't repeat its top spacing. */}
      <section className="pt-2 sm:pt-4 pb-16 sm:pb-20 lg:pb-24">
        <PageContainer size="wide">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <h2 className="text-2xl sm:text-3xl heading">{t("home.trendingTitle")}</h2>
            <Link to="/shop" className="text-[13px] font-semibold text-brand-700 hover:underline whitespace-nowrap">
              {t("home.viewAllTrendings")}
            </Link>
          </div>
          <div className="mb-6">
            <PillTabs
              value={trendingVehicle}
              onChange={(v) => setTrendingVehicle(v as "car" | "bike")}
              options={[
                { value: "car", label: t("home.tabCar"), icon: "Car" },
                { value: "bike", label: t("home.tabBike"), icon: "Bike" },
              ]}
            />
          </div>
          <ProductCarousel products={trending} />
        </PageContainer>
      </section>

      <FullBleedSection spacing="normal" containerSize="wide" className="bg-steel-50">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
          <h2 className="text-2xl sm:text-3xl heading">{t("home.perfectVehicleTitle")}</h2>
          <Link to="/shop" className="text-[13px] font-semibold text-brand-700 hover:underline whitespace-nowrap">
            {t("home.viewAll")}
          </Link>
        </div>
        <div className="mb-6">
          <PillTabs
            value={vehicleTab}
            onChange={(v) => setVehicleTab(v as "popular" | "new")}
            options={[
              { value: "popular", label: t("home.tabPopular"), icon: "Flame" },
              { value: "new", label: t("home.tabNewlyLaunched"), icon: "Sparkles" },
            ]}
          />
        </div>
        <ProductCarousel products={perfectVehicles} />
      </FullBleedSection>

      <FullBleedSection spacing="normal" containerSize="wide">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
          <h2 className="text-2xl sm:text-3xl heading">{t("home.brandsSectionTitle")}</h2>
          <Link to="/brands" className="text-[13px] font-semibold text-brand-700 hover:underline whitespace-nowrap">
            {t("home.viewAll")}
          </Link>
        </div>
        <div className="mb-6">
          <PillTabs
            value={brandsVehicle}
            onChange={(v) => setBrandsVehicle(v as "car" | "bike")}
            options={[
              { value: "car", label: t("home.tabCar"), icon: "Car" },
              { value: "bike", label: t("home.tabBike"), icon: "Bike" },
            ]}
          />
        </div>
        <VehicleBrandGrid vehicle={brandsVehicle} />
      </FullBleedSection>

      <FullBleedSection spacing="normal" containerSize="wide" className="bg-steel-50">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
          <h2 className="text-2xl sm:text-3xl heading">{t("home.topCategoriesCarTitle")}</h2>
          <Link to="/shop?vehicle=car" className="text-[13px] font-semibold text-brand-700 hover:underline whitespace-nowrap">
            {t("home.viewAll")}
          </Link>
        </div>
        <div className="mb-6">
          <PillTabs
            value={carCategoryTab}
            onChange={(v) => setCarCategoryTab(v as typeof carCategoryTab)}
            options={[
              { value: "seat-covers", label: t("home.tabSeatCovers") },
              { value: "dash-cams", label: t("home.tabDashCams") },
              { value: "mats", label: t("home.tabMats") },
              { value: "care", label: t("home.tabCare") },
            ]}
          />
        </div>
        <ProductCarousel products={carCategoryProducts} />
      </FullBleedSection>

      <FullBleedSection spacing="compact" containerSize="wide">
        <PromoBannerPair />
      </FullBleedSection>

      <FullBleedSection spacing="normal" containerSize="wide" className="bg-steel-50">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
          <h2 className="text-2xl sm:text-3xl heading">{t("home.topCategoriesBikeTitle")}</h2>
          <Link to="/shop?vehicle=bike" className="text-[13px] font-semibold text-brand-700 hover:underline whitespace-nowrap">
            {t("home.viewAll")}
          </Link>
        </div>
        <div className="mb-6">
          <PillTabs
            value={bikeCategoryTab}
            onChange={(v) => setBikeCategoryTab(v as typeof bikeCategoryTab)}
            options={[
              { value: "helmets", label: t("home.tabHelmets") },
              { value: "covers", label: t("home.tabCovers") },
              { value: "saddlebags", label: t("home.tabSaddlebags") },
              { value: "guards", label: t("home.tabGuards") },
            ]}
          />
        </div>
        <ProductCarousel products={bikeCategoryProducts} />
      </FullBleedSection>

      <FullBleedSection spacing="normal" containerSize="wide">
        <SectionHead title={t("home.testimonialsTitle")} />
        <TestimonialCarousel />
      </FullBleedSection>

      <FullBleedSection spacing="normal" containerSize="wide" className="bg-steel-50">
        <GetInTouchBox />
        <div className="mt-12">
          <TrustBadgesRow />
        </div>
      </FullBleedSection>
    </>
  );
}
