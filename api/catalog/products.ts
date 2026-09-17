// Vercel serverless function: GET /api/catalog/products
//
// When Odoo is configured, genuinely calls it (server/odoo/fetchProducts.ts) — see
// Documentations MD/odoo-live-catalog-integration.md for the query/pagination model and its known
// limitations. Falls back to the local mock catalog only when Odoo is NOT configured at all (dev
// convenience); if Odoo IS configured but the call fails, returns a controlled 502 rather than
// silently serving mock data (spec section 18 — never show fake price/stock in that state).
//
// Typed loosely (`any` req/res) rather than importing `@vercel/node` — see server/odoo/client.ts's
// header comment; this file sits outside tsconfig.app.json's `include`, so `npm run build` doesn't
// type-check it (Vercel does, independently, at deploy time).

import { isOdooConfigured } from "../../server/odoo/client";
import { fetchOdooProductsPage } from "../../server/odoo/fetchProducts";
import { products as mockProducts } from "../../src/data/products";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

export default async function handler(req: any, res: any) {
  const { vehicle, category, brand, tag, q, limit, page, offset } = req.query ?? {};

  const parsedLimit = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));
  const parsedPage = Math.max(1, Number(page) || 1);
  const parsedOffset = offset !== undefined ? Math.max(0, Number(offset) || 0) : (parsedPage - 1) * parsedLimit;

  if (isOdooConfigured()) {
    try {
      const { items, total } = await fetchOdooProductsPage({
        vehicle: vehicle ? String(vehicle) : undefined,
        category: category ? String(category) : undefined,
        brand: brand ? String(brand) : undefined,
        tag: tag ? String(tag) : undefined,
        q: q ? String(q) : undefined,
        offset: parsedOffset,
        limit: parsedLimit,
      });
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
      res.setHeader("X-Total-Count", String(total));
      res.setHeader("X-Page", String(parsedPage));
      res.setHeader("X-Page-Size", String(parsedLimit));
      res.status(200).json(items);
    } catch (err) {
      console.error("[api/catalog/products] Odoo query failed:", err instanceof Error ? err.message : err);
      res.status(502).json({ error: "Catalog temporarily unavailable" });
    }
    return;
  }

  // Not configured — explicit dev/mock fallback. Never reached once ODOO_* env vars are set.
  try {
    let list = mockProducts;
    if (vehicle) list = list.filter((p) => p.vehicle === vehicle);
    if (category) list = list.filter((p) => p.categorySlug === category);
    if (brand) list = list.filter((p) => p.brandSlug === brand);
    if (tag) list = list.filter((p) => p.tag === tag);
    if (q) {
      const needle = String(q).toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(needle));
    }
    const total = list.length;
    list = list.slice(parsedOffset, parsedOffset + parsedLimit);

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.setHeader("X-Total-Count", String(total));
    res.setHeader("X-Page", String(parsedPage));
    res.setHeader("X-Page-Size", String(parsedLimit));
    res.status(200).json(list);
  } catch (err) {
    console.error("[api/catalog/products]", err);
    res.status(500).json({ error: "Failed to load products" });
  }
}
