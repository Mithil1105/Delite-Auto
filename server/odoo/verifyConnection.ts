import { checkBaseUrlReachable, getConfigPresence, isOdooConfigured, odooAuthenticate, odooSearchCount } from "./client";

export interface OdooHealthResult {
  configured: boolean;
  /** Which ODOO_* env vars are present — booleans only, never values. */
  configPresence: ReturnType<typeof getConfigPresence>;
  reachable: boolean | null;
  authenticated: boolean | null;
  uid: number | null;
  /** A harmless `search_count` on `product.template` — proves the authenticated user can read the catalog model. */
  canReadCatalog: boolean | null;
  error: string | null;
}

/**
 * The actual health-check logic behind `api/internal/odoo/health.ts` — pulled out so it can also
 * be exercised by an opt-in Vitest integration test (`server/odoo/liveConnection.integration.test.ts`)
 * without going through an HTTP handler. Never returns anything beyond booleans/uid — no
 * database/username/API key, no raw Odoo error payloads (only `Error.message`, which this
 * codebase's own error paths never populate with the secret itself — see client.ts).
 */
export async function verifyOdooConnection(): Promise<OdooHealthResult> {
  const configPresence = getConfigPresence();
  const configured = isOdooConfigured();
  const result: OdooHealthResult = {
    configured,
    configPresence,
    reachable: null,
    authenticated: null,
    uid: null,
    canReadCatalog: null,
    error: null,
  };
  if (!configured) return result;

  const baseUrl = process.env.ODOO_BASE_URL as string;
  const reach = await checkBaseUrlReachable(baseUrl);
  result.reachable = reach.reachable;
  if (!reach.reachable) {
    result.error = `Base URL not reachable: ${reach.error ?? "unknown network error"}`;
    return result;
  }

  try {
    result.uid = await odooAuthenticate();
    result.authenticated = true;
  } catch (err) {
    result.authenticated = false;
    result.error = err instanceof Error ? err.message : "Authentication failed";
    return result;
  }

  try {
    await odooSearchCount("product.template", []);
    result.canReadCatalog = true;
  } catch (err) {
    result.canReadCatalog = false;
    result.error = err instanceof Error ? err.message : "product.template read failed";
  }

  return result;
}
