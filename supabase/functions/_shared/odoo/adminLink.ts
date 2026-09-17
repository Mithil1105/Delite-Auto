// Deno port of server/odoo/adminLink.ts's pure string logic (never imported cross-runtime — Node
// and Deno each get their own copy, same reasoning as _shared/odoo/client.ts vs server/odoo/client.ts).
//
// Odoo's web client record URL scheme changed between versions: `/odoo/<model>/<id>` on 17.0+,
// `/web#model=<model>&id=<id>&view_type=form` on 16.0 and earlier. This instance is confirmed
// `19.0+e` (see Documentations MD/odoo-schema-report.md) — "modern" is no longer a guess.
export function buildOdooAdminUrl(baseUrl: string, model: string, odooId: number): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  return `${trimmed}/odoo/${encodeURIComponent(model)}/${odooId}`;
}
