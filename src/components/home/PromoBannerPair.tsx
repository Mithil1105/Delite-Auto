import { useRef, type CSSProperties } from "react";
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
function PromoArt({ src, style }: { src?: string; style?: CSSProperties }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={style}
        className="relative z-0 h-[110%] max-h-[190px] w-auto max-w-[46%] object-contain object-right shrink-0 -mr-2 sm:-mr-3"
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

/** Alternates the two default gradients for any number of CMS-published promotions — real
 * uploaded images (when set) win over the gradient+icon placeholder. Purple→blue / purple→light-
 * blue, matching the Figma reference's "Best Combo Deals" / "New Launch" cards. */
const GRADIENTS = ["from-[#5b3fc4] to-[#3f6fd8]", "from-[#6a3fc4] to-[#8fb8f0]"];

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
      <div ref={ref} className="grid sm:grid-cols-2 gap-4">
        {promotions.map((promo, i) => {
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
              className={`relative flex items-center gap-4 overflow-hidden rounded-xl min-h-[136px] sm:min-h-[156px] pl-6 sm:pl-8 pr-2 py-6 sm:py-7 text-white bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]}`}
            >
              <div className="relative z-10 flex-1 min-w-0">
                <h3 className="font-display text-xl sm:text-2xl mb-1.5">{promo.heading}</h3>
                {promo.subheading && <p className="text-[13.5px] text-white/75 max-w-[26ch]">{promo.subheading}</p>}
                {promo.ctaLabel && <span className="inline-block mt-3 text-[13px] font-semibold underline">{promo.ctaLabel}</span>}
              </div>
              <PromoArt src={activeImage ?? undefined} style={style} />
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
