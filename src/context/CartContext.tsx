import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Product } from "../data/types";
import { products } from "../data/products";
import { useMediaQuery } from "../hooks/useMediaQuery";

interface CartLine {
  product: Product;
  qty: number;
}

/**
 * Fired on every "real" Add to Cart action (not Buy Now — see CartContext's `addToCart` options).
 * `id` is a monotonically increasing counter, not just `timestamp` — adding a second unit of the
 * SAME product within the same millisecond must still produce a distinct activity so consumers
 * (CartDrawer's highlight, MobileCartAddedIndicator's timer) can tell it apart from the previous
 * one and restart their own transient state instead of comparing cartCount, which wouldn't change
 * when the drawer just needs to re-highlight/re-scroll to an already-open state.
 */
export interface CartActivity {
  type: "item-added";
  productId: string;
  timestamp: number;
  id: number;
}

interface CartContextValue {
  lines: CartLine[];
  wishlist: string[];
  cartCount: number;
  addToCart: (product: Product, qty?: number, options?: { feedback?: boolean }) => void;
  removeLine: (productId: string) => void;
  setQuantity: (productId: string, qty: number) => void;
  clearCart: () => void;
  toggleWishlist: (productId: string) => void;
  isWishlisted: (productId: string) => boolean;
  toast: string | null;
  isCartDrawerOpen: boolean;
  openCartDrawer: () => void;
  closeCartDrawer: () => void;
  recentCartActivity: CartActivity | null;
}

const CartContext = createContext<CartContextValue | null>(null);

const CART_KEY = "delite-auto-cart";
const WISHLIST_KEY = "delite-auto-wishlist";

/**
 * Deliberately not Tailwind's `md` (768px) — we specifically want iPad/tablet portrait to use
 * the drawer. Exported so CartDrawer/Header import this single source of truth rather than
 * re-declaring the query string. See Documentations MD/responsive-cart-drawer.md.
 */
export const CART_DRAWER_BREAKPOINT = "(min-width: 700px)";

function loadCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const entries: { id: string; qty: number }[] = JSON.parse(raw);
    return entries
      .map((e) => {
        const product = products.find((p) => p.id === e.id);
        return product ? { product, qty: e.qty } : null;
      })
      .filter((l): l is CartLine => l !== null);
  } catch {
    return [];
  }
}

function loadWishlist(): string[] {
  try {
    const raw = localStorage.getItem(WISHLIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(loadCart);
  const [wishlist, setWishlist] = useState<string[]>(loadWishlist);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const [isCartDrawerOpenRaw, setIsCartDrawerOpenRaw] = useState(false);
  const [recentCartActivity, setRecentCartActivity] = useState<CartActivity | null>(null);
  const activityIdRef = useRef(0);
  const isDrawerBreakpoint = useMediaQuery(CART_DRAWER_BREAKPOINT);
  // Derived, not stored+synced via effect: the drawer is a tablet/desktop-only affordance, so a
  // live resize below the breakpoint (rotating a tablet, shrinking a desktop window) hides it
  // immediately without needing a separate "close on resize" effect.
  const isCartDrawerOpen = isCartDrawerOpenRaw && isDrawerBreakpoint;

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(lines.map((l) => ({ id: l.product.id, qty: l.qty }))));
    } catch {
      /* storage unavailable, skip persisting */
    }
  }, [lines]);

  useEffect(() => {
    try {
      localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
    } catch {
      /* storage unavailable, skip persisting */
    }
  }, [wishlist]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  /**
   * `options.feedback` defaults to true. Buy Now passes `{ feedback: false }` — it still adds the
   * product, it just must not trigger the drawer/mobile "Added" indicator (that's cart-specific
   * feedback; Buy Now is navigating straight to checkout, a different action — see
   * Documentations MD/responsive-cart-drawer.md).
   */
  const addToCart = useCallback(
    (product: Product, qty = 1, options?: { feedback?: boolean }) => {
      setLines((prev) => {
        const existing = prev.find((l) => l.product.id === product.id);
        if (existing) {
          return prev.map((l) => (l.product.id === product.id ? { ...l, qty: l.qty + qty } : l));
        }
        return [...prev, { product, qty }];
      });

      if (options?.feedback === false) return;

      activityIdRef.current += 1;
      setRecentCartActivity({ type: "item-added", productId: product.id, timestamp: Date.now(), id: activityIdRef.current });
      // Only actually open at the drawer breakpoint — otherwise this would leave the raw flag
      // true from a mobile add, ready to pop the drawer open unprompted if the viewport later
      // grows (e.g. rotating a tablet) without another Add to Cart happening.
      if (isDrawerBreakpoint) setIsCartDrawerOpenRaw(true);
    },
    [isDrawerBreakpoint]
  );

  const removeLine = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  }, []);

  const setQuantity = useCallback(
    (productId: string, qty: number) => {
      if (qty <= 0) {
        removeLine(productId);
        return;
      }
      setLines((prev) => prev.map((l) => (l.product.id === productId ? { ...l, qty } : l)));
    },
    [removeLine]
  );

  const clearCart = useCallback(() => setLines([]), []);

  const toggleWishlist = useCallback(
    (productId: string) => {
      setWishlist((prev) => {
        const on = prev.includes(productId);
        showToast(on ? "Removed from wishlist" : "Saved to wishlist");
        return on ? prev.filter((id) => id !== productId) : [...prev, productId];
      });
    },
    [showToast]
  );

  const isWishlisted = useCallback((productId: string) => wishlist.includes(productId), [wishlist]);

  const cartCount = useMemo(() => lines.reduce((sum, l) => sum + l.qty, 0), [lines]);

  const openCartDrawer = useCallback(() => setIsCartDrawerOpenRaw(true), []);
  const closeCartDrawer = useCallback(() => setIsCartDrawerOpenRaw(false), []);

  const value: CartContextValue = {
    lines,
    wishlist,
    cartCount,
    addToCart,
    removeLine,
    setQuantity,
    clearCart,
    toggleWishlist,
    isWishlisted,
    toast,
    isCartDrawerOpen,
    openCartDrawer,
    closeCartDrawer,
    recentCartActivity,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
