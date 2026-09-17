import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildStableSlug,
  normalizeCategory,
  normalizeProduct,
  normalizeProductDetail,
  normalizeVariant,
  odooIdFromSlug,
} from "./normalizeProduct";
import {
  fixtureAttributeValues,
  fixtureCategory,
  fixtureTemplate,
  fixtureTemplateInactiveButInStock,
  fixtureTemplateMinimal,
  fixtureTemplateZeroStock,
  fixtureVariantRecords,
} from "./fixtures";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("normalizeProduct", () => {
  it("maps standard fields onto Product", () => {
    const product = normalizeProduct(fixtureTemplate);
    expect(product.id).toBe("442");
    expect(product.odooId).toBe(442);
    expect(product.name).toBe("Premium Seat Cover");
    expect(product.sku).toBe("SC-442");
    expect(product.price).toBe(12990);
    expect(product.categorySlug).toBe("seat-covers");
    expect(product.description).toBe("A tailored, model-specific seat cover.");
    expect(product.variantCount).toBe(2);
    expect(product.updatedAt).toBe("2026-09-01 10:00:00");
  });

  it("produces a stable slug of name--odooId, not just slugify(name)", () => {
    const product = normalizeProduct(fixtureTemplate);
    expect(product.slug).toBe("premium-seat-cover--442");
  });

  it("handles missing optional fields (no SKU, category, description, image)", () => {
    const product = normalizeProduct(fixtureTemplateMinimal);
    expect(product.sku).toBeUndefined();
    expect(product.categorySlug).toBe("");
    expect(product.description).toBe("");
  });

  it("zero stock makes a product unavailable", () => {
    const product = normalizeProduct(fixtureTemplateZeroStock);
    expect(product.purchasable).toBe(false);
  });

  it("an inactive product is unavailable even with stock on hand", () => {
    const product = normalizeProduct(fixtureTemplateInactiveButInStock);
    expect(product.purchasable).toBe(false);
  });

  it("brand/vehicle/MRP default to unmapped when no custom field is configured", () => {
    const product = normalizeProduct(fixtureTemplate);
    expect(product.brandSlug).toBe("");
    expect(product.vehicle).toBe("universal");
    expect(product.mrp).toBeUndefined();
  });

  it("resolves vehicle/brand/MRP from operator-configured custom fields when set", () => {
    vi.stubEnv("ODOO_VEHICLE_FIELD", "x_vehicle_type");
    vi.stubEnv("ODOO_BRAND_FIELD", "x_brand");
    vi.stubEnv("ODOO_MRP_FIELD", "x_mrp");
    const record = { ...fixtureTemplate, x_vehicle_type: "Car", x_brand: [3, "Dolphin"], x_mrp: 15500 };
    const product = normalizeProduct(record);
    expect(product.vehicle).toBe("car");
    expect(product.brandSlug).toBe("dolphin");
    expect(product.mrp).toBe(15500);
  });
});

describe("odooIdFromSlug / buildStableSlug", () => {
  it("round-trips", () => {
    const slug = buildStableSlug("Premium Seat Cover", 442);
    expect(odooIdFromSlug(slug)).toBe(442);
  });

  it("survives a product rename — the id, not the name, is canonical", () => {
    const originalSlug = buildStableSlug("Premium Seat Cover", 442);
    const renamedSlug = buildStableSlug("Deluxe Seat Cover", 442);
    expect(odooIdFromSlug(originalSlug)).toBe(odooIdFromSlug(renamedSlug));
  });

  it("returns null for a slug with no trailing id (e.g. a stale mock-catalog slug)", () => {
    expect(odooIdFromSlug("dolphin-orbit-seat-cover-creta")).toBeNull();
  });
});

describe("normalizeVariant", () => {
  const attributeLabels = new Map(fixtureAttributeValues.map((av) => [av.id, { attribute: "Colour", value: String((av.product_attribute_value_id as [number, string])[1]) }]));

  it("labels a variant from its resolved attribute values", () => {
    const variant = normalizeVariant(fixtureVariantRecords[0], attributeLabels);
    expect(variant.odooVariantId).toBe(901);
    expect(variant.label).toBe("Black");
    expect(variant.sku).toBe("SC-442-BLK");
    expect(variant.purchasable).toBe(true);
    expect(variant.attributes).toEqual([{ attribute: "Colour", value: "Black" }]);
  });

  it("falls back to the raw variant name when attribute labels can't be resolved", () => {
    const variant = normalizeVariant(fixtureVariantRecords[0], new Map());
    expect(variant.label).toBe("Premium Seat Cover (Black)");
    expect(variant.attributes).toBeUndefined();
  });
});

describe("normalizeProductDetail", () => {
  it("includes a media entry when the image field is present, and variants when given", () => {
    const attributeLabels = new Map(fixtureAttributeValues.map((av) => [av.id, { attribute: "Colour", value: String((av.product_attribute_value_id as [number, string])[1]) }]));
    const variants = fixtureVariantRecords.map((v) => normalizeVariant(v, attributeLabels));
    const detail = normalizeProductDetail(fixtureTemplate, variants);
    expect(detail.media).toHaveLength(1);
    expect(detail.media[0].src).toBe("/api/catalog/media/product.template/442/image_1920");
    expect(detail.variants).toHaveLength(2);
  });

  it("has no media entry when the image field is absent (missing image case)", () => {
    const detail = normalizeProductDetail(fixtureTemplateMinimal);
    expect(detail.media).toHaveLength(0);
    expect(detail.variants).toBeUndefined();
  });
});

describe("normalizeCategory", () => {
  it("maps id/name and slugifies", () => {
    const category = normalizeCategory(fixtureCategory);
    expect(category.slug).toBe("seat-covers");
    expect(category.name).toBe("Seat Covers");
    expect(category.odooId).toBe(12);
  });
});
