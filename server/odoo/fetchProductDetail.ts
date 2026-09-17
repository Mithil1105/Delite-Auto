import { odooSearchRead } from "./client";
import { getProductTemplateFields, getProductVariantFields } from "./productFields";
import { normalizeProductDetail, normalizeVariant, odooIdFromSlug } from "./normalizeProduct";
import type { ProductDetail, ProductVariant } from "../../src/data/types";
import type { OdooProductTemplateRecord, OdooProductVariantRecord, OdooTemplateAttributeValueRecord } from "./types";

/**
 * Resolves a single product by its stable slug (`name--odooId` — see `normalizeProduct.ts`),
 * fetching the template, its variants, and their attribute labels. Returns `null` for an
 * unresolvable slug or a template Odoo doesn't have — callers must turn that into a real 404, not
 * silently substitute a different product (see spec section 14).
 */
export async function fetchOdooProductDetailBySlug(slug: string): Promise<ProductDetail | null> {
  const odooId = odooIdFromSlug(slug);
  if (odooId === null) return null;

  const templates = await odooSearchRead<OdooProductTemplateRecord & Record<string, unknown>>(
    "product.template",
    [["id", "=", odooId]],
    getProductTemplateFields(),
    { limit: 1 }
  );
  const template = templates[0];
  if (!template) return null;

  const variants = await fetchVariantsForTemplate(template);
  return normalizeProductDetail(template, variants);
}

async function fetchVariantsForTemplate(template: OdooProductTemplateRecord & Record<string, unknown>): Promise<ProductVariant[]> {
  const variantIds = template.product_variant_ids ?? [];
  if (variantIds.length === 0) return [];

  const variantRecords = await odooSearchRead<OdooProductVariantRecord & Record<string, unknown>>(
    "product.product",
    [["id", "in", variantIds]],
    getProductVariantFields()
  );

  const attributeValueIds = Array.from(new Set(variantRecords.flatMap((v) => v.product_template_attribute_value_ids ?? [])));
  const attributeLabels = new Map<number, { attribute: string; value: string }>();

  if (attributeValueIds.length > 0) {
    try {
      const attrValues = await odooSearchRead<OdooTemplateAttributeValueRecord & Record<string, unknown>>(
        "product.template.attribute.value",
        [["id", "in", attributeValueIds]],
        ["id", "attribute_id", "product_attribute_value_id", "name"]
      );
      for (const av of attrValues) {
        const attribute = av.attribute_id ? av.attribute_id[1] : "Option";
        const value = av.product_attribute_value_id ? av.product_attribute_value_id[1] : (av.name ?? "");
        attributeLabels.set(av.id, { attribute, value: String(value) });
      }
    } catch {
      // Attribute-label resolution failing shouldn't block the whole product-detail response —
      // variants still normalize, just with their raw variant name as the label instead of a
      // human "Colour: Black" pair.
    }
  }

  return variantRecords.map((v) => normalizeVariant(v, attributeLabels));
}
