import { useEffect, useState } from "react";
import { catalogService } from "../services/catalog/catalogService";
import type { Product } from "../data/types";

/** How a "Shop by Top Categories" tab finds its products in the live catalog when nothing is hand-picked in the admin. */
export interface CategoryTabSpec {
  /** Drops products tagged only for the other vehicle; omit to keep everything. */
  vehicle?: "car" | "bike";
  /** With `vehicle`: ask Odoo only for that vehicle's products and keep only ones explicitly tagged for it (untagged products are left out). */
  exact?: boolean;
  /** Odoo product-category id to list. */
  categoryId?: number;
  /** Name searches (each one query; results are merged, de-duplicated). */
  queries?: string[];
}

const LIMIT = 12;
const cache = new Map<string, Promise<Product[]>>();

function load(spec: CategoryTabSpec): Promise<Product[]> {
  const key = JSON.stringify(spec);
  let hit = cache.get(key);
  if (!hit) {
    // One after another, not in parallel — this Odoo instance rate-limits (HTTP 429) under concurrent calls.
    const run = async () => {
      const pages = [];
      for (const q of spec.queries?.length ? spec.queries : [undefined]) {
        pages.push(await catalogService.getProductsPage({ page: 1, pageSize: LIMIT, q, categoryId: spec.categoryId, vehicle: spec.exact ? spec.vehicle : undefined }));
      }
      return pages;
    };
    hit = run()
      .then((pages) => {
        const seen = new Set<string>();
        const other = spec.vehicle === "car" ? "bike" : spec.vehicle === "bike" ? "car" : null;
        return pages
          .flatMap((p) => p.items)
          .filter((p) => !seen.has(p.id) && seen.add(p.id))
          // Untagged products fit either vehicle; only drop ones tagged exclusively for the other.
          .filter((p) => (spec.exact && spec.vehicle ? !!p.vehicleTypes?.includes(spec.vehicle) : !(other && p.vehicleTypes?.length && p.vehicleTypes.every((v) => v === other))))
          .slice(0, LIMIT);
      })
      .catch((err) => {
        cache.delete(key);
        throw err;
      });
    cache.set(key, hit);
  }
  return hit;
}

/** Live products for one tab. `null` = loading, `[]` = none found (or the lookup failed). Pass `null` to skip. */
export function useCategoryTabProducts(spec: CategoryTabSpec | null): Product[] | null {
  const key = spec ? JSON.stringify(spec) : "";
  const [state, setState] = useState<{ key: string; products: Product[] } | null>(null);

  useEffect(() => {
    if (!spec) return;
    let cancelled = false;
    load(spec)
      .then((products) => !cancelled && setState({ key, products }))
      .catch(() => !cancelled && setState({ key, products: [] }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return spec && state?.key === key ? state.products : null;
}
