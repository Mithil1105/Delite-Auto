import type { CatalogService, PagedProductQuery, PagedProductResult, ProductListQuery } from "./types";
import type { Category, Product, ProductDetail } from "../../data/types";

/**
 * Calls the `/api/catalog/*` Vercel functions (see `api/catalog/`) instead of reading local data
 * directly. Those endpoints themselves fall back to the mock catalog server-side until Odoo
 * credentials are configured, so switching `VITE_CATALOG_SOURCE=http` is safe at any point —
 * it changes where the data is read from (a network round-trip) before it changes what data
 * comes back.
 */
function buildQuery(query: ProductListQuery = {}): string {
  const params = new URLSearchParams();
  if (query.vehicle) params.set("vehicle", query.vehicle);
  if (query.categorySlug) params.set("category", query.categorySlug);
  if (query.brandSlug) params.set("brand", query.brandSlug);
  if (query.tag) params.set("tag", query.tag);
  if (query.search) params.set("q", query.search);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Catalog API request failed: ${res.status} ${url}`);
  return (await res.json()) as T;
}

export const httpCatalogService: CatalogService = {
  getProducts: (query) => fetchJson<Product[]>(`/api/catalog/products${buildQuery(query)}`),

  /**
   * Legacy path only — kept for parity/rollback, not production (see catalogService.ts). The
   * underlying `/api/catalog/products` route has no id-based category/brand/fitment filters or
   * real pagination, so this fetches a generously-sized page and paginates/sorts client-side
   * rather than pretending to support filters it can't honor server-side.
   */
  async getProductsPage(query: PagedProductQuery): Promise<PagedProductResult> {
    const list = await fetchJson<Product[]>(`/api/catalog/products${buildQuery({ search: query.q, vehicle: query.vehicle, limit: 200 })}`);
    const sorted = [...list];
    if (query.sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
    if (query.sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
    if (query.sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    const total = sorted.length;
    const start = (query.page - 1) * query.pageSize;
    const items = sorted.slice(start, start + query.pageSize);
    return { items, page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
  },

  async getProductBySlug(slug: string) {
    try {
      return await fetchJson<ProductDetail>(`/api/catalog/products/${encodeURIComponent(slug)}`);
    } catch {
      return null;
    }
  },

  getCategories: () => fetchJson<Category[]>("/api/catalog/categories"),

  async getRelatedProducts(product: Product, count = 4) {
    const list = await fetchJson<Product[]>(
      `/api/catalog/products${buildQuery({ categorySlug: product.categorySlug, limit: count + 1 })}`
    );
    return list.filter((p) => p.id !== product.id).slice(0, count);
  },
};
