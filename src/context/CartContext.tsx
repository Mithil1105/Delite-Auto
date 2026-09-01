import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Product } from "../data/types";
import { products } from "../data/products";

interface CartLine {
  product: Product;
  qty: number;
}

interface CartContextValue {
  lines: CartLine[];
  wishlist: string[];
  cartCount: number;
  addToCart: (product: Product, qty?: number) => void;
  toggleWishlist: (productId: string) => void;
  isWishlisted: (productId: string) => boolean;
  toast: string | null;
}

const CartContext = createContext<CartContextValue | null>(null);

const CART_KEY = "delite-auto-cart";
const WISHLIST_KEY = "delite-auto-wishlist";

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

  const addToCart = useCallback(
    (product: Product, qty = 1) => {
      setLines((prev) => {
        const existing = prev.find((l) => l.product.id === product.id);
        if (existing) {
          return prev.map((l) => (l.product.id === product.id ? { ...l, qty: l.qty + qty } : l));
        }
        return [...prev, { product, qty }];
      });
      showToast(`Added "${product.name}" to cart`);
    },
    [showToast]
  );

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

  const value: CartContextValue = {
    lines,
    wishlist,
    cartCount,
    addToCart,
    toggleWishlist,
    isWishlisted,
    toast,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
