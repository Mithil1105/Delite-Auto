/**
 * Optional, operator-configured mapping from THIS store's custom Odoo fields (brand, vehicle
 * type, MRP/compare-at price) to Delite's concepts. None of these are guessed — every one
 * defaults to unset ("not mapped yet") until the site owner:
 *   1. runs `GET /api/internal/odoo/schema` (or the opt-in introspection test) against the real
 *      instance,
 *   2. finds the actual field name in the response,
 *   3. sets the corresponding env var below.
 *
 * See Documentations MD/odoo-schema-report.md — every row for brand/vehicle/fitment/MRP is
 * marked NOT VERIFIED until this has actually been done once against a live connection.
 */
export interface OdooCustomFieldMap {
  /** Field on product.template holding brand/manufacturer — many2one ([id,name]) or a plain string. */
  brandField?: string;
  /** Field on product.template holding vehicle type — expected to resolve to something containing "car" or "bike". */
  vehicleField?: string;
  /** Field on product.template holding a customer-facing MRP/compare-at price (numeric). */
  mrpField?: string;
}

export function getCustomFieldMap(): OdooCustomFieldMap {
  return {
    brandField: process.env.ODOO_BRAND_FIELD || undefined,
    vehicleField: process.env.ODOO_VEHICLE_FIELD || undefined,
    mrpField: process.env.ODOO_MRP_FIELD || undefined,
  };
}

/** The full set of custom field names currently configured — used to build the search_read fields list. */
export function getConfiguredCustomFieldNames(): string[] {
  const map = getCustomFieldMap();
  return [map.brandField, map.vehicleField, map.mrpField].filter((f): f is string => !!f);
}
