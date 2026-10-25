// supabase/functions/_shared/odoo/fetch.ts
//
// Batched composite fetchers shared by catalog-products (list) and catalog-product-detail — the
// same functions back both, at different field richness, so there is exactly one place that
// knows how to go from a page of product.template ids to fully normalized CatalogProduct DTOs.
// Every fetch here is batched across the whole set of ids (one search_read, "id in [...]"),
// never one call per product/variant — see Documentations MD/odoo-real-catalog.md, "Performance".

import { odooFieldsGet, odooSearchRead, type OdooConfig } from "./client.ts";
import {
  getCategoryNameMap,
  normalizeProduct,
  normalizeVariant,
  splitFitmentAndAttributes,
  VARIANT_DETAIL_FIELDS,
  type CatalogAttribute,
  type CatalogFitment,
  type CatalogProduct,
  type CatalogVariant,
} from "./catalog.ts";
import type { OdooProductImageRecord, OdooProductTemplateRecord, OdooProductVariantRecord, OdooTemplateAttributeValueRecord } from "./types.ts";

/** One batched product.product read for every variant id across a whole page/product — never per-product. */
export async function fetchVariantsByTemplateId(
  config: OdooConfig,
  variantIds: number[]
): Promise<Map<number, (OdooProductVariantRecord & Record<string, unknown>)[]>> {
  const byTemplate = new Map<number, (OdooProductVariantRecord & Record<string, unknown>)[]>();
  if (variantIds.length === 0) return byTemplate;

  const records = await odooSearchRead<OdooProductVariantRecord & Record<string, unknown>>(
    config,
    "product.product",
    [["id", "in", variantIds]],
    VARIANT_DETAIL_FIELDS
  );
  for (const record of records) {
    const templateId = record.product_tmpl_id ? record.product_tmpl_id[0] : undefined;
    if (templateId === undefined) continue;
    const list = byTemplate.get(templateId) ?? [];
    list.push(record);
    byTemplate.set(templateId, list);
  }
  return byTemplate;
}

/** One batched product.template.attribute.value read for every template id across a whole page — the source of both fitment (Model attribute) and non-fitment attribute labels. */
export async function fetchTemplateAttributeValuesByTemplateId(
  config: OdooConfig,
  templateIds: number[]
): Promise<Map<number, (OdooTemplateAttributeValueRecord & Record<string, unknown>)[]>> {
  const byTemplate = new Map<number, (OdooTemplateAttributeValueRecord & Record<string, unknown>)[]>();
  if (templateIds.length === 0) return byTemplate;

  const records = await odooSearchRead<OdooTemplateAttributeValueRecord & Record<string, unknown>>(
    config,
    "product.template.attribute.value",
    [["product_tmpl_id", "in", templateIds]],
    ["id", "attribute_id", "product_attribute_value_id", "name", "product_tmpl_id"]
  );
  for (const record of records) {
    const templateId = record.product_tmpl_id ? record.product_tmpl_id[0] : undefined;
    if (templateId === undefined) continue;
    const list = byTemplate.get(templateId) ?? [];
    list.push(record);
    byTemplate.set(templateId, list);
  }
  return byTemplate;
}

/**
 * Optional product.image fields worth reading when this Odoo has them. `video_url` comes from
 * website_sale; asking for a field that doesn't exist makes the whole search_read fail, so the
 * field list is checked once per isolate with fields_get and the optional ones are only added when
 * present (a failed check just means "none" and is retried on the next request).
 */
let optionalGalleryFields: Promise<string[]> | null = null;
function galleryOptionalFields(config: OdooConfig): Promise<string[]> {
  if (!optionalGalleryFields) {
    optionalGalleryFields = odooFieldsGet(config, "product.image")
      .then((fields) => ["video_url"].filter((f) => f in fields))
      .catch(() => {
        optionalGalleryFields = null;
        return [] as string[];
      });
  }
  return optionalGalleryFields;
}

/**
 * Odoo's website "Compare to Price" (`compare_list_price`) is how a product is put on sale: it holds the old, higher price
 * that is shown struck through next to the real (`list_price`) price. The field only exists on some Odoo versions, so — like
 * video_url above — it is requested only when fields_get says it exists, and a failed read retries without it.
 */
let templateOptionalFields: Promise<string[]> | null = null;
function templateExtraFields(config: OdooConfig): Promise<string[]> {
  if (!templateOptionalFields) {
    templateOptionalFields = odooFieldsGet(config, "product.template")
      .then((fields) => ["compare_list_price"].filter((f) => f in fields))
      .catch(() => {
        templateOptionalFields = null;
        return [] as string[];
      });
  }
  return templateOptionalFields;
}

/** product.template search_read that also returns the optional sale field when this Odoo has it. */
export async function searchTemplates<T>(
  config: OdooConfig,
  domain: unknown[],
  fields: string[],
  opts: { offset?: number; limit?: number; order?: string } = {}
): Promise<T[]> {
  const extra = await templateExtraFields(config);
  try {
    return await odooSearchRead<T>(config, "product.template", domain, [...fields, ...extra], opts);
  } catch (err) {
    if (extra.length === 0) throw err;
    console.error("[fetch] template read with optional fields failed, retrying without", err instanceof Error ? err.message : err);
    return await odooSearchRead<T>(config, "product.template", domain, fields, opts);
  }
}

/** One batched product.image read for every template id — gallery images (confirmed template-level on this instance). Detail only; list responses pass an empty map to skip this call. */
export async function fetchGalleryImagesByTemplateId(
  config: OdooConfig,
  templateIds: number[]
): Promise<Map<number, OdooProductImageRecord[]>> {
  const byTemplate = new Map<number, OdooProductImageRecord[]>();
  if (templateIds.length === 0) return byTemplate;

  const baseFields = ["id", "name", "sequence", "product_tmpl_id", "product_variant_id", "write_date"];
  const extra = await galleryOptionalFields(config);
  const read = (fields: string[]) =>
    odooSearchRead<OdooProductImageRecord>(config, "product.image", [["product_tmpl_id", "in", templateIds]], fields, { order: "sequence asc" });
  let records: OdooProductImageRecord[];
  try {
    records = await read([...baseFields, ...extra]);
  } catch (err) {
    if (extra.length === 0) throw err;
    // Never let an optional field take product galleries down — fall back to the original read.
    console.error("[fetch] gallery read with optional fields failed, retrying without", err instanceof Error ? err.message : err);
    records = await read(baseFields);
  }
  for (const record of records) {
    const templateId = record.product_tmpl_id ? record.product_tmpl_id[0] : undefined;
    if (templateId === undefined) continue;
    const list = byTemplate.get(templateId) ?? [];
    list.push(record);
    byTemplate.set(templateId, list);
  }
  return byTemplate;
}

/**
 * Which of these templates have a gallery video? One small batched read (ids only, no media bytes) —
 * used by list responses, which skip the full gallery. Best-effort: when this Odoo has no video field,
 * or the read fails, nobody gets a badge rather than the list failing.
 */
export async function fetchTemplateIdsWithVideo(config: OdooConfig, templateIds: number[]): Promise<Set<number>> {
  const withVideo = new Set<number>();
  if (templateIds.length === 0) return withVideo;
  try {
    if (!(await galleryOptionalFields(config)).includes("video_url")) return withVideo;
    const records = await odooSearchRead<{ id: number; product_tmpl_id: [number, string] | false }>(
      config,
      "product.image",
      [["product_tmpl_id", "in", templateIds], ["video_url", "!=", false]],
      ["id", "product_tmpl_id"]
    );
    for (const r of records) if (r.product_tmpl_id) withVideo.add(r.product_tmpl_id[0]);
  } catch (err) {
    console.error("[fetch] video flag lookup failed", err instanceof Error ? err.message : err);
  }
  return withVideo;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface NormalizeTemplatesOptions {
  /** Detail responses pass true to fetch real product.image gallery rows; list responses pass false to stay lightweight. */
  includeGallery: boolean;
  supabaseUrl: string;
}

/**
 * The single composite step both catalog-products and catalog-product-detail call: given a page
 * of raw product.template records, batch-fetches variants/attributes/(optionally) gallery images
 * for the WHOLE set at once, then normalizes each template into a full CatalogProduct.
 */
export async function normalizeTemplates(
  config: OdooConfig,
  templates: (OdooProductTemplateRecord & Record<string, unknown>)[],
  options: NormalizeTemplatesOptions
): Promise<CatalogProduct[]> {
  const templateIds = templates.map((t) => t.id);
  const allVariantIds = templates.flatMap((t) => t.product_variant_ids ?? []);

  // Sequential, not Promise.all — this Odoo instance rate-limits (HTTP 429) under concurrent RPC
  // load (see Documentations MD/odoo-supabase-edge-functions.md and odoo-schema's own history of
  // the same issue). Each call here is already batched across the whole page/product, so this is
  // a handful of sequential round trips, not N+1.
  const categoryNameById = await getCategoryNameMap(config);
  await sleep(150);
  const variantsByTemplate = await fetchVariantsByTemplateId(config, allVariantIds);
  await sleep(150);
  const attrValuesByTemplate = await fetchTemplateAttributeValuesByTemplateId(config, templateIds);
  let galleryByTemplate = new Map<number, OdooProductImageRecord[]>();
  let templatesWithVideo: Set<number> | undefined;
  if (options.includeGallery) {
    await sleep(150);
    galleryByTemplate = await fetchGalleryImagesByTemplateId(config, templateIds);
  } else {
    await sleep(150);
    templatesWithVideo = await fetchTemplateIdsWithVideo(config, templateIds);
  }

  return templates.map((template) => {
    const attrValueRecords = attrValuesByTemplate.get(template.id) ?? [];
    const { fitment, attributes, labelsById } = splitFitmentAndAttributes(attrValueRecords);
    const variantRecords = variantsByTemplate.get(template.id) ?? [];
    const variants: CatalogVariant[] = variantRecords.map((v) => normalizeVariant(v, labelsById));

    return normalizeProduct({
      template,
      variants,
      categoryNameById,
      fitment: fitment as CatalogFitment[],
      attributes: attributes as CatalogAttribute[],
      supabaseUrl: options.supabaseUrl,
      galleryImages: galleryByTemplate.get(template.id) ?? [],
      hasVideo: templatesWithVideo ? templatesWithVideo.has(template.id) : undefined,
    });
  });
}
