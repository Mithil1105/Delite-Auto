import { Link } from "react-router-dom";
import { ArrowRight, Star } from "lucide-react";
import { ProductArt } from "./ProductArt";
import { useLang } from "../i18n/LanguageContext";

const tiles = [
  { icon: "Armchair", category: "seat-covers", rotate: -6, size: "w-40 h-52", pos: "left-2 top-6" },
  { icon: "MapPin", category: "gps-security", rotate: 5, size: "w-36 h-36", pos: "right-0 top-0" },
  { icon: "Grid2x2", category: "floor-mats", rotate: 4, size: "w-32 h-40", pos: "right-4 bottom-2" },
  { icon: "Radio", category: "audio-dashcams", rotate: -3, size: "w-36 h-28", pos: "left-24 bottom-0" },
];

export function Hero() {
  const { t } = useLang();
  const stats = [
    ["381+", t("hero.statProducts")],
    ["38+", t("hero.statBrands")],
    ["58", t("hero.statYears")],
  ];

  return (
    <section className="relative overflow-hidden bg-charcoal-deep text-white">
      <div className="absolute inset-0 bg-grain-dark" aria-hidden />
      <div className="absolute inset-0 bg-diagonal-lines opacity-40" aria-hidden />
      <div className="container-page relative py-16 sm:py-20 lg:py-28 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
        <div>
          <span className="eyebrow mb-5">{t("hero.eyebrow")}</span>
          <h1 className="text-[2.6rem] sm:text-6xl lg:text-[4.2rem] leading-[0.98] font-semibold mb-6">
            {t("hero.titleLine1")}
            <br />
            {t("hero.titleLine2")}
          </h1>
          <p className="max-w-[46ch] text-white/65 text-[15.5px] sm:text-base leading-relaxed mb-8">{t("hero.subtitle")}</p>
          <div className="flex flex-wrap items-center gap-3 mb-10">
            <Link to="/shop?vehicle=car" className="btn-primary">
              {t("hero.ctaCar")} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/shop?vehicle=bike" className="btn-outline-light">
              {t("hero.ctaBike")}
            </Link>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            {stats.map(([n, l]) => (
              <div key={l}>
                <div className="font-display text-2xl">{n}</div>
                <div className="text-[12px] text-white/50 uppercase tracking-wide">{l}</div>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <div className="flex text-accent">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-accent" />
                ))}
              </div>
              <span className="text-[12px] text-white/50">{t("hero.rated")}</span>
            </div>
          </div>
        </div>

        <div className="relative hidden lg:block h-[420px]">
          {tiles.map((t2, i) => (
            <div key={t2.category} style={{ transform: `rotate(${t2.rotate}deg)` }} className={`absolute ${t2.pos} ${t2.size}`}>
              <div
                style={{ animationDelay: `${0.1 + i * 0.1}s` }}
                className="motion-safe:animate-fadeUp shadow-lift border-4 border-charcoal-deep w-full h-full"
              >
                <ProductArt icon={t2.icon} categorySlug={t2.category} className="w-full h-full" iconClassName="w-12 h-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
