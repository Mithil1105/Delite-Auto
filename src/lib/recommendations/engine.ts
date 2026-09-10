import type { Product } from "../../data/types";
import { products } from "../../data/products";
import { COMPLEMENTARY_CATEGORIES } from "./categoryGraph";
import { getRecentlyViewedCategories } from "./history";
import type { CartLineInput, RecommendationRequest, ScoredCandidate } from "./types";

const MIN_LIMIT = 2;
const MAX_LIMIT = 4;
const MAX_PER_CATEGORY = 2;

const COMPLEMENT_SCORE = 35;
const MULTI_COMPLEMENT_BONUS = 15;
const VEHICLE_MATCH_SCORE = 35;
const RECENT_AFFINITY_SCORE = 20;
const SAME_CATEGORY_AS_CART_PENALTY = 25;
const PDP_SAME_CATEGORY_SCORE = 15;
const PDP_SAME_BRAND_SCORE = 10;

function isAvailable(product: Product): boolean {
  return product.available !== false;
}

function clampLimit(limit: number | undefined): number {
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, limit ?? MAX_LIMIT));
}

/**
 * Cart-cross-sell scoring — see section 3 of the feature spec / Documentations MD/
 * personalized-product-recommendations.md for the weight table this mirrors. Returns `null` for
 * anything that must be excluded outright (already in cart, out of stock, vehicle-incompatible),
 * not just low-scored.
 */
export function scoreForCartCrossSell(
  candidate: Product,
  lines: CartLineInput[],
  recentCategories: Set<string>
): ScoredCandidate | null {
  if (lines.some((l) => l.product.id === candidate.id)) return null;
  if (!isAvailable(candidate)) return null;

  const cartHasCar = lines.some((l) => l.product.vehicle === "car");
  const cartHasBike = lines.some((l) => l.product.vehicle === "bike");
  const vehicleCompatible =
    candidate.vehicle === "universal" ||
    (candidate.vehicle === "car" && cartHasCar) ||
    (candidate.vehicle === "bike" && cartHasBike) ||
    (!cartHasCar && !cartHasBike);
  if (!vehicleCompatible) return null;

  const cartCategories = new Set(lines.map((l) => l.product.categorySlug));
  const reasons: string[] = [];
  let score = 0;
  let complementCount = 0;

  for (const cartCategory of cartCategories) {
    if ((COMPLEMENTARY_CATEGORIES[cartCategory] ?? []).includes(candidate.categorySlug)) {
      score += COMPLEMENT_SCORE;
      complementCount += 1;
      reasons.push(`complements:${cartCategory}`);
    }
  }
  if (complementCount >= 2) {
    score += MULTI_COMPLEMENT_BONUS;
    reasons.push("multi-complement-bonus");
  }

  if ((candidate.vehicle === "car" && cartHasCar) || (candidate.vehicle === "bike" && cartHasBike)) {
    score += VEHICLE_MATCH_SCORE;
    reasons.push("vehicle-match");
  }

  if (recentCategories.has(candidate.categorySlug)) {
    score += RECENT_AFFINITY_SCORE;
    reasons.push("recent-affinity");
  }

  // Co-purchase / co-cart signals are intentionally absent: no real order/session data exists
  // yet, and fabricating one would misrepresent confidence we don't have (see "Known issues" in
  // Documentations MD/personalized-product-recommendations.md). Once Odoo order history lands,
  // those signals plug in here as additional positive terms — nothing else in this function
  // needs to change.

  if (cartCategories.has(candidate.categorySlug)) {
    score -= SAME_CATEGORY_AS_CART_PENALTY;
    reasons.push("same-category-as-cart");
  }

  return { product: candidate, score, reasons };
}

/** PDP "You might also like" scoring — same engine, no basket to aggregate, just one product. */
export function scoreForPdp(candidate: Product, currentProduct: Product): ScoredCandidate | null {
  if (candidate.id === currentProduct.id) return null;
  if (!isAvailable(candidate)) return null;

  const vehicleCompatible =
    candidate.vehicle === "universal" || currentProduct.vehicle === "universal" || candidate.vehicle === currentProduct.vehicle;
  if (!vehicleCompatible) return null;

  const reasons: string[] = [];
  let score = 0;

  if ((COMPLEMENTARY_CATEGORIES[currentProduct.categorySlug] ?? []).includes(candidate.categorySlug)) {
    score += COMPLEMENT_SCORE;
    reasons.push("complements");
  }
  if (candidate.categorySlug === currentProduct.categorySlug) {
    score += PDP_SAME_CATEGORY_SCORE;
    reasons.push("same-category");
  }
  if (candidate.brandSlug === currentProduct.brandSlug) {
    score += PDP_SAME_BRAND_SCORE;
    reasons.push("same-brand");
  }

  return { product: candidate, score, reasons };
}

/**
 * Ranks by score, then diversifies: caps any single category at `MAX_PER_CATEGORY` so a strong
 * single-category signal (e.g. three complementary comfort items) can't crowd out every other
 * category, only relaxing that cap if there aren't enough candidates left to fill `limit`.
 */
function rankAndDiversify(candidates: ScoredCandidate[], limit: number): Product[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const picked: ScoredCandidate[] = [];
  const overflow: ScoredCandidate[] = [];
  const categoryCounts = new Map<string, number>();

  for (const candidate of sorted) {
    if (picked.length >= limit) break;
    const count = categoryCounts.get(candidate.product.categorySlug) ?? 0;
    if (count >= MAX_PER_CATEGORY) {
      overflow.push(candidate);
      continue;
    }
    picked.push(candidate);
    categoryCounts.set(candidate.product.categorySlug, count + 1);
  }
  for (const candidate of overflow) {
    if (picked.length >= limit) break;
    picked.push(candidate);
  }

  return picked.map((c) => c.product);
}

/**
 * Single entry point for both consumers (CartRecommendations via useRecommendations for
 * "cart-cross-sell", ProductDetail via useRecommendations for "pdp") — see architecture note in
 * Documentations MD/personalized-product-recommendations.md. Only a positive score qualifies a
 * candidate at all; a strategy with nothing genuinely relevant returns fewer than `limit` (or
 * none) rather than padding with weak matches.
 */
export function getRecommendations(request: RecommendationRequest): Product[] {
  const limit = clampLimit(request.limit);

  if (request.strategy === "cart-cross-sell") {
    const lines = request.cartLines ?? [];
    if (lines.length === 0) return [];
    const recentCategories = request.recentlyViewedCategories ?? getRecentlyViewedCategories();
    const scored = products
      .map((p) => scoreForCartCrossSell(p, lines, recentCategories))
      .filter((c): c is ScoredCandidate => c !== null && c.score > 0);
    return rankAndDiversify(scored, limit);
  }

  if (request.strategy === "pdp") {
    if (!request.currentProduct) return [];
    const scored = products
      .map((p) => scoreForPdp(p, request.currentProduct!))
      .filter((c): c is ScoredCandidate => c !== null && c.score > 0);
    return rankAndDiversify(scored, limit);
  }

  return [];
}
