// supabase/functions/_shared/odoo/catalog.ts
//
// The catalog domain model: classification config, eligibility domain, field lists, normalizers.
// This is the ONE place that turns Odoo's real (flat, mixed-purpose) schema into Delite's
// storefront concepts. Every constant below was verified against the live instance — see
// Documentations MD/odoo-real-catalog.md, "Verified facts this module encodes" — nothing here is
// guessed. If Odoo's category list changes (new brand added, etc.), re-run
// supabase/functions/odoo-catalog-classify and update the two id lists below; nothing else in
// this file needs to change.

import { odooSearchRead, type OdooConfig } from "./client.ts";
import type {
  OdooMany2One,
  OdooProductImageRecord,
  OdooProductTemplateRecord,
  OdooProductVariantRecord,
  OdooPublicCategoryRecord,
  OdooTemplateAttributeValueRecord,
} from "./types.ts";

// ---------------------------------------------------------------------------------------------
// Classification config — Delite metadata layered on top of Odoo's flat product.public.category.
// NEVER written back to Odoo; names are always resolved live from Odoo, never duplicated here.
// ---------------------------------------------------------------------------------------------

/** CAR = category id 1, BIKE = category id 2 — confirmed via product.template.public_categ_ids on real products. */
export const VEHICLE_TYPE_CATEGORY_IDS: Record<"car" | "bike", number> = { car: 1, bike: 2 };

/**
 * Brand-named product.public.category ids. Finalized by running
 * supabase/functions/odoo-catalog-classify (2026-09-16) against ALL 37 real category records +
 * their real product.template membership counts — not a name guess. The 9 ids intentionally
 * excluded below (and why) are documented in OTHER_CATEGORY_IDS.
 */
export const BRAND_CATEGORY_IDS: readonly number[] = [
  23, // WHEELS EYE
  24, // WURTH
  25, // 4N
  28, // STELLAR
  29, // PRICOL
  30, // NAKAMICHI
  31, // GODREJ
  32, // MOCO
  33, // GALIO
  34, // ALP
  35, // QUBO
  38, // SONY
  39, // TORETO
  41, // UNO MINDA
  42, // DOLPHIN
  43, // VEDASHREE
  49, // LETSTEACK
  51, // HAMAAN
  52, // TORQ
  53, // NV TRACK
  54, // WAXPOL
  55, // GARWARE
  56, // PATHAK
  57, // M TEK
  58, // MOTOMAX
  60, // PV MAX
  61, // JVC
  62, // JBL
];

/** Confirmed NOT brands: promo groupings (11/12/13) and product-type tags (17/18/21/59), verified against real product co-occurrence (e.g. id 59 "CAR MATS" appears alongside 1 "CAR" and 25 "4N" on the same real product — a type tag, not a brand). */
export const OTHER_CATEGORY_IDS: readonly number[] = [11, 12, 13, 17, 18, 21, 59];

export type CategoryRole = "vehicle" | "brand" | "other";

export function classifyCategoryId(id: number): CategoryRole {
  if (id === VEHICLE_TYPE_CATEGORY_IDS.car || id === VEHICLE_TYPE_CATEGORY_IDS.bike) return "vehicle";
  if (BRAND_CATEGORY_IDS.includes(id)) return "brand";
  return "other";
}

/** The "Model" product.attribute (id 10) — free-text fitment labels, e.g. "Brezza 2024 / LXI". Never parsed into make/model/year/trim. */
export const FITMENT_ATTRIBUTE_ID = 10;

// ---------------------------------------------------------------------------------------------
// Catalog eligibility domain — VERIFIED via supabase/functions/odoo-catalog-classify against 7
// known non-catalog POS/service records (Standard delivery, Booking Fees, Tips, Settle Due,
// Deposit, Down Payment (POS), Service on Timesheets) and 8 genuine catalog products. Every one
// of the 7 non-catalog records has website_published=false AND is_published=false; every sampled
// genuine product has both true. That pair alone cleanly separates the two groups — no reliance
// on category name/id, which could change.
// ---------------------------------------------------------------------------------------------

export const CATALOG_ELIGIBILITY_DOMAIN: unknown[] = [
  ["sale_ok", "=", true],
  ["active", "=", true],
  ["website_published", "=", true],
  ["is_published", "=", true],
];

export interface CatalogProductQuery {
  q?: string;
  categoryId?: number;
  vehicle?: "car" | "bike";
  brandCategoryId?: number;
  fitmentValueId?: number;
  offset: number;
  limit: number;
}

/**
 * Builds the full Odoo domain for a catalog list query — filter-in-Odoo, never fetch-then-filter.
 * `brandCategoryId`/`categoryId` are validated against the real category list by the caller
 * (catalog-products/index.ts) before reaching here; this function trusts its inputs are real ids.
 */
export function buildCatalogDomain(query: CatalogProductQuery): unknown[] {
  const domain: unknown[] = [...CATALOG_ELIGIBILITY_DOMAIN];
  if (query.q) {
    domain.push("|", ["name", "ilike", query.q], ["default_code", "ilike", query.q]);
  }
  if (query.categoryId !== undefined) domain.push(["public_categ_ids", "in", [query.categoryId]]);
  if (query.vehicle) domain.push(["public_categ_ids", "in", [VEHICLE_TYPE_CATEGORY_IDS[query.vehicle]]]);
  if (query.brandCategoryId !== undefined) domain.push(["public_categ_ids", "in", [query.brandCategoryId]]);
  if (query.fitmentValueId !== undefined) domain.push(["attribute_line_ids.value_ids", "in", [query.fitmentValueId]]);
  return domain;
}

// ---------------------------------------------------------------------------------------------
// Field lists — list endpoint stays lightweight (no description, no image bytes); detail can be richer.
// ---------------------------------------------------------------------------------------------

export const TEMPLATE_LIST_FIELDS = [
  "id",
  "name",
  "default_code",
  "list_price",
  "active",
  "sale_ok",
  "website_published",
  "is_published",
  "public_categ_ids",
  "product_variant_ids",
  "product_variant_count",
  "write_date",
];

export const TEMPLATE_DETAIL_FIELDS = [...TEMPLATE_LIST_FIELDS, "description_sale", "attribute_line_ids"];

export const VARIANT_STOCK_FIELDS = ["id", "product_tmpl_id", "active", "qty_available", "free_qty"];

export const VARIANT_DETAIL_FIELDS = [
  "id",
  "name",
  "default_code",
  "list_price",
  "active",
  "qty_available",
  "free_qty",
  "product_tmpl_id",
  "product_template_attribute_value_ids",
];

// ---------------------------------------------------------------------------------------------
// Stable identity — slug format `human-readable-name--ODOO_TEMPLATE_ID`.
// ---------------------------------------------------------------------------------------------

function slugifyName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function buildStableSlug(name: string, odooTemplateId: number): string {
  return `${slugifyName(name)}--${odooTemplateId}`;
}

export function odooIdFromSlug(slug: string): number | null {
  const match = /--(\d+)$/.exec(slug);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

// ---------------------------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------------------------

export type MediaModel = "product.template" | "product.product" | "product.image";
export type MediaField = "image_1920" | "image_1024" | "image_512" | "image_256" | "image_128";

export function buildMediaUrl(supabaseUrl: string, model: MediaModel, id: number, field: MediaField = "image_1920"): string {
  const params = new URLSearchParams({ model, id: String(id), field });
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/catalog-media?${params.toString()}`;
}

// ---------------------------------------------------------------------------------------------
// Normalized DTOs
// ---------------------------------------------------------------------------------------------

export interface CatalogCategoryRef {
  id: number;
  name: string;
}

export interface CatalogFitment {
  id: number;
  label: string;
}

export interface CatalogAttribute {
  attributeId: number;
  attributeName: string;
  values: { id: number; label: string }[];
}

export interface CatalogVariant {
  odooVariantId: number;
  sku?: string;
  name: string;
  price: number;
  attributes: { attribute: string; value: string }[];
  /** Odoo's own `active` flag on this product.product record (not archived) — record-level, says nothing about inventory. */
  catalogActive: boolean;
  /** Raw on-hand quantity (`free_qty`/`qty_available`), honest, can be 0 — informational display only, never business-rule-adjusted. */
  inventoryQuantity: number;
  /** Whether this store operationally tracks inventory at all — see STORE_INVENTORY_TRACKED below. */
  inventoryTracked: boolean;
  /** `inventoryQuantity > 0` — purely inventory-derived, never overridden by a business rule. */
  inStock: boolean;
  /** The actual Add-to-Cart gate: `catalogActive && (inStock || !inventoryTracked)`. See `normalizeVariant`'s doc comment. */
  purchasable: boolean;
}

export interface CatalogMediaItem {
  id: string;
  url: string;
  alt: string;
}

export interface CatalogStockSummary {
  totalOnHand: number;
  anyVariantInStock: boolean;
  anyVariantPurchasable: boolean;
}

export interface CatalogProduct {
  id: string;
  odooTemplateId: number;
  slug: string;
  name: string;
  sku?: string;
  price: number;
  mrp: number | null;
  description?: string;
  categoryIds: number[];
  categories: CatalogCategoryRef[];
  brand: { id: number; name: string } | null;
  vehicleTypes: ("car" | "bike")[];
  fitment: CatalogFitment[];
  attributes: CatalogAttribute[];
  variants: CatalogVariant[];
  primaryImage: string;
  media: CatalogMediaItem[];
  /** Odoo's own `active` flag on this product.template record — record-level, says nothing about inventory. */
  catalogActive: boolean;
  /** The actual Add-to-Cart gate at the product level: `sale_ok && catalogActive && (no variants || any variant purchasable)`. */
  purchasable: boolean;
  stockSummary: CatalogStockSummary;
  websitePublished: boolean;
}

/** Resolves each public_categ_id to a real {id, name} via the caller-supplied lookup map (built once per request from a live category fetch — never hardcoded names). */
function resolveCategoryRefs(ids: number[], categoryNameById: Map<number, string>): CatalogCategoryRef[] {
  return ids.map((id) => ({ id, name: categoryNameById.get(id) ?? `Category ${id}` }));
}

function resolveBrand(ids: number[], categoryNameById: Map<number, string>): { id: number; name: string } | null {
  const brandId = ids.find((id) => BRAND_CATEGORY_IDS.includes(id));
  if (brandId === undefined) return null;
  return { id: brandId, name: categoryNameById.get(brandId) ?? `Category ${brandId}` };
}

function resolveVehicleTypes(ids: number[]): ("car" | "bike")[] {
  const types: ("car" | "bike")[] = [];
  if (ids.includes(VEHICLE_TYPE_CATEGORY_IDS.car)) types.push("car");
  if (ids.includes(VEHICLE_TYPE_CATEGORY_IDS.bike)) types.push("bike");
  return types;
}

function many2OneId(value: OdooMany2One | false | undefined): number | undefined {
  return value ? value[0] : undefined;
}

/**
 * STOCK DECISION (verified 2026-09-16 via supabase/functions/odoo-catalog-classify's stockCheck):
 * of 365 real product.product records, only 6 (1.6%) have any nonzero qty_available/free_qty/
 * virtual_available — the other 359 are genuinely active/sale_ok/website-published catalog items
 * that all show 0 across every stock field. This store does not operationally track inventory
 * quantities for the vast majority of its catalog (Odoo's Inventory app isn't being used to gate
 * sales here). Because Odoo returns `0` identically whether a specific item is genuinely
 * tracked-and-empty or simply never tracked, there is no reliable PER-ITEM signal to tell the two
 * apart — so this is deliberately a STORE-LEVEL constant, verified against real aggregate data
 * (1.6%), not a fabricated per-product guess. `false` means: purchasability is driven by
 * `catalogActive` alone (an explicit, documented Delite business rule), never by inventory
 * quantity — see `normalizeVariant`'s `purchasable` computation. Re-verify via
 * odoo-catalog-classify's `stockCheck` before ever flipping this to `true`; see
 * Documentations MD/odoo-real-catalog.md, "Stock decision".
 */
export const STORE_INVENTORY_TRACKED = false;

/**
 * Normalizes a variant record into the catalog DTO shape. `attributeLabels` maps a
 * product.template.attribute.value id -> {attribute, value} label pair (see
 * resolveAttributeLabels below) — resolved once per request, not per variant.
 *
 * Deliberately exposes FIVE separate, honest signals instead of one conflated `available`
 * boolean (2026-09-17 stabilization pass — see Documentations MD/odoo-real-catalog.md, "Stock
 * decision"): `catalogActive` (Odoo's own record-active flag, nothing to do with stock),
 * `inventoryQuantity` (the raw number, can be 0, purely informational), `inventoryTracked` (the
 * store-level operational fact above), `inStock` (`inventoryQuantity > 0`, never business-rule
 * adjusted), and `purchasable` (the actual Add-to-Cart gate, which only falls back to
 * `catalogActive` alone when inventory genuinely isn't tracked — never silently presented as
 * "in stock").
 */
export function normalizeVariant(
  record: OdooProductVariantRecord & Record<string, unknown>,
  attributeLabels: Map<number, { attribute: string; value: string }>
): CatalogVariant {
  const attributes = (record.product_template_attribute_value_ids ?? [])
    .map((id) => attributeLabels.get(id))
    .filter((a): a is { attribute: string; value: string } => !!a);

  const inventoryQuantity = typeof record.free_qty === "number" ? record.free_qty : (record.qty_available ?? 0);
  const catalogActive = record.active !== false;
  const inStock = inventoryQuantity > 0;
  const purchasable = catalogActive && (inStock || !STORE_INVENTORY_TRACKED);

  return {
    odooVariantId: record.id,
    sku: record.default_code || undefined,
    name: record.name,
    price: record.list_price,
    attributes,
    catalogActive,
    inventoryQuantity,
    inventoryTracked: STORE_INVENTORY_TRACKED,
    inStock,
    purchasable,
  };
}

export interface NormalizeProductArgs {
  template: OdooProductTemplateRecord & Record<string, unknown>;
  variants: CatalogVariant[];
  categoryNameById: Map<number, string>;
  fitment: CatalogFitment[];
  attributes: CatalogAttribute[];
  supabaseUrl: string;
  /** Detail responses include a real gallery (product.image); list responses pass []. */
  galleryImages: OdooProductImageRecord[];
}

export function normalizeProduct(args: NormalizeProductArgs): CatalogProduct {
  const { template, variants, categoryNameById, fitment, attributes, supabaseUrl, galleryImages } = args;
  const categoryIds = template.public_categ_ids ?? [];

  const media: CatalogMediaItem[] = [
    { id: `${template.id}-primary`, url: buildMediaUrl(supabaseUrl, "product.template", template.id), alt: template.name },
    ...galleryImages.map((img) => ({
      id: `image-${img.id}`,
      url: buildMediaUrl(supabaseUrl, "product.image", img.id),
      alt: img.name || template.name,
    })),
  ];

  const anyVariantPurchasable = variants.some((v) => v.purchasable);
  const anyVariantInStock = variants.some((v) => v.inStock);
  const totalOnHand = variants.reduce((sum, v) => sum + Math.max(0, v.inventoryQuantity), 0);
  const catalogActive = template.active !== false;
  // Same rule as normalizeVariant's `purchasable`: a template-level gate, never a claim about
  // real inventory. See Documentations MD/odoo-real-catalog.md, "Stock decision".
  const purchasable = template.sale_ok !== false && catalogActive && (variants.length === 0 || anyVariantPurchasable);

  return {
    id: String(template.id),
    odooTemplateId: template.id,
    slug: buildStableSlug(template.name, template.id),
    name: template.name,
    sku: template.default_code || undefined,
    price: template.list_price,
    // MRP has no backing Odoo field on this instance — never fabricated. See
    // Documentations MD/odoo-real-catalog.md, "MRP absence".
    mrp: null,
    description: template.description_sale || undefined,
    categoryIds,
    categories: resolveCategoryRefs(categoryIds, categoryNameById),
    brand: resolveBrand(categoryIds, categoryNameById),
    vehicleTypes: resolveVehicleTypes(categoryIds),
    fitment,
    attributes,
    variants,
    primaryImage: buildMediaUrl(supabaseUrl, "product.template", template.id),
    media,
    catalogActive,
    purchasable,
    stockSummary: { totalOnHand, anyVariantInStock, anyVariantPurchasable },
    websitePublished: template.website_published === true && template.is_published === true,
  };
}

/**
 * Resolves product.template.attribute.value ids -> {attribute, value} label pairs, split into
 * "fitment" (attribute_id === FITMENT_ATTRIBUTE_ID) and "attributes" (everything else) — see
 * resolveTemplateAttributes in fetch helpers. Exported so both the list and detail code paths
 * build the two arrays identically.
 */
export function splitFitmentAndAttributes(
  templateAttributeValues: (OdooTemplateAttributeValueRecord & Record<string, unknown>)[]
): { fitment: CatalogFitment[]; attributes: CatalogAttribute[]; labelsById: Map<number, { attribute: string; value: string }> } {
  const fitment: CatalogFitment[] = [];
  const attributeGroups = new Map<number, CatalogAttribute>();
  const labelsById = new Map<number, { attribute: string; value: string }>();

  for (const av of templateAttributeValues) {
    const attributeId = many2OneId(av.attribute_id);
    const attributeName = av.attribute_id ? av.attribute_id[1] : "Option";
    const valueId = av.product_attribute_value_id ? av.product_attribute_value_id[0] : av.id;
    const valueLabel = av.product_attribute_value_id ? av.product_attribute_value_id[1] : (av.name ?? "");
    if (attributeId === undefined) continue;

    labelsById.set(av.id, { attribute: attributeName, value: String(valueLabel) });

    if (attributeId === FITMENT_ATTRIBUTE_ID) {
      fitment.push({ id: valueId, label: String(valueLabel) });
      continue;
    }

    const group = attributeGroups.get(attributeId) ?? { attributeId, attributeName, values: [] };
    if (!group.values.some((v) => v.id === valueId)) group.values.push({ id: valueId, label: String(valueLabel) });
    attributeGroups.set(attributeId, group);
  }

  return { fitment, attributes: Array.from(attributeGroups.values()), labelsById };
}

export function normalizeCategoryRecord(record: OdooPublicCategoryRecord): { id: number; name: string; role: CategoryRole } {
  return { id: record.id, name: record.name, role: classifyCategoryId(record.id) };
}

// ---------------------------------------------------------------------------------------------
// Category name cache — categories change rarely; avoids one extra Odoo round trip on every
// single catalog-products/catalog-product-detail request within the same warm isolate. A cold
// start (or 5-minute expiry) simply re-fetches; never stale enough to matter for a name lookup.
// ---------------------------------------------------------------------------------------------

let categoryCache: { expiresAt: number; map: Map<number, string> } | null = null;
const CATEGORY_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getCategoryNameMap(config: OdooConfig): Promise<Map<number, string>> {
  if (categoryCache && categoryCache.expiresAt > Date.now()) return categoryCache.map;
  const records = await odooSearchRead<OdooPublicCategoryRecord>(config, "product.public.category", [], ["id", "name"], { limit: 1000 });
  const map = new Map(records.map((r) => [r.id, r.name] as const));
  categoryCache = { expiresAt: Date.now() + CATEGORY_CACHE_TTL_MS, map };
  return map;
}
