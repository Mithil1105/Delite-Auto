import type { Product } from "../../data/types";

/**
 * True when a product cannot be safely added to cart without the customer choosing a
 * colour/vehicle/fitment first. Two signals, either sufficient on its own:
 * - `requiresSelection` — an explicit manual flag. No local mock-catalog entry sets it.
 * - `variantCount > 1` — Odoo's `product_variant_count` (see
 *   `server/odoo/normalizeProduct.ts`), present once a product is Odoo-backed. More than one
 *   variant means at least one attribute (colour/fitment/etc.) genuinely differentiates them, so
 *   Quick Add must not guess which one — see
 *   `Documentations MD/personalized-product-recommendations.md` and
 *   `Documentations MD/odoo-live-catalog-integration.md`.
 */
export function productRequiresSelection(product: Product): boolean {
  return Boolean(product.requiresSelection) || (product.variantCount ?? 0) > 1;
}
