import { useRef, type CSSProperties } from "react";
import clsx from "clsx";
import { Link } from "react-router-dom";
import { useLang } from "../../i18n/LanguageContext";
import type { PromoBannerContent } from "../../hooks/usePromotions";
import { track } from "../../lib/analytics/client";
import { useOnVisible } from "../../lib/analytics/useOnVisible";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { resolveImagePosition, imagePositionStyle, type ImagePositionByDevice } from "../../lib/media/imagePosition";

function imagePositionStyleFor(byDevice: ImagePositionByDevice | null | undefined, device: "desktop" | "mobile"): CSSProperties {
  return imagePositionStyle(resolveImagePosition(byDevice, device));
}

/** Shared "product art bleeding off the right edge" treatment — used both for a real published
 * CMS promotion image and for the default banners' real curated-product image (never a generic
 * icon standing in for a product, per the Figma reference). */
function PromoArt({ src, style, large = false }: { src?: string; style?: CSSProperties; large?: boolean }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={style}
        className={clsx(
          "relative z-0 h-[110%] w-auto object-contain object-right shrink-0 -mr-2 sm:-mr-3",
          large ? "max-h-[190px] sm:max-h-[260px] max-w-[46%] sm:max-w-[42%]" : "max-h-[190px] max-w-[46%]"
        )}
      />
    );
  }
  // No real image to show (no CMS upload, no curated product with a photo) — a soft abstract
  // diagonal device rather than a literal icon standing in for an unknown product.
  return (
    <div
      aria-hidden
      className="relative z-0 w-24 h-24 sm:w-28 sm:h-28 shrink-0 mr-4 sm:mr-6 rounded-[28%] rotate-12 bg-white/10 border border-white/15"
    />
  );
}

/** Alternates the two gradients for any number of CMS-published promotions — real uploaded images (when set) win over
 * the placeholder device. Brand colours (deep navy ↔ royal blue, the same blue as the announcement bar) so the banners
 * sit in the site theme instead of the old purple. */
const GRADIENTS = ["from-brand-700 to-brand-500", "from-brand-500 to-brand-700"];

const SURFACE = "home_promo";
const promoMeta = (id: string, label: string) => ({ promotion_id: id, label: label.slice(0, 60) });

/**
 * `promotions`, when provided (non-empty), REPLACES the hardcoded combo/new-launch banners with
 * real published `cms_promotions` rows — same additive-prop pattern as Hero/AnnouncementBar/
 * CategoryIconStrip: omit the prop and this renders exactly as before.
 *
 * Analytics: each banner records one impression the first time the pair is ~40% on screen and a
 * click when followed (surface `home_promo`, promotion id + heading as the label).
 *
 * `comboImage`/`newLaunchImage` (optional): a real photo of a curated product behind each
 * default banner's destination (bestseller / new-arrival) — same graceful-degradation rule as
 * everywhere else, so an unimaged catalog falls back to `PromoArt`'s abstract device rather than
 * a fake or unrelated product photo. Ignored once real CMS `promotions` are published.
 */
export function PromoBannerPair({
  promotions,
  comboImage,
  newLaunchImage,
  previewBreakpoint,
}: {
  promotions?: PromoBannerContent[];
  comboImage?: string;
  newLaunchImage?: string;
  /** Admin-preview-only override — `PreviewFrame` simulates Desktop/Tablet/Mobile with a CSS
   * width constraint, not a real iframe, so `window.matchMedia` would otherwise always reflect
   * the admin browser's actual window, never the simulated breakpoint. Omit on the real
   * storefront, where the real media query is what should decide this. */
  previewBreakpoint?: "desktop" | "tablet" | "mobile";
} = {}) {
  const { t } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  const isMobileViewport = useMediaQuery("(max-width: 767px)");
  const isMobile = previewBreakpoint ? previewBreakpoint === "mobile" : isMobileViewport;
  const device: "mobile" | "desktop" = isMobile ? "mobile" : "desktop";

  const banners =
    promotions && promotions.length > 0
      ? null
      : [
          { id: "default_combo_deals", label: t("home.comboDealsTitle") },
          { id: "default_new_launch", label: t("home.newLaunchTitle") },
        ];
  const impressions = promotions && promotions.length > 0 ? promotions.map((p) => ({ id: p.id, label: p.heading })) : banners ?? [];

  useOnVisible(
    ref,
    () => {
      for (const b of impressions) track("promotion_impression", { surface: SURFACE, metadata: promoMeta(b.id, b.label) });
    },
    impressions.map((b) => b.id).join(",")
  );

  if (promotions && promotions.length > 0) {
    return (
      // One promotion fills the whole row (a half-width banner next to an empty gap looked unfinished); two sit side by side;
      // with an odd number the last one spans the row.
      <div ref={ref} className={clsx("grid gap-4", promotions.length > 1 && "sm:grid-cols-2")}>
        {promotions.map((promo, i) => {
          const single = promotions.length === 1;
          const spansRow = promotions.length > 2 && promotions.length % 2 === 1 && i === promotions.length - 1;
          // Mobile image (when set) wins on mobile; its own position set falls back to the
          // desktop image's positions if a mobile-specific one wasn't saved (spec's per-device
          // fallback chain — never silently 0/0/1).
          const useMobileImage = device === "mobile" && !!promo.mobileImage;
          const activeImage = useMobileImage ? promo.mobileImage : promo.image;
          const activePositionSet = useMobileImage ? promo.mobileImagePosition ?? promo.imagePosition : promo.imagePosition;
          const style = activeImage ? imagePositionStyleFor(activePositionSet, device) : undefined;
          return (
            <Link
              key={promo.id}
              to={promo.ctaUrl || "/shop"}
              onClick={() => track("promotion_click", { surface: SURFACE, metadata: promoMeta(promo.id, promo.heading) })}
              className={clsx(
                "relative flex items-center gap-4 overflow-hidden rounded-xl text-white bg-gradient-to-br",
                GRADIENTS[i % GRADIENTS.length],
                single ? "min-h-[180px] sm:min-h-[240px] pl-6 sm:pl-12 pr-3 py-8 sm:py-10" : "min-h-[136px] sm:min-h-[156px] pl-6 sm:pl-8 pr-2 py-6 sm:py-7",
                spansRow && "sm:col-span-2"
              )}
            >
              <div className="relative z-10 flex-1 min-w-0">
                <h3 className={clsx("font-display mb-1.5", single ? "text-2xl sm:text-4xl" : "text-xl sm:text-2xl")}>{promo.heading}</h3>
                {promo.subheading && <p className={clsx("text-white/80", single ? "text-[14.5px] sm:text-[16px] max-w-[44ch]" : "text-[13.5px] max-w-[26ch]")}>{promo.subheading}</p>}
                {promo.ctaLabel && <span className="mt-4 inline-flex rounded-full bg-gold px-5 py-2 text-[13px] font-semibold text-ink shadow-sm transition-colors hover:bg-gold-600">{promo.ctaLabel}</span>}
              </div>
              <PromoArt src={activeImage ?? undefined} style={style} large={single} />
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={ref} className="grid sm:grid-cols-2 gap-4">
      <Link
        to="/shop?tag=bestseller"
        onClick={() => track("promotion_click", { surface: SURFACE, metadata: promoMeta("default_combo_deals", t("home.comboDealsTitle")) })}
        className={`relative flex items-center gap-4 overflow-hidden rounded-xl min-h-[136px] sm:min-h-[156px] pl-6 sm:pl-8 pr-2 py-6 sm:py-7 text-white bg-gradient-to-br ${GRADIENTS[0]}`}
      >
        <div className="relative z-10 flex-1 min-w-0">
          <h3 className="font-display text-xl sm:text-2xl mb-1.5">{t("home.comboDealsTitle")}</h3>
          <p className="text-[13.5px] text-white/75 max-w-[26ch]">{t("home.comboDealsBody")}</p>
        </div>
        <PromoArt src={comboImage} />
      </Link>
      <Link
        to="/shop?tag=new"
        onClick={() => track("promotion_click", { surface: SURFACE, metadata: promoMeta("default_new_launch", t("home.newLaunchTitle")) })}
        className={`relative flex items-center gap-4 overflow-hidden rounded-xl min-h-[136px] sm:min-h-[156px] pl-6 sm:pl-8 pr-2 py-6 sm:py-7 text-white bg-gradient-to-br ${GRADIENTS[1]}`}
      >
        <div className="relative z-10 flex-1 min-w-0">
          <h3 className="font-display text-xl sm:text-2xl mb-1.5">{t("home.newLaunchTitle")}</h3>
          <p className="text-[13.5px] text-white/75 max-w-[26ch]">{t("home.newLaunchBody")}</p>
        </div>
        <PromoArt src={newLaunchImage} />
      </Link>
    </div>
  );
}
