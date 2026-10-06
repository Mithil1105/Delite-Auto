import { describe, expect, it } from "vitest";
import { computeLineTax, type TaxRecord } from "./taxCalculator.ts";

describe("taxCalculator", () => {
  it("no tax attached — subtotal/total equal unit price × qty, zero tax", () => {
    const result = computeLineTax(1500, 2, 0, []);
    expect(result).toMatchObject({ ok: true, subtotal: 3000, tax: 0, total: 3000 });
  });

  it("a 0% tax (real current production state for tax id 273) yields zero tax, not an error", () => {
    const taxes: TaxRecord[] = [{ id: 273, amount: 0, amount_type: "percent", price_include: false }];
    const result = computeLineTax(1500, 1, 0, taxes);
    expect(result).toMatchObject({ ok: true, subtotal: 1500, tax: 0, total: 1500 });
  });

  it("a supported nonzero percent tax (exclusive) computes correctly", () => {
    const taxes: TaxRecord[] = [{ id: 1, amount: 18, amount_type: "percent", price_include: false }];
    const result = computeLineTax(1000, 1, 0, taxes);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subtotal).toBe(1000);
      expect(result.tax).toBeCloseTo(180, 5);
      expect(result.total).toBeCloseTo(1180, 5);
    }
  });

  it("a supported nonzero percent tax (price-included) backs out the pre-tax subtotal", () => {
    const taxes: TaxRecord[] = [{ id: 1, amount: 18, amount_type: "percent", price_include: true }];
    const result = computeLineTax(1180, 1, 0, taxes);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subtotal).toBeCloseTo(1000, 5);
      expect(result.tax).toBeCloseTo(180, 5);
      expect(result.total).toBeCloseTo(1180, 5);
    }
  });

  it("applies a pricelist discount before computing tax", () => {
    const taxes: TaxRecord[] = [{ id: 1, amount: 10, amount_type: "percent", price_include: false }];
    const result = computeLineTax(1000, 1, 10, taxes); // 10% off -> base 900
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subtotal).toBeCloseTo(900, 5);
      expect(result.tax).toBeCloseTo(90, 5);
      expect(result.total).toBeCloseTo(990, 5);
    }
  });

  it("a fixed-amount tax is multiplied by quantity", () => {
    const taxes: TaxRecord[] = [{ id: 1, amount: 5, amount_type: "fixed", price_include: false }];
    const result = computeLineTax(100, 3, 0, taxes);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tax).toBe(15);
  });

  it("fails closed on unsupported amount_type (division/group/code) — never guessed", () => {
    for (const amount_type of ["division", "group", "code"] as const) {
      const taxes: TaxRecord[] = [{ id: 1, amount: 18, amount_type, price_include: false }];
      const result = computeLineTax(1000, 1, 0, taxes);
      expect(result.ok).toBe(false);
    }
  });

  it("multiple taxes on one line sum correctly", () => {
    const taxes: TaxRecord[] = [
      { id: 1, amount: 9, amount_type: "percent", price_include: false },
      { id: 2, amount: 9, amount_type: "percent", price_include: false },
    ];
    const result = computeLineTax(1000, 1, 0, taxes);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tax).toBeCloseTo(180, 5);
  });
});
