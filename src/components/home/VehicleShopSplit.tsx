import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useLang } from "../../i18n/LanguageContext";

/**
 * Full-bleed "Shop by Cars / Shop by Bikes" diagonal split banner.
 *
 * Each column is a `relative` wrapper (the actual grid item, `min-h-*` sized) holding two
 * children: the clipped/overflow-hidden colored panel `<Link>` (heading/arrow/divider — its clip
 * -path is what produces the diagonal seam, so IT must stay clipped), and an unclipped vehicle
 * `<img>` positioned relative to the WRAPPER (not the clipped Link) so ~1/3 of it can overhang
 * below the wrapper's own bottom edge without being cut off by the panel's clip-path/overflow.
 * `gap-y-*` between the two wrappers (mobile stack only — 0 at `lg` where they sit side by side)
 * gives the car's overhang room before the bike panel starts; `mb-*` on the section reserves the
 * same clearance below the bike panel so its overhang doesn't collide with CategoryIconStrip
 * underneath. See Documentations MD/frontend-foundation-uiux-refactor.md.
 *
 * `.inset-wide-l` (src/index.css) lines the heading text up with every other `.container-wide`
 * section on the page at every viewport width — this section is full-bleed (no `.container-wide`
 * wrapper) so it needs the equivalent left inset applied directly.
 */
export function VehicleShopSplit() {
  const { t } = useLang();

  return (
    <section className="relative bg-white mb-[58px] sm:mb-[70px] lg:mb-[78px]">
      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-y-[34px] sm:gap-y-[40px] lg:gap-y-0">
        <div className="relative min-h-[300px] sm:min-h-[330px] lg:min-h-[360px]">
          <Link
            to="/shop?vehicle=car"
            className="relative z-10 block h-full text-white bg-brand-500 inset-wide-l pr-6 sm:pr-10 lg:pr-14 pt-6 sm:pt-8 overflow-hidden"
            style={{ clipPath: "polygon(0 0, 100% 0, 82% 100%, 0 100%)" }}
          >
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-2xl sm:text-3xl font-display">{t("home.shopByCars")}</h3>
                <ArrowRight className="w-6 h-6 shrink-0" />
              </div>
              <div className="h-px bg-white/25 mt-4 max-w-[240px]" />
            </div>
          </Link>
          <div
            className="absolute z-20 -bottom-[34px] sm:-bottom-[40px] lg:-bottom-[46px] left-1/2 -translate-x-1/2 w-[70%] max-w-[320px] pointer-events-none"
            aria-hidden
          >
            <div className="absolute inset-x-6 bottom-[33%] h-4 rounded-[50%] bg-black/35 blur-md" aria-hidden />
            <img
              src="/images/hero/car.png"
              alt=""
              className="relative w-full h-auto max-h-[160px] sm:max-h-[190px] lg:max-h-[215px] object-contain object-bottom"
            />
          </div>
        </div>

        <div className="relative min-h-[300px] sm:min-h-[330px] lg:min-h-[360px]">
          <Link to="/shop?vehicle=bike" className="relative block h-full bg-white px-6 sm:px-10 lg:px-14 pt-6 sm:pt-8 overflow-hidden">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-2xl sm:text-3xl font-display text-ink">{t("home.shopByBikes")}</h3>
                <span className="grid place-items-center w-7 h-7 rounded-full bg-brand-500 text-white shrink-0">
                  <ArrowRight className="w-4 h-4" />
                </span>
              </div>
              <div className="h-px bg-line mt-4 max-w-[240px]" />
            </div>
          </Link>
          <div
            className="absolute z-20 -bottom-[58px] sm:-bottom-[70px] lg:-bottom-[78px] left-1/2 -translate-x-1/2 w-[45%] max-w-[180px] pointer-events-none"
            aria-hidden
          >
            <div className="absolute inset-x-3 bottom-[33%] h-3 rounded-[50%] bg-black/25 blur-md" aria-hidden />
            <img
              src="/images/hero/bike.png"
              alt=""
              className="relative w-full h-auto max-h-[175px] sm:max-h-[210px] lg:max-h-[235px] object-contain object-bottom"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
