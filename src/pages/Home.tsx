import { Link } from "react-router-dom";
import { ArrowRight, MapPin, ShieldCheck } from "lucide-react";
import { Hero } from "../components/Hero";
import { TrustStrip } from "../components/TrustStrip";
import { CategoryGrid } from "../components/CategoryGrid";
import { Rail, RailItem } from "../components/Rail";
import { ProductCard } from "../components/ProductCard";
import { SectionHeading } from "../components/SectionHeading";
import { BrandMarquee } from "../components/BrandMarquee";
import { FounderTeaser } from "../components/FounderTeaser";
import { TestimonialsSection } from "../components/TestimonialsSection";
import { ContactForm } from "../components/ContactForm";
import { products } from "../data/products";
import { site } from "../data/site";
import { useLang } from "../i18n/LanguageContext";

export default function Home() {
  const { t } = useLang();
  const trendingCar = products.filter((p) => p.vehicle === "car" && (p.tag === "trending" || p.tag === "bestseller")).slice(0, 8);
  const trendingBike = products.filter((p) => p.vehicle === "bike").slice(0, 8);
  const carCare = products.filter((p) => p.categorySlug === "car-care" || p.categorySlug === "workshop-essentials").slice(0, 8);

  return (
    <>
      <Hero />

      <section className="py-10 border-b border-line">
        <div className="container-page">
          <TrustStrip />
        </div>
      </section>

      <section className="section-pad">
        <div className="container-page">
          <SectionHeading
            eyebrow={t("home.categoryEyebrow")}
            title={t("home.categoryTitle")}
            description={t("home.categoryDesc")}
            cta={t("home.viewCatalog")}
            ctaHref="/shop"
          />
          <CategoryGrid />
        </div>
      </section>

      <section className="section-pad bg-steel-50">
        <div className="container-page">
          <SectionHeading eyebrow={t("home.trendingCarEyebrow")} title={t("home.trendingCarTitle")} cta={t("home.shopAllCar")} ctaHref="/shop?vehicle=car" />
          <Rail>
            {trendingCar.map((p) => (
              <RailItem key={p.id}>
                <ProductCard product={p} />
              </RailItem>
            ))}
          </Rail>
        </div>
      </section>

      <section className="section-pad">
        <div className="container-page">
          <SectionHeading eyebrow={t("home.trendingBikeEyebrow")} title={t("home.trendingBikeTitle")} cta={t("home.shopAllBike")} ctaHref="/shop?vehicle=bike" />
          <Rail>
            {trendingBike.map((p) => (
              <RailItem key={p.id}>
                <ProductCard product={p} />
              </RailItem>
            ))}
          </Rail>
        </div>
      </section>

      <section className="section-pad bg-charcoal-deep text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-diagonal-lines opacity-30" aria-hidden />
        <div className="container-page relative grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <span className="eyebrow mb-4">
              <MapPin className="w-3 h-3" /> {t("home.gpsEyebrow")}
            </span>
            <h2 className="text-3xl sm:text-4xl font-semibold mb-4 leading-tight">{t("home.gpsTitle")}</h2>
            <p className="text-white/65 text-[15px] leading-relaxed mb-6 max-w-[50ch]">{t("home.gpsBody")}</p>
            <Link to="/shop?category=gps-security" className="btn-primary">
              {t("home.gpsCta")} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-white/15 p-6 flex flex-col gap-3">
              <ShieldCheck className="w-6 h-6 text-accent" />
              <div className="font-display uppercase text-sm">{t("home.antiTheftTitle")}</div>
              <p className="text-[13px] text-white/55">{t("home.antiTheftBody")}</p>
            </div>
            <div className="border border-white/15 p-6 flex flex-col gap-3">
              <MapPin className="w-6 h-6 text-accent" />
              <div className="font-display uppercase text-sm">{t("home.liveTrackingTitle")}</div>
              <p className="text-[13px] text-white/55">{t("home.liveTrackingBody")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section-pad">
        <div className="container-page">
          <SectionHeading eyebrow={t("home.careEyebrow")} title={t("home.careTitle")} cta={t("home.shopCarCare")} ctaHref="/shop?category=car-care" />
          <Rail>
            {carCare.map((p) => (
              <RailItem key={p.id}>
                <ProductCard product={p} />
              </RailItem>
            ))}
          </Rail>
        </div>
      </section>

      <section className="py-14 border-y border-line bg-steel-50">
        <div className="container-page">
          <div className="text-center mb-8">
            <span className="eyebrow justify-center">{t("home.brandsEyebrow")}</span>
            <h2 className="text-2xl font-semibold mt-2">{t("home.brandsTitle")}</h2>
          </div>
          <BrandMarquee />
        </div>
      </section>

      <FounderTeaser />
      <TestimonialsSection />

      <section className="section-pad">
        <div className="container-page grid lg:grid-cols-[1fr_1.2fr] gap-12">
          <div>
            <SectionHeading eyebrow={t("home.connectEyebrow")} title={t("home.connectTitle")} description={t("home.connectDesc")} />
            <ul className="space-y-3 text-[14px] text-steel-500 mt-6">
              <li>{site.address}</li>
              <li>
                {site.phone} &middot; {site.phoneAlt}
              </li>
              <li>{site.email}</li>
            </ul>
          </div>
          <ContactForm />
        </div>
      </section>
    </>
  );
}
