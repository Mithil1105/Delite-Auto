import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Play } from "lucide-react";
import clsx from "clsx";
import type { ProductMedia } from "../../data/types";
import { EmbeddedVideo } from "./EmbeddedVideo";
import { MediaLightbox } from "./MediaLightbox";

const MAX_MEDIA = 9;

/**
 * Product image gallery, modelled on the Hasto storefront's ProductMediaGallery:
 *  - desktop: a vertical thumbnail rail (active dot, arrows when it overflows, arrow-key navigation)
 *    beside one image stage that cross-fades between images (thumbnails, ‹ › buttons, ←/→);
 *  - mobile: a horizontal swipe carousel with a thumbnail strip;
 *  - click any image to open the full-screen zoom viewer (MediaLightbox).
 *
 * The desktop stage deliberately is NOT a nested scroll area (Hasto's is): a scroller under the
 * pointer captures the mouse wheel / trackpad before handing it back to the page, which made
 * scrolling the product page feel jerky. The stage never intercepts page scrolling.
 *
 * `fallback` renders when the product has no images at all (the icon placeholder). Callers should
 * pass `key={product.id}` so a different product remounts the gallery at its first image.
 */

/** Hide a broken image so its container shows instead of a broken icon. */
const hideBroken = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.visibility = "hidden";
};

function Thumb({ m }: { m: ProductMedia }) {
  // An embedded (YouTube/Vimeo) video shows its still image with a play badge.
  if (m.video) {
    return (
      <>
        {m.thumbnail || m.src ? <img src={m.thumbnail || m.src} alt="" loading="lazy" onError={hideBroken} className="h-full w-full object-cover" /> : <span className="block h-full w-full bg-ink" />}
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/25">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-ink">
            <Play className="ml-0.5 h-3 w-3" fill="currentColor" />
          </span>
        </span>
      </>
    );
  }
  if (m.type === "video") return <video src={m.src} muted preload="metadata" className="h-full w-full object-cover" />;
  return <img src={m.thumbnail || m.src} alt="" loading="lazy" onError={hideBroken} className="h-full w-full object-cover" />;
}

const mediaLabel = (m: ProductMedia, i: number, total: number) => `View product ${m.type === "video" ? "video" : "image"} ${i + 1} of ${total}`;

function ActiveDot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={clsx("pointer-events-none block h-1.5 w-1.5 rounded-full bg-brand-600", className)} />;
}

/** Square product shots, capped by the viewport height so the whole image is visible without scrolling the page. */
const FRAME = "aspect-square max-h-[calc(100dvh-200px)] min-h-[320px]";

export function ProductMediaGallery({ media, productName, fallback }: { media: ProductMedia[]; productName: string; fallback?: ReactNode }) {
  const items = useMemo(() => media.slice(0, MAX_MEDIA), [media]);
  const total = items.length;
  const showThumbs = total > 1;

  const [selected, setSelected] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [railOverflows, setRailOverflows] = useState(false);

  const thumbColRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Both rails are in the DOM at once (one is display:none per breakpoint), so each needs its own refs.
  const mobileThumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const mobileTrackRef = useRef<HTMLDivElement>(null);

  const [reducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const behavior: ScrollBehavior = reducedMotion ? "auto" : "smooth";

  // Keep the active thumbnail (and its dot) in view — scrolls the rail itself, never the page.
  useEffect(() => {
    const rail = thumbColRef.current;
    const btn = thumbRefs.current[selected];
    if (!rail || !btn) return;
    const top = btn.offsetTop;
    const bottom = top + btn.offsetHeight;
    if (top < rail.scrollTop) rail.scrollTo({ top, behavior });
    else if (bottom > rail.scrollTop + rail.clientHeight) rail.scrollTo({ top: bottom - rail.clientHeight, behavior });
  }, [selected, behavior]);

  // Show the rail arrows only when there is somewhere to scroll (measured: the rail height follows the stage).
  useEffect(() => {
    const rail = thumbColRef.current;
    if (!rail) return;
    const measure = () => setRailOverflows(rail.scrollHeight > rail.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(rail);
    return () => ro.disconnect();
  }, [total]);

  if (total === 0) return <>{fallback}</>;

  const scrollThumbs = (dir: 1 | -1) => thumbColRef.current?.scrollBy({ top: dir * 200, behavior });

  const goTo = (i: number) => setSelected(i);

  const goToMobile = (i: number) => {
    setSelected(i);
    const el = mobileTrackRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior });
  };

  const step = (dir: 1 | -1) => setSelected((s) => (s + dir + total) % total);

  // Arrow / Home / End move between thumbnails; scoped to the rail so page scrolling is untouched.
  const railKeyDown = (e: React.KeyboardEvent, isMobile: boolean) => {
    let next: number;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = Math.min(total - 1, selected + 1);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = Math.max(0, selected - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = total - 1;
    else return;
    e.preventDefault();
    if (isMobile) {
      goToMobile(next);
      mobileThumbRefs.current[next]?.focus();
    } else {
      goTo(next);
      thumbRefs.current[next]?.focus();
    }
  };

  const syncMobileSelected = () => {
    const el = mobileTrackRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== selected) setSelected(Math.max(0, Math.min(total - 1, idx)));
  };

  const slideContent = (m: ProductMedia, i: number, imgClass: string) =>
    m.video ? (
      <EmbeddedVideo video={m.video} poster={m.thumbnail || m.src} title={m.alt || productName} active={i === selected} />
    ) : m.type === "image" ? (
      <button type="button" onClick={() => setLightbox(i)} aria-label="Open image viewer" className="block h-full w-full cursor-zoom-in">
        <img src={m.src} alt={m.alt || productName} loading={i === 0 ? "eager" : "lazy"} onError={hideBroken} className={imgClass} />
      </button>
    ) : (
      <video src={m.src} controls playsInline preload="metadata" aria-label={m.alt || productName} className="h-full w-full object-contain" />
    );

  return (
    <>
      {/* Desktop / tablet: thumbnail rail + cross-fading stage */}
      <div className="hidden gap-3 md:flex">
        {showThumbs && (
          <div className="relative w-[68px] shrink-0 lg:w-[76px]">
            {/* Absolutely positioned so the rail takes its height from the stage beside it and can never stretch it. */}
            <div className="absolute inset-0 flex flex-col items-center">
              {railOverflows && (
                <button type="button" onClick={() => scrollThumbs(-1)} aria-label="Scroll thumbnails up" className="mb-1 text-ink/30 transition hover:text-ink">
                  <ChevronUp size={16} strokeWidth={1.5} />
                </button>
              )}
              <div
                ref={thumbColRef}
                role="group"
                aria-label="Product images"
                onKeyDown={(e) => railKeyDown(e, false)}
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pl-3"
                style={{ scrollbarWidth: "none" }}
              >
                {items.map((m, i) => (
                  <div key={m.id + i} className="relative w-14 shrink-0 lg:w-16">
                    {i === selected && <ActiveDot className="absolute -left-3 top-1/2 -translate-y-1/2" />}
                    <button
                      ref={(el) => {
                        thumbRefs.current[i] = el;
                      }}
                      type="button"
                      onClick={() => goTo(i)}
                      // Roving tabindex: the rail is ONE tab stop that lands on the active thumbnail.
                      tabIndex={i === selected ? 0 : -1}
                      aria-label={mediaLabel(m, i, total)}
                      aria-current={i === selected ? "true" : undefined}
                      className={clsx(
                        "relative block aspect-square w-full overflow-hidden rounded-lg border transition",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                        i === selected ? "border-ink" : "border-line hover:border-ink/40"
                      )}
                    >
                      <Thumb m={m} />
                    </button>
                  </div>
                ))}
              </div>
              {railOverflows && (
                <button type="button" onClick={() => scrollThumbs(1)} aria-label="Scroll thumbnails down" className="mt-1 text-ink/30 transition hover:text-ink">
                  <ChevronDown size={16} strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* All images are stacked and cross-faded (no scrolling inside the stage), so switching is
            instant and the page scroll is never captured. */}
        <div className={clsx(FRAME, "group relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-line bg-paper")}>
          {items.map((m, i) => (
            <div
              key={m.id + i}
              aria-hidden={i !== selected}
              className={clsx(
                "absolute inset-0 flex items-center justify-center transition-opacity duration-300 ease-out motion-reduce:transition-none",
                i === selected ? "opacity-100" : "pointer-events-none opacity-0"
              )}
            >
              {slideContent(m, i, "h-full w-full object-contain object-center")}
            </div>
          ))}

          {showThumbs && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous image"
                className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-card opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 hover:bg-white"
              >
                <ChevronLeft size={18} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next image"
                className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-card opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 hover:bg-white"
              >
                <ChevronRight size={18} strokeWidth={1.8} />
              </button>
              <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-ink/60 px-2.5 py-1 text-[11px] tabular-nums text-white/90">
                {selected + 1} / {total}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Mobile: horizontal swipe carousel + thumbnail strip */}
      <div className="md:hidden">
        <div ref={mobileTrackRef} onScroll={syncMobileSelected} className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl border border-line" style={{ scrollbarWidth: "none" }}>
          {items.map((m, i) => (
            <div key={m.id + i} className="w-full shrink-0 snap-center">
              <div className="flex aspect-square items-center justify-center overflow-hidden bg-paper">{slideContent(m, i, "h-full w-full object-contain")}</div>
            </div>
          ))}
        </div>

        {showThumbs && (
          <div role="group" aria-label="Product images" onKeyDown={(e) => railKeyDown(e, true)} className="flex justify-center gap-1.5 overflow-x-auto px-4 pb-1 pt-3" style={{ scrollbarWidth: "none" }}>
            {items.map((m, i) => (
              <div key={m.id + i} className="flex shrink-0 flex-col items-center gap-1">
                <button
                  ref={(el) => {
                    mobileThumbRefs.current[i] = el;
                  }}
                  type="button"
                  onClick={() => goToMobile(i)}
                  tabIndex={i === selected ? 0 : -1}
                  aria-label={mediaLabel(m, i, total)}
                  aria-current={i === selected ? "true" : undefined}
                  className={clsx("relative h-12 w-12 overflow-hidden rounded-md border transition", i === selected ? "border-ink" : "border-line opacity-60")}
                >
                  <Thumb m={m} />
                </button>
                <ActiveDot className={clsx(i !== selected && "invisible")} />
              </div>
            ))}
          </div>
        )}
      </div>

      {lightbox !== null && (
        <MediaLightbox
          media={items}
          index={lightbox}
          onIndexChange={(i) => {
            setLightbox(i);
            setSelected(i);
            const el = mobileTrackRef.current;
            if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "auto" });
          }}
          onClose={() => setLightbox(null)}
          productName={productName}
        />
      )}
    </>
  );
}
