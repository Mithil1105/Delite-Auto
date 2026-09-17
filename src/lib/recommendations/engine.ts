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
  return product.purchasable !== false;
}

/**
 * "universal" (an authored claim: genuinely fits everything) and "unknown" (real Odoo data with
 * no verified `public_categ_ids` vehicle tag — see Documentations MD/odoo-real-catalog.md) are
 * DIFFERENT facts, but the same GATING decision applies to both here: neither should be excluded
 * from a vehicle-specific recommendation just because it isn't confidently car- or bike-specific.
 * This is a scoring/inclusion choice, not a label — nothing renders "unknown" as "Universal fit"
 * anywhere in the UI (see ProductDetail.tsx).
 */
function isVehicleWildcard(vehicle: Product["vehicle"]): boolean {
  return vehicle === "universal" || vehicle === "unknown";
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
    isVehicleWildcard(candidate.vehicle) ||
    (candidate.vehicle === "car" && cartHasCar) ||
    (candidate.vehicle === "bike" && cartHasBike) ||
    (!cartHasCar && !cartHasBike);
  if (!vehicleCompatible) return null;

  // "" (every real Odoo-backed product's categorySlug — see Documentations MD/odoo-real-catalog.md)
  // is filtered out of this set entirely: leaving it in would make every real candidate collide
  // with every real cart line on an empty-string "category", incorrectly triggering the
  // same-category penalty below on essentially all real recommendations.
  const cartCategories = new Set(lines.map((l) => l.product.categorySlug).filter(Boolean));
  const reasons: string[] = [];
  let score = 0;
  let complementCount = 0;

  if (candidate.categorySlug) {
    for (const cartCategory of cartCategories) {
      if ((COMPLEMENTARY_CATEGORIES[cartCategory] ?? []).includes(candidate.categorySlug)) {
        score += COMPLEMENT_SCORE;
        complementCount += 1;
        reasons.push(`complements:${cartCategory}`);
      }
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

  if (candidate.categorySlug && recentCategories.has(candidate.categorySlug)) {
    score += RECENT_AFFINITY_SCORE;
    reasons.push("recent-affinity");
  }

  // Co-purchase / co-cart signals are intentionally absent: no real order/session data exists
  // yet, and fabricating one would misrepresent confidence we don't have (see "Known issues" in
  // Documentations MD/personalized-product-recommendations.md). Once Odoo order history lands,
  // those signals plug in here as additional positive terms — nothing else in this function
  // needs to change.

  if (candidate.categorySlug && cartCategories.has(candidate.categorySlug)) {
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
    isVehicleWildcard(candidate.vehicle) || isVehicleWildcard(currentProduct.vehicle) || candidate.vehicle === currentProduct.vehicle;
  if (!vehicleCompatible) return null;

  const reasons: string[] = [];
  let score = 0;

  // `categorySlug`/`brandSlug` are "" for every real Odoo-backed product (see
  // Documentations MD/odoo-real-catalog.md — Odoo's category model has no single slug to give
  // them) — comparing two empty strings would score a false "same category"/"same brand" match
  // between two completely unrelated real products, so both checks require a genuinely non-empty
  // value on both sides before counting. Real data instead compares `categories`/`brand` (id-based).
  if (currentProduct.categorySlug && candidate.categorySlug && (COMPLEMENTARY_CATEGORIES[currentProduct.categorySlug] ?? []).includes(candidate.categorySlug)) {
    score += COMPLEMENT_SCORE;
    reasons.push("complements");
  }
  if (currentProduct.categorySlug && candidate.categorySlug && candidate.categorySlug === currentProduct.categorySlug) {
    score += PDP_SAME_CATEGORY_SCORE;
    reasons.push("same-category");
  } else if (currentProduct.categories?.some((c) => candidate.categories?.some((cc) => cc.id === c.id))) {
    score += PDP_SAME_CATEGORY_SCORE;
    reasons.push("same-category");
  }
  if (currentProduct.brandSlug && candidate.brandSlug && candidate.brandSlug === currentProduct.brandSlug) {
    score += PDP_SAME_BRAND_SCORE;
    reasons.push("same-brand");
  } else if (currentProduct.brand && candidate.brand && candidate.brand.id === currentProduct.brand.id) {
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
/**
 * `categorySlug` is "" for every real Odoo-backed product (see
 * Documentations MD/odoo-real-catalog.md) — grouping the diversity cap on "" would collide every
 * real candidate into one bucket and wrongly cap the whole result at MAX_PER_CATEGORY regardless
 * of how many genuinely different products qualified. Falls back to the first real category id,
 * then to the product's own id (never grouped with an unrelated product) so the cap only ever
 * applies to a real, shared category.
 */
function diversityKey(product: Product): string {
  if (product.categorySlug) return product.categorySlug;
  if (product.categories && product.categories.length > 0) return `cat:${product.categories[0].id}`;
  return `product:${product.id}`;
}

function rankAndDiversify(candidates: ScoredCandidate[], limit: number): Product[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const picked: ScoredCandidate[] = [];
  const overflow: ScoredCandidate[] = [];
  const categoryCounts = new Map<string, number>();

  for (const candidate of sorted) {
    if (picked.length >= limit) break;
    const key = diversityKey(candidate.product);
    const count = categoryCounts.get(key) ?? 0;
    if (count >= MAX_PER_CATEGORY) {
      overflow.push(candidate);
      continue;
    }
    picked.push(candidate);
    categoryCounts.set(key, count + 1);
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
  const candidatePool = request.candidates ?? products;

  if (request.strategy === "cart-cross-sell") {
    const lines = request.cartLines ?? [];
    if (lines.length === 0) return [];
    const recentCategories = request.recentlyViewedCategories ?? getRecentlyViewedCategories();
    const scored = candidatePool
      .map((p) => scoreForCartCrossSell(p, lines, recentCategories))
      .filter((c): c is ScoredCandidate => c !== null && c.score > 0);
    return rankAndDiversify(scored, limit);
  }

  if (request.strategy === "pdp") {
    if (!request.currentProduct) return [];
    const scored = candidatePool
      .map((p) => scoreForPdp(p, request.currentProduct!))
      .filter((c): c is ScoredCandidate => c !== null && c.score > 0);
    return rankAndDiversify(scored, limit);
  }

  return [];
}
