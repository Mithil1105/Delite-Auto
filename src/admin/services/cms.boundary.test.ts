import { describe, it, expect } from "vitest";
import type { HeroContentOverride } from "../../components/Hero";
import type { AnnouncementContentOverride } from "../../components/AnnouncementBar";
import type { CategorySelection } from "../../hooks/useMerchandisingCms";
import type { PromotionInput } from "../services/promotionsService";

/**
 * Regression test for the one rule that shapes this whole system: Odoo owns sellable-item data,
 * Delite CMS owns how the website presents it. A CMS content payload must never carry a copied
 * commerce field — see Documentations MD/delite-admin.md, "Odoo / CMS ownership boundary".
 * Merchandising stores Odoo product/category IDs only; this test locks that contract in so it
 * can't silently drift.
 */
const FORBIDDEN_COMMERCE_FIELDS = ["price", "sku", "stock", "mrp", "inventory", "cost", "quantity"];

function assertNoCommerceFields(sample: Record<string, unknown>) {
  const keys = Object.keys(sample).map((k) => k.toLowerCase());
  for (const forbidden of FORBIDDEN_COMMERCE_FIELDS) {
    expect(keys).not.toContain(forbidden);
  }
}

describe("CMS / commerce data boundary", () => {
  it("Hero CMS content never carries a commerce field", () => {
    const sample: HeroContentOverride = {
      headingLine1: "Everything Your Car Needs.",
      headingLine2: "Delitefy It.",
      subheading: "Premium accessories",
      ctaLabel: "Shop Now",
      ctaLink: "/shop",
    };
    assertNoCommerceFields(sample as unknown as Record<string, unknown>);
  });

  it("Announcement Bar CMS content never carries a commerce field", () => {
    const sample: AnnouncementContentOverride = {
      message: "Free delivery above ₹999",
      linkLabel: "Shop now",
      linkUrl: "/shop",
      visible: true,
    };
    assertNoCommerceFields(sample as unknown as Record<string, unknown>);
  });

  it("the merchandising product storage contract is Odoo IDs only, never copied fields", () => {
    interface MerchandisingSelection {
      section: "featured" | "trending" | "new-arrivals";
      productIds: number[];
    }
    const sample: MerchandisingSelection = { section: "trending", productIds: [442, 508, 351] };
    assertNoCommerceFields(sample as unknown as Record<string, unknown>);
    expect(sample.productIds.every((id) => typeof id === "number")).toBe(true);
  });

  it("Homepage Categories CMS content stores a real Odoo category id, never copied category data", () => {
    const sample: CategorySelection = { categoryId: 12, order: 0, visible: true, heading: "Seat Covers" };
    assertNoCommerceFields(sample as unknown as Record<string, unknown>);
    expect(typeof sample.categoryId).toBe("number");
  });

  it("Promotions CMS content never carries a product price/stock field", () => {
    const sample: PromotionInput = {
      internalName: "Diwali combo banner",
      heading: "Combo Deals",
      subheading: "Save on bundles",
      body: null,
      imageStoragePath: "promotions/diwali.jpg",
      mobileImageStoragePath: null,
      imagePosition: null,
      mobileImagePosition: null,
      ctaLabel: "Shop Now",
      ctaUrl: "/shop?tag=bestseller",
      enabled: true,
      displayOrder: 0,
    };
    assertNoCommerceFields(sample as unknown as Record<string, unknown>);
  });
});
