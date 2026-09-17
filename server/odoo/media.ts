import { odooExecuteKw } from "./client";

/**
 * Resolves the URL the frontend should use for a product's image. Odoo's own binary field
 * endpoints normally require an authenticated Odoo session, so the browser is pointed at our own
 * proxy (`/api/catalog/media/:model/:id/:field`) instead of Odoo directly — that endpoint fetches
 * the real bytes server-side (see `fetchOdooMediaBytes` below) and streams them with caching
 * headers. See Documentations MD/odoo-live-catalog-integration.md, "Media model".
 */
export function resolveOdooMediaUrl(
  id: number,
  field: MediaField = "image_1920",
  model: MediaModel = "product.template"
): string {
  return `/api/catalog/media/${model}/${id}/${field}`;
}

/** Only these models/fields may be requested through the media proxy — see `MEDIA_MODEL_WHITELIST`. */
export type MediaModel = "product.template" | "product.product";
export type MediaField = "image_1920" | "image_1024" | "image_512" | "image_256" | "image_128";

export const MEDIA_MODEL_WHITELIST: readonly MediaModel[] = ["product.template", "product.product"];
export const MEDIA_FIELD_WHITELIST: readonly MediaField[] = ["image_1920", "image_1024", "image_512", "image_256", "image_128"];

export function isWhitelistedMediaRequest(model: string, field: string): model is MediaModel {
  return (MEDIA_MODEL_WHITELIST as readonly string[]).includes(model) && (MEDIA_FIELD_WHITELIST as readonly string[]).includes(field);
}

/** Magic-byte sniffing — Odoo's `read()` returns raw base64 image bytes with no content-type of its own. */
function sniffImageContentType(buffer: Buffer): string {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 6 && buffer.toString("ascii", 0, 6) === "GIF89a") return "image/gif";
  if (buffer.length >= 6 && buffer.toString("ascii", 0, 6) === "GIF87a") return "image/gif";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "application/octet-stream";
}

/**
 * Fetches and decodes one product image field via `execute_kw` `read()`. Returns `null` if the
 * model/id doesn't exist or the field is genuinely empty (a product with no image set) — callers
 * should treat that as "no image," not an error (see `api/catalog/media/[model]/[id]/[field].ts`).
 */
export async function fetchOdooMediaBytes(
  model: MediaModel,
  id: number,
  field: MediaField
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const rows = await odooExecuteKw<Array<Record<string, unknown>>>(model, "read", [[id], [field]]);
  const raw = rows[0]?.[field];
  if (!raw || typeof raw !== "string") return null;
  const buffer = Buffer.from(raw, "base64");
  if (buffer.length === 0) return null;
  return { buffer, contentType: sniffImageContentType(buffer) };
}
