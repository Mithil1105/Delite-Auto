/**
 * Gates the internal diagnostic endpoints (`api/internal/odoo/*`). Neither endpoint returns
 * secrets, but the health check reveals whether Odoo is reachable/authenticated and the schema
 * endpoint reveals this store's actual field layout — more than an anonymous production visitor
 * should see. Open by default in development; in production, requires a matching
 * `x-internal-token` header against `INTERNAL_DIAGNOSTICS_TOKEN`. If that env var isn't set in
 * production, access is refused outright (fail closed, never fail open) — see
 * Documentations MD/odoo-live-catalog-integration.md.
 */
export function isInternalAccessAllowed(req: { headers?: Record<string, unknown> }): { allowed: boolean; reason?: string } {
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  if (!isProd) return { allowed: true };

  const token = process.env.INTERNAL_DIAGNOSTICS_TOKEN;
  if (!token) {
    return { allowed: false, reason: "Diagnostics disabled in production: INTERNAL_DIAGNOSTICS_TOKEN is not set" };
  }

  const provided = req.headers?.["x-internal-token"];
  if (provided !== token) {
    return { allowed: false, reason: "Missing or invalid x-internal-token header" };
  }

  return { allowed: true };
}
