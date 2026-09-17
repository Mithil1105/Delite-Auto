// Vercel serverless function: GET /api/catalog/media/:model/:id/:field
//
// Proxies/streams one Odoo binary image field so the browser never talks to Odoo directly (no
// credentials, no arbitrary model/field access — see server/odoo/media.ts's whitelist). See
// api/catalog/products.ts for the `@vercel/node` typing note.

import { isOdooConfigured } from "../../../../../server/odoo/client";
import { fetchOdooMediaBytes, isWhitelistedMediaRequest, type MediaField, type MediaModel } from "../../../../../server/odoo/media";

export default async function handler(req: any, res: any) {
  if (!isOdooConfigured()) {
    res.status(501).json({ error: "Odoo media proxy not configured — set ODOO_* env vars first" });
    return;
  }

  const { model, id, field } = req.query ?? {};
  const numericId = Number(id);

  if (typeof model !== "string" || typeof field !== "string" || !isWhitelistedMediaRequest(model, field) || !Number.isFinite(numericId)) {
    // Deliberately vague — do not echo back what was rejected in detail, this is the one Odoo
    // proxy endpoint reachable from the public internet.
    res.status(400).json({ error: "Unsupported media request" });
    return;
  }

  try {
    const media = await fetchOdooMediaBytes(model as MediaModel, numericId, field as MediaField);
    if (!media) {
      res.status(404).json({ error: "No image" });
      return;
    }
    res.setHeader("Content-Type", media.contentType);
    // Odoo product images change rarely relative to page views; a day of shared caching with a
    // long stale-while-revalidate keeps the proxy off the hot path without ever serving a
    // week-stale image after a real update.
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).send(media.buffer);
  } catch (err) {
    console.error("[api/catalog/media]", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Failed to fetch media from Odoo" });
  }
}
