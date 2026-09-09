// Vercel serverless function: GET /api/catalog/media/:model/:id/:field
//
// Intended to proxy/stream an authenticated Odoo binary image field (see
// server/odoo/media.ts#resolveOdooMediaUrl) so the browser never talks to Odoo directly. NOT
// implemented — there was no real Odoo instance available in this session to verify the actual
// binary-field fetch shape (Odoo's `/web/image` endpoint vs. reading the base64 field via
// `execute_kw` and decoding it) or exercise caching/ETag behavior against it. Implement this
// before pointing any real product media at this route.

import { isOdooConfigured } from "../../../../../server/odoo/client";

export default async function handler(req: any, res: any) {
  if (!isOdooConfigured()) {
    res.status(501).json({ error: "Odoo media proxy not configured — set ODOO_* env vars first" });
    return;
  }

  const { model, id, field } = req.query ?? {};
  console.warn(`[api/catalog/media] not implemented yet — requested ${model}/${id}/${field}`);
  res.status(501).json({ error: "Odoo media proxy not implemented yet" });
}
