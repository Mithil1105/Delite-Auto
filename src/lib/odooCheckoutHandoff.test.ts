import { describe, expect, it, vi, beforeEach } from "vitest";

const getProductBySlugMock = vi.fn();
vi.mock("../services/catalog/catalogService", () => ({
  catalogService: { getProductBySlug: (...args: unknown[]) => getProductBySlugMock(...args) },
}));

const { buildHandoffPayload, buildHandoffUrl, HandoffValidationError } = await import("./odooCheckoutHandoff");

function line(overrides: { odooId?: number; slug?: string; name?: string; qty?: number; variantId?: string } = {}) {
  return {
    product: { odooId: overrides.odooId ?? 100, slug: overrides.slug ?? "widget", name: overrides.name ?? "Widget" },
    qty: overrides.qty ?? 1,
    variantId: overrides.variantId,
  };
}

describe("buildHandoffPayload", () => {
  beforeEach(() => getProductBySlugMock.mockReset());

  it("throws on an empty cart", async () => {
    await expect(buildHandoffPayload([])).rejects.toThrow(HandoffValidationError);
  });

  it("uses the line's own variantId directly when already set — no catalog lookup needed", async () => {
    const payload = await buildHandoffPayload([line({ odooId: 100, variantId: "200", qty: 2 })]);
    expect(payload).toEqual({ v: 1, lines: [{ productTemplateId: 100, productId: 200, quantity: 2 }] });
    expect(getProductBySlugMock).not.toHaveBeenCalled();
  });

  it("resolves the real variant id from the catalog when the cart line has none (single-variant product)", async () => {
    getProductBySlugMock.mockResolvedValue({ variants: [{ odooVariantId: 524 }] });
    const payload = await buildHandoffPayload([line({ odooId: 498, slug: "baleno-floor-mats", qty: 1 })]);
    expect(payload.lines).toEqual([{ productTemplateId: 498, productId: 524, quantity: 1 }]);
  });

  it("never includes price/discount/tax/shipping/total fields — Odoo is sole authority", async () => {
    const payload = await buildHandoffPayload([line({ odooId: 100, variantId: "200" })]);
    const serialized = JSON.stringify(payload);
    for (const forbidden of ["price", "discount", "tax", "shipping", "total", "subtotal"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("fails visibly (never guesses) when a product has no resolvable Odoo variant id", async () => {
    getProductBySlugMock.mockResolvedValue({ variants: [] });
    await expect(buildHandoffPayload([line({ odooId: 100, name: "Mystery Product" })])).rejects.toThrow(/Mystery Product/);
  });

  it("fails visibly (never guesses) when a product has multiple variants and none was selected", async () => {
    getProductBySlugMock.mockResolvedValue({ variants: [{ odooVariantId: 1 }, { odooVariantId: 2 }] });
    await expect(buildHandoffPayload([line({ odooId: 100, name: "Multi Variant Product" })])).rejects.toThrow(/Multi Variant Product/);
  });

  it("fails visibly on a missing/invalid product template id — never silently dropped", async () => {
    const lineWithNoTemplateId = { product: { odooId: undefined, slug: "widget", name: "Widget" }, qty: 1, variantId: "200" };
    await expect(buildHandoffPayload([lineWithNoTemplateId])).rejects.toThrow(HandoffValidationError);
  });

  it("fails visibly on an invalid (zero/negative/non-integer) quantity", async () => {
    await expect(buildHandoffPayload([line({ odooId: 100, variantId: "200", qty: 0 })])).rejects.toThrow(HandoffValidationError);
  });

  it("merges duplicate productId entries by summing quantity instead of sending two lines", async () => {
    const payload = await buildHandoffPayload([
      line({ odooId: 100, variantId: "200", qty: 2 }),
      line({ odooId: 100, variantId: "200", qty: 3 }),
    ]);
    expect(payload.lines).toEqual([{ productTemplateId: 100, productId: 200, quantity: 5 }]);
  });

  it("caps a single line's quantity at the maximum (50)", async () => {
    const payload = await buildHandoffPayload([line({ odooId: 100, variantId: "200", qty: 999 })]);
    expect(payload.lines[0].quantity).toBe(50);
  });

  it("rejects a cart with more than the maximum number of distinct lines (20)", async () => {
    const lines = Array.from({ length: 21 }, (_, i) => line({ odooId: 100 + i, variantId: String(200 + i) }));
    await expect(buildHandoffPayload(lines)).rejects.toThrow(HandoffValidationError);
  });

  it("accepts exactly the maximum number of distinct lines", async () => {
    const lines = Array.from({ length: 20 }, (_, i) => line({ odooId: 100 + i, variantId: String(200 + i) }));
    const payload = await buildHandoffPayload(lines);
    expect(payload.lines).toHaveLength(20);
  });
});

describe("buildHandoffUrl", () => {
  it("encodes the payload into a URL fragment that round-trips back to the same data", () => {
    const payload = { v: 1 as const, lines: [{ productTemplateId: 100, productId: 200, quantity: 3 }] };
    const url = buildHandoffUrl(payload);
    expect(url).toMatch(/^https:\/\/www\.deliteauto\.com\/checkout-handoff-test#/);
    const fragment = url.split("#")[1];
    const decoded = JSON.parse(decodeURIComponent(fragment));
    expect(decoded).toEqual(payload);
  });

  it("builds the URL from VITE_ODOO_CHECKOUT_BASE_URL, not a hardcoded domain", () => {
    const payload = { v: 1 as const, lines: [{ productTemplateId: 1, productId: 2, quantity: 1 }] };
    const url = buildHandoffUrl(payload);
    expect(url.startsWith(import.meta.env.VITE_ODOO_CHECKOUT_BASE_URL as string)).toBe(true);
  });
});
