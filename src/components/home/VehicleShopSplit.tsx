import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useLang } from "../../i18n/LanguageContext";
import { track } from "../../lib/analytics/client";

/**
 * Full-bleed "Shop by Cars / Shop by Bikes" diagonal split banner.
 *
 * Each column is a `relative` wrapper (the actual grid item, `min-h-*` sized) holding two
 * children: the clipped/overflow-hidden colored panel `<Link>` (heading/arrow/divider — its clip
 * -path is what produces the diagonal seam, so IT must stay clipped), and an unclipped vehicle
 * `<img>` positioned relative to the WRAPPER (not the clipped Link) so ~1/3 of it can overhang
 * below the wrapper's own bottom edge without being cut off by the panel's clip-path/overflow.
 *
 * Side-by-side at every breakpoint, not just `lg:` (2026-10-07 — mobile used to stack these two
 * panels vertically; changed so mobile matches desktop's "one line" two-column layout). Because
 * each column is now roughly half the viewport width on a phone too, not just at `lg`, the
 * text/image/padding scale is its own smaller ramp at the base/`sm:` tiers — the `lg:` values are
 * unchanged from the original stacked design, since that breakpoint was already side-by-side.
 * `pb-*` on the section reserves clearance below the bike panel's image overhang so it doesn't
 * collide with CategoryIconStrip underneath — deliberately PADDING, not margin: a margin is
 * outside the section's own `bg-white` box and paints as the page's base `bg-paper` (#f7f8f8, not
 * pure white), which showed up as a visible gray seam between this section and the next white one
 * at every breakpoint. Padding stays inside the background box, so the reserved clearance is
 * white too. See Documentations MD/frontend-foundation-uiux-refactor.md.
 *
 * `.inset-wide-l` (src/index.css) lines the heading text up with every other `.container-wide`
 * section on the page at every viewport width — this section is full-bleed (no `.container-wide`
 * wrapper) so it needs the equivalent left inset applied directly.
 */
export function VehicleShopSplit({ content }: { content?: Record<string, unknown> } = {}) {
  const { t } = useLang();
  const copy = (key: string, fallback: string) => typeof content?.[key] === "string" && String(content[key]).trim() ? String(content[key]).trim() : fallback;
  const href = (key: string, fallback: string) => { const value = copy(key, fallback); return value.startsWith("/") && !value.startsWith("//") ? value : fallback; };
  const image = (key: string, fallback: string) => { const value = copy(key, fallback); return value.startsWith("/") || value.startsWith("https://") ? value : fallback; };

  return (
    <section className="relative bg-white pb-[34px] sm:pb-[48px] lg:pb-[78px]">
      <div className="grid grid-cols-2 lg:grid-cols-[1.15fr_1fr]">
        <div className="relative min-h-[200px] sm:min-h-[260px] lg:min-h-[360px]">
          <Link
            to={href("carLink", "/shop?vehicle=car")}
            onClick={() => track("navigation_click", { surface: "home_vehicle_split", metadata: { target: "/shop" } })}
            className="relative z-10 block h-full text-white bg-brand-500 inset-wide-l pr-3 sm:pr-6 lg:pr-14 pt-4 sm:pt-6 lg:pt-8 overflow-hidden"
            style={{ clipPath: "polygon(0 0, 100% 0, 82% 100%, 0 100%)" }}
          >
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h3 className="text-[15px] sm:text-xl lg:text-3xl font-display leading-snug">{copy("carTitle", t("home.shopByCars"))}</h3>
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 shrink-0" />
              </div>
              <div className="h-px bg-white/25 mt-2.5 sm:mt-3 lg:mt-4 max-w-[100px] sm:max-w-[160px] lg:max-w-[240px]" />
            </div>
          </Link>
          <div
            className="absolute z-20 -bottom-[18px] sm:-bottom-[28px] lg:-bottom-[46px] left-1/2 -translate-x-1/2 w-[85%] max-w-[150px] sm:max-w-[200px] lg:max-w-[320px] pointer-events-none"
            aria-hidden
          >
            <div className="absolute inset-x-6 bottom-[33%] h-4 rounded-[50%] bg-black/35 blur-md" aria-hidden />
            <img
              src={image("carImage", "/images/hero/car.png")}
              alt=""
              className="relative w-full h-auto max-h-[80px] sm:max-h-[120px] lg:max-h-[215px] object-contain object-bottom"
            />
          </div>
        </div>

        <div className="relative min-h-[200px] sm:min-h-[260px] lg:min-h-[360px]">
          <Link to={href("bikeLink", "/shop?vehicle=bike")} onClick={() => track("navigation_click", { surface: "home_vehicle_split", metadata: { target: "/shop" } })} className="relative block h-full bg-white px-3 sm:px-6 lg:px-14 pt-4 sm:pt-6 lg:pt-8 overflow-hidden">
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h3 className="text-[15px] sm:text-xl lg:text-3xl font-display text-ink leading-snug">{copy("bikeTitle", t("home.shopByBikes"))}</h3>
                <span className="grid place-items-center w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 rounded-full bg-brand-500 text-white shrink-0">
                  <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4" />
                </span>
              </div>
              <div className="h-px bg-line mt-2.5 sm:mt-3 lg:mt-4 max-w-[100px] sm:max-w-[160px] lg:max-w-[240px]" />
            </div>
          </Link>
          <div
            className="absolute z-20 -bottom-[26px] sm:-bottom-[40px] lg:-bottom-[78px] left-1/2 -translate-x-1/2 w-[60%] max-w-[110px] sm:max-w-[150px] lg:max-w-[180px] pointer-events-none"
            aria-hidden
          >
            <div className="absolute inset-x-3 bottom-[33%] h-3 rounded-[50%] bg-black/25 blur-md" aria-hidden />
            <img
              src={image("bikeImage", "/images/hero/bike.png")}
              alt=""
              className="relative w-full h-auto max-h-[85px] sm:max-h-[130px] lg:max-h-[235px] object-contain object-bottom"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
