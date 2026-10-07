// supabase/functions/_shared/odoo/media.ts
//
// Allowlisted binary-image proxy logic shared by catalog-media/index.ts. Only product.template /
// product.product / product.image / product.public.category + the confirmed image_*/cover_image
// fields may ever be requested — this must never become a general Odoo record reader.
// product.public.category added so real Odoo category images can be shown instead of requiring a
// manually-uploaded CMS override for every curated category — NOTE this model's real photo lives
// in a non-standard `cover_image` field, NOT Odoo's usual image.mixin fields (image_1920 etc.),
// which are genuinely empty on every real category on this instance; confirmed live via
// fields_get + a real-data sample, not assumed from Odoo's general framework defaults. See
// "Category image fix" in Documentations MD/frontend-foundation-uiux-refactor.md.

import { odooExecuteKw, type OdooConfig } from "./client.ts";
import type { MediaField, MediaModel } from "./catalog.ts";

export const MEDIA_MODEL_WHITELIST: readonly MediaModel[] = ["product.template", "product.product", "product.image", "product.public.category"];
export const MEDIA_FIELD_WHITELIST: readonly MediaField[] = ["image_1920", "image_1024", "image_512", "image_256", "image_128", "cover_image"];

export function isWhitelistedMediaRequest(model: string, field: string): model is MediaModel {
  return (MEDIA_MODEL_WHITELIST as readonly string[]).includes(model) && (MEDIA_FIELD_WHITELIST as readonly string[]).includes(field);
}

function sniffImageContentType(bytes: Uint8Array): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const ascii4 = String.fromCharCode(...bytes.slice(0, 4));
  const ascii6 = String.fromCharCode(...bytes.slice(0, 6));
  if (ascii6 === "GIF89a" || ascii6 === "GIF87a") return "image/gif";
  if (bytes.length >= 12 && ascii4 === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return "application/octet-stream";
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Returns `null` for "no image" (genuinely empty field, or model/id doesn't exist) — never an error; callers turn that into a 404. */
export async function fetchOdooMediaBytes(
  config: OdooConfig,
  model: MediaModel,
  id: number,
  field: MediaField
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const rows = await odooExecuteKw<Array<Record<string, unknown>>>(config, model, "read", [[id], [field]]);
  const raw = rows[0]?.[field];
  if (!raw || typeof raw !== "string") return null;
  const bytes = base64ToBytes(raw);
  if (bytes.length === 0) return null;
  return { bytes, contentType: sniffImageContentType(bytes) };
}
