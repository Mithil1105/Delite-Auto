import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Product, ProductDetail } from "../data/types";
import { useMediaQuery } from "../hooks/useMediaQuery";

interface CartLine {
  product: Product;
  qty: number;
  /**
   * Which variant of `product` this line is for — `product.variants[n].id` (see
   * `src/data/types.ts#ProductVariant`, which itself carries the real `odooVariantId` once a
   * product is Odoo-backed — that is the authoritative purchase identity for a real Odoo product,
   * see Documentations MD/odoo-real-catalog.md, "Cart identity"). `undefined` means "the product
   * itself, no variant selected" (a single-variant or variant-less product). Cart-line identity is
   * `(product.id, variantId)` together, NOT just `product.id` — the same product with two
   * different variants selected is two separate lines, never collapsed into one.
   */
  variantId?: string;
  /** The selected variant's own label/price, captured at add-to-cart time — see `addToCart`. Absent when no variant was selected. */
  variantLabel?: string;
  variantPrice?: number;
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
  addToCart: (product: Product | ProductDetail, qty?: number, options?: { feedback?: boolean; variantId?: string }) => void;
  removeLine: (productId: string, variantId?: string) => void;
  setQuantity: (productId: string, qty: number, variantId?: string) => void;
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

/**
 * CART PERSISTENCE — MIGRATION NOTE (see Documentations MD/odoo-real-catalog.md, "Cart identity"):
 * the old format persisted only `{ id, qty, variantId }` and rehydrated `product` by looking the
 * id up in the static mock `src/data/products.ts` array. That silently discarded every real
 * Odoo-backed cart line on reload (a real template id like "442" is never in the mock array), and
 * would have been worse if "fixed" by falling back to some other product — a stale mock-id cart
 * must never resolve to an unrelated real product. The new format persists the full `product`
 * snapshot alongside `qty`/`variantId`/`variantLabel`/`variantPrice`, so no catalog lookup is
 * needed at load time at all — it works identically for the mock catalog and real Odoo data, and
 * a pre-migration entry (no embedded `product`) is a version mismatch, not a partial match: it is
 * dropped, never guessed at. This never throws on an old/corrupt entry — one bad line is skipped,
 * not a page crash.
 */
interface PersistedCartLine {
  product?: Product;
  qty?: number;
  variantId?: string;
  variantLabel?: string;
  variantPrice?: number;
}

function isValidProduct(value: unknown): value is Product {
  return !!value && typeof value === "object" && typeof (value as Product).id === "string" && typeof (value as Product).slug === "string";
}

function loadCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const entries: PersistedCartLine[] = JSON.parse(raw);
    if (!Array.isArray(entries)) return [];
    return entries
      .filter((e): e is Required<Pick<PersistedCartLine, "product" | "qty">> & PersistedCartLine => isValidProduct(e.product) && typeof e.qty === "number" && e.qty > 0)
      .map((e): CartLine => ({ product: e.product, qty: e.qty, variantId: e.variantId, variantLabel: e.variantLabel, variantPrice: e.variantPrice }));
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
      const persisted: PersistedCartLine[] = lines.map((l) => ({
        product: l.product,
        qty: l.qty,
        variantId: l.variantId,
        variantLabel: l.variantLabel,
        variantPrice: l.variantPrice,
      }));
      localStorage.setItem(CART_KEY, JSON.stringify(persisted));
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
    (product: Product | ProductDetail, qty = 1, options?: { feedback?: boolean; variantId?: string }) => {
      const variantId = options?.variantId;
      // Captured once, at add time — `variants` only exists on the richer `ProductDetail` a PDP
      // fetches, not on the `Product` a list card passes; a stored cart line carries its own
      // snapshot so it renders correctly even if only a plain `Product` is ever passed in.
      const variant = variantId ? (product as ProductDetail).variants?.find((v) => v.id === variantId) : undefined;

      setLines((prev) => {
        // Identity is (product.id, variantId) together — the same product with a DIFFERENT
        // variant is a separate line, not a quantity bump on an unrelated variant's line.
        const existing = prev.find((l) => l.product.id === product.id && l.variantId === variantId);
        if (existing) {
          return prev.map((l) => (l.product.id === product.id && l.variantId === variantId ? { ...l, qty: l.qty + qty } : l));
        }
        return [...prev, { product, qty, variantId, variantLabel: variant?.label, variantPrice: variant?.price }];
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

  // `variantId` omitted matches every line for that product regardless of variant — correct
  // today (no line ever has a variantId, since no UI passes one into addToCart yet) and an
  // explicit, documented edge case once real variant selection lands: a caller that knows which
  // variant it means should always pass it.
  const removeLine = useCallback((productId: string, variantId?: string) => {
    setLines((prev) => prev.filter((l) => !(l.product.id === productId && (variantId === undefined || l.variantId === variantId))));
  }, []);

  const setQuantity = useCallback(
    (productId: string, qty: number, variantId?: string) => {
      if (qty <= 0) {
        removeLine(productId, variantId);
        return;
      }
      setLines((prev) =>
        prev.map((l) => (l.product.id === productId && (variantId === undefined || l.variantId === variantId) ? { ...l, qty } : l))
      );
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
