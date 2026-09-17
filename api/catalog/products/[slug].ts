// Vercel serverless function: GET /api/catalog/products/:slug
//
// See api/catalog/products.ts for the Odoo-fallback/failure-mode rationale. Odoo-backed slugs are
// `name--odooId` (server/odoo/normalizeProduct.ts#buildStableSlug); a slug that doesn't parse to
// an id, or an id Odoo doesn't have, is a genuine 404 — never silently substituted for a
// different product (spec section 14).

import { isOdooConfigured } from "../../../server/odoo/client";
import { fetchOdooProductDetailBySlug } from "../../../server/odoo/fetchProductDetail";
import { productBySlug } from "../../../src/data/products";
import { productImages } from "../../../src/lib/productImages";
import { categoryImages } from "../../../src/lib/categoryImages";
import type { ProductMedia } from "../../../src/data/types";

export default async function handler(req: any, res: any) {
  const { slug } = req.query ?? {};

  if (isOdooConfigured()) {
    try {
      const detail = await fetchOdooProductDetailBySlug(String(slug));
      if (!detail) {
        res.status(404).json({ error: "Product not found" });
        return;
      }
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
      res.status(200).json(detail);
    } catch (err) {
      console.error("[api/catalog/products/:slug] Odoo query failed:", err instanceof Error ? err.message : err);
      res.status(502).json({ error: "Catalog temporarily unavailable" });
    }
    return;
  }

  // Not configured — explicit dev/mock fallback.
  try {
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
