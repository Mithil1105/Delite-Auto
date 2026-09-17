// Vercel serverless function: GET /api/catalog/categories
//
// See api/catalog/products.ts for the Odoo-fallback/failure-mode rationale. Tries
// product.public.category then product.category — see server/odoo/fetchCategories.ts.

import { isOdooConfigured } from "../../server/odoo/client";
import { fetchOdooCategories } from "../../server/odoo/fetchCategories";
import { categories } from "../../src/data/categories";

export default async function handler(_req: any, res: any) {
  if (isOdooConfigured()) {
    try {
      const { categories: items } = await fetchOdooCategories();
      res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
      res.status(200).json(items);
    } catch (err) {
      console.error("[api/catalog/categories] Odoo query failed:", err instanceof Error ? err.message : err);
      res.status(502).json({ error: "Categories temporarily unavailable" });
    }
    return;
  }

  // Not configured — explicit dev/mock fallback.
  try {
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json(categories);
  } catch (err) {
    console.error("[api/catalog/categories]", err);
    res.status(500).json({ error: "Failed to load categories" });
  }
}
