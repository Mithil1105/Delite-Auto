import { odooSearchCount, odooSearchRead } from "./client";
import { getProductTemplateFields } from "./productFields";
import { normalizeProduct } from "./normalizeProduct";
import { fetchOdooCategories } from "./fetchCategories";
import type { Product } from "../../src/data/types";
import type { OdooProductTemplateRecord } from "./types";

export interface OdooProductQuery {
  vehicle?: string;
  category?: string;
  brand?: string;
  tag?: string;
  q?: string;
  offset: number;
  limit: number;
}

export interface OdooProductPage {
  items: Product[];
  total: number;
}

/**
 * Resolves a category slug to a real Odoo domain clause. `categ_id` (the standard many2one on
 * `product.template` to `product.category`) and `public_categ_ids` (the standard many2many to
 * `product.public.category`, that field's own name since the Website/eCommerce module added it in
 * Odoo 13.0) are both documented, near-universal Odoo fields — not guesses — so once we know
 * which category model this store's categories actually came from (`fetchOdooCategories`'s
 * `sourceModel`), building a real domain clause is safe. Returns `null` if the slug doesn't match
 * any real category (a genuine "no such category," not "ignore the filter").
 */
async function buildCategoryDomainClause(categorySlug: string): Promise<unknown[] | null> {
  const { categories, sourceModel } = await fetchOdooCategories();
  const match = categories.find((c) => c.slug === categorySlug);
  if (!match || match.odooId === undefined) return null;
  return sourceModel === "product.public.category" ? [["public_categ_ids", "in", [match.odooId]]] : [["categ_id", "=", match.odooId]];
}

/**
 * Fetches one page of products from Odoo, filtered server-side wherever the backing Odoo field is
 * actually known:
 * - `sale_ok = true` always, `name ilike` for `q` — both standard fields.
 * - `category` — a real domain clause via `buildCategoryDomainClause` (see above). `total` (from
 *   `search_count` against the SAME domain) is therefore accurate for a category-filtered query.
 *
 * `brand`/`vehicle` have NO verified Odoo field yet (see `customFieldMap.ts` /
 * Documentations MD/odoo-schema-report.md) — not just an unknown name, but an unknown *type*
 * (many2one vs. char/selection determines the correct domain operator/value shape), so building a
 * domain clause would be guessing, which the integration explicitly must not do. These remain a
 * post-normalization filter on the fetched page only: `total` in that case reflects the
 * category/search domain alone, not further reduced by the brand/vehicle post-filter — the
 * honest number we can actually compute without fetching the entire catalog. See
 * Documentations MD/odoo-live-catalog-integration.md, "Known missing fields" for the upgrade path
 * once those fields are confirmed.
 */
export async function fetchOdooProductsPage(query: OdooProductQuery): Promise<OdooProductPage> {
  const domain: unknown[] = [["sale_ok", "=", true]];
  if (query.q) domain.push(["name", "ilike", query.q]);

  if (query.category) {
    const categoryClause = await buildCategoryDomainClause(query.category);
    if (!categoryClause) return { items: [], total: 0 };
    domain.push(...categoryClause);
  }

  const fields = getProductTemplateFields();
  const [records, total] = await Promise.all([
    odooSearchRead<OdooProductTemplateRecord & Record<string, unknown>>("product.template", domain, fields, {
      offset: query.offset,
      limit: query.limit,
      order: "id asc",
    }),
    odooSearchCount("product.template", domain),
  ]);

  let items = records.map(normalizeProduct);
  if (query.brand) items = items.filter((p) => p.brandSlug === query.brand);
  if (query.vehicle) items = items.filter((p) => p.vehicle === query.vehicle);
  // `tag` (new/trending/bestseller) has no Odoo equivalent at all — not filtered.

  return { items, total };
}
