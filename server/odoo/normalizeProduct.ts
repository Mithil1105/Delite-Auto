import type { Product, ProductDetail, ProductMedia, ProductVariant, Category } from "../../src/data/types";
import type { OdooCategoryRecord, OdooMany2One, OdooProductTemplateRecord, OdooProductVariantRecord } from "./types";
import { getCustomFieldMap } from "./customFieldMap";
import { resolveOdooMediaUrl } from "./media";

/**
 * Converts raw Odoo records into the frontend's `Product`/`ProductDetail`/`Category` shapes.
 * Every Odoo field name is isolated to this file (plus `productFields.ts`/`customFieldMap.ts`) —
 * nothing downstream (API route response bodies, the catalog service, React) should ever see
 * `list_price`, `categ_id`, `qty_available`, etc. Pure functions, no network calls — see
 * `normalizeProduct.test.ts` for fixture-based coverage.
 */

function slugifyName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * `product-name--odooId` — not just `slugify(name)`. Odoo product names can be renamed at any
 * time (a real risk with a live catalog, unlike the static mock data this pattern replaces), and
 * two different products can slugify to the same string. Appending the immutable Odoo id
 * guarantees uniqueness and stability even across a rename; `odooId` (not the slug) is the
 * canonical identity everywhere else in the stack (cart lines, "Open in Odoo", etc.) — see
 * Documentations MD/odoo-live-catalog-integration.md, "Slug strategy".
 */
export function buildStableSlug(name: string, odooId: number): string {
  return `${slugifyName(name)}--${odooId}`;
}

/** Inverse of `buildStableSlug` — pulls the trailing Odoo id back out of a URL slug. Returns `null` if the slug isn't in the expected shape (e.g. a stale mock-catalog slug). */
export function odooIdFromSlug(slug: string): number | null {
  const match = /--(\d+)$/.exec(slug);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

function many2OneName(value: OdooMany2One | false | undefined): string | undefined {
  return value ? value[1] : undefined;
}

/** Odoo represents an unset optional char/text field as `false`, not `undefined`/`""`. */
function orUndefined(value: string | false | undefined): string | undefined {
  return value ? value : undefined;
}

/**
 * Resolves the vehicle type from the operator-configured custom field, if any — never guessed.
 * Best-effort string match ("car"/"bike" appearing anywhere in the raw value or its many2one
 * label); anything else (field unset, unrecognized value) is `"universal"`, matching the existing
 * mock-catalog default for uncategorized products.
 */
function resolveVehicle(record: Record<string, unknown>): Product["vehicle"] {
  const map = getCustomFieldMap();
  if (!map.vehicleField) return "universal";
  const raw = record[map.vehicleField];
  const text = Array.isArray(raw) ? String(raw[1]) : typeof raw === "string" ? raw : "";
  const lower = text.toLowerCase();
  if (lower.includes("car")) return "car";
  if (lower.includes("bike")) return "bike";
  return "universal";
}

/** Resolves brandSlug from the operator-configured custom field, if any — never guessed. */
function resolveBrandSlug(record: Record<string, unknown>): string {
  const map = getCustomFieldMap();
  if (!map.brandField) return "";
  const raw = record[map.brandField];
  const text = Array.isArray(raw) ? String(raw[1]) : typeof raw === "string" ? raw : "";
  return text ? slugifyName(text) : "";
}

/** Resolves MRP/compare-at price from the operator-configured custom field, if any — never guessed. */
function resolveMrp(record: Record<string, unknown>): number | undefined {
  const map = getCustomFieldMap();
  if (!map.mrpField) return undefined;
  const raw = record[map.mrpField];
  return typeof raw === "number" && raw > 0 ? raw : undefined;
}

export function normalizeProduct(record: OdooProductTemplateRecord & Record<string, unknown>): Product {
  const odooId = record.id;
  return {
    id: String(odooId),
    odooId,
    slug: buildStableSlug(record.name, odooId),
    name: record.name,
    sku: orUndefined(record.default_code),
    brandSlug: resolveBrandSlug(record),
    categorySlug: record.categ_id ? slugifyName(many2OneName(record.categ_id) ?? "") : "",
    vehicle: resolveVehicle(record),
    price: record.list_price,
    mrp: resolveMrp(record),
    icon: "Package",
    description: orUndefined(record.description_sale) ?? "",
    specs: [],
    // `active` defaults true when absent (Odoo's own default); `sale_ok` likewise. A product
    // explicitly marked inactive or not-for-sale must never show as purchasable regardless of
    // stock — see Documentations MD/odoo-live-catalog-integration.md, "Stock mapping". Field
    // renamed from `available` to `purchasable` (2026-09-17, matches the shared `src/data/types.ts`
    // rename) — this legacy Vercel path's own business logic is unchanged.
    purchasable: record.active !== false && record.sale_ok !== false && (record.qty_available ?? 0) > 0,
    updatedAt: record.write_date,
    variantCount: record.product_variant_count,
  };
}

export function normalizeVariant(
  record: OdooProductVariantRecord & Record<string, unknown>,
  attributeLabels: Map<number, { attribute: string; value: string }>
): ProductVariant {
  const attributes = (record.product_template_attribute_value_ids ?? [])
    .map((id) => attributeLabels.get(id))
    .filter((a): a is { attribute: string; value: string } => !!a);

  return {
    id: String(record.id),
    odooVariantId: record.id,
    label: attributes.length > 0 ? attributes.map((a) => a.value).join(" / ") : record.name,
    sku: orUndefined(record.default_code),
    price: record.list_price,
    purchasable: record.active !== false && (record.qty_available ?? 0) > 0,
    attributes: attributes.length > 0 ? attributes : undefined,
  };
}

export function normalizeProductDetail(
  record: OdooProductTemplateRecord & Record<string, unknown>,
  variants: ProductVariant[] = []
): ProductDetail {
  const media: ProductMedia[] = orUndefined(record.image_1920)
    ? [{ id: `${record.id}-primary`, type: "image", src: resolveOdooMediaUrl(record.id, "image_1920"), alt: record.name }]
    : [];
  const base = normalizeProduct(record);
  return { ...base, media, variants: variants.length > 0 ? variants : undefined };
}

export function normalizeCategory(record: OdooCategoryRecord): Category {
  return {
    slug: slugifyName(record.name),
    name: record.name,
    vehicle: "universal", // Not derivable from a category record alone — see Known issues.
    odooId: record.id,
  };
}
