import type { CatalogService, PagedProductQuery, PagedProductResult, ProductListQuery } from "./types";
import type { Category, Product, ProductDetail, ProductMedia, ProductVariant, Vehicle } from "../../data/types";

/**
 * Real Odoo catalog data via Supabase Edge Functions (`supabase/functions/catalog-*`) — the
 * production transport. React never talks to Odoo directly and never sees raw Odoo field names;
 * this file's only job is mapping the normalized `CatalogProduct` DTO those functions return onto
 * the frontend's existing `Product`/`ProductDetail`/`Category` shapes. See
 * Documentations MD/odoo-real-catalog.md for the full DTO reference and the deliberate gaps
 * (brandSlug/categorySlug are "" here — real Odoo brands/categories are id-based, not the static
 * slug sets `src/data/brands.ts`/`src/data/categories.ts` use for the mock catalog).
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? "";

interface CatalogCategoryRef {
  id: number;
  name: string;
}

interface CatalogFitment {
  id: number;
  label: string;
}

interface CatalogAttribute {
  attributeId: number;
  attributeName: string;
  values: { id: number; label: string }[];
}

interface CatalogVariantDto {
  odooVariantId: number;
  sku?: string;
  name: string;
  price: number;
  attributes: { attribute: string; value: string }[];
  catalogActive: boolean;
  inventoryQuantity: number;
  inventoryTracked: boolean;
  inStock: boolean;
  purchasable: boolean;
}

interface CatalogMediaItemDto {
  id: string;
  url: string;
  alt: string;
}

interface CatalogProductDto {
  id: string;
  odooTemplateId: number;
  slug: string;
  name: string;
  sku?: string;
  price: number;
  mrp: number | null;
  description?: string;
  categoryIds: number[];
  categories: CatalogCategoryRef[];
  brand: { id: number; name: string } | null;
  vehicleTypes: ("car" | "bike")[];
  fitment: CatalogFitment[];
  attributes: CatalogAttribute[];
  variants: CatalogVariantDto[];
  primaryImage: string;
  media: CatalogMediaItemDto[];
  catalogActive: boolean;
  purchasable: boolean;
  stockSummary: { totalOnHand: number; anyVariantInStock: boolean; anyVariantPurchasable: boolean };
  websitePublished: boolean;
}

interface CatalogListResponseDto {
  items: CatalogProductDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface CatalogCategoryDto {
  id: number;
  name: string;
  role: "vehicle" | "brand" | "other";
  productCount?: number;
  imageUrl?: string;
}

async function callFunction<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!res.ok) throw new Error(`Catalog request failed: ${res.status} ${url.pathname}`);
  return (await res.json()) as T;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** vehicleTypes.length===0 is genuinely unclassified — "unknown", never silently "universal". Both tags present is a real dual claim, so "universal" there is honest, not fabricated. */
function deriveVehicle(vehicleTypes: ("car" | "bike")[]): Vehicle {
  if (vehicleTypes.length === 0) return "unknown";
  if (vehicleTypes.length === 2) return "universal";
  return vehicleTypes[0];
}

function mapVariant(v: CatalogVariantDto): ProductVariant {
  return {
    id: String(v.odooVariantId),
    label: v.attributes.length > 0 ? v.attributes.map((a) => a.value).join(" / ") : v.name,
    sku: v.sku,
    price: v.price,
    purchasable: v.purchasable,
    odooVariantId: v.odooVariantId,
    attributes: v.attributes.length > 0 ? v.attributes : undefined,
    catalogActive: v.catalogActive,
    inventoryQuantity: v.inventoryQuantity,
    inventoryTracked: v.inventoryTracked,
    inStock: v.inStock,
  };
}

function mapProduct(dto: CatalogProductDto): Product {
  return {
    id: dto.id,
    slug: dto.slug,
    name: dto.name,
    // No meaningful single slug in Odoo's flat, multi-tag category model — `categories`/`brand`
    // below are the real source of truth for Odoo-backed products; these stay "" (not
    // fabricated) so legacy slug-keyed lookups (src/data/brands.ts, src/data/categories.ts) just
    // no-op instead of silently matching the wrong static entry.
    brandSlug: "",
    categorySlug: "",
    vehicle: deriveVehicle(dto.vehicleTypes),
    price: dto.price,
    mrp: dto.mrp ?? undefined,
    icon: "Package",
    description: dto.description ?? "",
    specs: [],
    purchasable: dto.purchasable,
    odooId: dto.odooTemplateId,
    sku: dto.sku,
    variantCount: dto.variants.length,
    vehicleTypes: dto.vehicleTypes,
    brand: dto.brand,
    categories: dto.categories,
    primaryImage: dto.primaryImage,
  };
}

function mapProductDetail(dto: CatalogProductDto): ProductDetail {
  const media: ProductMedia[] = dto.media.map((m) => ({ id: m.id, type: "image", src: m.url, alt: m.alt }));
  return {
    ...mapProduct(dto),
    media,
    variants: dto.variants.length > 0 ? dto.variants.map(mapVariant) : undefined,
    fitment: dto.fitment,
    productAttributes: dto.attributes,
  };
}

function mapCategory(dto: CatalogCategoryDto): Category {
  return { slug: slugify(dto.name), name: dto.name, vehicle: "unknown", odooId: dto.id, role: dto.role, productCount: dto.productCount, imageUrl: dto.imageUrl };
}

export const supabaseCatalogService: CatalogService = {
  async getProducts(query: ProductListQuery = {}) {
    const page = await supabaseCatalogService.getProductsPage({ page: 1, pageSize: query.limit ?? 100 });
    return page.items;
  },

  async getProductsPage(query: PagedProductQuery): Promise<PagedProductResult> {
    const data = await callFunction<CatalogListResponseDto>("catalog-products", {
      page: query.page,
      pageSize: query.pageSize,
      q: query.q,
      category: query.categoryId,
      vehicle: query.vehicle,
      brand: query.brandCategoryId,
      fitment: query.fitmentValueId,
      ids: query.ids && query.ids.length > 0 ? query.ids.join(",") : undefined,
      sort: query.sort,
    });
    return { items: data.items.map(mapProduct), page: data.page, pageSize: data.pageSize, total: data.total, totalPages: data.totalPages };
  },

  async getProductBySlug(slug: string) {
    try {
      const dto = await callFunction<CatalogProductDto>("catalog-product-detail", { slug });
      return mapProductDetail(dto);
    } catch {
      return null;
    }
  },

  async getCategories() {
    const data = await callFunction<{ categories: CatalogCategoryDto[] }>("catalog-categories");
    return data.categories.map(mapCategory);
  },

  async getRelatedProducts(product: Product, count = 4) {
    if (!product.categories || product.categories.length === 0) return [];
    // Odoo has no single "primary category" — use the first real category tag as a best-effort
    // related-products signal; the shared recommendation engine (useRecommendations) is the real
    // relevance mechanism, this is only the raw candidate fetch a fallback caller might use.
    const categoryId = product.categories[0].id;
    const page = await supabaseCatalogService.getProductsPage({ page: 1, pageSize: count + 1, categoryId });
    return page.items.filter((p) => p.id !== product.id).slice(0, count);
  },
};
