import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Hero } from "../components/Hero";
import { Rail, RailItem } from "../components/Rail";
import { PillTabs } from "../components/home/PillTabs";
import { ProductCard } from "../components/product/ProductCard";
import { CategoryIconStrip } from "../components/home/CategoryIconStrip";
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
      <h2 className="text-2xl sm:text-3xl font-display normal-case">{title}</h2>
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

      <section className="relative bg-white overflow-hidden">
        <div className="grid lg:grid-cols-[1.15fr_1fr] min-h-[300px] sm:min-h-[330px] lg:min-h-[360px]">
          <Link
            to="/shop?vehicle=car"
            className="relative z-10 text-white bg-brand-500 px-6 sm:px-10 lg:px-14 pt-6 sm:pt-8 overflow-hidden"
            style={{ clipPath: "polygon(0 0, 100% 0, 82% 100%, 0 100%)" }}
          >
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-2xl sm:text-3xl font-display">{t("home.shopByCars")}</h3>
                <ArrowRight className="w-6 h-6 shrink-0" />
              </div>
              <div className="h-px bg-white/25 mt-4 max-w-[240px]" />
            </div>
            <div className="absolute bottom-5 sm:bottom-6 left-1/2 -translate-x-1/2 w-[70%] max-w-[320px]">
              <div className="absolute inset-x-6 bottom-1 h-4 rounded-[50%] bg-black/35 blur-md" aria-hidden />
              <img
                src="/images/hero/car.png"
                alt=""
                className="relative w-full h-auto max-h-[160px] sm:max-h-[190px] lg:max-h-[215px] object-contain object-bottom pointer-events-none"
              />
            </div>
          </Link>
          <Link
            to="/shop?vehicle=bike"
            className="relative bg-white px-6 sm:px-10 lg:px-14 pt-6 sm:pt-8 overflow-hidden"
          >
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-2xl sm:text-3xl font-display text-ink">{t("home.shopByBikes")}</h3>
                <span className="grid place-items-center w-7 h-7 rounded-full bg-brand-500 text-white shrink-0">
                  <ArrowRight className="w-4 h-4" />
                </span>
              </div>
              <div className="h-px bg-line mt-4 max-w-[240px]" />
            </div>
            <div className="absolute bottom-5 sm:bottom-6 left-1/2 -translate-x-1/2 w-[45%] max-w-[180px]">
              <div className="absolute inset-x-3 bottom-1 h-3 rounded-[50%] bg-black/25 blur-md" aria-hidden />
              <img
                src="/images/hero/bike.png"
                alt=""
                className="relative w-full h-auto max-h-[175px] sm:max-h-[210px] lg:max-h-[235px] object-contain object-bottom pointer-events-none"
              />
            </div>
          </Link>
        </div>
      </section>

      <section className="py-8 sm:py-10 lg:py-12">
        <div className="container-wide">
          <CategoryIconStrip />
        </div>
      </section>

      <section className="pt-2 sm:pt-4 pb-16 sm:pb-20 lg:pb-24">
        <div className="container-wide">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <h2 className="text-2xl sm:text-3xl font-display normal-case">{t("home.trendingTitle")}</h2>
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
                <ProductCard product={p} />
              </RailItem>
            ))}
          </Rail>
        </div>
      </section>

      <section className="section-pad bg-steel-50">
        <div className="container-wide">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <h2 className="text-2xl sm:text-3xl font-display normal-case">{t("home.perfectVehicleTitle")}</h2>
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
                <ProductCard product={p} />
              </RailItem>
            ))}
          </Rail>
        </div>
      </section>

      <section className="section-pad">
        <div className="container-wide">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <h2 className="text-2xl sm:text-3xl font-display normal-case">{t("home.brandsSectionTitle")}</h2>
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
        <div className="container-wide">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <h2 className="text-2xl sm:text-3xl font-display normal-case">{t("home.topCategoriesCarTitle")}</h2>
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
                <ProductCard product={p} />
              </RailItem>
            ))}
          </Rail>
        </div>
      </section>

      <section className="section-pad">
        <div className="container-wide">
          <PromoBannerPair />
        </div>
      </section>

      <section className="section-pad bg-steel-50">
        <div className="container-wide">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <h2 className="text-2xl sm:text-3xl font-display normal-case">{t("home.topCategoriesBikeTitle")}</h2>
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
                <ProductCard product={p} />
              </RailItem>
            ))}
          </Rail>
        </div>
      </section>

      <section className="section-pad">
        <div className="container-wide">
          <SectionHead title={t("home.testimonialsTitle")} />
          <TestimonialCarousel />
        </div>
      </section>

      <section className="section-pad bg-steel-50">
        <div className="container-wide">
          <GetInTouchBox />
          <div className="mt-12">
            <TrustBadgesRow />
          </div>
        </div>
      </section>
    </>
  );
}
