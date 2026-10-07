import { useEffect, useState } from "react";
import { getPublishedPageSections, mediaPublicUrl, type PublishedSection } from "../services/cms/publishedCmsService";
import { catalogService } from "../services/catalog/catalogService";
import type { Product } from "../data/types";
import type { CmsCategoryItem } from "../components/home/CategoryIconStrip";

export interface CategorySelection {
  categoryId: number;
  order: number;
  visible: boolean;
  imageStoragePath?: string;
  heading?: string;
}

/** One query for all four merchandising sections (featured/trending/new-arrivals/categories). */
export function useMerchandisingCms() {
  const [sections, setSections] = useState<PublishedSection[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublishedPageSections("merchandising").then((s) => {
      if (!cancelled) setSections(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const bySectionKey = new Map((sections ?? []).map((s) => [s.sectionKey, s]));
  return { bySectionKey, loading: sections === null };
}

/**
 * Resolves a merchandising section's stored Odoo ids to real, current product data in ONE
 * request (never copied CMS data — see Documentations MD/delite-admin.md, "Odoo-ID-only
 * persistence"). Order follows the CMS-stored id order, not whatever order Odoo happens to
 * return. An id that no longer resolves (unpublished/archived/deleted in Odoo) is silently
 * skipped — never a broken card, never a crash (spec: "missing Odoo product handling").
 */
export function useMerchandisedProducts(productIds: number[] | undefined) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState(false);
  const key = (productIds ?? []).join(",");

  useEffect(() => {
    if (!productIds || productIds.length === 0) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    setError(false);
    catalogService
      .getProductsPage({ page: 1, pageSize: productIds.length, ids: productIds })
      .then((result) => {
        if (cancelled) return;
        const byId = new Map(result.items.map((p) => [p.odooId, p]));
        const ordered = productIds.map((id) => byId.get(id)).filter((p): p is Product => !!p);
        setProducts(ordered);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setProducts([]);
        }
      });
    return () => {
      cancelled = true;
    };
    // Deliberately keyed on the serialized id list (`key`), not `productIds` itself — the array
    // is a new reference every render, which would refetch on every render if used directly.
  }, [key]);

  return { products, loading: products === null && !error, error };
}

/**
 * Resolves CMS-curated `CategorySelection[]` (real Odoo ids + optional overrides) to
 * `CmsCategoryItem[]` for `CategoryIconStrip` — real category names come live from
 * `catalog-categories` (same one Brands.tsx uses), never copied into the CMS row. Visible-only,
 * CMS order preserved. An id that no longer resolves in Odoo is silently skipped.
 */
export function useResolvedCategorySelections(selections: CategorySelection[]): CmsCategoryItem[] | null {
  const [items, setItems] = useState<CmsCategoryItem[] | null>(null);
  const key = selections.map((s) => `${s.categoryId}:${s.visible}:${s.heading ?? ""}:${s.imageStoragePath ?? ""}`).join(",");

  useEffect(() => {
    if (selections.length === 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    catalogService
      .getCategories()
      .then((categories) => {
        if (cancelled) return;
        const byId = new Map(categories.map((c) => [c.odooId, c]));
        const resolved = selections
          .filter((s) => s.visible)
          .map((s): CmsCategoryItem | null => {
            const category = byId.get(s.categoryId);
            if (!category) return null;
            return {
              categoryId: s.categoryId,
              name: s.heading || category.name,
              // A manually-uploaded CMS image always wins when set; otherwise fall back to
              // Odoo's own real category image (see catalog-categories' `imageUrl`) rather than
              // showing a generic icon just because nobody separately uploaded an override.
              image: s.imageStoragePath ? mediaPublicUrl(s.imageStoragePath) : category.imageUrl,
            };
          })
          .filter((c): c is CmsCategoryItem => c !== null);
        setItems(resolved);
      })
      .catch((err) => {
        // A transient Odoo/Edge Function failure (seen in practice as a 503 from
        // catalog-categories) must never hang this hook forever or throw an unhandled rejection —
        // `items` stays `null`, so the caller's own `cmsItems.length > 0 ? cmsItems : undefined`
        // check falls back to the component's hardcoded default items, same as "no CMS curation
        // yet". Logged, not swallowed silently, so a real outage is still visible in dev tools.
        if (!cancelled) console.error("[useResolvedCategorySelections] category resolution failed", err instanceof Error ? err.message : err);
      });
    return () => {
      cancelled = true;
    };
    // Deliberately keyed on `key` (serialized selections), not `selections` itself — see the
    // identical pattern/reasoning in useMerchandisedProducts above.
  }, [key]);

  return items;
}
