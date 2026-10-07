import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export interface ReviewRow {
  id: string;
  user_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  created_at: string;
  reviewer_name: string | null;
  verified_purchase: boolean;
  photo_paths: string[];
}

export interface ReviewAggregate {
  average: number | null;
  count: number;
  /** Count of approved reviews at each star rating (1-5) — powers the breakdown bars. */
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
}

/**
 * Real, approved reviews for a real Odoo product (keyed by `product.template` id — see
 * Documentations MD/delite-accounts-orders-reviews-admin.md). Returns an empty/zero result when
 * `odooTemplateId` is undefined (the local mock catalog has no Odoo id — its own static
 * `rating`/`reviewCount` fields keep rendering via ProductDetail's fallback, unaffected by this
 * hook) or when Supabase isn't configured.
 */
export function useProductReviews(odooTemplateId: number | undefined) {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(!!odooTemplateId);

  const refresh = useCallback(async () => {
    if (!supabase || !odooTemplateId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("product_reviews")
      .select("id, user_id, rating, title, body, created_at, reviewer_name, verified_purchase, photo_paths")
      .eq("odoo_template_id", odooTemplateId)
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    setReviews((data as ReviewRow[] | null) ?? []);
    setLoading(false);
  }, [odooTemplateId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const breakdown: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) {
    if (r.rating >= 1 && r.rating <= 5) breakdown[r.rating as 1 | 2 | 3 | 4 | 5]++;
  }
  const aggregate: ReviewAggregate = {
    count: reviews.length,
    average: reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null,
    breakdown,
  };

  return { reviews, aggregate, loading, refresh };
}
