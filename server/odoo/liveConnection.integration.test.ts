import { describe, expect, it } from "vitest";
import { isOdooConfigured } from "./client";
import { verifyOdooConnection } from "./verifyConnection";

/**
 * Opt-in integration test — only exercises a REAL Odoo instance, gated on `isOdooConfigured()`
 * (i.e. ODOO_BASE_URL/ODOO_DATABASE/ODOO_USERNAME/ODOO_API_KEY all present in the environment
 * running the tests). Never commit real credentials or a real Odoo response as a fixture — see
 * spec section 28 / `Documentations MD/odoo-live-catalog-integration.md`. In the environment this
 * integration was built in, no ODOO_* vars were ever set, so this suite is skipped every run —
 * that's expected, not a failure; see that doc's "Known gaps" for what still needs a real
 * connection to complete.
 */
describe.skipIf(!isOdooConfigured())("live Odoo connection (opt-in — requires ODOO_* env vars)", () => {
  it("authenticates and can read product.template", async () => {
    const result = await verifyOdooConnection();
    expect(result.configured).toBe(true);
    expect(result.reachable).toBe(true);
    expect(result.authenticated).toBe(true);
    expect(typeof result.uid).toBe("number");
    expect(result.canReadCatalog).toBe(true);
  }, 20000);
});
