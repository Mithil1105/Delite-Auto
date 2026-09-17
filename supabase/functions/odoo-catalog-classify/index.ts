// supabase/functions/odoo-catalog-classify/index.ts
//
// One-off (but kept as a re-runnable diagnostic) live inspection used to FINALIZE the
// brand/vehicle/other classification of `product.public.category` records before writing them
// into `_shared/odoo/catalog.ts`'s config. Per the catalog-implementation spec: "Must inspect the
// complete public-category list and product membership before finalizing brand IDs, not guess by
// name alone." This endpoint:
//   1. Fetches EVERY product.public.category record (no 40-record sampling limit).
//   2. For each one, runs a real search_count against product.template's public_categ_ids to
//      confirm it actually has products linked to it (a "brand" name with zero real products
//      would be a red flag, not evidence).
// Protected the same way as odoo-schema (x-internal-token / INTERNAL_DIAGNOSTICS_TOKEN, fails
// closed). Never returns secrets. Read-only (search_read/search_count only).

import { getOdooConfig, odooExecuteKw, odooSearchRead } from "../_shared/odoo/client.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

interface CategoryRow {
  id: number;
  name: string;
  parent_id: [number, string] | false;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const requiredToken = Deno.env.get("INTERNAL_DIAGNOSTICS_TOKEN");
  if (!requiredToken) return json({ error: "Diagnostics disabled: INTERNAL_DIAGNOSTICS_TOKEN is not set" }, 403);
  if (req.headers.get("x-internal-token") !== requiredToken) return json({ error: "Missing or invalid x-internal-token header" }, 403);

  const config = getOdooConfig();
  if (!config) return json({ configured: false });

  try {
    const categories = await odooSearchRead<CategoryRow>(config, "product.public.category", [], ["id", "name", "parent_id"], {
      limit: 1000,
      order: "id asc",
    });

    const rows: Array<CategoryRow & { productCount: number }> = [];
    for (const cat of categories) {
      await sleep(300);
      const productCount = await odooExecuteKw<number>(config, "product.template", "search_count", [
        [["public_categ_ids", "in", [cat.id]]],
      ]);
      rows.push({ ...cat, productCount });
    }

    await sleep(300);
    const NON_CATALOG_FIELDS = ["id", "name", "active", "sale_ok", "website_published", "is_published", "categ_id", "public_categ_ids"];
    const knownNonCatalog = await odooSearchRead<Record<string, unknown>>(config, "product.template", [["id", "in", [1, 2, 3, 4, 5, 6, 7]]], NON_CATALOG_FIELDS);

    await sleep(300);
    const genuineCatalogSample = await odooSearchRead<Record<string, unknown>>(
      config,
      "product.template",
      [["public_categ_ids", "!=", false]],
      NON_CATALOG_FIELDS,
      { limit: 8, order: "id asc" }
    );

    await sleep(300);
    const STOCK_FIELDS = ["id", "name", "product_tmpl_id", "active", "qty_available", "virtual_available", "free_qty"];
    const qtyAvailablePositiveCount = await odooExecuteKw<number>(config, "product.product", "search_count", [[["qty_available", ">", 0]]]);
    await sleep(300);
    const freeQtyPositiveCount = await odooExecuteKw<number>(config, "product.product", "search_count", [[["free_qty", ">", 0]]]);
    await sleep(300);
    const virtualPositiveCount = await odooExecuteKw<number>(config, "product.product", "search_count", [[["virtual_available", ">", 0]]]);
    await sleep(300);
    const totalVariantCount = await odooExecuteKw<number>(config, "product.product", "search_count", [[]]);
    await sleep(300);
    const anyStockSample = await odooSearchRead<Record<string, unknown>>(
      config,
      "product.product",
      ["|", "|", ["qty_available", ">", 0], ["free_qty", ">", 0], ["virtual_available", ">", 0]],
      STOCK_FIELDS,
      { limit: 10 }
    );

    return json({
      configured: true,
      totalCategories: rows.length,
      categories: rows,
      knownNonCatalogRecords: knownNonCatalog,
      genuineCatalogSample,
      stockCheck: {
        totalVariantCount,
        qtyAvailablePositiveCount,
        freeQtyPositiveCount,
        virtualPositiveCount,
        anyStockSample,
      },
    });
  } catch (err) {
    return json({ configured: true, error: err instanceof Error ? err.message : "Classification introspection failed" }, 500);
  }
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
