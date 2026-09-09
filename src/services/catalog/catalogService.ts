import { mockCatalogService } from "./mockCatalogService";
import { httpCatalogService } from "./httpCatalogService";
import type { CatalogService } from "./types";

/**
 * Which implementation backs the app. Defaults to the local mock catalog (safe, works with no
 * setup); set `VITE_CATALOG_SOURCE=http` (see `.env.example`) once `/api/catalog/*` is deployed
 * to switch to it. This flag never carries credentials — it only selects which of the two
 * `CatalogService` implementations below to use.
 */
const source: CatalogService =
  import.meta.env.VITE_CATALOG_SOURCE === "http" ? httpCatalogService : mockCatalogService;

export const catalogService: CatalogService = source;
export type { CatalogService, ProductListQuery } from "./types";
