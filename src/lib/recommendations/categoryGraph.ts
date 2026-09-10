/**
 * Hand-authored complementary-category graph — the "what goes with what" signal for both the PDP
 * and cart-cross-sell strategies, until real co-purchase/co-cart data exists (see
 * Documentations MD/personalized-product-recommendations.md). Deliberately NOT symmetric in every
 * direction (e.g. `workshop-essentials` complements `car-care` but not vice versa) — these are
 * "a customer with X in mind probably also wants Y" relationships, not a same-category cluster.
 */
export const COMPLEMENTARY_CATEGORIES: Record<string, string[]> = {
  "seat-covers": ["comfort", "fragrances", "gps-security", "audio-dashcams"],
  "floor-mats": ["car-care", "comfort", "seat-covers"],
  "car-care": ["comfort", "fragrances", "floor-mats"],
  "audio-dashcams": ["gps-security", "workshop-essentials"],
  "gps-security": ["audio-dashcams", "workshop-essentials"],
  fragrances: ["comfort", "car-care"],
  comfort: ["fragrances", "seat-covers"],
  "workshop-essentials": ["car-care"],
  "bike-guards": ["bike-covers", "helmets", "saddlebags"],
  "bike-covers": ["bike-guards", "workshop-essentials"],
  helmets: ["bike-guards", "saddlebags"],
  saddlebags: ["bike-guards", "helmets"],
};
