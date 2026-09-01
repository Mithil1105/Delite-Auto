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
}

export interface Testimonial {
  name: string;
  location: string;
  quote: string;
  vehicle: string;
}
