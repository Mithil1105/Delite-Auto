import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Hero } from "../components/Hero";
import { Rail, RailItem } from "../components/Rail";
import { PillTabs } from "../components/home/PillTabs";
import { HomeProductCard } from "../components/home/HomeProductCard";
import { CategoryIconStrip } from "../components/home/CategoryIconStrip";
import { VehicleBrandGrid } from "../components/home/VehicleBrandGrid";
import { PromoBannerPair } from "../components/home/PromoBannerPair";
import { TestimonialCarousel } from "../components/home/TestimonialCarousel";
import { GetInTouchBox } from "../components/home/GetInTouchBox";
import { TrustBadgesRow } from "../components/home/TrustBadgesRow";
import { ProductArt } from "../components/ProductArt";
import { products } from "../data/products";
import { useLang } from "../i18n/LanguageContext";

function SectionHead({ title, cta, onCta }: { title: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-5">
      <h2 className="text-xl sm:text-2xl font-display normal-case">{title}</h2>
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
  const [vehicleTab, setVehicleTab] = useState<"popular" | "new" | "upcoming">("popular");
  const [brandsVehicle, setBrandsVehicle] = useState<"car" | "bike">("car");
  const [carCategoryTab, setCarCategoryTab] = useState<"seat-covers" | "dash-cams" | "covers" | "care">("seat-covers");
  const [bikeCategoryTab, setBikeCategoryTab] = useState<"helmets" | "covers" | "saddlebags" | "locks">("helmets");

  const trending = useMemo(() => {
    const base = products.filter((p) => p.vehicle === trendingVehicle);
    const tagged = base.filter((p) => p.tag === "trending" || p.tag === "bestseller");
    return (tagged.length >= 6 ? tagged : base).slice(0, 8);
  }, [trendingVehicle]);

  const perfectVehicles = useMemo(() => {
    if (vehicleTab === "popular") return products.filter((p) => p.tag === "bestseller" || p.tag === "trending").slice(0, 8);
    if (vehicleTab === "new") return products.filter((p) => p.tag === "new").slice(0, 8);
    return products.slice(-8);
  }, [vehicleTab]);

  const carCategoryProducts = useMemo(() => {
    if (carCategoryTab === "seat-covers") return products.filter((p) => p.categorySlug === "seat-covers");
    if (carCategoryTab === "dash-cams")
      return products.filter((p) => p.categorySlug === "audio-dashcams" && /cam|dvr/i.test(p.name));
    if (carCategoryTab === "covers") return products.filter((p) => p.categorySlug === "floor-mats");
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

      <section className="section-pad">
        <div className="container-page grid sm:grid-cols-2 gap-4">
          <Link to="/shop?vehicle=car" className="relative overflow-hidden rounded-2xl bg-brand-700 text-white p-6 sm:p-8 flex items-center justify-between gap-4 min-h-[160px]">
            <div>
              <h3 className="text-xl font-display mb-2">{t("home.shopByCars")}</h3>
              <ArrowRight className="w-5 h-5" />
            </div>
            <ProductArt icon="Sofa" categorySlug="seat-covers" className="w-24 h-24 rounded-xl shrink-0" iconClassName="w-10 h-10" />
          </Link>
          <Link to="/shop?vehicle=bike" className="relative overflow-hidden rounded-2xl border border-line bg-white p-6 sm:p-8 flex items-center justify-between gap-4 min-h-[160px]">
            <div>
              <h3 className="text-xl font-display mb-2">{t("home.shopByBikes")}</h3>
              <ArrowRight className="w-5 h-5" />
            </div>
            <ProductArt icon="ShieldCheck" categorySlug="bike-guards" className="w-24 h-24 rounded-xl shrink-0" iconClassName="w-10 h-10" />
          </Link>
        </div>
      </section>

      <section className="pb-4">
        <div className="container-page">
          <CategoryIconStrip />
        </div>
      </section>

      <section className="section-pad">
        <div className="container-page">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <h2 className="text-xl sm:text-2xl font-display normal-case">{t("home.trendingTitle")}</h2>
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
          <Rail>
            {trending.map((p) => (
              <RailItem key={p.id}>
                <HomeProductCard product={p} />
              </RailItem>
            ))}
          </Rail>
        </div>
      </section>

      <section className="section-pad bg-steel-50">
        <div className="container-page">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <h2 className="text-xl sm:text-2xl font-display normal-case">{t("home.perfectVehicleTitle")}</h2>
            <Link to="/shop" className="text-[13px] font-semibold text-brand-700 hover:underline whitespace-nowrap">
              {t("home.viewAll")}
            </Link>
          </div>
          <div className="mb-6">
            <PillTabs
              value={vehicleTab}
              onChange={(v) => setVehicleTab(v as "popular" | "new" | "upcoming")}
              options={[
                { value: "popular", label: t("home.tabPopular"), icon: "Flame" },
                { value: "new", label: t("home.tabNewlyLaunched"), icon: "Sparkles" },
                { value: "upcoming", label: t("home.tabUpcoming"), icon: "CalendarClock" },
              ]}
            />
          </div>
          <Rail>
            {perfectVehicles.map((p) => (
              <RailItem key={p.id}>
                <HomeProductCard product={p} />
              </RailItem>
            ))}
          </Rail>
        </div>
      </section>

      <section className="section-pad">
        <div className="container-page">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <h2 className="text-xl sm:text-2xl font-display normal-case">{t("home.brandsSectionTitle")}</h2>
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
        </div>
      </section>

      <section className="section-pad bg-steel-50">
        <div className="container-page">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <h2 className="text-xl sm:text-2xl font-display normal-case">{t("home.topCategoriesCarTitle")}</h2>
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
                { value: "covers", label: t("home.tabCovers") },
                { value: "care", label: t("home.tabCare") },
              ]}
            />
          </div>
          <Rail>
            {carCategoryProducts.map((p) => (
              <RailItem key={p.id}>
                <HomeProductCard product={p} />
              </RailItem>
            ))}
          </Rail>
        </div>
      </section>

      <section className="section-pad">
        <div className="container-page">
          <PromoBannerPair />
        </div>
      </section>

      <section className="section-pad bg-steel-50">
        <div className="container-page">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <h2 className="text-xl sm:text-2xl font-display normal-case">{t("home.topCategoriesBikeTitle")}</h2>
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
                { value: "locks", label: t("home.tabLocksSafety") },
              ]}
            />
          </div>
          <Rail>
            {bikeCategoryProducts.map((p) => (
              <RailItem key={p.id}>
                <HomeProductCard product={p} />
              </RailItem>
            ))}
          </Rail>
        </div>
      </section>

      <section className="section-pad">
        <div className="container-page">
          <SectionHead title={t("home.testimonialsTitle")} />
          <TestimonialCarousel />
        </div>
      </section>

      <section className="section-pad bg-steel-50">
        <div className="container-page">
          <GetInTouchBox />
          <div className="mt-12">
            <TrustBadgesRow />
          </div>
        </div>
      </section>
    </>
  );
}
