import { useEffect, useRef, type RefObject } from "react";

/**
 * Calls `onVisible` once, the first time the referenced element is ~40% on screen (used for
 * impression events). Re-arms when `key` changes (e.g. a rail's product set or a tab switch).
 * Never throws; falls back to firing immediately where IntersectionObserver is unavailable.
 */
export function useOnVisible(ref: RefObject<Element | null>, onVisible: () => void, key: string, enabled = true): void {
  const callback = useRef(onVisible);
  useEffect(() => {
    callback.current = onVisible;
  });

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      try { callback.current(); } catch { /* analytics must never throw into the UI */ }
    };
    if (typeof IntersectionObserver === "undefined") {
      fire();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          fire();
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, key, enabled]);
}
