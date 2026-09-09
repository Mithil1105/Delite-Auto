// Vercel serverless function: GET /api/catalog/products
//
// Falls back to the local mock catalog until Odoo is configured (see
// server/odoo/client.ts#isOdooConfigured) — this keeps the endpoint genuinely functional today
// rather than 500ing, while staying honest that no real Odoo call has been wired up yet.
//
// Typed loosely (`any` req/res) rather than importing `@vercel/node` — that package isn't a
// project dependency yet; add it (`npm i -D @vercel/node`) and swap in `VercelRequest`/
// `VercelResponse` before relying on this in production. This file sits outside `tsconfig.app.json`'s
// `include` (see tsconfig.app.json — only "src"), so it isn't checked by `npm run build` locally;
// Vercel type-checks it independently at deploy time.

import { isOdooConfigured } from "../../server/odoo/client";
import { products as mockProducts } from "../../src/data/products";

export default async function handler(req: any, res: any) {
  try {
    const { vehicle, category, brand, tag, q, limit } = req.query ?? {};

    if (isOdooConfigured()) {
      // TODO: replace this branch with a real `odooExecuteKw("product.template", "search_read", ...)`
      // call + `normalizeProduct()` once field mappings are confirmed against this store's Odoo
      // instance. Deliberately not attempted here — no credentials were available to verify the
      // real shape, and a guessed mapping would be worse than the honest mock fallback below.
      console.warn("[api/catalog/products] Odoo is configured but the real query path isn't implemented yet — serving mock data");
    }

    let list = mockProducts;
    if (vehicle) list = list.filter((p) => p.vehicle === vehicle);
    if (category) list = list.filter((p) => p.categorySlug === category);
    if (brand) list = list.filter((p) => p.brandSlug === brand);
    if (tag) list = list.filter((p) => p.tag === tag);
    if (q) {
      const needle = String(q).toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(needle));
    }
    if (limit) list = list.slice(0, Number(limit));

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.status(200).json(list);
  } catch (err) {
    console.error("[api/catalog/products]", err);
    res.status(500).json({ error: "Failed to load products" });
  }
}
