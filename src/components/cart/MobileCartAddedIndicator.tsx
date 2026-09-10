import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import clsx from "clsx";
import { useCart } from "../../context/CartContext";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { CART_DRAWER_BREAKPOINT } from "../../context/CartContext";
import { useLang } from "../../i18n/LanguageContext";

const VISIBLE_DURATION_MS = 1500;

/**
 * Mobile-only "✓ Added" confirmation bubble — mounted by Header inside a `relative` wrapper
 * around the cart icon, positioned absolutely relative to that wrapper (never manual screen
 * coordinates). Never rendered at the tablet/desktop breakpoint, where the cart drawer opening
 * is itself the feedback. See Documentations MD/responsive-cart-drawer.md.
 */
export function MobileCartAddedIndicator() {
  const { recentCartActivity } = useCart();
  const { t } = useLang();
  const isDrawerBreakpoint = useMediaQuery(CART_DRAWER_BREAKPOINT);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!recentCartActivity || isDrawerBreakpoint) return;
    // Restart cleanly on every new activity rather than stacking — a second Add to Cart before
    // the first bubble finishes just extends the same one.
    setVisible(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setVisible(false), VISIBLE_DURATION_MS);
    return () => window.clearTimeout(timerRef.current);
  }, [recentCartActivity, isDrawerBreakpoint]);

  if (isDrawerBreakpoint) return null;

  return (
    <span
      role="status"
      aria-live="polite"
      className={clsx(
        "absolute -top-1 right-0 flex items-center gap-1 rounded-full bg-ink text-white text-[11px] font-semibold px-2.5 py-1 shadow-lift whitespace-nowrap",
        "transition-all duration-200 motion-reduce:transition-none",
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 pointer-events-none"
      )}
    >
      {visible && (
        <>
          <Check className="w-3 h-3" aria-hidden />
          {t("cart.added")}
        </>
      )}
    </span>
  );
}
