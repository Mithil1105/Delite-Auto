// supabase/functions/catalog-products/index.ts
//
// GET /functions/v1/catalog-products?page=1&pageSize=24&q=...&category=25&vehicle=car&brand=24&fitment=123
//
// Real, server-side-filtered, paginated Odoo product listing. Filter-in-Odoo-domain-then-paginate
// — never fetch-then-filter-in-JS (see buildCatalogDomain in _shared/odoo/catalog.ts). Response
// shape: { items, page, pageSize, total, totalPages }.

import { getOdooConfig, odooExecuteKw, odooSearchRead } from "../_shared/odoo/client.ts";
import { normalizeTemplates } from "../_shared/odoo/fetch.ts";
import { BRAND_CATEGORY_IDS, buildCatalogDomain, TEMPLATE_LIST_FIELDS } from "../_shared/odoo/catalog.ts";
import type { OdooProductTemplateRecord } from "../_shared/odoo/types.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 60;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const config = getOdooConfig();
  if (!config) return json({ error: "Catalog not configured" }, 501);

  const url = new URL(req.url);
  const params = url.searchParams;

  const page = Math.max(1, Number(params.get("page")) || 1);
  const q = params.get("q")?.trim() || undefined;
  const vehicleRaw = params.get("vehicle");
  const vehicle = vehicleRaw === "car" || vehicleRaw === "bike" ? vehicleRaw : undefined;
  if (vehicleRaw && !vehicle) return json({ error: `Unsupported vehicle "${vehicleRaw}" — expected "car" or "bike"` }, 400);

  const categoryId = parsePositiveInt(params.get("category"));
  if (params.get("category") && categoryId === undefined) return json({ error: "category must be a positive integer Odoo category id" }, 400);

  const brandCategoryId = parsePositiveInt(params.get("brand"));
  if (params.get("brand") && brandCategoryId === undefined) return json({ error: "brand must be a positive integer Odoo category id" }, 400);
  if (brandCategoryId !== undefined && !BRAND_CATEGORY_IDS.includes(brandCategoryId)) {
    return json({ error: `Category ${brandCategoryId} is not classified as a brand` }, 400);
  }

  const fitmentValueId = parsePositiveInt(params.get("fitment"));
  if (params.get("fitment") && fitmentValueId === undefined) return json({ error: "fitment must be a positive integer attribute-value id" }, 400);

  // Resolves an explicit set of Odoo template ids in one request — used by CMS merchandising
  // rails (Featured/Trending/New Arrivals), which store only ids. Capped at MAX_PAGE_SIZE like
  // every other list here; a curated homepage rail is never that large in practice.
  const idsRaw = params.get("ids");
  let ids: number[] | undefined;
  if (idsRaw) {
    ids = idsRaw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, MAX_PAGE_SIZE);
    if (ids.length === 0) return json({ items: [], page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 });
  }

  // Defaults to fitting every requested id on one page when `ids` is given (a curated rail should
  // never be silently truncated to the generic default page size).
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(params.get("pageSize")) || (ids ? ids.length : DEFAULT_PAGE_SIZE)));

  const sortRaw = params.get("sort") ?? "relevance";
  const order = { relevance: "id asc", "price-asc": "list_price asc", "price-desc": "list_price desc", name: "name asc" }[sortRaw];
  if (!order) return json({ error: `Unsupported sort "${sortRaw}"` }, 400);

  try {
    const domain = buildCatalogDomain({ q, categoryId, vehicle, brandCategoryId, fitmentValueId, ids, offset: (page - 1) * pageSize, limit: pageSize });

    // Sequential, not Promise.all — this Odoo instance rate-limits (HTTP 429) under concurrent
    // RPC load (see Documentations MD/odoo-supabase-edge-functions.md); two small sequential
    // calls cost a negligible amount of latency compared to that risk.
    const total = await odooExecuteKw<number>(config, "product.template", "search_count", [domain]);
    const templates = await odooSearchRead<OdooProductTemplateRecord & Record<string, unknown>>(config, "product.template", domain, TEMPLATE_LIST_FIELDS, {
      offset: (page - 1) * pageSize,
      limit: pageSize,
      order,
    });

    await sleep(150);
    const items = await normalizeTemplates(config, templates, { includeGallery: false, supabaseUrl: getSupabaseUrl() });

    return new Response(JSON.stringify({ items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300", ...CORS_HEADERS },
    });
  } catch (err) {
    console.error("[catalog-products]", err instanceof Error ? err.message : err);
    return json({ error: "Catalog temporarily unavailable" }, 502);
  }
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInt(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function getSupabaseUrl(): string {
  return Deno.env.get("SUPABASE_URL") ?? "";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
