import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Product, ProductDetail } from "../data/types";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { syncCart, track, type CartSnapshotItem } from "../lib/analytics/client";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./AuthContext";

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
  const { session } = useAuth();
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

  // Analytics reads the latest state through refs so cart callbacks stay referentially stable and
  // events are emitted OUTSIDE React state updaters (which StrictMode double-invokes).
  const linesRef = useRef(lines);
  const wishlistRef = useRef(wishlist);
  const cartMutatedRef = useRef(false);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  useEffect(() => {
    wishlistRef.current = wishlist;
  }, [wishlist]);

  // Account-backed wishlist sync (guest = localStorage only, unchanged). On login: merges the
  // guest wishlist into `wishlist_items` (dedupe, never drop a server item, never clear local
  // state until the merge actually succeeds — #41), then the server becomes the source of truth
  // for the rest of the session. On logout: reverts to whatever's in localStorage, so one
  // account's wishlist never leaks into the next guest view on a shared device.
  const previousUserId = useRef<string | null>(null);
  useEffect(() => {
    const userId = session?.user?.id ?? null;
    if (userId === previousUserId.current) return;
    const wasSignedOut = !previousUserId.current;
    previousUserId.current = userId;
    if (!supabase) return;

    if (userId && wasSignedOut) {
      (async () => {
        const localIds = wishlistRef.current.map((id) => Number(id)).filter((n) => Number.isSafeInteger(n) && n > 0);
        if (localIds.length > 0) {
          await supabase!
            .from("wishlist_items")
            .upsert(
              localIds.map((odoo_template_id) => ({ user_id: userId, odoo_template_id })),
              { onConflict: "user_id,odoo_template_id", ignoreDuplicates: true }
            );
        }
        const { data } = await supabase!.from("wishlist_items").select("odoo_template_id").eq("user_id", userId);
        if (data) setWishlist(data.map((r) => String(r.odoo_template_id)));
      })();
    } else if (!userId) {
      setWishlist(loadWishlist());
    }
  }, [session?.user?.id]);

  // Observed cart snapshot for analytics (historical observed prices — never a price source).
  // The first run is hydration from localStorage and must not count as cart activity.
  useEffect(() => {
    const items: CartSnapshotItem[] = lines
      .filter((l) => typeof l.product.odooId === "number")
      .map((l) => ({
        odoo_template_id: l.product.odooId as number,
        odoo_variant_id: l.variantId ? Number(l.variantId) || 0 : 0,
        quantity: l.qty,
        observed_unit_price: l.variantPrice ?? l.product.price,
      }));
    syncCart(items, cartMutatedRef.current);
    cartMutatedRef.current = false;
  }, [lines]);

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
      cartMutatedRef.current = true;
      if (typeof product.odooId === "number") {
        track("add_to_cart", {
          odoo_template_id: product.odooId,
          ...(variantId && Number(variantId) > 0 ? { odoo_variant_id: Number(variantId) } : {}),
          quantity: qty, value: (variant?.price ?? product.price) * qty,
        });
      }

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
    const removed = linesRef.current.filter((l) => l.product.id === productId && (variantId === undefined || l.variantId === variantId));
    cartMutatedRef.current = true;
    for (const line of removed) {
      if (typeof line.product.odooId !== "number") continue;
      track("remove_from_cart", {
        odoo_template_id: line.product.odooId,
        ...(line.variantId && Number(line.variantId) > 0 ? { odoo_variant_id: Number(line.variantId) } : {}),
        quantity: line.qty, value: (line.variantPrice ?? line.product.price) * line.qty,
      });
    }
    setLines((prev) => prev.filter((l) => !(l.product.id === productId && (variantId === undefined || l.variantId === variantId))));
  }, []);

  const setQuantity = useCallback(
    (productId: string, qty: number, variantId?: string) => {
      if (qty <= 0) {
        removeLine(productId, variantId);
        return;
      }
      const line = linesRef.current.find((l) => l.product.id === productId && (variantId === undefined || l.variantId === variantId));
      if (line && line.qty !== qty) {
        cartMutatedRef.current = true;
        if (typeof line.product.odooId === "number") {
          track("cart_quantity_changed", {
            odoo_template_id: line.product.odooId,
            ...(line.variantId && Number(line.variantId) > 0 ? { odoo_variant_id: Number(line.variantId) } : {}),
            quantity: qty, value: (line.variantPrice ?? line.product.price) * qty,
          });
        }
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
      const templateId = Number(productId);
      const wasOn = wishlistRef.current.includes(productId);
      if (Number.isSafeInteger(templateId) && templateId > 0) {
        track(wasOn ? "wishlist_remove" : "wishlist_add", { odoo_template_id: templateId });
      }
      setWishlist((prev) => {
        const on = prev.includes(productId);
        showToast(on ? "Removed from wishlist" : "Saved to wishlist");
        return on ? prev.filter((id) => id !== productId) : [...prev, productId];
      });

      // Signed-in: mirror the change to the account-backed table too — optimistic (local state
      // already flipped above), reverted on a real backend failure (#42).
      const userId = previousUserId.current;
      if (supabase && userId && Number.isSafeInteger(templateId) && templateId > 0) {
        const write = wasOn
          ? supabase.from("wishlist_items").delete().eq("user_id", userId).eq("odoo_template_id", templateId)
          : supabase.from("wishlist_items").insert({ user_id: userId, odoo_template_id: templateId });
        write.then(({ error }) => {
          if (error) {
            setWishlist((prev) => (wasOn ? [...prev, productId] : prev.filter((id) => id !== productId)));
            showToast("Couldn't update your wishlist — please try again");
          }
        });
      }
    },
    [showToast]
  );

  const isWishlisted = useCallback((productId: string) => wishlist.includes(productId), [wishlist]);

  const cartCount = useMemo(() => lines.reduce((sum, l) => sum + l.qty, 0), [lines]);

  const openCartDrawer = useCallback(() => {
    setIsCartDrawerOpenRaw(true);
    const current = linesRef.current;
    track("cart_viewed", {
      quantity: current.reduce((n, l) => n + l.qty, 0),
      value: current.reduce((n, l) => n + (l.variantPrice ?? l.product.price) * l.qty, 0),
    });
  }, []);
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
