import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Imperative controls exposed via ref (opt-in) — lets a parent render its own scroll buttons
 * (e.g. small circular arrows next to a section's "View All") instead of Rail's own edge-overlay
 * arrows. `canScrollPrev`/`canScrollNext` are a snapshot at the time `onBoundsChange` last fired,
 * not itself reactive — a parent that needs live enabled/disabled state should read it from
 * `onBoundsChange` instead of this handle. */
export interface RailHandle {
  scrollPrev: () => void;
  scrollNext: () => void;
}

interface RailProps {
  children: React.ReactNode;
  /**
   * Opt-in only — every existing Rail consumer (ProductCarousel etc.) renders with the exact same
   * single-element DOM/classes as before when this is omitted, so they cannot regress. When true,
   * the scroll container and the flex track are split into two nested elements so the track can
   * be `w-max min-w-full justify-center`: content narrower than the container is forced to fill
   * it (`min-w-full`) and then centers within that full width (`justify-center`); content wider
   * than the container renders at its natural (`w-max`) width and simply overflows/scrolls from
   * the start, exactly as before — `justify-center` has no visible effect once the track is
   * already exactly as wide as its content. See Documentations MD/frontend-foundation-uiux-refactor.md
   * for the category-icon-strip fix this was added for.
   */
  centerWhenFits?: boolean;
  /**
   * "square" (default) is the original arrow used by every existing Rail. "circle" is the Figma
   * category-strip arrow: round, previous = white/outlined, next = filled brand blue, centered on
   * the rail's left/right edge. Opt-in, so other Rails are unchanged.
   */
  arrowStyle?: "square" | "circle";
  /** Vertical anchor for the arrows (a Tailwind `top-*` class). Default `top-1/2`; the category strip pins them to the image row rather than the image+label block. */
  arrowTop?: string;
  /** Opt-in: suppresses Rail's own edge-overlay prev/next buttons entirely — for a section that
   * renders its own scroll controls elsewhere (e.g. next to "View All") via the `ref` handle
   * below, instead of Rail's default overlay-on-the-rail-edge arrows. */
  hideEdgeArrows?: boolean;
  /** Opt-in: fires whenever the scrollable bounds change (mount, resize, scroll) so a parent
   * rendering its own controls can mirror Rail's enabled/disabled state. */
  onBoundsChange?: (bounds: { canScrollPrev: boolean; canScrollNext: boolean }) => void;
}

export const Rail = forwardRef<RailHandle, RailProps>(function Rail(
  { children, centerWhenFits = false, arrowStyle = "square", arrowTop = "top-1/2", hideEdgeArrows = false, onBoundsChange },
  handleRef
) {
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateBounds = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const nextAtStart = el.scrollLeft <= 1;
    const nextAtEnd = el.scrollLeft >= max - 1;
    setAtStart(nextAtStart);
    setAtEnd(nextAtEnd);
    onBoundsChange?.({ canScrollPrev: !nextAtStart, canScrollNext: !nextAtEnd });
  }, [onBoundsChange]);

  useEffect(() => {
    const el = ref.current;
    updateBounds();
    if (!el) return;
    const ro = new ResizeObserver(updateBounds);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateBounds, children]);

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  useImperativeHandle(handleRef, () => ({
    scrollPrev: () => scrollBy(-1),
    scrollNext: () => scrollBy(1),
  }));

  const scrollContainerClasses =
    "overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  const arrowBase = `hidden md:grid place-items-center absolute -translate-y-1/2 transition-colors ${arrowTop}`;
  const prevClass =
    arrowStyle === "circle"
      ? `${arrowBase} -left-[22px] w-11 h-11 rounded-full bg-white border border-line text-ink hover:border-ink`
      : `${arrowBase} -left-4 w-10 h-10 bg-white border border-line shadow-card hover:bg-ink hover:text-white hover:border-ink`;
  const nextClass =
    arrowStyle === "circle"
      ? `${arrowBase} -right-[22px] w-11 h-11 rounded-full bg-brand-500 text-white hover:bg-brand-700`
      : `${arrowBase} -right-4 w-10 h-10 bg-white border border-line shadow-card hover:bg-ink hover:text-white hover:border-ink`;

  return (
    <div className="relative">
      {centerWhenFits ? (
        <div ref={ref} onScroll={updateBounds} className={scrollContainerClasses}>
          <div className="flex gap-4 w-max min-w-full justify-center">{children}</div>
        </div>
      ) : (
        <div ref={ref} onScroll={updateBounds} className={`flex gap-4 ${scrollContainerClasses}`}>
          {children}
        </div>
      )}
      {!hideEdgeArrows && !atStart && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Scroll left"
          className={prevClass}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      {!hideEdgeArrows && !atEnd && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Scroll right"
          className={nextClass}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
});

export function RailItem({ children, className = "w-[260px] sm:w-[280px]" }: { children: React.ReactNode; className?: string }) {
  return <div className={`snap-start shrink-0 ${className}`}>{children}</div>;
}
