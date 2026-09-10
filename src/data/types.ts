export type Vehicle = "car" | "bike" | "universal";

export interface Category {
  slug: string;
  name: string;
  tagline: string;
  vehicle: Vehicle;
  icon: string;
}

export interface Brand {
  slug: string;
  name: string;
  blurb: string;
}

export type ProductTag = "new" | "trending" | "bestseller";

/**
 * A single piece of product media (photo or video). `id` is stable per-product so a
 * `ProductVariant`/`ProductColour` can point at the media it should switch the gallery to via
 * `mediaId`, without embedding the media itself.
 */
export interface ProductMedia {
  id: string;
  type: "image" | "video";
  src: string;
  alt: string;
  thumbnail?: string;
}

/** A purchasable variant of a product (e.g. "Fits Hyundai Creta 2020-23"), not a colour. */
export interface ProductVariant {
  id: string;
  label: string;
  sku?: string;
  price?: number;
  mrp?: number;
  available?: boolean;
  mediaId?: string;
}

/**
 * A named colour option. Distinct from `Product.colors` (a flat hex list used by the compact
 * home-page card swatches) — this carries a name (for accessibility — see
 * `Documentations MD` accessibility notes) and can point at the gallery photo for that colour.
 */
export interface ProductColour {
  id: string;
  name: string;
  hex?: string;
  mediaId?: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  brandSlug: string;
  categorySlug: string;
  vehicle: Vehicle;
  price: number;
  mrp?: number;
  tag?: ProductTag;
  icon: string;
  description: string;
  specs: { label: string; value: string }[];
  /** Home-page product card extras (Figma redesign) — optional, only backfilled on featured products. */
  rating?: number;
  reviewCount?: number;
  colors?: string[];
  /** Availability for purchase — absent means "assume available" (existing catalog has no stock data yet). */
  available?: boolean;
  /**
   * True when this product cannot be added to cart without the customer choosing a
   * colour/vehicle/fitment first. No current catalog entry sets this (no real variant data yet)
   * — see `src/lib/recommendations/variants.ts` and
   * `Documentations MD/personalized-product-recommendations.md`.
   */
  requiresSelection?: boolean;
}

/**
 * The richer shape the product detail page needs: a real media gallery, named colours and
 * fitment variants. Optional on top of `Product` (not every source populates it yet) so existing
 * `Product`-typed data keeps working — see `src/services/catalog/mockCatalogService.ts`, which
 * backfills a minimal one from the existing mock catalog.
 */
export interface ProductDetail extends Product {
  media: ProductMedia[];
  variants?: ProductVariant[];
  colours?: ProductColour[];
}

export interface VehicleBrand {
  slug: string;
  name: string;
  vehicle: "car" | "bike";
}

export interface Testimonial {
  name: string;
  location: string;
  quote: string;
  vehicle: string;
  /** Short purchase label shown under the name on the home-page testimonial carousel. */
  productLabel?: string;
}
