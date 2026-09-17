import type { Category, Product, ProductDetail, Vehicle } from "../../data/types";

export interface ProductListQuery {
  vehicle?: Vehicle;
  categorySlug?: string;
  brandSlug?: string;
  tag?: string;
  search?: string;
  limit?: number;
}

export type ProductSort = "relevance" | "price-asc" | "price-desc" | "name";

/**
 * Server-side paged/filtered query — the shape `Shop.tsx` drives against real Odoo data.
 * `categoryId`/`brandCategoryId`/`fitmentValueId` are real Odoo ids (see
 * Documentations MD/odoo-real-catalog.md), never name/slug matches. `mockCatalogService` supports
 * this too (filtering its local array in-memory) so both sources share one code path in
 * `Shop.tsx`.
 */
export interface PagedProductQuery {
  page: number;
  pageSize: number;
  q?: string;
  categoryId?: number;
  vehicle?: "car" | "bike";
  brandCategoryId?: number;
  fitmentValueId?: number;
  sort?: ProductSort;
  /** Mock-catalog-only convenience filters (slug-based) — `supabaseCatalogService` ignores these; `mockCatalogService` is the only implementation that understands them. */
  categorySlug?: string;
  brandSlug?: string;
  tag?: string;
}

export interface PagedProductResult {
  items: Product[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * The abstraction React pages/components call for catalog data — never `src/data/products.ts`
 * directly, and never raw Odoo records. Three implementations exist: `mockCatalogService`
 * (synchronous local data, wrapped in resolved promises), `httpCatalogService` (legacy
 * `/api/catalog/*` Vercel routes — kept for parity/rollback, not the production path), and
 * `supabaseCatalogService` (real Odoo data via Supabase Edge Functions — see
 * Documentations MD/odoo-real-catalog.md). `catalogService.ts` picks between them via
 * `VITE_CATALOG_SOURCE`.
 */
export interface CatalogService {
  getProducts(query?: ProductListQuery): Promise<Product[]>;
  /** Real server-side pagination + filtering — what `Shop.tsx` uses. `mockCatalogService` emulates it by filtering/paging its in-memory array. */
  getProductsPage(query: PagedProductQuery): Promise<PagedProductResult>;
  getProductBySlug(slug: string): Promise<ProductDetail | null>;
  getCategories(): Promise<Category[]>;
  getRelatedProducts(product: Product, count?: number): Promise<Product[]>;
}
