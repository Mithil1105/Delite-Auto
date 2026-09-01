import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Rail({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={ref}
        className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <button
        type="button"
        onClick={() => scrollBy(-1)}
        aria-label="Scroll left"
        className="hidden md:grid place-items-center absolute -left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white border border-line shadow-card hover:bg-ink hover:text-white hover:border-ink transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => scrollBy(1)}
        aria-label="Scroll right"
        className="hidden md:grid place-items-center absolute -right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white border border-line shadow-card hover:bg-ink hover:text-white hover:border-ink transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

export function RailItem({ children }: { children: React.ReactNode }) {
  return <div className="snap-start shrink-0 w-[240px] sm:w-[260px]">{children}</div>;
}
