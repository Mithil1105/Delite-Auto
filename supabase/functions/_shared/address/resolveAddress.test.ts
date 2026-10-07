import { describe, expect, it, vi, beforeEach } from "vitest";

const odooSearchReadMock = vi.fn();
vi.mock("../odoo/client.ts", () => ({
  odooSearchRead: (...args: unknown[]) => odooSearchReadMock(...args),
}));

const { resolveStructuredAddress, formatShippingAddress } = await import("./resolveAddress.ts");

const config = { baseUrl: "https://example.odoo.com", database: "db", username: "u", apiKey: "k" };

const INDIA = { id: 104, name: "India" };
const GUJARAT = { id: 588, name: "Gujarat" };
const MAHARASHTRA = { id: 597, name: "Maharashtra" };

function mockSequence(...results: unknown[][]) {
  for (const r of results) odooSearchReadMock.mockResolvedValueOnce(r);
}

describe("resolveStructuredAddress", () => {
  beforeEach(() => odooSearchReadMock.mockReset());

  it("resolves India + Gujarat to their real, confirmed ids (live-audit values)", async () => {
    mockSequence([INDIA], [GUJARAT]);
    const result = await resolveStructuredAddress(config, {
      line1: "4/h Navrangpura Post Office",
      line2: "",
      city: "Ahmedabad",
      state: "Gujarat",
      pincode: "380009",
    });
    expect(result.country_id).toBe(104);
    expect(result.state_id).toBe(588);
    expect(result.street).toBe("4/h Navrangpura Post Office");
    expect(result.city).toBe("Ahmedabad");
    expect(result.zip).toBe("380009");
    expect(result.warnings).toHaveLength(0);
  });

  it("resolves India + Maharashtra to their real, confirmed ids (live-audit values)", async () => {
    mockSequence([INDIA], [MAHARASHTRA]);
    const result = await resolveStructuredAddress(config, { line1: "1 MG Road", city: "Mumbai", state: "Maharashtra", pincode: "400001" });
    expect(result.country_id).toBe(104);
    expect(result.state_id).toBe(597);
  });

  it("is case-insensitive for the state name", async () => {
    mockSequence([INDIA], [GUJARAT]);
    const result = await resolveStructuredAddress(config, { line1: "x", city: "y", state: "gujarat", pincode: "1" });
    expect(result.state_id).toBe(588);
  });

  it("leaves state_id unset (never guesses) when the state has no unique match", async () => {
    mockSequence([INDIA], [], []); // country found; exact search empty; loose search also empty
    const result = await resolveStructuredAddress(config, { line1: "x", city: "y", state: "Narnia", pincode: "1" });
    expect(result.country_id).toBe(104);
    expect(result.state_id).toBeUndefined();
    expect(result.warnings.some((w) => w.includes("could not be uniquely resolved"))).toBe(true);
  });

  it("leaves state_id unset (never guesses) when the state name is ambiguous (2+ matches)", async () => {
    mockSequence([INDIA], [GUJARAT, { id: 999, name: "Gujarat Duplicate" }]);
    const result = await resolveStructuredAddress(config, { line1: "x", city: "y", state: "Gujarat", pincode: "1" });
    expect(result.state_id).toBeUndefined();
  });

  it("leaves country_id AND state_id unset when the country itself can't be uniquely resolved", async () => {
    mockSequence([]); // country search empty
    const result = await resolveStructuredAddress(config, { line1: "x", city: "y", state: "Gujarat", pincode: "1", country: "Nowhereland" });
    expect(result.country_id).toBeUndefined();
    expect(result.state_id).toBeUndefined();
    expect(result.warnings.some((w) => w.includes("country"))).toBe(true);
    // Only one odooSearchRead call — never attempted a state lookup without a resolved country.
    expect(odooSearchReadMock).toHaveBeenCalledTimes(1);
  });

  it("defaults to India when no country is submitted", async () => {
    mockSequence([INDIA], [GUJARAT]);
    await resolveStructuredAddress(config, { line1: "x", city: "y", state: "Gujarat", pincode: "1" });
    const firstCallDomain = odooSearchReadMock.mock.calls[0][2];
    expect(firstCallDomain).toEqual([["code", "=", "IN"]]);
  });

  it("never produces the old 'city, state, pincode in street2' concatenation — street2 is only line2", async () => {
    mockSequence([INDIA], [GUJARAT]);
    const result = await resolveStructuredAddress(config, {
      line1: "4/h Navrangpura",
      line2: "Near Jain Temple",
      city: "Ahmedabad",
      state: "Gujarat",
      pincode: "380009",
    });
    expect(result.street2).toBe("Near Jain Temple");
    expect(result.street2).not.toContain("Ahmedabad");
    expect(result.street2).not.toContain("Gujarat");
    expect(result.street2).not.toContain("380009");
  });

  it("structured output has city/zip as their own fields, not folded into street2", async () => {
    mockSequence([INDIA], [GUJARAT]);
    const result = await resolveStructuredAddress(config, { line1: "x", city: "Ahmedabad", state: "Gujarat", pincode: "380009" });
    expect(result.city).toBe("Ahmedabad");
    expect(result.zip).toBe("380009");
  });

  it("never throws on an Odoo error — degrades to unset relations + a warning", async () => {
    odooSearchReadMock.mockRejectedValueOnce(new Error("Odoo unreachable"));
    const result = await resolveStructuredAddress(config, { line1: "x", city: "y", state: "Gujarat", pincode: "1" });
    expect(result.country_id).toBeUndefined();
    expect(result.state_id).toBeUndefined();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("formatShippingAddress", () => {
  it("formats a single display string for the Supabase orders.shipping_address text column", () => {
    const text = formatShippingAddress({ line1: "4/h Navrangpura", line2: "Near Jain Temple", city: "Ahmedabad", state: "Gujarat", pincode: "380009", country: "India" });
    expect(text).toBe("4/h Navrangpura, Near Jain Temple, Ahmedabad, Gujarat, 380009, India");
  });
});
