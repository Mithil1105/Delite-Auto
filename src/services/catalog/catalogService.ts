import { mockCatalogService } from "./mockCatalogService";
import { httpCatalogService } from "./httpCatalogService";
import { supabaseCatalogService } from "./supabaseCatalogService";
import type { CatalogService } from "./types";

/**
 * Which implementation backs the app, via `VITE_CATALOG_SOURCE` (see `.env.example`):
 * - unset / "mock" (default): the local mock catalog — safe, works with no setup.
 * - "supabase": real Odoo data via Supabase Edge Functions — the production path. See
 *   Documentations MD/odoo-real-catalog.md. Requires `VITE_SUPABASE_URL`/
 *   `VITE_SUPABASE_PUBLISHABLE_KEY` only — never Odoo credentials client-side.
 * - "http": the legacy `/api/catalog/*` Vercel routes — kept for parity/rollback, not the
 *   production path once "supabase" is verified working.
 * This flag never carries credentials — it only selects which `CatalogService` implementation to use.
 */
function resolveCatalogService(): CatalogService {
  const source = import.meta.env.VITE_CATALOG_SOURCE;
  if (source === "supabase") return supabaseCatalogService;
  if (source === "http") return httpCatalogService;
  return mockCatalogService;
}

export const catalogService: CatalogService = resolveCatalogService();
export type { CatalogService, PagedProductQuery, PagedProductResult, ProductListQuery, ProductSort } from "./types";
