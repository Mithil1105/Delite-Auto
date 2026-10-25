import { Star } from "lucide-react";
import clsx from "clsx";

/** Read-only star row that supports half stars (ratings are stored in 0.5 steps, e.g. 3.5). */
export function StarRating({ rating, size = "w-3.5 h-3.5", showValue = false }: { rating: number; size?: string; showValue?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${rating} out of 5 stars`}>
      <span className="flex items-center gap-0.5">
        {Array.from({ length: 5 }, (_, i) =>
          i + 0.5 === rating ? (
            <span key={i} className={clsx("relative inline-block", size)} aria-hidden="true">
              <Star className={clsx("absolute inset-0 text-line", size)} />
              <span className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
                <Star className={clsx("fill-gold text-gold", size)} />
              </span>
            </span>
          ) : (
            <Star key={i} aria-hidden="true" className={clsx(size, i < rating ? "fill-gold text-gold" : "text-line")} />
          )
        )}
      </span>
      {showValue && <span className="text-[12px] font-semibold tabular-nums">{rating.toFixed(1)}</span>}
    </span>
  );
}
