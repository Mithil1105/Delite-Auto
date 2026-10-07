import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../i18n/LanguageContext";
import { track } from "../lib/analytics/client";

/**
 * Bold-background-photo hero (2026-10-07 redesign, replacing the prior dual car+bike floating
 * composition — see Documentations MD/frontend-foundation-uiux-refactor.md, "Hero redesign" for
 * the reference this was modeled on). Composition: a giant fixed "DELITEFY" wordmark behind the
 * vehicle photo, the vehicle itself large and prominent, then a headline/subheading/CTA stack
 * below — kept in our own established navy/gold brand palette rather than the reference's light
 * theme, for visual consistency with the rest of the site (Announcement bar, buttons, etc. all
 * already use this dark/gold language). `car.png` is the same real, background-removed stock
 * photo (Pixabay Content License) used by the prior Hero design.
 *
 * The "DELITEFY" wordmark is intentionally a fixed design element, NOT CMS-editable — the user's
 * own explicit instruction: the three text lines below (heading/subheading/CTA) stay editable
 * from Delite Admin, the wordmark in the background does not.
 */
function DelitefyWordmark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none select-none absolute inset-x-0 top-6 sm:top-8 lg:top-10 flex justify-center overflow-hidden"
    >
      <span className="font-display font-bold uppercase tracking-tightish leading-none text-[88px] sm:text-[140px] lg:text-[200px] xl:text-[240px] text-white/10 whitespace-nowrap">
        DELITEFY
      </span>
    </div>
  );
}

/**
 * Every prop is optional and defaults to today's i18n copy/link — passing none behaves exactly as
 * before (the live storefront's `<Hero />` call in Home.tsx is unchanged). Reused by the Delite
 * Admin homepage editor's live preview (fed draft CMS content) instead of a separate fake preview
 * renderer — see Documentations MD/delite-admin.md. `eyebrow` was dropped from this design (no
 * small pre-headline line in the new layout, matching the reference) — the Admin Hero editor's
 * own Eyebrow field was removed alongside it, not just hidden.
 */
export interface HeroContentOverride {
  headingLine1?: string;
  headingLine2?: string;
  subheading?: string;
  ctaLabel?: string;
  ctaLink?: string;
}

export function Hero({ headingLine1, headingLine2, subheading, ctaLabel, ctaLink }: HeroContentOverride = {}) {
  const { t } = useLang();

  // Analytics: hero impression once per page view (the admin editor preview is never tracked).
  useEffect(() => {
    track("promotion_impression", { surface: "home_hero" });
  }, []);

  return (
    <section className="relative overflow-hidden bg-brand-700 text-white">
      <div className="absolute inset-0 bg-grain-navy" aria-hidden />
      <div className="absolute inset-0 bg-grid-navy [background-size:32px_32px] opacity-40" aria-hidden />
      <DelitefyWordmark />

      <div className="relative container-wide pt-10 sm:pt-14 lg:pt-16">
        <div className="relative mx-auto w-full max-w-[720px] motion-safe:animate-fadeUp">
          <img src="/images/hero/car.png" alt="" className="relative z-10 w-full h-auto object-contain drop-shadow-[0_30px_40px_rgba(0,0,0,0.45)]" />
        </div>
      </div>

      <div className="relative container-wide pb-14 sm:pb-16 lg:pb-20 text-center">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] mb-3">
          <span>{headingLine1 ?? t("hero.headingLine1")}</span>{" "}
          <span className="text-gold">{headingLine2 ?? t("hero.headingLine2")}</span>
        </h1>
        <p className="text-white/70 text-[14px] sm:text-[15px] mb-8">{subheading ?? t("hero.subtitle")}</p>
        <Link
          to={ctaLink ?? "/shop"}
          onClick={() => track("promotion_click", { surface: "home_hero", metadata: { label: ctaLabel ?? t("hero.cta") } })}
          className="btn-pill-gold px-10"
        >
          {ctaLabel ?? t("hero.cta")}
        </Link>
      </div>
    </section>
  );
}
