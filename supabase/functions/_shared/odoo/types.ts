// supabase/functions/_shared/odoo/types.ts
//
// Raw Odoo record shapes — every field below is VERIFIED against the live instance (server
// 19.0+e) via supabase/functions/odoo-schema and supabase/functions/odoo-catalog-classify. See
// Documentations MD/odoo-schema-report.md and Documentations MD/odoo-real-catalog.md. Nothing
// here is guessed; there is no custom-field section because this instance has zero x_/x_studio_
// fields on product.template or product.product.

/** [id, display_name] — Odoo's standard shape for a many2one field read via search_read. */
export type OdooMany2One = [number, string];

export interface OdooProductTemplateRecord {
  id: number;
  name: string;
  default_code?: string | false;

  list_price: number;
  description_sale?: string | false;

  active?: boolean;
  sale_ok?: boolean;
  website_published?: boolean;
  is_published?: boolean;

  /** Internal category — present but not used for storefront classification (see catalog.ts). */
  categ_id?: OdooMany2One | false;
  /** The real storefront classification field — flat, mixes vehicle/brand/type/promo (see catalog.ts). */
  public_categ_ids?: number[];

  qty_available?: number;
  virtual_available?: number;
  /** NOT present on product.template — variant-only. Never request this on a template read. */
  free_qty?: never;

  image_1920?: string | false;

  product_variant_ids?: number[];
  product_variant_count?: number;
  attribute_line_ids?: number[];

  write_date?: string;
}

export interface OdooProductVariantRecord {
  id: number;
  name: string;
  default_code?: string | false;
  list_price: number;
  active?: boolean;

  qty_available?: number;
  virtual_available?: number;
  /** Variant-only stock field — confirmed absent on product.template. */
  free_qty?: number;

  image_1920?: string | false;

  /** [id, name] — the owning product.template. */
  product_tmpl_id?: OdooMany2One;
  /** Attribute values that make this variant distinct from its siblings. */
  product_template_attribute_value_ids?: number[];
}

export interface OdooPublicCategoryRecord {
  id: number;
  name: string;
  /** Confirmed always `false` on this instance — the model is genuinely flat, no hierarchy. */
  parent_id: OdooMany2One | false;
}

export interface OdooTemplateAttributeValueRecord {
  id: number;
  name?: string;
  /** [id, name] — which product.attribute this value belongs to, e.g. [10, "Model"]. */
  attribute_id?: OdooMany2One;
  /** [id, name] — the underlying product.attribute.value, e.g. [123, "Brezza 2024 / LXI"]. */
  product_attribute_value_id?: OdooMany2One;
  /** [id, name] — the owning product.template. Present when queried directly (not via a variant's product_template_attribute_value_ids). */
  product_tmpl_id?: OdooMany2One;
}

export interface OdooProductImageRecord {
  id: number;
  name?: string;
  sequence?: number;
  product_tmpl_id?: OdooMany2One | false;
  /** Confirmed `false` on every sampled record — gallery images are template-level on this store. */
  product_variant_id?: OdooMany2One | false;
}
