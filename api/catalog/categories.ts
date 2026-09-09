// Vercel serverless function: GET /api/catalog/categories
//
// See api/catalog/products.ts for the Odoo-fallback rationale and the `@vercel/node` typing note.

import { isOdooConfigured } from "../../server/odoo/client";
import { categories } from "../../src/data/categories";

export default async function handler(_req: any, res: any) {
  try {
    if (isOdooConfigured()) {
      // TODO: real `odooExecuteKw("product.category", "search_read", ...)` call once field
      // mappings are confirmed. Serving the local category list until then.
      console.warn("[api/catalog/categories] Odoo is configured but the real query path isn't implemented yet — serving mock data");
    }

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json(categories);
  } catch (err) {
    console.error("[api/catalog/categories]", err);
    res.status(500).json({ error: "Failed to load categories" });
  }
}
