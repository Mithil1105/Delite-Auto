import { describe, expect, it } from "vitest";
import { getRecommendations, scoreForCartCrossSell } from "./engine";
import { productRequiresSelection } from "./variants";
import { productBySlug } from "../../data/products";
import { en } from "../../i18n/en";
import type { CartLineInput } from "./types";
import type { Product } from "../../data/types";

/**
 * Unit tests for the pure recommendation engine — see
 * Documentations MD/personalized-product-recommendations.md, "Required tests" (spec section 17,
 * items A–D, F, H, I). Uses real catalog products (not fixtures) so these also double as
 * documentation of how the actual weight table behaves on real data. Items E and G (Quick Add UI
 * behavior, empty-cart UI behavior) are covered by
 * tests/interaction/cart-recommendations.spec.ts instead — they're DOM/interaction behavior, not
 * pure logic.
 */

const seatCover = productBySlug("dolphin-orbit-seat-cover-creta")!; // p01, seat-covers, car
const anotherSeatCover = productBySlug("dolphin-orbit-seat-cover-xuv700")!; // p02, seat-covers, car
const floorMats = productBySlug("4n-mats-12mm-grass-black-set-5")!; // p05, floor-mats, car
const neckRest = productBySlug("carigiri-neck-rest")!; // p39, comfort, car
const gpsTracker = productBySlug("wheels-eye-w1-tracker")!; // p20, gps-security, universal
const jumpStarter = productBySlug("qubo-jumpstarter-inflator-2in1")!; // p18, audio-dashcams, universal
const helmet = productBySlug("studds-half-face-helmet-black")!; // p49, helmets, bike

function line(product: Product, qty = 1): CartLineInput {
  return { product, qty };
}

describe("getRecommendations — cart-cross-sell", () => {
  it("A: excludes a product already in the cart", () => {
    const results = getRecommendations({ strategy: "cart-cross-sell", cartLines: [line(seatCover)] });
    expect(results.find((p) => p.id === seatCover.id)).toBeUndefined();
  });

  it("B: excludes bike-only products when the cart contains only car products", () => {
    const results = getRecommendations({ strategy: "cart-cross-sell", cartLines: [line(seatCover)] });
    expect(results.find((p) => p.id === helmet.id)).toBeUndefined();
    for (const product of results) {
      expect(product.vehicle).not.toBe("bike");
    }
  });

  it("G: returns nothing once the cart is empty", () => {
    expect(getRecommendations({ strategy: "cart-cross-sell", cartLines: [] })).toEqual([]);
  });
});

/**
 * C, D, H validate the actual weight table from scoring directly (not the final top-4 UI list —
 * with 58 catalog products across a handful of complementary categories, many candidates
 * legitimately tie on score, so which exact 4 win the diversification cutoff is emergent
 * catalog-density noise, not something a scoring-behavior test should assert on). See
 * scoreForCartCrossSell in engine.ts and the weight table in
 * Documentations MD/personalized-product-recommendations.md.
 */
describe("scoreForCartCrossSell — weight table", () => {
  it("C: a complementary-category candidate scores above a same-category (as cart) candidate", () => {
    const emptyAffinity = new Set<string>();
    const complementScore = scoreForCartCrossSell(neckRest, [line(seatCover)], emptyAffinity);
    const sameCategoryScore = scoreForCartCrossSell(anotherSeatCover, [line(seatCover)], emptyAffinity);
    expect(complementScore).not.toBeNull();
    expect(sameCategoryScore).not.toBeNull();
    expect(complementScore!.score).toBeGreaterThan(sameCategoryScore!.score);
  });

  it("D: a candidate complementing two cart categories scores above one complementing only one", () => {
    const emptyAffinity = new Set<string>();
    const cart = [line(seatCover), line(floorMats)];
    // "comfort" complements both seat-covers and floor-mats; "gps-security" complements only seat-covers.
    const dualComplement = scoreForCartCrossSell(neckRest, cart, emptyAffinity);
    const singleComplement = scoreForCartCrossSell(gpsTracker, cart, emptyAffinity);
    expect(dualComplement).not.toBeNull();
    expect(singleComplement).not.toBeNull();
    expect(dualComplement!.score).toBeGreaterThan(singleComplement!.score);
  });

  it("H: recent browsing affinity raises the score of an otherwise-equal candidate", () => {
    const cart = [line(seatCover)];
    const withoutAffinity = scoreForCartCrossSell(gpsTracker, cart, new Set());
    const withAffinity = scoreForCartCrossSell(gpsTracker, cart, new Set(["gps-security"]));
    expect(withoutAffinity).not.toBeNull();
    expect(withAffinity).not.toBeNull();
    expect(withAffinity!.score).toBeGreaterThan(withoutAffinity!.score);
    // ...enough to overtake a same-scoring-without-affinity competitor from another category.
    const competitor = scoreForCartCrossSell(jumpStarter, cart, new Set());
    expect(withoutAffinity!.score).toBe(competitor!.score);
    expect(withAffinity!.score).toBeGreaterThan(competitor!.score);
  });
});

describe("getRecommendations — pdp", () => {
  it("excludes the current product itself", () => {
    const results = getRecommendations({ strategy: "pdp", currentProduct: seatCover });
    expect(results.find((p) => p.id === seatCover.id)).toBeUndefined();
  });

  it("returns nothing without a current product", () => {
    expect(getRecommendations({ strategy: "pdp" })).toEqual([]);
  });
});

describe("productRequiresSelection", () => {
  it("F: a product flagged as requiring selection cannot be silently Quick Added", () => {
    const configuredProduct: Product = { ...seatCover, id: "test-configured", requiresSelection: true };
    expect(productRequiresSelection(configuredProduct)).toBe(true);
  });

  it("is false for existing catalog products (no real variant data yet)", () => {
    expect(productRequiresSelection(seatCover)).toBe(false);
  });
});

describe("copy honesty", () => {
  it('I: does not claim "Frequently Bought Together" without genuine co-purchase data', () => {
    expect(en.cart.youMightAlsoNeed.toLowerCase()).not.toContain("frequently bought");
  });
});
