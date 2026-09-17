// scripts/odoo-health-local.ts
//
// Local, Docker-free way to test freshly-typed Odoo credentials from `.env.local` BEFORE
// deciding whether to push them up to the Supabase project's secrets. Reuses the exact same
// check `api/internal/odoo/health.ts` runs in production — no logic duplicated here, no secret
// values printed (verifyOdooConnection() only ever returns booleans/uid/error message, see its
// own doc comment). Run via:
//
//   npm run odoo:health:local
//
// which loads `.env.local` with Node's native --env-file flag (Node 20.6+) — no dotenv
// dependency needed. See Documentations MD/odoo-supabase-edge-functions.md.

import { verifyOdooConnection } from "../server/odoo/verifyConnection.ts";

const result = await verifyOdooConnection();
console.log(JSON.stringify(result, null, 2));

if (!result.configured) {
  console.error("\nNot configured — set ODOO_BASE_URL/ODOO_DATABASE/ODOO_USERNAME/ODOO_API_KEY in .env.local.");
  process.exit(1);
}
if (!result.reachable) {
  console.error("\nStage failed: reachable (base URL not responding).");
  process.exit(1);
}
if (!result.authenticated) {
  console.error("\nStage failed: authenticated (ODOO_DATABASE/ODOO_USERNAME/ODOO_API_KEY rejected by Odoo).");
  process.exit(1);
}
if (!result.canReadCatalog) {
  console.error("\nAuthenticated, but stage failed: canReadCatalog (uid can't search.count product.template).");
  process.exit(1);
}

console.log("\nAll stages passed: configured, reachable, authenticated, canReadCatalog.");
