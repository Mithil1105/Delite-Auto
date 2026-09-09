/**
 * Raw Odoo record shapes, as read directly off the JSON-RPC `execute_kw` response.
 *
 * ⚠️ ASSUMED shapes, based on Odoo's standard `product.template` / `product.category` models —
 * NOT verified against a real Odoo instance (no credentials were available while this was
 * written). Confirm every field name here against the actual database before trusting
 * `normalizeProduct.ts`'s mapping in production.
 *
 * Nothing outside `server/odoo/` and `api/catalog/` should ever import this file — the whole
 * point of `normalizeProduct.ts` is that React components never see these field names.
 */

export interface OdooProductRecord {
  id: number;
  name: string;
  default_code?: string | false;
  list_price: number;
  qty_available?: number;
  categ_id?: [number, string] | false;
  /** Odoo returns a base64 string for binary image fields when requested directly — too large
   * to pass through untouched. `media.ts` resolves a proxy URL instead of using this raw value. */
  image_1920?: string | false;
  product_variant_ids?: number[];
}

export interface OdooCategoryRecord {
  id: number;
  name: string;
  parent_id?: [number, string] | false;
}
