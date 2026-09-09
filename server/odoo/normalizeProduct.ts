import type { OdooProductRecord } from "./types";
import type { Product, ProductDetail, ProductMedia } from "../../src/data/types";
import { resolveOdooMediaUrl } from "./media";

/**
 * Converts a raw Odoo product record into the frontend's `Product` shape. Every Odoo field name
 * is isolated to this file — nothing downstream (React components, the catalog service) should
 * ever see `list_price`, `categ_id`, `qty_available`, etc.
 *
 * ⚠️ Field mapping below is an ASSUMPTION based on Odoo's standard `product.template` model. It
 * has not been verified against this store's real Odoo instance (no credentials were available
 * in this session) — in particular:
 * - `brandSlug` and `vehicle` (car/bike/universal) have no obvious standard Odoo field; this
 *   store likely tracks them as a custom field or product attribute/tag. TODO once confirmed.
 * - `categorySlug` is derived by slugifying the Odoo category *name*, which will only line up
 *   with `src/data/categories.ts`'s slugs if Odoo's category names are kept in sync with them.
 */
export function normalizeProduct(record: OdooProductRecord): Product {
  return {
    id: String(record.id),
    slug: slugify(record.name),
    name: record.name,
    brandSlug: "", // TODO: map from an Odoo brand/manufacturer field once confirmed
    categorySlug: record.categ_id ? slugify(record.categ_id[1]) : "",
    vehicle: "universal", // TODO: map from an Odoo attribute/tag once confirmed
    price: record.list_price,
    icon: "Package",
    description: "",
    specs: [],
    available: (record.qty_available ?? 0) > 0,
  };
}

export function normalizeProductDetail(record: OdooProductRecord): ProductDetail {
  const src = resolveOdooMediaUrl(record);
  const media: ProductMedia[] = src ? [{ id: `${record.id}-primary`, type: "image", src, alt: record.name }] : [];
  return { ...normalizeProduct(record), media };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
