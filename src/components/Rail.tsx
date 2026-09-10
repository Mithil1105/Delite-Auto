import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Rail({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateBounds = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= max - 1);
  }, []);

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

  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={updateBounds}
        className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {!atStart && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Scroll left"
          className="hidden md:grid place-items-center absolute -left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white border border-line shadow-card hover:bg-ink hover:text-white hover:border-ink transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      {!atEnd && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Scroll right"
          className="hidden md:grid place-items-center absolute -right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white border border-line shadow-card hover:bg-ink hover:text-white hover:border-ink transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function RailItem({ children, className = "w-[260px] sm:w-[280px]" }: { children: React.ReactNode; className?: string }) {
  return <div className={`snap-start shrink-0 ${className}`}>{children}</div>;
}
