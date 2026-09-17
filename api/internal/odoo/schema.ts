// Vercel serverless function: GET /api/internal/odoo/schema
//
// Server-only diagnostic — runs `fields_get` + a tiny `search_read` (id/name/display_name only)
// against the models the catalog integration cares about (see
// server/odoo/introspect.ts#CANDIDATE_MODELS). This is the ONLY legitimate way to fill in
// Documentations MD/odoo-schema-report.md's "VERIFIED" column — do not hand-edit that file with
// assumed field names. Gated the same way as health.ts (see server/odoo/internalAccessGuard.ts).

import { isInternalAccessAllowed } from "../../../server/odoo/internalAccessGuard";
import { isOdooConfigured } from "../../../server/odoo/client";
import { introspectOdooSchema } from "../../../server/odoo/introspect";

export default async function handler(req: any, res: any) {
  const access = isInternalAccessAllowed(req);
  if (!access.allowed) {
    res.status(403).json({ error: access.reason ?? "Forbidden" });
    return;
  }
  if (!isOdooConfigured()) {
    res.status(503).json({ error: "Odoo not configured" });
    return;
  }

  try {
    const report = await introspectOdooSchema();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(report);
  } catch (err) {
    console.error("[api/internal/odoo/schema]", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Schema introspection failed" });
  }
}
