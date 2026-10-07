// supabase/functions/catalog-media/index.ts
//
// GET /functions/v1/catalog-media?model=product.template&id=442&field=image_1920
//
// Proxies one Odoo binary image field. Only product.template/product.product + the confirmed
// image_* fields are reachable — see _shared/odoo/media.ts's whitelist. Never a generic
// execute_kw proxy: model/field are checked against a fixed allowlist, id must be a positive
// integer, and rejection responses are deliberately vague (this is the one Odoo-touching endpoint
// reachable from the public internet with no further gating). No base64 JSON is ever returned —
// always raw image bytes with a real Content-Type.

import { getOdooConfig } from "../_shared/odoo/client.ts";
import { fetchOdooMediaBytes, isWhitelistedMediaRequest } from "../_shared/odoo/media.ts";
import type { MediaField, MediaModel } from "../_shared/odoo/catalog.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * One retry on top of fetchOdooMediaBytes — a homepage load fires 10-20+ of these in parallel
 * (every curated category's cover image at once), and Odoo occasionally 502s a fraction of that
 * burst (confirmed live via Supabase edge-function logs, 2026-10-07 — several `catalog-media`
 * calls failing with "Odoo request failed" while sibling calls in the same burst succeeded).
 * `fetchOdooMediaBytes` only ever calls Odoo's `read` (never a write), so retrying it is always
 * safe — unlike `odooExecuteKw` generally, which `catalog-media` deliberately does NOT wrap here
 * since that's shared with non-idempotent write endpoints. See
 * Documentations MD/frontend-foundation-uiux-refactor.md, "Category image load glitches".
 */
async function fetchOdooMediaBytesWithRetry(
  config: Parameters<typeof fetchOdooMediaBytes>[0],
  model: MediaModel,
  id: number,
  field: MediaField
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    return await fetchOdooMediaBytes(config, model, id, field);
  } catch (err) {
    console.error("[catalog-media] first attempt failed, retrying once", err instanceof Error ? err.message : err);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return fetchOdooMediaBytes(config, model, id, field);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const config = getOdooConfig();
  if (!config) return json({ error: "Catalog media not configured" }, 501);

  const url = new URL(req.url);
  const model = url.searchParams.get("model") ?? "";
  const field = (url.searchParams.get("field") || "image_1920") as MediaField;
  const idRaw = url.searchParams.get("id") ?? "";
  const id = Number(idRaw);

  if (!isWhitelistedMediaRequest(model, field) || !Number.isInteger(id) || id <= 0) {
    return json({ error: "Unsupported media request" }, 400);
  }

  try {
    const media = await fetchOdooMediaBytesWithRetry(config, model as MediaModel, id, field);
    if (!media) return json({ error: "No image" }, 404);
    return new Response(media.bytes, {
      status: 200,
      headers: {
        "Content-Type": media.contentType,
        // Product images change rarely relative to page views; a day of shared caching with a
        // long stale-while-revalidate keeps this proxy off the hot path without serving a
        // week-stale image after a real update.
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    return json({ error: "Failed to fetch media from Odoo" }, 502, err);
  }
});

function json(body: unknown, status = 200, err?: unknown): Response {
  if (err) console.error("[catalog-media]", err instanceof Error ? err.message : err);
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
