/**
 * "unknown" is distinct from "universal": Odoo's `public_categ_ids` is not consistently populated
 * on every real product, and a missing classification must never be silently presented as "fits
 * everything" — see Documentations MD/odoo-real-catalog.md, "Vehicle classification". Only the
 * local mock catalog ever sets "universal" (a genuine authored claim); real Odoo-backed products
 * are "car" | "bike" | "unknown", or "universal" only when explicitly tagged with BOTH category 1
 * (CAR) and category 2 (BIKE).
 */
export type Vehicle = "car" | "bike" | "universal" | "unknown";

export interface Category {
  slug: string;
  name: string;
  /** Local mock catalog always sets this; an Odoo-derived category has no equivalent field, so it's optional. */
  tagline?: string;
  vehicle: Vehicle;
  /** Local mock catalog always sets this (a Lucide icon name); an Odoo-derived category has no equivalent, so it's optional. */
  icon?: string;
  /** Odoo's category id (`product.public.category`), when Odoo-backed. */
  odooId?: number;
  /** Delite's classification of this real Odoo category — see `_shared/odoo/catalog.ts`'s config. Absent for the local mock catalog. */
  role?: "vehicle" | "brand" | "other";
  /** Real, storefront-eligibility-filtered server-side count — only populated for `role: "brand"` categories (see `catalog-categories`). Absent otherwise. */
  productCount?: number;
  /** Odoo's own category image, via the catalog-media proxy — always a URL (never inline bytes),
   * may 404 if this category genuinely has no image set in Odoo. Absent for the local mock
   * catalog. */
  imageUrl?: string;
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
  /**
   * Whether this variant can currently be added to cart — a business-rule gate, not raw
   * inventory truth. See `catalogActive`/`inStock`/`inventoryTracked` below for the honest
   * breakdown Odoo-backed products carry (2026-09-17 stabilization pass — see
   * Documentations MD/odoo-real-catalog.md, "Stock decision"); the local mock catalog only ever
   * sets this field directly (no breakdown fields), since it has no Odoo inventory concept.
   */
  purchasable?: boolean;
  mediaId?: string;
  /**
   * Odoo's `product.product` id for this specific variant — distinct from the parent product's
   * `odooId` (that's the `product.template` id). Required to build a cart-line identity that can
   * tell "same product, different variant" apart — see
   * `Documentations MD/odoo-live-catalog-integration.md`.
   */
  odooVariantId?: number;
  /** e.g. [{ attribute: "Colour", value: "Black" }] — from product.template.attribute.value, once confirmed. */
  attributes?: { attribute: string; value: string }[];
  /** Odoo's own `active` flag on this product.product record (not archived) — record-level, says nothing about inventory. Absent for the local mock catalog. */
  catalogActive?: boolean;
  /**
   * Raw on-hand quantity (`free_qty`/`qty_available`), honest, can be 0 — informational display
   * only (e.g. a "44 in stock" badge). Never used alone to gate Add to Cart — see
   * `inventoryTracked`/`purchasable`. Absent for the local mock catalog.
   */
  inventoryQuantity?: number;
  /**
   * Whether this store operationally tracks inventory at all. VERIFIED FALSE store-wide as of
   * 2026-09-16 (`odoo-catalog-classify`'s `stockCheck`: only 1.6% of real variants show any
   * nonzero quantity) — see Documentations MD/odoo-real-catalog.md, "Stock decision". When
   * false, `purchasable` is driven by `catalogActive` alone (an explicit, documented Delite
   * business rule, not fabricated stock); when true, `purchasable` also requires `inStock`.
   */
  inventoryTracked?: boolean;
  /** `inventoryQuantity > 0` — purely inventory-derived, never business-rule-adjusted. Absent for the local mock catalog. */
  inStock?: boolean;
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
  /**
   * Whether this product can currently be purchased — a business-rule gate (see
   * `ProductVariant.purchasable`'s doc comment for the honest `catalogActive`/`inStock`/
   * `inventoryTracked` breakdown Odoo-backed products carry). Absent means "assume purchasable"
   * (the local mock catalog has no stock concept). Renamed from `available` in the 2026-09-17
   * stabilization pass — the old name was silently equal to Odoo's `active` flag, which is not
   * the same claim; see Documentations MD/odoo-real-catalog.md, "Stock decision".
   */
  purchasable?: boolean;
  /**
   * True when this product cannot be added to cart without the customer choosing a
   * colour/vehicle/fitment first. No current catalog entry sets this (no real variant data yet)
   * — see `src/lib/recommendations/variants.ts` and
   * `Documentations MD/personalized-product-recommendations.md`.
   */
  requiresSelection?: boolean;
  /**
   * Odoo's `product.template` id, when this product is Odoo-backed. Absent for the local mock
   * catalog. Canonical stable identity — `slug` can drift if a product is renamed in Odoo, this
   * cannot. See `Documentations MD/odoo-live-catalog-integration.md` ("Slug strategy").
   */
  odooId?: number;
  /** Odoo's `default_code` (internal reference/SKU), when known. */
  sku?: string;
  /** Odoo's `write_date` (ISO string), when known — lets the frontend show "last updated" or detect staleness. */
  updatedAt?: string;
  /** Odoo's `product_variant_count` — lets list-level UI (Quick Add) know a product needs variant selection without fetching full ProductDetail. See `src/lib/recommendations/variants.ts`. */
  variantCount?: number;
  /**
   * Real, verified vehicle-type tags from `public_categ_ids` (category 1 = CAR, 2 = BIKE) — can
   * hold both, one, or neither. `Product.vehicle` above is a single-value convenience derived
   * from this array (see `src/services/catalog/supabaseCatalogService.ts`); this array is the
   * source of truth when a UI needs to know precisely, e.g. to avoid mislabeling an unclassified
   * product as "Universal". Absent for the local mock catalog.
   */
  vehicleTypes?: ("car" | "bike")[];
  /** The real brand-category tag this product is linked to, resolved from `public_categ_ids` against the verified brand-category id list — never a separate stored brand name. `null` means genuinely unclassified (not "no brand"). Absent for the local mock catalog (use `brandSlug` there). */
  brand?: { id: number; name: string } | null;
  /** Every real `product.public.category` this product is tagged with (vehicle + brand + type + promo, all flat) — raw membership, before Delite's role classification is applied. Absent for the local mock catalog. */
  categories?: { id: number; name: string }[];
  /**
   * The catalog-media proxy URL for this product's primary image (see
   * Documentations MD/odoo-real-catalog.md, "Media behavior") — never a raw Odoo binary field.
   * List-level UI (ProductCard, CartDrawerItem) should prefer this over the local
   * `productImages` static map, which has no entries for Odoo-backed products. Absent for the
   * local mock catalog (which uses `productImages`/`categoryImages` instead).
   */
  primaryImage?: string;
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
  /**
   * Raw fitment labels from Odoo's "Model" attribute (id 10) — e.g. `{ id: 7, label: "Model:
   * Brezza 2024 / LXI" }`. Never parsed into make/model/year/trim; the label is exactly what
   * Odoo returns. Absent for the local mock catalog.
   */
  fitment?: { id: number; label: string }[];
  /** Non-fitment variant-defining attributes (e.g. colour/Material) grouped by their real Odoo attribute id — deliberately NOT merged across differently-named attributes. Absent for the local mock catalog. */
  productAttributes?: { attributeId: number; attributeName: string; values: { id: number; label: string }[] }[];
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
