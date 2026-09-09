import type { OdooProductRecord } from "./types";

/**
 * Resolves the URL the frontend should use for a product's primary image. Odoo's own binary
 * field endpoints (`/web/image/<model>/<id>/<field>`) normally require an authenticated Odoo
 * session, so the browser is pointed at our own proxy (`api/catalog/media/[model]/[id]/[field]`)
 * instead of Odoo directly — that endpoint is responsible for fetching the real bytes
 * server-side and streaming them with proper caching headers.
 *
 * ⚠️ Scaffolding — not exercised against a real Odoo instance in this session.
 */
export function resolveOdooMediaUrl(record: OdooProductRecord, field: "image_1920" = "image_1920"): string | null {
  if (!record[field]) return null;
  return `/api/catalog/media/product.template/${record.id}/${field}`;
}
