import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { useProductReviews } from "../../hooks/useProductReviews";
import { useLang } from "../../i18n/LanguageContext";

/**
 * Real reviews for a real Odoo product (see useProductReviews.ts). Every insert lands as
 * `pending` server-side (enforced by a Postgres trigger — never trusted from this form) and only
 * appears here once an admin approves it via /admin/reviews.
 */
export function ReviewsSection({ odooTemplateId }: { odooTemplateId?: number }) {
  const { t } = useLang();
  const { user, configured } = useAuth();
  const { reviews, aggregate, loading, refresh } = useProductReviews(odooTemplateId);

  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!odooTemplateId) {
    return <p className="text-[14.5px] text-ink/75">{t("product.noReviewsYet")}</p>;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || !user) return;
    setSubmitting(true);
    setError(null);
    const { error: insertError } = await supabase.from("product_reviews").insert({
      odoo_template_id: odooTemplateId,
      user_id: user.id,
      rating,
      title: title.trim() || null,
      body: body.trim() || null,
    });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message.toLowerCase().includes("duplicate") ? t("reviews.alreadyReviewed") : t("reviews.submitFailed"));
      return;
    }
    setSubmitted(true);
    setTitle("");
    setBody("");
    refresh();
  };

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div className="flex items-center gap-3">
        {aggregate.count > 0 ? (
          <>
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className={clsx("w-4 h-4", i < Math.round(aggregate.average!) ? "fill-gold text-gold" : "text-line")} />
              ))}
            </div>
            <span className="text-[13px] font-semibold">{aggregate.average!.toFixed(1)}</span>
            <span className="text-[12.5px] text-steel-500">({aggregate.count})</span>
          </>
        ) : (
          !loading && <span className="text-[13px] text-steel-500">{t("product.noReviewsYet")}</span>
        )}
      </div>

      {reviews.length > 0 && (
        <div className="flex flex-col divide-y divide-line">
          {reviews.map((r) => (
            <div key={r.id} className="py-4">
              <div className="flex items-center gap-1 mb-1">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} className={clsx("w-3.5 h-3.5", i < r.rating ? "fill-gold text-gold" : "text-line")} />
                ))}
              </div>
              {r.title && <div className="font-semibold text-[13.5px]">{r.title}</div>}
              {r.body && <p className="text-[13.5px] text-ink/75 mt-1">{r.body}</p>}
              <div className="text-[11.5px] text-steel-500 mt-1">{new Date(r.created_at).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-line pt-6">
        <h3 className="font-display uppercase text-[13.5px] mb-4">{t("reviews.writeReview")}</h3>
        {!configured ? (
          <p className="text-[13px] text-steel-500">{t("auth.notConfigured")}</p>
        ) : !user ? (
          <Link
            to={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}
            className="text-[13px] font-semibold text-brand-700 hover:underline"
          >
            {t("reviews.signInToReview")}
          </Link>
        ) : submitted ? (
          <p className="text-[13.5px] text-steel-500">{t("reviews.submittedPending")}</p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star`}>
                  <Star className={clsx("w-5 h-5", n <= rating ? "fill-gold text-gold" : "text-line")} />
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder={t("reviews.titlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 px-3 border border-line text-[13.5px] bg-white focus:outline-none focus:border-ink"
            />
            <textarea
              rows={3}
              placeholder={t("reviews.bodyPlaceholder")}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="px-3 py-2 border border-line text-[13.5px] bg-white focus:outline-none focus:border-ink"
            />
            {error && <p className="text-[12.5px] text-sale">{error}</p>}
            <button type="submit" disabled={submitting} className="btn-outline w-fit disabled:opacity-50">
              {submitting ? t("reviews.submitting") : t("reviews.submit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
