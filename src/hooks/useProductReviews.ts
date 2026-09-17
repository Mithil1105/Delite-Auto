import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export interface ReviewRow {
  id: string;
  user_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  created_at: string;
}

export interface ReviewAggregate {
  average: number | null;
  count: number;
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
      .select("id, user_id, rating, title, body, created_at")
      .eq("odoo_template_id", odooTemplateId)
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    setReviews((data as ReviewRow[] | null) ?? []);
    setLoading(false);
  }, [odooTemplateId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const aggregate: ReviewAggregate = {
    count: reviews.length,
    average: reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null,
  };

  return { reviews, aggregate, loading, refresh };
}
