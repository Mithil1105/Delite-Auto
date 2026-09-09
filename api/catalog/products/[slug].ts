// Vercel serverless function: GET /api/catalog/products/:slug
//
// See api/catalog/products.ts for the Odoo-fallback rationale and the `@vercel/node` typing note.

import { isOdooConfigured } from "../../../server/odoo/client";
import { productBySlug } from "../../../src/data/products";
import { productImages } from "../../../src/lib/productImages";
import { categoryImages } from "../../../src/lib/categoryImages";
import type { ProductMedia } from "../../../src/data/types";

export default async function handler(req: any, res: any) {
  const { slug } = req.query ?? {};
  try {
    if (isOdooConfigured()) {
      // TODO: real `odooExecuteKw` read + `normalizeProductDetail()` — see api/catalog/products.ts.
      console.warn("[api/catalog/products/:slug] Odoo is configured but the real query path isn't implemented yet — serving mock data");
    }

    const product = productBySlug(String(slug));
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const src = productImages[product.id] ?? categoryImages[product.categorySlug];
    const media: ProductMedia[] = src ? [{ id: `${product.id}-0`, type: "image", src, alt: product.name }] : [];

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({ ...product, media });
  } catch (err) {
    console.error("[api/catalog/products/:slug]", err);
    res.status(500).json({ error: "Failed to load product" });
  }
}
