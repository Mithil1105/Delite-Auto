import { getConfiguredCustomFieldNames } from "./customFieldMap";

/**
 * Standard `product.template` fields safe to request without having inspected this store's real
 * instance — near-universal across Odoo 13.0–18.0. Anything custom (brand, vehicle, MRP) is
 * appended only if the operator has configured it via `customFieldMap.ts` env vars — never
 * requested speculatively (an unknown field name makes `search_read` error out entirely).
 */
const STANDARD_TEMPLATE_FIELDS = [
  "id",
  "name",
  "display_name",
  "default_code",
  "barcode",
  "list_price",
  "active",
  "sale_ok",
  "categ_id",
  "qty_available",
  "image_1920",
  "description_sale",
  "product_variant_ids",
  "product_variant_count",
  "write_date",
];

export function getProductTemplateFields(): string[] {
  return [...STANDARD_TEMPLATE_FIELDS, ...getConfiguredCustomFieldNames()];
}

const STANDARD_VARIANT_FIELDS = [
  "id",
  "name",
  "display_name",
  "default_code",
  "list_price",
  "active",
  "qty_available",
  "image_1920",
  "product_tmpl_id",
  "product_template_attribute_value_ids",
];

export function getProductVariantFields(): string[] {
  return STANDARD_VARIANT_FIELDS;
}

export const STANDARD_CATEGORY_FIELDS = ["id", "name", "display_name", "parent_id"];
