import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Product } from "../../data/types";
import { FullBleedSection } from "../layout/FullBleedSection";
import { PillTabs, type PillTabOption } from "./PillTabs";
import { ProductCarousel } from "../product/ProductCarousel";
import type { RailHandle } from "../Rail";

/**
 * Shared shell for the Figma "Shop by Top Categories in Car/Bike" sections — same header
 * pattern, segmented tab control, denser product rail and small circular scroll controls next to
 * "View All" for both, via one component (see Documentations MD, "REUSE, DON'T FORK" — Home.tsx
 * previously duplicated this structure once per vehicle).
 */
export function HomeCategoryProductSection({
  title,
  ctaLabel,
  ctaHref,
  tabs,
  activeTab,
  onTabChange,
  products,
  loading = false,
  emptyLabel,
  topSlot,
}: {
  title: string;
  ctaLabel: string;
  ctaHref: string;
  tabs: PillTabOption[];
  activeTab: string;
  onTabChange: (value: string) => void;
  products: Product[];
  /** The tab's products are still being fetched. */
  loading?: boolean;
  /** Shown when the tab has no products. */
  emptyLabel?: string;
  /** Optional control shown above the tabs (the Car / Bike switch). */
  topSlot?: ReactNode;
}) {
  const railRef = useRef<RailHandle>(null);
  const [bounds, setBounds] = useState({ canScrollPrev: false, canScrollNext: false });

  return (
    <FullBleedSection spacing="compact" containerSize="wide" className="bg-steel-50">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl sm:text-2xl heading">{title}</h2>
        <div className="flex items-center gap-2">
          <Link to={ctaHref} className="text-[13px] font-semibold text-brand-700 hover:underline whitespace-nowrap">
            {ctaLabel}
          </Link>
          <div className="hidden md:flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => railRef.current?.scrollPrev()}
              disabled={!bounds.canScrollPrev}
              aria-label="Scroll left"
              className="rail-control-btn"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => railRef.current?.scrollNext()}
              disabled={!bounds.canScrollNext}
              aria-label="Scroll right"
              className="rail-control-btn"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
      {topSlot && <div className="mb-3">{topSlot}</div>}
      <div className="mb-5">
        <PillTabs value={activeTab} onChange={onTabChange} options={tabs} variant="segmented" />
      </div>
      {products.length > 0 ? (
        <ProductCarousel ref={railRef} products={products} variant="home-category" hideArrows onBoundsChange={setBounds} />
      ) : (
        <div className="grid min-h-[12rem] place-items-center rounded-2xl border border-dashed border-line bg-white/60 px-4 text-center text-[14px] text-steel-500" aria-live="polite">
          {loading ? "…" : emptyLabel ?? ""}
        </div>
      )}
    </FullBleedSection>
  );
}
