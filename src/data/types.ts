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
