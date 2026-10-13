// supabase/functions/catalog-categories/index.ts
//
// GET /functions/v1/catalog-categories
//
// Real product.public.category records — the model is confirmed FLAT on this instance (every
// record's parent_id is false), so no hierarchy is fabricated. Each row carries a `role`
// ("vehicle" | "brand" | "other") derived from the verified classification config in
// _shared/odoo/catalog.ts — Delite metadata, never written back to Odoo, never duplicating the
// category's own name (always read live from Odoo). `imageUrl` always points at Odoo's own
// category image via the catalog-media proxy (added so a curated homepage category shows its real
// Odoo image by default — see Documentations MD/frontend-foundation-uiux-refactor.md,
// "Category image fix" — previously the frontend had no way to show it at all, only a manually
// uploaded CMS override).

import { getOdooConfig, odooExecuteKw, odooSearchRead } from "../_shared/odoo/client.ts";
import { CATALOG_ELIGIBILITY_DOMAIN, BRAND_CATEGORY_IDS, buildMediaUrl, normalizeCategoryRecord } from "../_shared/odoo/catalog.ts";
import type { OdooPublicCategoryRecord } from "../_shared/odoo/types.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// In-isolate response cache — categories (and their counts) change rarely relative to page views.
// A warm isolate reuses this for 5 minutes instead of re-hitting Odoo on every request; a cold
// start or expiry just rebuilds it once. Same pattern/TTL as _shared/odoo/catalog.ts's
// getCategoryNameMap cache. Performance pass, 2026-10-13 — see
// Documentations MD/storefront-performance-2026-10.md.
let responseCache: { expiresAt: number; body: string } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const config = getOdooConfig();
  if (!config) return json({ error: "Catalog not configured" }, 501);

  if (responseCache && responseCache.expiresAt > Date.now()) {
    return new Response(responseCache.body, { status: 200, headers: RESPONSE_HEADERS });
  }

  try {
    const records = await odooSearchRead<OdooPublicCategoryRecord>(config, "product.public.category", [], ["id", "name", "parent_id", "write_date"], {
      order: "name asc",
      limit: 1000,
    });
    // `imageUrl` is just a URL string pointing at the existing catalog-media proxy (same pattern
    // every product image already uses) — never the base64 bytes themselves, so this list stays
    // cheap regardless of category count. `cover_image` (NOT the standard image_* fields — see
    // _shared/odoo/media.ts) is confirmed live to hold every real category's actual photo on this
    // instance. A category with no image set in Odoo gets a URL that 404s when actually requested;
    // callers (CategoryIconStrip) fall back to a generic icon on that, exactly like a missing
    // product image would.
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const writeDateById = new Map(records.map((r) => [r.id, r.write_date] as const));
    const withRole = records.map(normalizeCategoryRecord).map((cat) => ({
      ...cat,
      imageUrl: buildMediaUrl(supabaseUrl, "product.public.category", cat.id, "cover_image", writeDateById.get(cat.id)),
    }));

    // Real, storefront-honest counts — same eligibility domain the actual product listing uses, so
    // "42 products" here matches what a customer filtering by that brand would actually see.
    // Previously: one sequential search_count Odoo call PER brand category (27 of them) with a
    // 250ms sleep before each — measured at ~3s of the ~3.1s this endpoint took, confirmed via a
    // live production waterfall. Replaced with a SINGLE read_group call, grouped by
    // public_categ_ids — proven live (odoo-schema's categoryReadGroupProbe) to return the exact
    // same per-category counts as the old per-category search_count loop. Grouping by a many2many
    // field fans out one row per category any matching product belongs to (not just brand
    // categories), so the result is filtered down to only the real brand ids afterward.
    const brandIds = withRole.filter((c) => c.role === "brand").map((c) => c.id);
    const countByBrandId = new Map<number, number>();
    if (brandIds.length > 0) {
      const groups = await odooExecuteKw<{ public_categ_ids?: [number, string]; public_categ_ids_count?: number }[]>(
        config,
        "product.template",
        "read_group",
        [[...CATALOG_ELIGIBILITY_DOMAIN, ["public_categ_ids", "in", brandIds]], ["public_categ_ids"], ["public_categ_ids"]],
        {}
      );
      for (const g of groups) {
        const catId = g.public_categ_ids?.[0];
        if (typeof catId === "number" && BRAND_CATEGORY_IDS.includes(catId) && typeof g.public_categ_ids_count === "number") {
          countByBrandId.set(catId, g.public_categ_ids_count);
        }
      }
    }
    const categories = withRole.map((cat) => (cat.role === "brand" ? { ...cat, productCount: countByBrandId.get(cat.id) ?? 0 } : cat));

    const body = JSON.stringify({ categories });
    responseCache = { expiresAt: Date.now() + CACHE_TTL_MS, body };
    return new Response(body, { status: 200, headers: RESPONSE_HEADERS });
  } catch (err) {
    console.error("[catalog-categories]", err instanceof Error ? err.message : err);
    return json({ error: "Categories temporarily unavailable" }, 502);
  }
});

const RESPONSE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
  ...CORS_HEADERS,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
