import { Link } from "react-router-dom";
import { Car, Bike, Armchair } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";

/**
 * Figma-redesign hero. The Figma mock shows real photography (an SUV + seat covers on the
 * left, a motorcycle + bike seat covers on the right) — we have no matching stock photography,
 * so this uses a stylized icon-on-gradient composition instead. See the "missing assets" note
 * in Documentations MD/figma-homepage-redesign.md.
 */
export function Hero() {
  const { t } = useLang();

  return (
    <section className="relative overflow-hidden bg-brand-900 text-white">
      <div className="absolute inset-0 bg-grain-navy" aria-hidden />
      <div className="absolute inset-0 bg-grid-navy [background-size:32px_32px] opacity-40" aria-hidden />
      <div className="container-page relative py-14 sm:py-20 lg:py-24 grid lg:grid-cols-[1fr_1.3fr_1fr] gap-8 items-center">
        <div className="hidden lg:flex justify-center">
          <div className="relative w-56 h-56 rounded-full bg-gradient-to-br from-accent/30 to-brand-400/40 grid place-items-center motion-safe:animate-fadeUp">
            <Car className="w-28 h-28 text-white/90" strokeWidth={1.2} />
            <span className="absolute -bottom-3 -right-3 grid place-items-center w-16 h-16 rounded-2xl bg-white/10 border border-white/15 rotate-6">
              <Armchair className="w-8 h-8 text-gold" strokeWidth={1.4} />
            </span>
          </div>
        </div>

        <div className="text-center">
          <p className="font-display italic text-white/60 text-lg mb-1">{t("hero.tiredLine")}</p>
          <h1 className="text-4xl sm:text-6xl font-bold leading-[1.02] mb-3">
            <span className="block">{t("hero.upgradeLine1")}</span>
            <span className="block text-gold">{t("hero.upgradeLine2")}</span>
          </h1>
          <p className="text-white/70 text-[15px] mb-8">{t("hero.subtitle")}</p>
          <Link to="/shop" className="btn-pill-gold px-10">
            {t("hero.cta")}
          </Link>
        </div>

        <div className="hidden lg:flex justify-center">
          <div className="relative w-56 h-56 rounded-full bg-gradient-to-br from-accent/30 to-brand-400/40 grid place-items-center motion-safe:animate-fadeUp" style={{ animationDelay: "0.1s" }}>
            <Bike className="w-28 h-28 text-white/90" strokeWidth={1.2} />
            <span className="absolute -bottom-3 -left-3 grid place-items-center w-16 h-16 rounded-2xl bg-white/10 border border-white/15 -rotate-6">
              <Armchair className="w-8 h-8 text-gold" strokeWidth={1.4} />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
