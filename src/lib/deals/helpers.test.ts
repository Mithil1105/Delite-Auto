import { describe, expect, it } from "vitest";
import { asIdList, asNumber, budgetBandHref, countdownParts, isCampaignActive, isDealsPageEnabled, parseBudgetBands, parseCombos, resolveDealsSections, whatsappUrl } from "./helpers";
import type { PublishedSection } from "../../services/cms/publishedCmsService";

const row = (sectionKey: string, over: Partial<PublishedSection> = {}): PublishedSection => ({ sectionKey, sectionType: "x", content: {}, visible: true, displayOrder: 1, ...over });

describe("resolveDealsSections", () => {
  it("falls back to the in-code defaults when nothing is published (page not seeded yet)", () => {
    const sections = resolveDealsSections([]);
    const byKey = Object.fromEntries(sections.map((s) => [s.key, s]));
    expect(byKey.hero.visible).toBe(true);
    expect(byKey.hero.content.title).toBe("Deals & Offers");
    expect(byKey.campaign.visible).toBe(false);
    expect(byKey.combos.visible).toBe(false);
    expect(sections.map((s) => s.order)).toEqual([...sections.map((s) => s.order)].sort((a, b) => a - b));
  });

  it("lets the published row override visibility, order and content, ignoring blank values", () => {
    const sections = resolveDealsSections([
      row("campaign", { visible: true, displayOrder: 1, content: { title: "Diwali Sale", subtitle: "  " } }),
      row("hero", { visible: false, displayOrder: 999, content: { title: "" } }),
    ]);
    expect(sections[0].key).toBe("campaign");
    expect(sections[0].visible).toBe(true);
    expect(sections[0].content.title).toBe("Diwali Sale");
    const hero = sections.find((s) => s.key === "hero")!;
    expect(hero.visible).toBe(false);
    expect(hero.content.title).toBe("Deals & Offers"); // blank → default
  });
});

describe("isDealsPageEnabled", () => {
  it("is on by default and off only when the admin switches it off", () => {
    expect(isDealsPageEnabled(resolveDealsSections([]))).toBe(true);
    expect(isDealsPageEnabled(resolveDealsSections([row("settings", { content: { pageEnabled: false } })]))).toBe(false);
    expect(isDealsPageEnabled(resolveDealsSections([row("settings", { content: { pageEnabled: true } })]))).toBe(true);
  });
});

describe("parseBudgetBands / budgetBandHref", () => {
  it("parses label|min|max lines and skips malformed ones", () => {
    const bands = parseBudgetBands("Under ₹500|0|500\n\nbad line only\nNegative|-5|10\nBackwards|500|100\n₹5,000 & above|5000|");
    expect(bands).toEqual([
      { label: "Under ₹500", min: 0, max: 500 },
      { label: "bad line only", min: 0, max: undefined },
      { label: "₹5,000 & above", min: 5000, max: undefined },
    ]);
  });
  it("builds shop URLs", () => {
    expect(budgetBandHref({ label: "a", min: 0, max: 500 })).toBe("/shop?max=500");
    expect(budgetBandHref({ label: "a", min: 5000 })).toBe("/shop?min=5000");
    expect(budgetBandHref({ label: "a", min: 100, max: 900 })).toBe("/shop?min=100&max=900");
    expect(budgetBandHref({ label: "a", min: 0 })).toBe("/shop");
  });
  it("returns nothing for non-strings", () => {
    expect(parseBudgetBands(undefined)).toEqual([]);
  });
});

describe("isCampaignActive", () => {
  const at = (s: string) => new Date(s).getTime();
  it("respects start and end, and treats blanks as open-ended", () => {
    const c = { startsAt: "2026-11-01T09:00", endsAt: "2026-11-05T21:00" };
    expect(isCampaignActive(c, at("2026-10-31T12:00"))).toBe(false);
    expect(isCampaignActive(c, at("2026-11-03T12:00"))).toBe(true);
    expect(isCampaignActive(c, at("2026-11-05T21:00"))).toBe(false);
    expect(isCampaignActive({}, at("2026-11-03T12:00"))).toBe(true);
    expect(isCampaignActive({ endsAt: "2026-11-05T21:00" }, at("2026-10-01T00:00"))).toBe(true);
    expect(isCampaignActive({ startsAt: "garbage", endsAt: "" }, at("2026-10-01T00:00"))).toBe(true);
  });
});

describe("countdownParts", () => {
  it("splits milliseconds and never goes negative", () => {
    expect(countdownParts(((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 });
    expect(countdownParts(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});

describe("whatsappUrl", () => {
  it("normalises Indian numbers and encodes the message", () => {
    expect(whatsappUrl("+91 85110 90909", "Hi Delite")).toBe("https://wa.me/918511090909?text=Hi%20Delite");
    expect(whatsappUrl("8511090909", "")).toBe("https://wa.me/918511090909");
    expect(whatsappUrl("123", "x")).toBeUndefined();
    expect(whatsappUrl(undefined, "x")).toBeUndefined();
  });
});

describe("parseCombos / asIdList / asNumber", () => {
  it("keeps only combos with 2–4 valid ids and caps at 4 combos", () => {
    const combos = parseCombos([
      { title: "Mats + covers", productIds: [1, 2, 3, 4, 5] },
      { title: "One only", productIds: [1] },
      { productIds: [7, "x", 8] },
      null,
      ...Array.from({ length: 6 }, (_, i) => ({ title: `c${i}`, productIds: [10 + i, 20 + i] })),
    ]);
    expect(combos).toHaveLength(4);
    expect(combos[0]).toEqual({ title: "Mats + covers", productIds: [1, 2, 3, 4] });
    expect(combos[1]).toEqual({ title: "Combo", productIds: [7, 8] });
    expect(parseCombos("nope")).toEqual([]);
  });
  it("sanitises ids and numbers", () => {
    expect(asIdList([1, "2", -3, 4.5, 5], 2)).toEqual([1, 5]);
    expect(asNumber("8", 3)).toBe(8);
    expect(asNumber("abc", 3)).toBe(3);
    expect(asNumber(500, 3, 24)).toBe(24);
  });
});
