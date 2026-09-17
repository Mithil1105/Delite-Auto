/**
 * Builds the URL to a product's Odoo backend record — for a future "OPEN IN ODOO ↗" button in
 * Delite Admin (not built in this pass — see spec section 33). Deliberately NOT exposed straight
 * to the browser: `ODOO_BASE_URL` is server-only, so a future admin API route would call this
 * server-side and return just the constructed `url`, never the base URL as its own field.
 *
 * ⚠️ Odoo's web client record URL scheme changed between versions — `/odoo/<model>/<id>` on
 * 17.0+, `/web#model=<model>&id=<id>&view_type=form` on 16.0 and earlier. Which one this store
 * needs is NOT verified (no live connection was reachable — see
 * Documentations MD/odoo-schema-report.md); `version` defaults to `"modern"` but must be
 * confirmed (e.g. via the instance's own About/version page, or `GET
 * /api/internal/odoo/health`'s future version field) before this is wired to a real button.
 */
export function buildOdooAdminUrl(baseUrl: string, model: string, odooId: number, version: "modern" | "legacy" = "modern"): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  if (version === "legacy") {
    return `${trimmed}/web#model=${encodeURIComponent(model)}&id=${odooId}&view_type=form`;
  }
  return `${trimmed}/odoo/${encodeURIComponent(model)}/${odooId}`;
}
