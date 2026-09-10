import { products } from "../../data/products";

const RECENTLY_VIEWED_KEY = "delite-auto-recently-viewed";
const MAX_TRACKED_VIEWS = 20;
const DEFAULT_AFFINITY_LOOKBACK = 8;

function readViewedIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Called once per PDP visit (see ProductDetail.tsx). Most-recent-first, deduped, capped. */
export function recordProductView(productId: string) {
  try {
    const existing = readViewedIds();
    const next = [productId, ...existing.filter((id) => id !== productId)].slice(0, MAX_TRACKED_VIEWS);
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — personalization just degrades to basket-only signals */
  }
}

/**
 * Categories from the customer's most recent product views — the "recent affinity" scoring
 * signal. No purchase-history equivalent exists yet (no real order data — see
 * Documentations MD/personalized-product-recommendations.md), so this is the only history signal
 * today.
 */
export function getRecentlyViewedCategories(limit = DEFAULT_AFFINITY_LOOKBACK): Set<string> {
  const ids = readViewedIds().slice(0, limit);
  const categories = new Set<string>();
  for (const id of ids) {
    const product = products.find((p) => p.id === id);
    if (product) categories.add(product.categorySlug);
  }
  return categories;
}
