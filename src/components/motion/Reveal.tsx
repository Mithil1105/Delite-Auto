import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import clsx from "clsx";

/**
 * Fades + lifts its children into place the first time they scroll into view. The animation itself
 * lives in CSS (`.reveal` / `.is-visible` in src/index.css) so it's compositor-only (opacity +
 * transform) and switched off by `prefers-reduced-motion`. `delay` (ms) staggers siblings.
 *
 * Content that is already on screen when it mounts still animates (it flips to visible on the next
 * frame). Browsers without IntersectionObserver just show the content immediately.
 */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className,
}: {
  children: ReactNode;
  delay?: number;
  as?: ElementType;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          // Next frame, so an element that starts on screen still gets its transition.
          requestAnimationFrame(() => setVisible(true));
          io.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <Tag ref={ref} className={clsx("reveal", visible && "is-visible", className)} style={delay ? { ["--reveal-delay" as string]: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  );
}

/** Stagger helper for grid items: a short, capped delay per column position so long lists don't wait. */
export const staggerDelay = (index: number, perItem = 55, maxSteps = 6) => (index % maxSteps) * perItem;
