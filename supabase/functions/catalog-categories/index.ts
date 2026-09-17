// supabase/functions/catalog-categories/index.ts
//
// GET /functions/v1/catalog-categories
//
// Real product.public.category records — the model is confirmed FLAT on this instance (every
// record's parent_id is false), so no hierarchy is fabricated. Each row carries a `role`
// ("vehicle" | "brand" | "other") derived from the verified classification config in
// _shared/odoo/catalog.ts — Delite metadata, never written back to Odoo, never duplicating the
// category's own name (always read live from Odoo).

import { getOdooConfig, odooExecuteKw, odooSearchRead } from "../_shared/odoo/client.ts";
import { CATALOG_ELIGIBILITY_DOMAIN, normalizeCategoryRecord } from "../_shared/odoo/catalog.ts";
import type { OdooPublicCategoryRecord } from "../_shared/odoo/types.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const config = getOdooConfig();
  if (!config) return json({ error: "Catalog not configured" }, 501);

  try {
    const records = await odooSearchRead<OdooPublicCategoryRecord>(config, "product.public.category", [], ["id", "name", "parent_id"], {
      order: "name asc",
      limit: 1000,
    });
    const withRole = records.map(normalizeCategoryRecord);

    // Real, storefront-honest counts — same eligibility domain the actual product listing uses,
    // so "42 products" here matches what a customer filtering by that brand would actually see.
    // Only for brand-role categories (the only place Brands.tsx needs a count); sequential with a
    // small delay, same rate-limit precaution as every other multi-call Odoo function in this repo.
    const categories = [];
    for (const cat of withRole) {
      if (cat.role !== "brand") {
        categories.push(cat);
        continue;
      }
      await sleep(250);
      const productCount = await odooExecuteKw<number>(config, "product.template", "search_count", [
        [...CATALOG_ELIGIBILITY_DOMAIN, ["public_categ_ids", "in", [cat.id]]],
      ]);
      categories.push({ ...cat, productCount });
    }

    return new Response(JSON.stringify({ categories }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400", ...CORS_HEADERS },
    });
  } catch (err) {
    console.error("[catalog-categories]", err instanceof Error ? err.message : err);
    return json({ error: "Categories temporarily unavailable" }, 502);
  }
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
