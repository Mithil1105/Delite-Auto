import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { track } from "../lib/analytics/client";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { mediaPublicUrl } from "../services/cms/publishedCmsService";
import { imagePositionStyle, resolveImagePosition, type ImagePositionByDevice } from "../lib/media/imagePosition";
import { MAX_HERO_ASPECT } from "../lib/layout/heroWidthCap";

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
 *
 * **Admin-replaceable image** (2026-10-11): the CMS hero editor can swap in a different image via
 * `imageStoragePath` (a `marketing-media` Storage path, same as Promotions/Categories) instead of
 * the baked default. The default image's "Shop Now" button position (`BUTTON_PX`/`computeOverlayPx`)
 * is pixel-measured to exactly cover THAT image's own baked button art, so it's meaningless for an
 * admin-uploaded photo with no baked button — a custom image instead gets a draggable-by-slider
 * `buttonPosition` (admin editor), expressed as % of the container (the image always fills it, see
 * below, so there's no letterbox offset to account for).
 *
 * A first attempt at "don't crop an arbitrary upload unpredictably" used `object-fit: contain`
 * (full photo always visible, letterboxed) — wrong in practice: it put ugly solid-color bars down
 * the sides on any viewport whose ratio didn't match the photo's own, which is most of them, and
 * broke the full-bleed look the rest of the site uses. Fixed by reusing the SAME focal-point +
 * zoom model Promotions already uses for exactly this problem (an arbitrary admin-uploaded photo
 * that still needs to fill a fixed-ratio box) — `imagePositionStyle`/`ImagePositionControl`
 * (`src/lib/media/imagePosition.ts`): `object-fit: cover` (always full-bleed, no bars) with an
 * admin-adjustable `imagePosition` (focal X/Y + zoom, independently settable per device via
 * `ImagePositionByDevice`) controlling WHAT gets cropped, instead of the browser picking blindly.
 * This also keeps the admin editor's live preview an honest WYSIWYG: the same component renders
 * both places, so whatever the admin sees while sliding the focal point / `buttonPosition` around
 * is exactly what ships.
 */
export interface HeroContentOverride {
  ctaLink?: string;
  /** `marketing-media` Storage path of an admin-uploaded replacement for the default hero image. */
  imageStoragePath?: string;
  /** Focal point + zoom for cropping `imageStoragePath` into the hero's fixed-ratio box — same
   * model Promotions uses (`src/lib/media/imagePosition.ts`), settable per device. */
  imagePosition?: ImagePositionByDevice;
  /** Button center position (% of the container) when `imageStoragePath` is set — lets an admin
   * re-aim the "Shop Now" button at wherever makes sense on their own uploaded photo, since the
   * baked-image pixel math below doesn't apply to it. Defaults to `DEFAULT_CUSTOM_BUTTON_POSITION`. */
  buttonPosition?: { left: number; top: number };
}

const DEFAULT_IMAGE_SRC = "/images/hero/delitefied-suv-golden-hour-cropped.png";
// Same pixels as DEFAULT_IMAGE_SRC, re-encoded as WebP (1.97MB → 131KB) — served via <picture> for the
// default image only (performance pass, see Documentations MD/storefront-performance-2026-10.md).
const DEFAULT_IMAGE_SRC_WEBP = "/images/hero/delitefied-suv-golden-hour-cropped.webp";
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

// Default button position for an admin-uploaded custom image, which has no baked button art for
// BUTTON_PX's pixel-cover math to align with — centered near the bottom of the photo unless the
// admin picks a different spot via `buttonPosition`. Expressed as % of the photo's OWN content
// box, not the surrounding container (see computeContainBox below).
const DEFAULT_CUSTOM_BUTTON_POSITION = { left: 50, top: 86 };

// Desktop ultra-wide handling (2026-10-13): the hero fills exactly one viewport HEIGHT, so on a
// monitor much wider than it is tall (ultra-wide/super-ultra-wide, e.g. 21:9 or 32:9), a plain
// `object-fit: cover` has to scale the photo up far more than it does at a normal desktop's ~16:9
// ratio just to cover the extra width — the car/wordmark end up zoomed in well past how they look
// on a normal desktop, reading as "stretched"/wrong even though cover itself never distorts
// proportions. A typical 16:9 screen (ratio ≈1.78) stays well under this; only genuinely
// wider-than-normal monitors cross it. Fixed by capping how wide the crisp foreground image is
// ever allowed to render (`width = min(containerWidth, containerHeight * MAX_HERO_ASPECT)`,
// centered) and filling the remaining width on either side with a blurred, scaled-up copy of the
// SAME image as a backdrop — an immersive edge-to-edge fill instead of either an over-zoomed photo
// or flat color bars. `MAX_HERO_ASPECT` itself lives in `src/lib/layout/heroWidthCap.ts`, shared
// with Header.tsx, so the nav row's own width cap (added 2026-10-13, see Header.tsx) always lines
// up with the hero's capped photo instead of spanning into its blurred margins.

// Desktop tall/narrow handling (2026-10-13): the opposite edge case from the ultra-wide one above
// — a desktop-WIDTH (≥1024px) window that's unusually TALL relative to its width (e.g. a portrait
// monitor, or a tall DevTools "Responsive" size like 1398×2034) forces `object-fit: cover` to crop
// drastically off the SIDES to fill that much height, cutting off the wordmark/tagline on both
// edges — reported live with a screenshot showing exactly that. Below `MIN_HERO_ASPECT`, the hero
// stops trying to fill the viewport height at all and instead sizes itself the same way
// `MobileHero` already does: full width, height set by the image's OWN aspect ratio (no crop, the
// whole photo visible), with whatever follows (Shop by Cars/Bikes, etc.) reached by scrolling —
// exactly the user's own framing ("the hero image covers... as it can be as a landscape image and
// then the shop by car section[s follow]"). 1.2 sits comfortably below every previously-verified
// normal desktop ratio (the narrowest was 1280×720's 1.78) so no normal screen is affected, while
// safely catching genuinely portrait-ish windows.
const MIN_HERO_ASPECT = 1.2;

/** Replicates `object-fit: cover; object-position: bottom` 's own crop math for a container of
 * `containerW`×`containerH` showing a `NATURAL_W`×`NATURAL_H` image, so the button overlay can be
 * positioned in the same pixel space as what's actually on screen. Also returns `scale` itself —
 * the "glass" treatment (blur/border/highlight) needs it too, see `glassStyleForScale` below. */
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
    scale,
  };
}

// At `scale` 1 (BUTTON_BASE_CLASS's own `backdrop-blur-md`/`border`/inset-highlight values), the
// glass look was tuned for a normal desktop's button size. The button's own box scales with
// `scale` (via `computeOverlayPx`'s width/height), but those three CSS values are all FIXED
// pixel amounts baked into Tailwind classes — on a big screen where `scale` runs well past normal
// (a large/high-res monitor, not just an ultra-wide one — MAX_HERO_ASPECT above only caps WIDTH
// relative to height, not overall size), the button renders much bigger while the blur/border/
// highlight stay the same absolute size, so they become proportionally thin and the "glass" look
// reads as a flat solid pill instead. Scaling all three with the same `scale` keeps the glass look
// visually consistent at any size; clamped so it never gets so blurred it looks smudgy.
function glassStyleForScale(scale: number): CSSProperties {
  const blur = Math.min(12 * scale, 28);
  const borderPx = Math.min(Math.max(1 * scale, 1), 2.5);
  const highlightPx = Math.min(1 * scale, 2.5);
  return {
    backdropFilter: `blur(${blur}px)`,
    WebkitBackdropFilter: `blur(${blur}px)`,
    borderWidth: `${borderPx}px`,
    boxShadow: `inset 0 ${highlightPx}px 0 rgba(255,255,255,0.25)`,
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

function DesktopHero({
  ctaLink,
  imageSrc,
  isCustomImage,
  imagePosition,
  buttonPosition,
}: HeroContentOverride & { imageSrc: string; isCustomImage: boolean }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [fgBox, setFgBox] = useState<{ width: number; height: number } | null>(null);
  const [overlayPx, setOverlayPx] = useState<ReturnType<typeof computeOverlayPx>>(null);
  const [naturalMode, setNaturalMode] = useState(false);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      // Decided from the real window, not `r` — `r`'s own height depends on `naturalMode`'s
      // result (the outer div has no fixed height in natural mode), so using it here would be
      // circular. `r.width` is still reliable either way (outer is always `w-full`).
      const isNatural = window.innerWidth / window.innerHeight < MIN_HERO_ASPECT;
      setNaturalMode(isNatural);
      if (isNatural) {
        const width = r.width;
        const height = width / (NATURAL_W / NATURAL_H);
        setFgBox({ width, height });
        if (!isCustomImage) setOverlayPx(computeOverlayPx(width, height));
      } else {
        const width = Math.min(r.width, r.height * MAX_HERO_ASPECT);
        setFgBox({ width, height: r.height });
        if (!isCustomImage) setOverlayPx(computeOverlayPx(width, r.height));
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [isCustomImage]);

  const { left: buttonLeftPct, top: buttonTopPct } = buttonPosition ?? DEFAULT_CUSTOM_BUTTON_POSITION;
  const foregroundStyle = isCustomImage ? imagePositionStyle(resolveImagePosition(imagePosition, "desktop")) : { objectFit: "cover" as const, objectPosition: "bottom" };

  return (
    <div ref={outerRef} className="relative w-full" style={naturalMode ? undefined : { height: "100vh", minHeight: 460 }}>
      {/* Ultra-wide backdrop: a blurred, zoomed-in copy of the same photo filling the full width —
          only visible beyond the capped foreground's edges on a wider-than-normal monitor. Skipped
          in natural mode — the foreground already matches the image's own ratio exactly there, so
          there's no crop/gap for a backdrop to ever fill. */}
      {!naturalMode && (
        <>
          <img src={imageSrc} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover scale-110 blur-3xl" style={foregroundStyle} />
          <div className="absolute inset-0 bg-brand-700/35" />
        </>
      )}
      {fgBox && (
        <div
          className={naturalMode ? "relative w-full" : "absolute top-0 h-full"}
          style={naturalMode ? { height: fgBox.height } : { left: "50%", transform: "translateX(-50%)", width: fgBox.width }}
        >
          <picture>
            {!isCustomImage && <source srcSet={DEFAULT_IMAGE_SRC_WEBP} type="image/webp" />}
            <img src={imageSrc} alt={IMAGE_ALT} className="absolute inset-0 w-full h-full" style={foregroundStyle} />
          </picture>
          {isCustomImage ? (
            <ShopAccessoriesButton
              ctaLink={ctaLink}
              className={`${BUTTON_BASE_CLASS} text-[15px] px-8 py-4`}
              style={{ left: `${buttonLeftPct}%`, top: `${buttonTopPct}%`, transform: "translate(-50%, -50%)" }}
            />
          ) : (
            overlayPx && (
              <ShopAccessoriesButton
                ctaLink={ctaLink}
                className={`${BUTTON_BASE_CLASS} text-[15px]`}
                style={{
                  left: overlayPx.left,
                  top: overlayPx.top,
                  width: overlayPx.width,
                  height: overlayPx.height,
                  ...glassStyleForScale(overlayPx.scale),
                }}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function MobileHero({
  ctaLink,
  imageSrc,
  isCustomImage,
  imagePosition,
  buttonPosition,
}: HeroContentOverride & { imageSrc: string; isCustomImage: boolean }) {
  const { left: buttonLeftPct, top: buttonTopPct } = buttonPosition ?? DEFAULT_CUSTOM_BUTTON_POSITION;

  return (
    <div className="relative w-full aspect-[1372/741]">
      <picture>
        {!isCustomImage && <source srcSet={DEFAULT_IMAGE_SRC_WEBP} type="image/webp" />}
        <img
          src={imageSrc}
          alt={IMAGE_ALT}
          className="absolute inset-0 w-full h-full"
          style={isCustomImage ? imagePositionStyle(resolveImagePosition(imagePosition, "mobile")) : { objectFit: "cover" }}
        />
      </picture>
      <ShopAccessoriesButton
        ctaLink={ctaLink}
        className={isCustomImage ? `${BUTTON_BASE_CLASS} text-[12px] px-5 py-3` : `${BUTTON_BASE_CLASS} text-[11px] sm:text-[13px] !gap-1 px-1`}
        style={
          isCustomImage
            ? { left: `${buttonLeftPct}%`, top: `${buttonTopPct}%`, transform: "translate(-50%, -50%)" }
            : { left: "35.29%", top: "86.00%", width: "29.42%", height: "9.93%" }
        }
      />
    </div>
  );
}

export function Hero({ ctaLink, imageStoragePath, imagePosition, buttonPosition }: HeroContentOverride = {}) {
  // Analytics: hero impression once per page view (the admin editor preview is never tracked).
  useEffect(() => {
    track("promotion_impression", { surface: "home_hero" });
  }, []);

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isCustomImage = Boolean(imageStoragePath);
  const imageSrc = imageStoragePath ? mediaPublicUrl(imageStoragePath) : DEFAULT_IMAGE_SRC;

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
      {isDesktop ? (
        <DesktopHero ctaLink={ctaLink} imageSrc={imageSrc} isCustomImage={isCustomImage} imagePosition={imagePosition} buttonPosition={buttonPosition} />
      ) : (
        <MobileHero ctaLink={ctaLink} imageSrc={imageSrc} isCustomImage={isCustomImage} imagePosition={imagePosition} buttonPosition={buttonPosition} />
      )}
    </section>
  );
}
