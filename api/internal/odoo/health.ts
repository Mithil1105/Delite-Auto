// Vercel serverless function: GET /api/internal/odoo/health
//
// Server-only diagnostic — verifies the configured Odoo connection without ever returning
// database/username/API key or a raw Odoo error payload. See
// server/odoo/internalAccessGuard.ts for the production access gate and
// server/odoo/verifyConnection.ts for the actual check logic (shared with the opt-in integration
// test at server/odoo/liveConnection.integration.test.ts).
//
// Typed loosely (`any` req/res) — see api/catalog/products.ts for why (@vercel/node not installed).

import { isInternalAccessAllowed } from "../../../server/odoo/internalAccessGuard";
import { verifyOdooConnection } from "../../../server/odoo/verifyConnection";

export default async function handler(req: any, res: any) {
  const access = isInternalAccessAllowed(req);
  if (!access.allowed) {
    res.status(403).json({ error: access.reason ?? "Forbidden" });
    return;
  }

  try {
    const result = await verifyOdooConnection();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(result);
  } catch (err) {
    console.error("[api/internal/odoo/health]", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Health check failed unexpectedly" });
  }
}
