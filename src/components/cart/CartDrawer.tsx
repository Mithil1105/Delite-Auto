import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X, ShoppingBag } from "lucide-react";
import clsx from "clsx";
import { useCart } from "../../context/CartContext";
import { useLang } from "../../i18n/LanguageContext";
import { CartDrawerItem } from "./CartDrawerItem";
import { CartDrawerSummary } from "./CartDrawerSummary";
import { CartRecommendations } from "./CartRecommendations";

/**
 * Global mini-cart drawer — mounted once in Layout.tsx, opened via CartContext's
 * isCartDrawerOpen (auto-opened by a real Add to Cart on tablet/desktop, or manually via the
 * header cart button). Always shows the FULL current cart, not just the newly added line.
 * See Documentations MD/responsive-cart-drawer.md.
 */
export function CartDrawer() {
  const { lines, cartCount, isCartDrawerOpen, closeCartDrawer, recentCartActivity } = useCart();
  const { t } = useLang();

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);

  // Body scroll lock while open; always restored on close/unmount.
  useEffect(() => {
    if (!isCartDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCartDrawerOpen]);

  // Focus the close button on open; return focus to whatever triggered the open on close.
  useEffect(() => {
    if (isCartDrawerOpen) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      closeButtonRef.current?.focus();
    } else if (previouslyFocused.current) {
      previouslyFocused.current.focus();
      previouslyFocused.current = null;
    }
  }, [isCartDrawerOpen]);

  // Escape closes; Tab/Shift+Tab is trapped within the panel so keyboard focus can't wander
  // into the (visually hidden, backdrop-covered) page behind it.
  useEffect(() => {
    if (!isCartDrawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeCartDrawer();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCartDrawerOpen, closeCartDrawer]);

  // New/updated line gets a brief highlight + is scrolled into view — covers both a freshly
  // added product and an existing one whose quantity just went up.
  useEffect(() => {
    if (!recentCartActivity) return;
    setHighlightedProductId(recentCartActivity.productId);
    itemRefs.current.get(recentCartActivity.productId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const timer = window.setTimeout(() => setHighlightedProductId(null), 800);
    return () => window.clearTimeout(timer);
  }, [recentCartActivity]);

  const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);

  return (
    <>
      <div
        className={clsx(
          "fixed inset-0 z-[95] bg-ink/40 transition-opacity duration-200 motion-reduce:transition-none",
          isCartDrawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={closeCartDrawer}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-heading"
        aria-hidden={!isCartDrawerOpen}
        className={clsx(
          "fixed top-0 right-0 z-[96] h-[100dvh] w-[360px] min-[900px]:w-[420px] max-w-full bg-white shadow-lift flex flex-col",
          "transition-transform duration-[260ms] ease-out motion-reduce:transition-none motion-reduce:duration-0",
          isCartDrawerOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <div>
            <h2 id="cart-drawer-heading" className="font-display uppercase text-lg leading-tight">
              {t("cart.title")}
            </h2>
            <p className="text-[12px] text-steel-500">{t("cart.itemsCount", { count: cartCount })}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeCartDrawer}
            aria-label={t("cart.closeCart")}
            className="grid place-items-center w-9 h-9 rounded-full hover:bg-steel-50 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-4">
            <ShoppingBag className="w-10 h-10 text-steel-300" aria-hidden />
            <div>
              <p className="font-semibold text-[15px] mb-1">{t("cart.empty")}</p>
              <p className="text-[13px] text-steel-500 max-w-[32ch]">{t("cart.emptyDesc")}</p>
            </div>
            <Link to="/shop" onClick={closeCartDrawer} className="btn-pill-dark !px-6">
              {t("cart.continueShopping")}
            </Link>
          </div>
        ) : (
          <>
            {/* Scrollable body: cart lines + cross-sell rail. Footer stays a sibling outside this
                scroll container so subtotal/checkout are always visible, never requiring a scroll
                past recommendations — see Documentations MD/personalized-product-recommendations.md. */}
            <div className="flex-1 overflow-y-auto">
              <div className="divide-y divide-line">
                {lines.map(({ product, qty }) => (
                  <CartDrawerItem
                    key={product.id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(product.id, el);
                      else itemRefs.current.delete(product.id);
                    }}
                    product={product}
                    qty={qty}
                    highlighted={highlightedProductId === product.id}
                  />
                ))}
              </div>
              <CartRecommendations />
            </div>
            <CartDrawerSummary subtotal={subtotal} onClose={closeCartDrawer} />
          </>
        )}
      </div>
    </>
  );
}
