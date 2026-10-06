import type { CatalogService, PagedProductQuery, PagedProductResult, ProductListQuery } from "./types";
import type { Product, ProductDetail, ProductMedia } from "../../data/types";
import { products, productBySlug, relatedProducts } from "../../data/products";
import { categories } from "../../data/categories";
import { productImages } from "../../lib/productImages";
import { categoryImages } from "../../lib/categoryImages";

/**
 * Development/demo fallback: wraps the existing local `src/data/products.ts` catalog in the
 * `CatalogService` interface (as resolved promises, so callers don't need to special-case a
 * synchronous source). This is what the app uses by default (`VITE_CATALOG_SOURCE` unset or
 * "mock") and what `/api/catalog/*` itself falls back to server-side when Odoo isn't configured.
 *
 * Not the production source of truth once Odoo is wired up — see
 * `Documentations MD/figma-shop-product-odoo-integration.md`.
 */
function resolveImage(product: Product): string | undefined {
  return productImages[product.id] ?? categoryImages[product.categorySlug];
}

function toProductDetail(product: Product): ProductDetail {
  const src = resolveImage(product);
  const media: ProductMedia[] = src ? [{ id: `${product.id}-0`, type: "image", src, alt: product.name }] : [];
  return { ...product, media };
}

export const mockCatalogService: CatalogService = {
  async getProducts(query: ProductListQuery = {}) {
    let list = products;
    if (query.vehicle) list = list.filter((p) => p.vehicle === query.vehicle);
    if (query.categorySlug) list = list.filter((p) => p.categorySlug === query.categorySlug);
    if (query.brandSlug) list = list.filter((p) => p.brandSlug === query.brandSlug);
    if (query.tag) list = list.filter((p) => p.tag === query.tag);
    if (query.search) {
      const needle = query.search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(needle));
    }
    return query.limit ? list.slice(0, query.limit) : list;
  },

  /**
   * Emulates real server-side paging/filtering over the in-memory mock array. `categoryId`/
   * `brandCategoryId`/`fitmentValueId` are real-Odoo-id concepts the mock catalog predates (mock
   * data uses slugs, not numeric ids) — deliberately not supported here, not silently mismatched
   * against the wrong entry.
   */
  async getProductsPage(query: PagedProductQuery): Promise<PagedProductResult> {
    let list = products;
    if (query.ids) list = list.filter((p) => p.odooId !== undefined && query.ids!.includes(p.odooId));
    if (query.vehicle) list = list.filter((p) => p.vehicle === query.vehicle || p.vehicle === "universal");
    if (query.categorySlug) list = list.filter((p) => p.categorySlug === query.categorySlug);
    if (query.brandSlug) list = list.filter((p) => p.brandSlug === query.brandSlug);
    if (query.tag) list = list.filter((p) => p.tag === query.tag);
    if (query.q) {
      const needle = query.q.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle));
    }
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
    const product = productBySlug(slug);
    return product ? toProductDetail(product) : null;
  },

  async getCategories() {
    return categories;
  },

  async getRelatedProducts(product: Product, count = 4) {
    return relatedProducts(product, count);
  },
};
