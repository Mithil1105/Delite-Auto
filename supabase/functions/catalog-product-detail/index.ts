// supabase/functions/catalog-product-detail/index.ts
//
// GET /functions/v1/catalog-product-detail?slug=floor-mat-set--442  (or ?id=442)
//
// Resolves one product by its stable slug (`name--odooTemplateId`) or a raw template id, and
// returns the full normalized CatalogProduct: all purchasable variants with real attribute
// labels, primary + gallery media, category/brand/vehicle/fitment. A slug that doesn't parse, or
// an id Odoo doesn't have, is a genuine 404 — never silently substituted for a different product.
// Also enforces the same catalog eligibility domain as the list endpoint, so a non-catalog
// record (or an unpublished product) can't be reached by guessing its id either.

import { getOdooConfig, odooSearchRead } from "../_shared/odoo/client.ts";
import { normalizeTemplates } from "../_shared/odoo/fetch.ts";
import { CATALOG_ELIGIBILITY_DOMAIN, odooIdFromSlug, TEMPLATE_DETAIL_FIELDS } from "../_shared/odoo/catalog.ts";
import type { OdooProductTemplateRecord } from "../_shared/odoo/types.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const config = getOdooConfig();
  if (!config) return json({ error: "Catalog not configured" }, 501);

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const idParam = url.searchParams.get("id");

  const templateId = slug ? odooIdFromSlug(slug) : idParam ? Number(idParam) : null;
  if (templateId === null || !Number.isInteger(templateId) || templateId <= 0) {
    return json({ error: "Provide a valid slug or id" }, 400);
  }

  try {
    const domain = [["id", "=", templateId], ...CATALOG_ELIGIBILITY_DOMAIN];
    const templates = await odooSearchRead<OdooProductTemplateRecord & Record<string, unknown>>(config, "product.template", domain, TEMPLATE_DETAIL_FIELDS, {
      limit: 1,
    });
    const template = templates[0];
    if (!template) return json({ error: "Product not found" }, 404);

    await sleep(150);
    const [product] = await normalizeTemplates(config, [template], { includeGallery: true, supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "" });

    return new Response(JSON.stringify(product), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300", ...CORS_HEADERS },
    });
  } catch (err) {
    console.error("[catalog-product-detail]", err instanceof Error ? err.message : err);
    return json({ error: "Catalog temporarily unavailable" }, 502);
  }
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
