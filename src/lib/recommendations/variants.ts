import type { Product } from "../../data/types";

/**
 * True when a product cannot be safely added to cart without the customer choosing a
 * colour/vehicle/fitment first. No current catalog entry sets `requiresSelection` — real
 * variant/fitment data doesn't exist yet (see
 * Documentations MD/figma-shop-product-odoo-integration.md) — but Quick Add from a cart-drawer
 * recommendation must never silently guess a variant once that data lands, so the check exists
 * now rather than being bolted on later under time pressure.
 */
export function productRequiresSelection(product: Product): boolean {
  return Boolean(product.requiresSelection);
}
