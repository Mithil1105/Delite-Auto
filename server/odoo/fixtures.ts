/**
 * Sanitized, representative fixture records — NOT real Odoo response data (none was available;
 * no live connection was reachable while this integration was built). Shaped to match the
 * standard `product.template`/`product.product`/`product.category` fields documented in
 * `types.ts`, for `normalizeProduct.test.ts`. Never commit a real Odoo response here.
 */
import type { OdooCategoryRecord, OdooProductTemplateRecord, OdooProductVariantRecord, OdooTemplateAttributeValueRecord } from "./types";

export const fixtureTemplate: OdooProductTemplateRecord & Record<string, unknown> = {
  id: 442,
  name: "Premium Seat Cover",
  display_name: "Premium Seat Cover",
  default_code: "SC-442",
  list_price: 12990,
  active: true,
  sale_ok: true,
  categ_id: [12, "Seat Covers"],
  qty_available: 8,
  image_1920: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  description_sale: "A tailored, model-specific seat cover.",
  product_variant_ids: [901, 902],
  product_variant_count: 2,
  write_date: "2026-09-01 10:00:00",
};

export const fixtureTemplateMinimal: OdooProductTemplateRecord & Record<string, unknown> = {
  id: 500,
  name: "Basic Air Freshener",
  list_price: 199,
  // default_code, categ_id, description_sale, image_1920 all absent/false — the "missing optional
  // fields" case.
  default_code: false,
  categ_id: false,
  description_sale: false,
  image_1920: false,
  qty_available: 0,
  product_variant_ids: [],
  product_variant_count: 1,
};

export const fixtureTemplateInactiveButInStock: OdooProductTemplateRecord & Record<string, unknown> = {
  ...fixtureTemplate,
  id: 601,
  name: "Discontinued Dashcam",
  active: false,
  qty_available: 15, // has stock, but inactive must still mean unavailable
};

export const fixtureTemplateZeroStock: OdooProductTemplateRecord & Record<string, unknown> = {
  ...fixtureTemplate,
  id: 602,
  name: "Backordered Floor Mat Set",
  qty_available: 0,
};

export const fixtureVariantRecords: (OdooProductVariantRecord & Record<string, unknown>)[] = [
  {
    id: 901,
    name: "Premium Seat Cover (Black)",
    default_code: "SC-442-BLK",
    list_price: 12990,
    active: true,
    qty_available: 5,
    product_tmpl_id: [442, "Premium Seat Cover"],
    product_template_attribute_value_ids: [7001],
  },
  {
    id: 902,
    name: "Premium Seat Cover (Tan)",
    default_code: "SC-442-TAN",
    list_price: 13490,
    active: true,
    qty_available: 3,
    product_tmpl_id: [442, "Premium Seat Cover"],
    product_template_attribute_value_ids: [7002],
  },
];

export const fixtureAttributeValues: (OdooTemplateAttributeValueRecord & Record<string, unknown>)[] = [
  { id: 7001, attribute_id: [1, "Colour"], product_attribute_value_id: [21, "Black"] },
  { id: 7002, attribute_id: [1, "Colour"], product_attribute_value_id: [22, "Tan"] },
];

export const fixtureCategory: OdooCategoryRecord = {
  id: 12,
  name: "Seat Covers",
  display_name: "Seat Covers",
  parent_id: false,
};
