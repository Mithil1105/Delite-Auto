import type { Category, Product, ProductDetail, Vehicle } from "../../data/types";

export interface ProductListQuery {
  vehicle?: Vehicle;
  categorySlug?: string;
  brandSlug?: string;
  tag?: string;
  search?: string;
  limit?: number;
}

/**
 * The abstraction React pages/components call for catalog data — never `src/data/products.ts`
 * directly, and never raw Odoo records. Two implementations exist today:
 * `mockCatalogService` (synchronous local data, wrapped in resolved promises) and
 * `httpCatalogService` (calls `/api/catalog/*`, which itself falls back to mock data until Odoo
 * credentials are configured — see `server/odoo/client.ts`). `catalogService.ts` picks between
 * them via `VITE_CATALOG_SOURCE`.
 */
export interface CatalogService {
  getProducts(query?: ProductListQuery): Promise<Product[]>;
  getProductBySlug(slug: string): Promise<ProductDetail | null>;
  getCategories(): Promise<Category[]>;
  getRelatedProducts(product: Product, count?: number): Promise<Product[]>;
}
