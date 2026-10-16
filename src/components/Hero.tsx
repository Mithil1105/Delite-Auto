import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { track } from "../lib/analytics/client";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { mediaPublicUrl } from "../services/cms/publishedCmsService";
import type { ImagePositionByDevice } from "../lib/media/imagePosition";

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
// Top edge raised-clearance pass (2026-10-13): the baked tagline's last row ends at y≈630 and the
// baked button starts at y≈645 (measured), so the pill's top sits at 640 — 10 image-px under the
// text, 5 image-px above the baked button — and its bottom at 709 (baked button ends ≈703). It can
// therefore never reach the text above at any zoom/device, because it scales with the image.
const BUTTON_PX = { left: 484.2, top: 640, width: 403.6, height: 69 };

// Smallest comfortable touch/click target (px). On a phone the image — and the pill drawn over its
// baked button — is only ~20px tall, so the real <a> gets an invisible hit area padded out to this.
const MIN_TAP_PX = 44;

// Label size as a fraction of pill height: the default (baked-art) pill is wide and short so its
// label can be bigger; a custom-image pill is a chunkier 3:1 shape with a smaller label.
const DEFAULT_FONT_RATIO = 0.4;
const CUSTOM_FONT_RATIO = 0.28;

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

type Overlay = { left: number; top: number; width: number; height: number; scale: number };
type Natural = { w: number; h: number };
type Fit = { x: number; y: number; w: number; h: number; scale: number };

/**
 * "Extended background" model (2026-10-16): the WHOLE photo is always shown — scaled to fit inside
 * the hero box (`contain`), never cropped, never zoomed — and any leftover space on the sides / top
 * is filled by an extended, blurred copy of the same photo (see `HeroBackdrop`). So wordmark, car,
 * tagline and button are all always visible at every window size and browser zoom, and the nav bar
 * can never end up on top of the wordmark. Horizontally centred; when the box is taller than the
 * photo the photo sits at the BOTTOM of the box (extension goes behind the nav at the top).
 */
function computeFit(boxW: number, boxH: number, nat: Natural): Fit | null {
  if (!boxW || !boxH || !nat.w || !nat.h) return null;
  const scale = Math.min(boxW / nat.w, boxH / nat.h);
  const w = nat.w * scale;
  const h = nat.h * scale;
  return { x: (boxW - w) / 2, y: boxH - h, w, h, scale };
}

/** Default artwork: the pill covers the baked-in button, whose position is known in image pixels. */
function computeDefaultOverlay(fit: Fit): Overlay {
  return {
    left: fit.x + BUTTON_PX.left * fit.scale,
    top: fit.y + BUTTON_PX.top * fit.scale,
    width: BUTTON_PX.width * fit.scale,
    height: BUTTON_PX.height * fit.scale,
    scale: fit.scale,
  };
}

/**
 * Admin-uploaded photo (no baked button): the admin's `buttonPosition` is a point ON THE PHOTO (x/y
 * as % of the photo), so the pill stays glued under the tagline at every size. Height is 6.5% of the
 * rendered photo height (clamped 18–72px); width keeps the pill proportions but never drops below
 * what the label needs; nudged a touch below the admin's point so it never touches the text above.
 */
function computeCustomOverlay(boxW: number, boxH: number, fit: Fit, leftPct: number, topPct: number): Overlay {
  const height = Math.min(Math.max(fit.h * 0.065, 18), 72);
  const fontPx = Math.max(height * CUSTOM_FONT_RATIO, 9);
  const width = Math.min(Math.max(height * 3, fontPx * 9.5), boxW - 8);
  const cx = fit.x + (fit.w * leftPct) / 100;
  const cy = fit.y + (fit.h * topPct) / 100;
  const margin = Math.max(2, boxH * 0.01);
  const left = Math.min(Math.max(cx - width / 2, 4), boxW - width - 4);
  const top = Math.min(Math.max(cy - height / 2 + height * 0.12, margin), boxH - height - margin);
  return { left, top, width, height, scale: height / 57 };
}

// At `scale` 1 (BUTTON_BASE_CLASS's own `backdrop-blur-md`/`border`/inset-highlight values), the
// glass look was tuned for a normal desktop's button size. The button's own box scales with
// `scale` (via the overlay's width/height), but those three CSS values are all FIXED
// pixel amounts baked into Tailwind classes — on a big screen where `scale` runs well past normal
// (a large/high-res monitor, not just an ultra-wide one — MAX_HERO_ASPECT above only caps WIDTH
// relative to height, not overall size), the button renders much bigger while the blur/border/
// highlight stay the same absolute size, so they become proportionally thin and the "glass" look
// reads as a flat solid pill instead. Scaling all three with the same `scale` keeps the glass look
// visually consistent at any size; clamped so it never gets so blurred it looks smudgy.
function glassStyleForScale(scale: number): CSSProperties {
  const blur = Math.min(Math.max(12 * scale, 6), 28);
  const borderPx = Math.min(Math.max(1 * scale, 1), 2.5);
  const highlightPx = Math.min(1 * scale, 2.5);
  return {
    backdropFilter: `blur(${blur}px)`,
    WebkitBackdropFilter: `blur(${blur}px)`,
    borderWidth: `${borderPx}px`,
    boxShadow: `inset 0 ${highlightPx}px 0 rgba(255,255,255,0.25)`,
  };
}

/**
 * The default-image "Shop Now" pill. Everything about it derives from the SAME image-space overlay
 * box (`computeDefaultOverlay`), so at any viewport width, browser zoom or device pixel ratio the pill,
 * its label, arrow, gap, blur and border all scale together with the artwork underneath and it
 * keeps covering exactly the baked button — never the tagline above it. Label size is
 * `0.4 × pill height` (floored at 9px so it stays legible on a phone); the arrow is dropped when
 * the pill is too narrow to hold it; and an invisible hit area pads the real link out to
 * `MIN_TAP_PX` so it's still easy to tap when the visible pill is tiny.
 */
function DefaultShopNowButton({
  ctaLink,
  overlay,
  fontRatio = DEFAULT_FONT_RATIO,
}: {
  ctaLink?: string;
  overlay: Overlay;
  fontRatio?: number;
}) {
  const { left, top, width, height, scale } = overlay;
  const fontPx = Math.max(height * fontRatio, 9);
  const showArrow = width >= fontPx * 11.5;
  const extra = Math.max(0, MIN_TAP_PX - height);
  return (
    <Link
      to={ctaLink ?? "/shop"}
      onClick={() => track("promotion_click", { surface: "home_hero", metadata: { label: "Shop Now" } })}
      className="absolute rounded-full flex items-center justify-center text-white font-semibold uppercase whitespace-nowrap hover:brightness-110 transition-[filter] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-700"
      style={{
        left,
        top,
        width,
        height,
        fontSize: fontPx,
        lineHeight: 1,
        letterSpacing: "0.04em",
        gap: fontPx * 0.5,
        backgroundColor: `rgba(${BUTTON_COLOR_RGB}, 0.6)`,
        borderStyle: "solid",
        borderColor: "rgba(255,255,255,0.3)",
        ...glassStyleForScale(scale),
      }}
    >
      {extra > 0 && <span aria-hidden="true" className="absolute inset-x-0" style={{ top: -extra * 0.6, bottom: -extra * 0.4 }} />}
      Shop Now
      {showArrow && <ArrowRight style={{ width: "0.9em", height: "0.9em" }} />}
    </Link>
  );
}

/** Extended background: a blurred, scaled-up copy of the same photo fills the whole hero box, so any
 * space the fitted photo doesn't cover (sides, or the top behind the nav) continues the artwork
 * instead of showing flat colour bars. */
function HeroBackdrop({ src }: { src: string }) {
  return <img src={src} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl" />;
}

/** Soft-fades the fitted photo's edges that touch the extended background, so the join is seamless. */
function edgeFadeStyle(fit: Fit, boxW: number): CSSProperties {
  const fadeX = Math.min(80, fit.w * 0.06);
  const fadeY = Math.min(80, fit.h * 0.08);
  const layers: string[] = [];
  if (fit.x > 1) layers.push(`linear-gradient(to right, transparent 0, #000 ${fadeX}px, #000 calc(100% - ${fadeX}px), transparent 100%)`);
  if (fit.y > 1) layers.push(`linear-gradient(to bottom, transparent 0, #000 ${fadeY}px)`);
  if (layers.length === 0 || boxW <= 0) return {};
  return {
    WebkitMaskImage: layers.join(", "),
    maskImage: layers.join(", "),
    WebkitMaskComposite: "source-in",
    maskComposite: "intersect",
  };
}

function FittedPhoto({ src, fit, webp }: { src: string; fit: Fit; webp?: string }) {
  return (
    <picture>
      {webp && <source srcSet={webp} type="image/webp" />}
      <img
        src={src}
        alt={IMAGE_ALT}
        className="absolute max-w-none"
        style={{ left: fit.x, top: fit.y, width: fit.w, height: fit.h, ...edgeFadeStyle(fit, fit.w) }}
      />
    </picture>
  );
}

function DesktopHero({
  ctaLink,
  imageSrc,
  isCustomImage,
  natural,
  buttonPosition,
}: HeroContentOverride & { imageSrc: string; isCustomImage: boolean; natural: Natural }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [naturalMode, setNaturalMode] = useState(false);
  const aspect = natural.w / natural.h;

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      // Decided from the real window, not `r` — `r`'s own height depends on `naturalMode`'s result
      // (the outer div has no fixed height in natural mode), so using it here would be circular.
      const isNatural = window.innerWidth / window.innerHeight < MIN_HERO_ASPECT;
      setNaturalMode(isNatural);
      setBox({ w: r.width, h: isNatural ? r.width / aspect : r.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [aspect]);

  const { left: buttonLeftPct, top: buttonTopPct } = buttonPosition ?? DEFAULT_CUSTOM_BUTTON_POSITION;
  const fit = box ? computeFit(box.w, box.h, natural) : null;
  const overlay =
    fit && box ? (isCustomImage ? computeCustomOverlay(box.w, box.h, fit, buttonLeftPct, buttonTopPct) : computeDefaultOverlay(fit)) : null;

  return (
    <div ref={outerRef} className="relative w-full overflow-hidden" style={naturalMode ? { height: box?.h } : { height: "100vh", minHeight: 460 }}>
      {!naturalMode && <HeroBackdrop src={imageSrc} />}
      {fit && <FittedPhoto src={imageSrc} fit={fit} webp={isCustomImage ? undefined : DEFAULT_IMAGE_SRC_WEBP} />}
      {overlay && <DefaultShopNowButton ctaLink={ctaLink} overlay={overlay} fontRatio={isCustomImage ? CUSTOM_FONT_RATIO : DEFAULT_FONT_RATIO} />}
    </div>
  );
}

function MobileHero({
  ctaLink,
  imageSrc,
  isCustomImage,
  natural,
  buttonPosition,
}: HeroContentOverride & { imageSrc: string; isCustomImage: boolean; natural: Natural }) {
  const { left: buttonLeftPct, top: buttonTopPct } = buttonPosition ?? DEFAULT_CUSTOM_BUTTON_POSITION;
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  // The box takes the photo's OWN aspect ratio, so the whole photo shows with no crop and no bars;
  // the pill is placed in the same image-space maths as desktop and scales with the real width.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fit = box ? computeFit(box.w, box.h, natural) : null;
  const overlay =
    fit && box ? (isCustomImage ? computeCustomOverlay(box.w, box.h, fit, buttonLeftPct, buttonTopPct) : computeDefaultOverlay(fit)) : null;

  return (
    <div ref={boxRef} className="relative w-full" style={{ aspectRatio: `${natural.w} / ${natural.h}` }}>
      {fit && <FittedPhoto src={imageSrc} fit={fit} webp={isCustomImage ? undefined : DEFAULT_IMAGE_SRC_WEBP} />}
      {overlay && <DefaultShopNowButton ctaLink={ctaLink} overlay={overlay} fontRatio={isCustomImage ? CUSTOM_FONT_RATIO : DEFAULT_FONT_RATIO} />}
    </div>
  );
}

export function Hero({ ctaLink, imageStoragePath, buttonPosition }: HeroContentOverride = {}) {
  // Analytics: hero impression once per page view (the admin editor preview is never tracked).
  useEffect(() => {
    track("promotion_impression", { surface: "home_hero" });
  }, []);

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  // An admin-uploaded image is only SWITCHED TO once it has actually finished loading. Until then
  // (or if it fails to load) the default artwork + its aligned pill stay on screen. Without this,
  // the CMS content arriving a beat after first paint flipped the pill to its custom-image
  // size/position while the browser was still showing the default image with its baked button —
  // a misaligned pill sitting next to a second, un-covered button for as long as the (large) upload
  // took to download.
  const customSrc = imageStoragePath ? mediaPublicUrl(imageStoragePath) : null;
  const [ready, setReady] = useState<{ src: string; w: number; h: number } | null>(null);
  useEffect(() => {
    if (!customSrc) return;
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled) setReady({ src: customSrc, w: probe.naturalWidth, h: probe.naturalHeight });
    };
    probe.src = customSrc;
    return () => {
      cancelled = true;
    };
  }, [customSrc]);
  const isCustomImage = customSrc !== null && ready?.src === customSrc;
  const natural: Natural = isCustomImage && ready ? { w: ready.w, h: ready.h } : { w: NATURAL_W, h: NATURAL_H };
  const imageSrc = isCustomImage ? customSrc : DEFAULT_IMAGE_SRC;

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
        <DesktopHero ctaLink={ctaLink} imageSrc={imageSrc} isCustomImage={isCustomImage} natural={natural} buttonPosition={buttonPosition} />
      ) : (
        <MobileHero ctaLink={ctaLink} imageSrc={imageSrc} isCustomImage={isCustomImage} natural={natural} buttonPosition={buttonPosition} />
      )}
    </section>
  );
}
