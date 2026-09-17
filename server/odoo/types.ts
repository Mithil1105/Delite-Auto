/**
 * Raw Odoo record shapes, as read directly off the JSON-RPC `execute_kw` response.
 *
 * ⚠️ STATUS: only the "standard/stable" fields below (name, default_code, list_price,
 * description_sale, active, sale_ok, categ_id, qty_available, image_1920, write_date,
 * product_variant_ids/count) are near-universal across Odoo's `product.template` model
 * (13.0–18.0) and safe to request without having inspected this store's real instance. Every
 * field marked "CUSTOM — unverified" below is a guess at a *possible* field name and MUST be
 * confirmed via `api/internal/odoo/schema.ts` (fields_get) against the real instance before it is
 * relied on — see `Documentations MD/odoo-schema-report.md`, which currently marks all of these
 * as NOT VERIFIED because no live Odoo connection was reachable from the environment this was
 * written in (no ODOO_* credentials present, no deployed URL provided).
 *
 * Nothing outside `server/odoo/` and `api/` should ever import this file — the whole point of
 * `normalizeProduct.ts` is that React components never see these field names.
 */

/** [id, display_name] — Odoo's standard shape for a many2one field read via search_read/read. */
export type OdooMany2One = [number, string];

export interface OdooProductTemplateRecord {
  id: number;
  name: string;
  display_name?: string;
  default_code?: string | false;
  barcode?: string | false;

  list_price: number;
  /** Odoo's own name for cost price — NOT the same concept as a customer-facing MRP/compare-at
   * price. Requested for completeness; not used as `mrp` (see normalizeProduct.ts). */
  standard_price?: number;

  active?: boolean;
  sale_ok?: boolean;
  /** Only present on instances with the Website/eCommerce module installed. */
  website_published?: boolean;
  is_published?: boolean;

  categ_id?: OdooMany2One | false;

  qty_available?: number;
  virtual_available?: number;
  free_qty?: number;

  /** Odoo returns a base64 string for binary image fields when requested directly — too large to
   * pass through untouched. `media.ts` resolves a proxy URL instead of using this raw value
   * directly in API responses. */
  image_1920?: string | false;
  image_1024?: string | false;
  image_512?: string | false;

  description?: string | false;
  description_sale?: string | false;

  product_variant_ids?: number[];
  product_variant_count?: number;
  attribute_line_ids?: number[];

  write_date?: string;

  // --- CUSTOM — unverified. Confirm via fields_get before uncommenting/using any of these. ---
  // A brand/manufacturer field has no standard Odoo name; common patterns are a custom
  // `x_studio_brand`/`x_brand_id` many2one, a `product.brand` model (OCA module), or a tag. Do
  // NOT guess which — see Documentations MD/odoo-schema-report.md.
  // A vehicle-type (car/bike) and fitment (make/model/year) field are almost certainly custom
  // (Studio field or product.attribute) on this specific store. Same rule: do not guess.
}

export interface OdooProductVariantRecord extends OdooProductTemplateRecord {
  /** On `product.product`, this points back at the owning `product.template`. */
  product_tmpl_id?: OdooMany2One;
  /** Attribute values that make this variant distinct from siblings, e.g. "Colour: Black". */
  product_template_attribute_value_ids?: number[];
}

export interface OdooCategoryRecord {
  id: number;
  name: string;
  display_name?: string;
  parent_id?: OdooMany2One | false;
  /** Present on `product.public.category` (Website/eCommerce module), not on `product.category`. */
  parent_path?: string;
  image_1920?: string | false;
}

export interface OdooAttributeRecord {
  id: number;
  name: string;
  display_type?: string;
}

export interface OdooAttributeValueRecord {
  id: number;
  name: string;
  attribute_id?: OdooMany2One;
}

export interface OdooTemplateAttributeLineRecord {
  id: number;
  attribute_id?: OdooMany2One;
  value_ids?: number[];
}

export interface OdooTemplateAttributeValueRecord {
  id: number;
  name?: string;
  attribute_id?: OdooMany2One;
  product_attribute_value_id?: OdooMany2One;
  price_extra?: number;
}

/** `fields_get` response shape (per-field metadata) — used by the schema introspection endpoint. */
export interface OdooFieldMeta {
  string: string;
  type: string;
  relation?: string;
  required?: boolean;
  readonly?: boolean;
  help?: string;
}
export type OdooFieldsGetResult = Record<string, OdooFieldMeta>;
