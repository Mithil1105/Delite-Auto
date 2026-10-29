import { describe, expect, it } from "vitest";
import { adjustPaiseByPercent, checkReadiness, planPublish, resolveActiveRule, validatePriceInput, windowsOverlap } from "./pricing.ts";
import { parseCsv, parsePriceCsv } from "./csv.ts";
import { buildDealerQuote, computeLineMoney } from "./quote.ts";
import { DealerError } from "./errors.ts";
import type { AccessRow, OdooVariantInfo, PriceRuleRow } from "./types.ts";

const NOW = new Date("2026-10-28T10:00:00.000Z");

function rule(over: Partial<PriceRuleRow>): PriceRuleRow {
  return { id: "r1", dealer_id: "d1", odoo_variant_id: 1, unit_price_paise: 380000, currency: "INR", tax_basis: "exclusive", starts_at: null, ends_at: null, status: "active", deal_note: null, version: 1, created_by: null, created_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...over };
}
function access(over: Partial<AccessRow>): AccessRow {
  return { id: "a1", dealer_id: "d1", odoo_template_id: 10, odoo_variant_id: 1, sku: "SKU1", product_name: "Mat", is_visible: true, is_orderable: true, minimum_quantity: 1, quantity_multiple: 1, featured_rank: null, updated_by: null, updated_at: NOW.toISOString(), ...over };
}
function info(over: Partial<OdooVariantInfo> = {}): OdooVariantInfo {
  return { variantId: 1, templateId: 10, name: "Mat", sku: "SKU1", publicPricePaise: 500000, purchasable: true, taxes: [{ id: 1, amount: 18, amount_type: "percent", price_include: false }], attributes: [], ...over };
}

describe("windowsOverlap", () => {
  it("treats windows as half-open: adjacent windows do not overlap", () => {
    expect(windowsOverlap({ starts_at: "2026-01-01T00:00:00Z", ends_at: "2026-02-01T00:00:00Z" }, { starts_at: "2026-02-01T00:00:00Z", ends_at: null })).toBe(false);
  });
  it("detects overlap and open-ended overlap", () => {
    expect(windowsOverlap({ starts_at: null, ends_at: null }, { starts_at: "2030-01-01T00:00:00Z", ends_at: null })).toBe(true);
    expect(windowsOverlap({ starts_at: "2026-01-01T00:00:00Z", ends_at: "2026-03-01T00:00:00Z" }, { starts_at: "2026-02-01T00:00:00Z", ends_at: "2026-04-01T00:00:00Z" })).toBe(true);
  });
});

describe("resolveActiveRule", () => {
  it("returns only an active rule in force — never a public fallback", () => {
    expect(resolveActiveRule([], 1, NOW)).toBeNull();
    expect(resolveActiveRule([rule({ status: "draft" })], 1, NOW)).toBeNull();
    expect(resolveActiveRule([rule({ starts_at: "2027-01-01T00:00:00Z" })], 1, NOW)).toBeNull();
    expect(resolveActiveRule([rule({ ends_at: "2026-10-01T00:00:00Z" })], 1, NOW)).toBeNull();
    expect(resolveActiveRule([rule({})], 1, NOW)?.unit_price_paise).toBe(380000);
    expect(resolveActiveRule([rule({})], 2, NOW)).toBeNull();
  });
});

describe("validatePriceInput", () => {
  it("rejects zero, negative, fractional-paise and inverted windows", () => {
    expect(() => validatePriceInput({ pricePaise: 0, taxBasis: "exclusive" })).toThrow(DealerError);
    expect(() => validatePriceInput({ pricePaise: -5, taxBasis: "exclusive" })).toThrow(DealerError);
    expect(() => validatePriceInput({ pricePaise: 10.5, taxBasis: "exclusive" })).toThrow(DealerError);
    expect(() => validatePriceInput({ pricePaise: 100, taxBasis: "exclusive", startsAt: "2026-05-01T00:00:00Z", endsAt: "2026-04-01T00:00:00Z" })).toThrow(DealerError);
    expect(() => validatePriceInput({ pricePaise: 100, taxBasis: "exclusive" })).not.toThrow();
  });
});

describe("planPublish", () => {
  it("an immediate draft expires the overlapping active rule", () => {
    const active = rule({ id: "old" });
    const draft = rule({ id: "new", status: "draft", unit_price_paise: 350000 });
    const plan = planPublish([draft], [active], NOW);
    expect(plan.expireIds).toEqual(["old"]);
    expect(plan.activate).toEqual([{ id: "new", startsAt: NOW.toISOString(), endsAt: null }]);
  });
  it("a draft whose start is already in the past counts as effective now (plain price edit in the grid)", () => {
    const active = rule({ id: "old", starts_at: "2026-10-01T00:00:00Z" });
    const draft = rule({ id: "new", status: "draft", unit_price_paise: 350000, starts_at: "2026-10-01T00:00:00Z" });
    const plan = planPublish([draft], [active], NOW);
    expect(plan.expireIds).toEqual(["old"]);
    expect(plan.activate[0].startsAt).toBe(NOW.toISOString());
  });
  it("a scheduled draft overlapping the current price is a conflict, not a guess", () => {
    const active = rule({ id: "old" });
    const draft = rule({ id: "new", status: "draft", starts_at: "2026-12-01T00:00:00Z", ends_at: "2026-12-31T00:00:00Z" });
    expect(() => planPublish([draft], [active], NOW)).toThrow(/overlaps/);
  });
  it("a scheduled draft after a finite current price is fine", () => {
    const active = rule({ id: "old", ends_at: "2026-12-01T00:00:00Z" });
    const draft = rule({ id: "new", status: "draft", starts_at: "2026-12-01T00:00:00Z" });
    expect(planPublish([draft], [active], NOW).expireIds).toEqual([]);
  });
  it("two overlapping drafts for one variant conflict", () => {
    expect(() => planPublish([rule({ id: "a", status: "draft" }), rule({ id: "b", status: "draft" })], [], NOW)).toThrow(/overlap/);
  });
  it("refuses a deal that has already ended", () => {
    expect(() => planPublish([rule({ status: "draft", starts_at: "2026-01-01T00:00:00Z", ends_at: "2026-02-01T00:00:00Z" })], [], NOW)).toThrow(/already ended/);
  });
});

describe("adjustPaiseByPercent / readiness", () => {
  it("adjusts by percent and rejects absurd values", () => {
    expect(adjustPaiseByPercent(10000, 10)).toBe(11000);
    expect(adjustPaiseByPercent(10000, -10)).toBe(9000);
    expect(() => adjustPaiseByPercent(10000, -100)).toThrow(DealerError);
  });
  it("flags missing prices and no products", () => {
    expect(checkReadiness({ ownerEmail: "a@b.co", access: [], rules: [], now: NOW }).map((i) => i.code)).toEqual(["no_products"]);
    const issues = checkReadiness({ ownerEmail: "a@b.co", access: [access({})], rules: [], now: NOW });
    expect(issues[0].code).toBe("missing_price");
    expect(checkReadiness({ ownerEmail: "a@b.co", access: [access({})], rules: [rule({})], now: NOW })).toEqual([]);
  });
});

describe("computeLineMoney", () => {
  it("exclusive: subtotal is exactly unit x qty, GST added on top", () => {
    const m = computeLineMoney(380000, 2, "exclusive", info().taxes);
    expect(m).toMatchObject({ ok: true, subtotalPaise: 760000, taxPaise: 136800, totalPaise: 896800, odooUnitPrice: 3800 });
  });
  it("inclusive: total is exactly the contract price, tax backed out", () => {
    const m = computeLineMoney(118000, 1, "inclusive", info().taxes);
    expect(m.totalPaise).toBe(118000);
    expect(m.subtotalPaise).toBe(100000);
    expect(m.taxPaise).toBe(18000);
  });
  it("tax-included Odoo taxes get a tax-inclusive price_unit", () => {
    const m = computeLineMoney(100000, 1, "exclusive", [{ id: 1, amount: 18, amount_type: "percent", price_include: true }]);
    expect(m.odooUnitPrice).toBe(1180);
  });
  it("no taxes -> zero tax; unsupported tax shapes fail closed", () => {
    expect(computeLineMoney(5000, 3, "exclusive", [])).toMatchObject({ ok: true, taxPaise: 0, totalPaise: 15000 });
    expect(computeLineMoney(5000, 1, "exclusive", [{ id: 2, amount: 5, amount_type: "code" }]).ok).toBe(false);
    expect(computeLineMoney(5000, 1, "exclusive", [{ id: 2, amount: 5, amount_type: "percent", price_include: true }, { id: 3, amount: 5, amount_type: "percent", price_include: false }]).ok).toBe(false);
  });
});

describe("buildDealerQuote", () => {
  const base = { access: [access({})], rules: [rule({})], variants: new Map([[1, info()]]), now: NOW };

  it("prices from the dealer rule, never from the public price", async () => {
    const q = await buildDealerQuote({ ...base, lines: [{ variantId: 1, quantity: 2 }] });
    expect(q.canOrder).toBe(true);
    expect(q.lines[0].unitPricePaise).toBe(380000);
    expect(q.totalPaise).toBe(896800);
  });
  it("flags unassigned, missing price, below-min, bad multiple, unavailable", async () => {
    const q = await buildDealerQuote({
      lines: [{ variantId: 9, quantity: 1 }, { variantId: 2, quantity: 1 }, { variantId: 3, quantity: 1 }, { variantId: 4, quantity: 7 }, { variantId: 5, quantity: 1 }],
      access: [access({ odoo_variant_id: 2 }), access({ odoo_variant_id: 3, minimum_quantity: 5 }), access({ odoo_variant_id: 4, quantity_multiple: 6 }), access({ odoo_variant_id: 5 })],
      rules: [rule({ odoo_variant_id: 3 }), rule({ odoo_variant_id: 4 }), rule({ odoo_variant_id: 5 })],
      variants: new Map([[2, info({ variantId: 2 })], [3, info({ variantId: 3 })], [4, info({ variantId: 4 })], [5, info({ variantId: 5, purchasable: false })]]),
      now: NOW,
    });
    const issues = Object.fromEntries(q.lines.map((l) => [l.variantId, l.issues]));
    expect(issues[9]).toContain("not_assigned");
    expect(issues[2]).toContain("no_price");
    expect(issues[3]).toContain("below_min");
    expect(issues[4]).toContain("bad_multiple");
    expect(issues[5]).toContain("unavailable");
    expect(q.canOrder).toBe(false);
  });
  it("detects a price change since the dealer last saw it, and fingerprint changes with price", async () => {
    const a = await buildDealerQuote({ ...base, lines: [{ variantId: 1, quantity: 1, quotedPricePaise: 400000 }] });
    expect(a.needsAcknowledgement).toBe(true);
    expect(a.lines[0].priceChanged).toBe(true);
    const b = await buildDealerQuote({ ...base, rules: [rule({ unit_price_paise: 370000 })], lines: [{ variantId: 1, quantity: 1 }] });
    const c = await buildDealerQuote({ ...base, lines: [{ variantId: 1, quantity: 1 }] });
    expect(b.fingerprint).not.toBe(c.fingerprint);
  });
});

describe("CSV", () => {
  it("parses quoted fields, escaped quotes and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"']]);
  });
  it("validates price rows with per-row errors", () => {
    const { rows, fatal } = parsePriceCsv("SKU,Price,Tax,MOQ\nMAT-1,\"₹3,800.50\",exclusive,2\nMAT-2,abc,,\n,100,,\nMAT-3,100,weird,0\n");
    expect(fatal).toBeNull();
    expect(rows[0]).toMatchObject({ sku: "MAT-1", priceRupees: 3800.5, taxBasis: "exclusive", minQty: 2, errors: [] });
    expect(rows[1].errors[0]).toMatch(/not a positive amount/);
    expect(rows[2].errors[0]).toMatch(/SKU is empty/);
    expect(rows[3].errors.length).toBe(2);
  });
  it("rejects a file missing required columns", () => {
    expect(parsePriceCsv("name,cost\nx,1").fatal).toMatch(/sku/);
    expect(parsePriceCsv("sku\nx").fatal).toMatch(/price/);
  });
});
