// supabase/functions/admin-reviews-list/index.ts
//
// POST /functions/v1/admin-reviews-list — wraps public.admin_reviews_query (the server-side
// filter/search/sort/paginate RPC — see the migration
// 20260930090000_admin_payments_and_reviews_reporting.sql) and enriches each row with its real
// Odoo product name. That enrichment can only happen here, never inside the SQL function itself —
// Odoo is an external JSON-RPC service, not something Postgres can join against. Never persists a
// product name as a second source of truth; it's resolved fresh on every call (spec: product stays
// Odoo-owned).
//
// Auth: standard signed-in admin session; the RPC itself re-enforces owner/admin/support via
// private.analytics_require — this function's own role gate is defence in depth, not the only one.

import { getOdooConfig, odooRead } from "../_shared/odoo/client.ts";
import { requireAdmin } from "../_shared/auth/requireAdmin.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReviewRow {
  id: string;
  odoo_template_id: number;
  rating: number;
  title: string | null;
  body: string | null;
  status: string;
  created_at: string;
  user_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  moderated_by: string | null;
  moderated_at: string | null;
  product_name?: string;
}

interface Body {
  status?: string;
  ratingMin?: number;
  ratingMax?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireAdmin(req, ["owner", "admin", "support"]);
  if (auth instanceof Response) return auth;
  const { db } = auth;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const pageSize = Math.min(Math.max(body.pageSize ?? 50, 1), 200);
  const page = Math.max(body.page ?? 0, 0);

  const { data, error } = await db.rpc("admin_reviews_query", {
    p_status: body.status ?? null,
    p_rating_min: body.ratingMin ?? null,
    p_rating_max: body.ratingMax ?? null,
    p_start: body.dateFrom ?? null,
    p_end: body.dateTo ?? null,
    p_search: body.search ?? null,
    p_sort: body.sort ?? "newest",
    p_limit: pageSize,
    p_offset: page * pageSize,
  });
  if (error) {
    console.error("[admin-reviews-list] rpc failed", error.message);
    return json({ error: "Could not load reviews" }, 502);
  }

  const rows = (data?.rows ?? []) as ReviewRow[];
  const total = (data?.total ?? 0) as number;

  const odooConfig = getOdooConfig();
  if (odooConfig && rows.length > 0) {
    const templateIds = [...new Set(rows.map((r) => r.odoo_template_id))];
    try {
      const products = await odooRead<{ id: number; name: string }>(odooConfig, "product.template", templateIds, ["id", "name"]);
      const nameById = new Map(products.map((p) => [p.id, p.name]));
      for (const row of rows) row.product_name = nameById.get(row.odoo_template_id) ?? `Product #${row.odoo_template_id}`;
    } catch (err) {
      console.error("[admin-reviews-list] Odoo product name lookup failed", err instanceof Error ? err.message : err);
      for (const row of rows) row.product_name = `Product #${row.odoo_template_id}`;
    }
  } else {
    for (const row of rows) row.product_name = `Product #${row.odoo_template_id}`;
  }

  return json({ rows, total }, 200);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
