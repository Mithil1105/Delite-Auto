import { Link } from "react-router-dom";
import { useLang } from "../i18n/LanguageContext";

/**
 * Figma-redesign hero. Car/bike photography (public/images/hero/car.png, bike.png) are real,
 * background-removed stock photos (Pixabay Content License — free for commercial use, no
 * attribution required) sourced to stand in for the Figma mock's own photography, which we
 * don't have export access to. See Documentations MD/figma-homepage-redesign.md.
 *
 * The Figma mock fans real accessory-product renders in front of each vehicle. We don't have the
 * exact Figma exports, but the repo already ships real, isolated (alpha-cut) product photography
 * under public/images/products/ that's otherwise unused — `seat-black`/`seat-grey` are the actual
 * Dolphin seat-cover photos behind the "Dolphin Orbit Seat Cover" products in the catalog, and
 * `pillow-black` is a real 4N Mats headrest-pillow pair — so `AccessoryCluster` fans genuine
 * product photos instead of a drawn stand-in.
 */
function AccessoryCluster({
  items,
}: {
  items: { src: string; width: number; rotate: number; y: number }[];
}) {
  return (
    <div className="flex items-end justify-center -space-x-6">
      {items.map((item, i) => (
        <img
          key={item.src}
          src={item.src}
          alt=""
          className="h-auto object-contain pointer-events-none select-none drop-shadow-[0_10px_14px_rgba(0,0,0,0.45)]"
          style={{
            width: item.width,
            transform: `rotate(${item.rotate}deg) translateY(${item.y}px)`,
            zIndex: i,
          }}
        />
      ))}
    </div>
  );
}

export function Hero() {
  const { t } = useLang();

  return (
    <section className="relative overflow-hidden bg-brand-700 text-white">
      <div className="absolute inset-0 bg-grain-navy" aria-hidden />
      <div className="absolute inset-0 bg-grid-navy [background-size:32px_32px] opacity-40" aria-hidden />
      <div className="container-wide relative py-14 sm:py-16 lg:py-20 grid lg:grid-cols-3 gap-6 items-center">
        <div className="hidden lg:flex justify-center">
          <div className="relative w-full max-w-[400px] motion-safe:animate-fadeUp">
            <img src="/images/hero/car.png" alt="" className="w-full h-auto object-contain" />
            <div className="absolute -bottom-1 inset-x-0 translate-x-2">
              <AccessoryCluster
                items={[
                  { src: "/images/hero/seat-black.png", width: 105, rotate: -6, y: 8 },
                  { src: "/images/hero/seat-grey.png", width: 115, rotate: 6, y: 0 },
                ]}
              />
            </div>
          </div>
        </div>

        <div className="text-center">
          <p className="font-display italic text-white/60 text-lg mb-1">{t("hero.tiredLine")}</p>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.02] mb-3">
            <span className="block">{t("hero.upgradeLine1")}</span>
            <span className="block text-gold">{t("hero.upgradeLine2")}</span>
          </h1>
          <p className="text-white/70 text-[15px] mb-8">{t("hero.subtitle")}</p>
          <Link to="/shop" className="btn-pill-gold px-10">
            {t("hero.cta")}
          </Link>
        </div>

        <div className="hidden lg:flex justify-center">
          <div className="relative w-full max-w-[220px] motion-safe:animate-fadeUp" style={{ animationDelay: "0.1s" }}>
            <img src="/images/hero/bike.png" alt="" className="w-full h-auto object-contain" />
            <div className="absolute -bottom-2 inset-x-0">
              <AccessoryCluster items={[{ src: "/images/hero/pillow-black.png", width: 128, rotate: 0, y: 2 }]} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
