import { describe, expect, it } from "vitest";
import { computeLinePrice, selectPricelistRule, evaluateLinePrice, type PricelistItemRule, type LinePriceContext } from "./pricelistEvaluator.ts";

function rule(overrides: Partial<PricelistItemRule> = {}): PricelistItemRule {
  return {
    id: 1,
    pricelist_id: [1, "Default (INR)"],
    product_tmpl_id: false,
    product_id: false,
    categ_id: false,
    applied_on: "1_product",
    compute_price: "fixed",
    fixed_price: 0,
    percent_price: 0,
    price_discount: 0,
    price_round: 0,
    price_surcharge: 0,
    price_min_margin: 0,
    price_max_margin: 0,
    min_quantity: 0,
    date_start: false,
    date_end: false,
    base: "list_price",
    base_pricelist_id: false,
    ...overrides,
  };
}

function ctx(overrides: Partial<LinePriceContext> = {}): LinePriceContext {
  return {
    variantId: 10,
    templateId: 10,
    categoryIds: [17],
    quantity: 1,
    listPrice: 1500,
    now: new Date("2026-10-06T00:00:00Z"),
    ...overrides,
  };
}

describe("pricelistEvaluator", () => {
  it("falls back to list_price when no rule matches (the normal/default case, not a failure)", () => {
    const result = computeLinePrice([], ctx());
    expect(result).toEqual({ ok: true, unitPrice: 1500, discountPercent: 0, ruleId: null, ruleApplied: "none" });
  });

  it("applies a fixed-price rule — real production shape (ACTIVA SET OF 3)", () => {
    const rules = [rule({ id: 4, product_tmpl_id: [10, "ACTIVA SET OF 3"], compute_price: "fixed", fixed_price: 1500 })];
    const result = computeLinePrice(rules, ctx({ templateId: 10, listPrice: 1500 }));
    expect(result).toEqual({ ok: true, unitPrice: 1500, discountPercent: 0, ruleId: 4, ruleApplied: "fixed" });
  });

  it("applies a formula/discount rule — real production shape (BALENO, 10% off)", () => {
    const rules = [rule({ id: 1, product_tmpl_id: [87, "BALENO"], compute_price: "formula", price_discount: 10, base: "list_price" })];
    const result = computeLinePrice(rules, ctx({ templateId: 87, listPrice: 2000 }));
    expect(result).toEqual({ ok: true, unitPrice: 2000, discountPercent: 10, ruleId: 1, ruleApplied: "formula" });
  });

  it("a fixed-price rule of 0 is honored, not treated as 'no price'", () => {
    const rules = [rule({ id: 2, product_tmpl_id: [61, "WURTH"], compute_price: "fixed", fixed_price: 0 })];
    const result = computeLinePrice(rules, ctx({ templateId: 61, listPrice: 450 }));
    expect(result).toEqual({ ok: true, unitPrice: 0, discountPercent: 0, ruleId: 2, ruleApplied: "fixed" });
  });

  it("respects min_quantity — rule doesn't apply below threshold", () => {
    const rules = [rule({ id: 5, product_tmpl_id: [10, "x"], compute_price: "fixed", fixed_price: 1200, min_quantity: 5 })];
    expect(computeLinePrice(rules, ctx({ templateId: 10, quantity: 4 }))).toMatchObject({ ruleApplied: "none", unitPrice: 1500 });
    expect(computeLinePrice(rules, ctx({ templateId: 10, quantity: 5 }))).toMatchObject({ ruleApplied: "fixed", unitPrice: 1200 });
    expect(computeLinePrice(rules, ctx({ templateId: 10, quantity: 6 }))).toMatchObject({ ruleApplied: "fixed", unitPrice: 1200 });
  });

  it("picks the rule with the highest qualifying min_quantity (tiered pricing precedence)", () => {
    const rules = [
      rule({ id: 1, product_tmpl_id: [10, "x"], compute_price: "fixed", fixed_price: 1400, min_quantity: 1 }),
      rule({ id: 2, product_tmpl_id: [10, "x"], compute_price: "fixed", fixed_price: 1200, min_quantity: 5 }),
      rule({ id: 3, product_tmpl_id: [10, "x"], compute_price: "fixed", fixed_price: 1000, min_quantity: 10 }),
    ];
    expect(computeLinePrice(rules, ctx({ templateId: 10, quantity: 1 }))).toMatchObject({ ruleId: 1, unitPrice: 1400 });
    expect(computeLinePrice(rules, ctx({ templateId: 10, quantity: 7 }))).toMatchObject({ ruleId: 2, unitPrice: 1200 });
    expect(computeLinePrice(rules, ctx({ templateId: 10, quantity: 12 }))).toMatchObject({ ruleId: 3, unitPrice: 1000 });
  });

  it("respects date_start — a future-dated rule does not yet apply", () => {
    const rules = [rule({ id: 1, product_tmpl_id: [10, "x"], compute_price: "fixed", fixed_price: 999, date_start: "2099-01-01 00:00:00" })];
    expect(computeLinePrice(rules, ctx({ templateId: 10 }))).toMatchObject({ ruleApplied: "none", unitPrice: 1500 });
  });

  it("respects date_end — an expired rule no longer applies", () => {
    const rules = [rule({ id: 1, product_tmpl_id: [10, "x"], compute_price: "fixed", fixed_price: 999, date_end: "2020-01-01 00:00:00" })];
    expect(computeLinePrice(rules, ctx({ templateId: 10 }))).toMatchObject({ ruleApplied: "none", unitPrice: 1500 });
  });

  it("an active date window (start in past, end in future) applies normally", () => {
    const rules = [
      rule({ id: 1, product_tmpl_id: [10, "x"], compute_price: "fixed", fixed_price: 999, date_start: "2020-01-01 00:00:00", date_end: "2099-01-01 00:00:00" }),
    ];
    expect(computeLinePrice(rules, ctx({ templateId: 10 }))).toMatchObject({ ruleApplied: "fixed", unitPrice: 999 });
  });

  it("variant-scoped rule beats product-scoped rule for the same product (specificity precedence)", () => {
    const rules = [
      rule({ id: 1, applied_on: "1_product", product_tmpl_id: [10, "x"], compute_price: "fixed", fixed_price: 1400 }),
      rule({ id: 2, applied_on: "0_product_variant", product_id: [10, "x"], compute_price: "fixed", fixed_price: 1200 }),
    ];
    expect(computeLinePrice(rules, ctx({ templateId: 10, variantId: 10 }))).toMatchObject({ ruleId: 2, unitPrice: 1200 });
  });

  it("category-scoped rule applies when no product-specific rule exists", () => {
    const rules = [rule({ id: 1, applied_on: "2_product_category", categ_id: [17, "Trending Bike Accessories"], compute_price: "fixed", fixed_price: 800 })];
    expect(computeLinePrice(rules, ctx({ categoryIds: [17] }))).toMatchObject({ ruleId: 1, unitPrice: 800 });
    expect(computeLinePrice(rules, ctx({ categoryIds: [99] }))).toMatchObject({ ruleApplied: "none" });
  });

  it("global rule applies only when nothing more specific matches", () => {
    const rules = [
      rule({ id: 1, applied_on: "3_global", compute_price: "fixed", fixed_price: 100 }),
      rule({ id: 2, applied_on: "1_product", product_tmpl_id: [10, "x"], compute_price: "fixed", fixed_price: 500 }),
    ];
    expect(computeLinePrice(rules, ctx({ templateId: 10 }))).toMatchObject({ ruleId: 2, unitPrice: 500 });
    expect(computeLinePrice(rules, ctx({ templateId: 999 }))).toMatchObject({ ruleId: 1, unitPrice: 100 });
  });

  it("fails closed on compute_price = 'percentage' — not proven active in production, never guessed", () => {
    const rules = [rule({ id: 1, product_tmpl_id: [10, "x"], compute_price: "percentage", percent_price: 15 })];
    const result = evaluateLinePrice(selectPricelistRule(rules, ctx({ templateId: 10 })), ctx({ templateId: 10 }));
    expect(result.ok).toBe(false);
  });

  it("fails closed on base != 'list_price'", () => {
    const rules = [rule({ id: 1, product_tmpl_id: [10, "x"], compute_price: "fixed", fixed_price: 100, base: "standard_price" })];
    const result = evaluateLinePrice(selectPricelistRule(rules, ctx({ templateId: 10 })), ctx({ templateId: 10 }));
    expect(result.ok).toBe(false);
  });

  it("fails closed on any nonzero rounding/surcharge/margin field", () => {
    for (const override of [{ price_round: 5 }, { price_surcharge: 10 }, { price_min_margin: 1 }, { price_max_margin: 1 }]) {
      const rules = [rule({ id: 1, product_tmpl_id: [10, "x"], compute_price: "fixed", fixed_price: 100, ...override })];
      const result = evaluateLinePrice(selectPricelistRule(rules, ctx({ templateId: 10 })), ctx({ templateId: 10 }));
      expect(result.ok).toBe(false);
    }
  });

  it("never falls back to list_price for an unsupported rule shape — fails closed instead", () => {
    const rules = [rule({ id: 1, product_tmpl_id: [10, "x"], compute_price: "percentage" })];
    const result = computeLinePrice(rules, ctx({ templateId: 10, listPrice: 1500 }));
    expect(result.ok).toBe(false);
  });
});
