import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { track } from "../lib/analytics/client";
import { useMediaQuery } from "../hooks/useMediaQuery";

/**
 * Full-bleed composited banner hero (2026-10-11 pass — real solid-color button + desktop
 * exact-viewport fit, on top of the 2026-10-10 "Delitefied SUV at Golden Hour" image swap). The
 * wordmark/vehicle photo/headline/subheading artwork is still ONE baked-in image
 * (`delitefied-suv-golden-hour-cropped.png`, 1672×741), not CMS-editable text, but the
 * "Shop Now" button (was "Shop Accessories") is now a REAL, visible pill drawn on top — covering the image's own
 * baked button pixels entirely — instead of an invisible hit-area over the artwork (explicit
 * instruction: "cover that shop now on the image and put an actual button"). `BUTTON_COLOR`
 * (#10148F, a deep indigo-blue) is an explicit user color choice, rendered translucent with a
 * backdrop blur for a "glass" look (also explicit) rather than a flat opaque fill.
 *
 * `BUTTON_PX`'s base box (left:665, top:642, width:342, height:64) was re-measured after an
 * earlier version of this box collided with the baked subtext line above the button — the first
 * measurement pass had picked up the inline "Delitefied" word inside the tagline text (same
 * purple-pixel family as the button) and merged its bounding box with the real button's, pushing
 * the detected top edge ~45px too high. Re-measured with a contiguous-run-length scan (requires a
 * continuous horizontal stretch of matching pixels, which only the solid pill satisfies — cursive
 * text strokes don't sustain a long straight run) restricted to the image's bottom third, which
 * isolated the real button cleanly.
 *
 * **Desktop (`lg:`+) exact-viewport fit**: per explicit instruction ("I just want the hero image
 * to be seen on one page... I don't want to see what's below it"), the hero fills precisely
 * `100vh - header height` — Header.tsx publishes its own real height as the `--header-height` CSS
 * var via a ResizeObserver — so header + hero always exactly fill one screen with nothing from the
 * next section peeking in, regardless of viewport size. The image uses `object-cover
 * object-bottom` to fill that box (cropping left/right on short-wide viewports, top on tall-narrow
 * ones — "bottom" anchoring means any vertical crop always comes from the top, never hiding the
 * button). Because the crop amount now varies continuously with the live viewport box (unlike the
 * old fixed-aspect-ratio layout, where a static CSS percentage was exact everywhere), the button
 * overlay's pixel position is computed in JS from a `ResizeObserver` on the image container,
 * replicating `object-fit: cover`'s own crop math (`computeOverlayPx` below) — a static percentage
 * would drift off the image's actual content as soon as the container's aspect ratio differs from
 * the image's own.
 *
 * **Mobile/tablet** (below `lg:`) keeps the simpler, proven fixed-aspect-ratio layout (the whole
 * image always fully visible, a static percentage overlay) — scrolling to reach the button is
 * normal, expected mobile UX, and this sidesteps the dynamic-crop math entirely where it isn't
 * needed.
 *
 * `id="home-hero"` is the anchor Header.tsx's IntersectionObserver watches to toggle its
 * transparent-over-hero / white-on-scroll background — see Header.tsx's own doc comment.
 */
export interface HeroContentOverride {
  ctaLink?: string;
}

const IMAGE_SRC = "/images/hero/delitefied-suv-golden-hour-cropped.png";
// Same exact 1372×741 pixels as IMAGE_SRC, re-encoded only (quality 90, no resize/recrop) — the
// button overlay math above depends on pixel-identical content, so this must never diverge from
// the PNG visually. 1.97MB → 131KB (93% smaller) — this is the single largest asset on the
// homepage's critical path (the hero is the LCP candidate on most homepage loads). Performance
// pass, 2026-10-13 — see Documentations MD/storefront-performance-2026-10.md.
const IMAGE_SRC_WEBP = "/images/hero/delitefied-suv-golden-hour-cropped.webp";
const IMAGE_ALT = "Whatever your ride needs, Delitefied it — accessories, upgrades, details that make every drive yours.";
// 2026-10-11: trimmed 150px off each side (1672 → 1372 wide, height unchanged) — explicit
// instruction ("crop the image width... so it touches the top of the screen"): a narrower image
// is proportionally taller, so at normal desktop widths `object-cover`/`object-bottom` now crops
// more of the top sky margin instead of leaving it as a visible gap below the header.
const NATURAL_W = 1372;
const NATURAL_H = 741;

// Bigger-than-drawn button box: base (665, 642, 342×64) in the ORIGINAL 1672-wide file, expanded
// ~18% wider / ~15% taller around its own center, then shifted left by 150px to match the width
// trim above (x-origin only — top/width/height are unaffected by a symmetric left+right crop).
// These pixel coordinates never change; only the on-screen crop/scale around them does (see
// computeOverlayPx below).
const BUTTON_PX = { left: 484.2, top: 637.2, width: 403.6, height: 73.6 };

// Explicit user color choice — rendered translucent (not opaque) for a "glass" look.
const BUTTON_COLOR_RGB = "16, 20, 143"; // #10148F

/** Replicates `object-fit: cover; object-position: bottom` 's own crop math for a container of
 * `containerW`×`containerH` showing a `NATURAL_W`×`NATURAL_H` image, so the button overlay can be
 * positioned in the same pixel space as what's actually on screen. */
function computeOverlayPx(containerW: number, containerH: number) {
  if (!containerW || !containerH) return null;
  const scale = Math.max(containerW / NATURAL_W, containerH / NATURAL_H);
  const renderedW = NATURAL_W * scale;
  const renderedH = NATURAL_H * scale;
  const cropX = (renderedW - containerW) / 2; // symmetric left/right crop (0 when height-bound)
  const cropY = renderedH - containerH; // all vertical crop comes off the top (object-bottom)
  return {
    left: BUTTON_PX.left * scale - cropX,
    top: BUTTON_PX.top * scale - cropY,
    width: BUTTON_PX.width * scale,
    height: BUTTON_PX.height * scale,
  };
}

function ShopAccessoriesButton({
  ctaLink,
  style,
  className,
}: {
  ctaLink?: string;
  style: CSSProperties;
  className: string;
}) {
  return (
    <Link
      to={ctaLink ?? "/shop"}
      onClick={() => track("promotion_click", { surface: "home_hero", metadata: { label: "Shop Now" } })}
      className={className}
      style={{ ...style, backgroundColor: `rgba(${BUTTON_COLOR_RGB}, 0.55)` }}
    >
      Shop Now <ArrowRight className="w-[0.9em] h-[0.9em] max-sm:hidden" />
    </Link>
  );
}

const BUTTON_BASE_CLASS =
  "absolute rounded-full flex items-center justify-center gap-2 text-white font-semibold uppercase tracking-wide whitespace-nowrap border border-white/30 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:brightness-110 transition-[filter] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-700";

function DesktopHero({ ctaLink }: HeroContentOverride) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [overlayPx, setOverlayPx] = useState<ReturnType<typeof computeOverlayPx>>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setOverlayPx(computeOverlayPx(r.width, r.height));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: "100vh", minHeight: 460 }}>
      <picture>
        <source srcSet={IMAGE_SRC_WEBP} type="image/webp" />
        <img src={IMAGE_SRC} alt={IMAGE_ALT} className="absolute inset-0 w-full h-full object-cover object-bottom" />
      </picture>
      {overlayPx && (
        <ShopAccessoriesButton
          ctaLink={ctaLink}
          className={`${BUTTON_BASE_CLASS} text-[15px]`}
          style={{ left: overlayPx.left, top: overlayPx.top, width: overlayPx.width, height: overlayPx.height }}
        />
      )}
    </div>
  );
}

function MobileHero({ ctaLink }: HeroContentOverride) {
  return (
    <div className="relative w-full aspect-[1372/741]">
      <picture>
        <source srcSet={IMAGE_SRC_WEBP} type="image/webp" />
        <img src={IMAGE_SRC} alt={IMAGE_ALT} className="absolute inset-0 w-full h-full object-cover" />
      </picture>
      <ShopAccessoriesButton
        ctaLink={ctaLink}
        className={`${BUTTON_BASE_CLASS} text-[11px] sm:text-[13px] !gap-1 px-1`}
        style={{ left: "35.29%", top: "86.00%", width: "29.42%", height: "9.93%" }}
      />
    </div>
  );
}

export function Hero({ ctaLink }: HeroContentOverride = {}) {
  // Analytics: hero impression once per page view (the admin editor preview is never tracked).
  useEffect(() => {
    track("promotion_impression", { surface: "home_hero" });
  }, []);

  const isDesktop = useMediaQuery("(min-width: 1024px)");

  return (
    <section
      id="home-hero"
      className="relative overflow-hidden bg-brand-700"
      // Desktop only: pulls the whole section up by the sticky header's own height so it starts
      // at the very top of the viewport (y=0), genuinely extending BEHIND where the header sits,
      // instead of starting right after it in normal flow. This is what makes the
      // transparent-over-hero effect show anything at all at scroll=0 — `position: sticky`
      // elements behave exactly like `position: static` (no overlap with following siblings)
      // until you've scrolled past their natural position, so without this, Header's "transparent"
      // background at the very top had nothing behind it except the plain page background, not
      // the hero photo (confirmed live: `elementsFromPoint` inside the nav row at scrollY=0
      // contained no part of the hero `<section>` or its `<img>` at all — they didn't overlap).
      // `DesktopHero`'s own height changed from `100vh - header height` to a plain `100vh` to
      // compensate, so the section still ends at exactly one viewport height either way.
      style={isDesktop ? { marginTop: "calc(-1 * var(--header-height, 97px))" } : undefined}
    >
      {isDesktop ? <DesktopHero ctaLink={ctaLink} /> : <MobileHero ctaLink={ctaLink} />}
    </section>
  );
}
