import { odooSearchRead } from "./client";
import { normalizeCategory } from "./normalizeProduct";
import { STANDARD_CATEGORY_FIELDS } from "./productFields";
import type { Category } from "../../src/data/types";
import type { OdooCategoryRecord } from "./types";

/**
 * Tries `product.public.category` first — the Website/eCommerce module's customer-facing
 * category tree, which is what a storefront should generally show — and falls back to
 * `product.category` (present on any Odoo instance with the Sales/Inventory apps) if the public
 * model doesn't exist on this instance. Which one this store actually uses/needs is something
 * `api/internal/odoo/schema.ts` confirms — see Documentations MD/odoo-schema-report.md.
 */
export async function fetchOdooCategories(): Promise<{ categories: Category[]; sourceModel: "product.public.category" | "product.category" }> {
  try {
    const records = await odooSearchRead<OdooCategoryRecord>("product.public.category", [], STANDARD_CATEGORY_FIELDS);
    return { categories: records.map(normalizeCategory), sourceModel: "product.public.category" };
  } catch {
    const records = await odooSearchRead<OdooCategoryRecord>("product.category", [], STANDARD_CATEGORY_FIELDS);
    return { categories: records.map(normalizeCategory), sourceModel: "product.category" };
  }
}
