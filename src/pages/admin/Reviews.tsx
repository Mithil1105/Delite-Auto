import { useCallback, useEffect, useState } from "react";
import { Star, Check, X } from "lucide-react";
import clsx from "clsx";
import { supabase } from "../../lib/supabaseClient";
import { useLang } from "../../i18n/LanguageContext";
import { AdminNav } from "./AdminNav";

interface ReviewRow {
  id: string;
  odoo_template_id: number;
  rating: number;
  title: string | null;
  body: string | null;
  status: string;
  created_at: string;
}

export default function AdminReviews() {
  const { t } = useLang();
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("product_reviews")
      .select("id, odoo_template_id, rating, title, body, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    setReviews((data as ReviewRow[] | null) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const moderate = async (id: string, status: "approved" | "rejected") => {
    if (!supabase) return;
    setActingId(id);
    await supabase.from("product_reviews").update({ status }).eq("id", id);
    setActingId(null);
    load();
  };

  return (
    <div className="container-page py-12">
      <h1 className="text-3xl font-semibold mb-2">{t("admin.title")}</h1>
      <AdminNav />

      {reviews === null && <p className="text-[13.5px] text-steel-500">{t("account.loadingOrders")}</p>}
      {reviews !== null && reviews.length === 0 && <p className="text-[13.5px] text-steel-500">{t("admin.noPendingReviews")}</p>}

      {reviews !== null && reviews.length > 0 && (
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {reviews.map((r) => (
            <div key={r.id} className="py-4 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} className={clsx("w-3.5 h-3.5", i < r.rating ? "fill-gold text-gold" : "text-line")} />
                  ))}
                  <span className="text-[11.5px] text-steel-500 ml-2">Product #{r.odoo_template_id}</span>
                </div>
                {r.title && <div className="font-semibold text-[13.5px]">{r.title}</div>}
                {r.body && <p className="text-[13.5px] text-ink/75 mt-1 max-w-lg">{r.body}</p>}
                <div className="text-[11.5px] text-steel-500 mt-1">{new Date(r.created_at).toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={actingId === r.id}
                  onClick={() => moderate(r.id, "approved")}
                  className="flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" /> {t("admin.approve")}
                </button>
                <button
                  type="button"
                  disabled={actingId === r.id}
                  onClick={() => moderate(r.id, "rejected")}
                  className="flex items-center gap-1 text-[12.5px] font-semibold text-sale hover:underline disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" /> {t("admin.reject")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
