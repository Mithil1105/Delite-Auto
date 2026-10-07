import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Star, Upload, X } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { useProductReviews, type ReviewRow } from "../../hooks/useProductReviews";
import { reviewMediaPublicUrl } from "../../lib/media/reviewMedia";
import { useLang } from "../../i18n/LanguageContext";

const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS = 6;

type SortMode = "newest" | "highest" | "lowest";
type StarFilter = 0 | 1 | 2 | 3 | 4 | 5; // 0 = all

function RatingBreakdown({ breakdown, total, onFilter, activeFilter }: {
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
  total: number;
  activeFilter: StarFilter;
  onFilter: (n: StarFilter) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 max-w-sm">
      {([5, 4, 3, 2, 1] as const).map((n) => {
        const count = breakdown[n];
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onFilter(activeFilter === n ? 0 : n)}
            className={clsx(
              "flex items-center gap-2 text-left group",
              activeFilter === n ? "opacity-100" : "opacity-80 hover:opacity-100"
            )}
          >
            <span className="w-10 text-[12px] text-steel-500 shrink-0">{n} star</span>
            <span className="flex-1 h-2 bg-steel-100 rounded-full overflow-hidden">
              <span
                className={clsx("block h-full rounded-full", activeFilter === n ? "bg-brand-600" : "bg-gold")}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="w-8 text-[11.5px] text-steel-500 text-right shrink-0">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function ReviewPhotoStrip({ paths }: { paths: string[] }) {
  if (paths.length === 0) return null;
  return (
    <div className="flex items-center gap-2 mt-2">
      {paths.map((p) => (
        <a key={p} href={reviewMediaPublicUrl(p)} target="_blank" rel="noreferrer" className="block w-14 h-14 rounded-lg overflow-hidden border border-line shrink-0">
          <img src={reviewMediaPublicUrl(p)} alt="" className="w-full h-full object-cover" loading="lazy" />
        </a>
      ))}
    </div>
  );
}

/**
 * Real reviews for a real Odoo product (see useProductReviews.ts). Every insert goes through the
 * `submit-review` Edge Function (never a direct client insert) so `reviewer_name` and
 * `verified_purchase` can be computed server-side — see that function's doc comment. Every
 * submission still lands as `pending` (enforced by a Postgres trigger, unchanged) and only appears
 * here once an admin approves it via /admin/reviews.
 */
export function ReviewsSection({ odooTemplateId }: { odooTemplateId?: number }) {
  const { t } = useLang();
  const { user, configured } = useAuth();
  const { reviews, aggregate, loading, refresh } = useProductReviews(odooTemplateId);

  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sort, setSort] = useState<SortMode>("newest");
  const [starFilter, setStarFilter] = useState<StarFilter>(0);

  const visibleReviews = useMemo(() => {
    const filtered = starFilter === 0 ? reviews : reviews.filter((r) => r.rating === starFilter);
    const sorted = [...filtered];
    if (sort === "highest") sorted.sort((a, b) => b.rating - a.rating || Date.parse(b.created_at) - Date.parse(a.created_at));
    else if (sort === "lowest") sorted.sort((a, b) => a.rating - b.rating || Date.parse(b.created_at) - Date.parse(a.created_at));
    else sorted.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return sorted;
  }, [reviews, sort, starFilter]);

  if (!odooTemplateId) {
    return <p className="text-[14.5px] text-ink/75">{t("product.noReviewsYet")}</p>;
  }

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).filter((f) => ALLOWED_PHOTO_TYPES.includes(f.type) && f.size <= MAX_PHOTO_SIZE_BYTES);
    setPhotos((prev) => [...prev, ...next].slice(0, MAX_PHOTOS));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || !user) return;
    setSubmitting(true);
    setError(null);

    const photoPaths: string[] = [];
    for (const file of photos) {
      const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadError } = await supabase.storage.from("review-media").upload(path, file, { contentType: file.type });
      if (uploadError) {
        setSubmitting(false);
        setError(t("reviews.photoUploadFailed"));
        return;
      }
      photoPaths.push(path);
    }

    const { data, error: invokeError } = await supabase.functions.invoke<{ error?: string }>("submit-review", {
      body: { odooTemplateId, rating, title: title.trim() || null, body: body.trim() || null, photoPaths },
    });

    setSubmitting(false);
    if (invokeError || data?.error) {
      setError(data?.error === "already_reviewed" ? t("reviews.alreadyReviewed") : t("reviews.submitFailed"));
      return;
    }
    setSubmitted(true);
    setTitle("");
    setBody("");
    setPhotos([]);
    refresh();
  };

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div className="flex flex-col gap-4">
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

        {aggregate.count > 0 && (
          <RatingBreakdown breakdown={aggregate.breakdown} total={aggregate.count} activeFilter={starFilter} onFilter={setStarFilter} />
        )}
      </div>

      {reviews.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              {starFilter !== 0 && (
                <button
                  type="button"
                  onClick={() => setStarFilter(0)}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 border border-brand-200 rounded-full px-2.5 py-1 hover:bg-brand-50"
                >
                  {starFilter} <Star className="w-3 h-3 fill-gold text-gold" /> <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="h-9 px-2.5 border border-line text-[12.5px] bg-white focus:outline-none focus:border-ink"
            >
              <option value="newest">{t("reviews.sortNewest")}</option>
              <option value="highest">{t("reviews.sortHighest")}</option>
              <option value="lowest">{t("reviews.sortLowest")}</option>
            </select>
          </div>

          {visibleReviews.length === 0 ? (
            <p className="text-[13px] text-steel-500">{t("reviews.noReviewsMatchFilter")}</p>
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {visibleReviews.map((r: ReviewRow) => (
                <div key={r.id} className="py-4">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star key={i} className={clsx("w-3.5 h-3.5", i < r.rating ? "fill-gold text-gold" : "text-line")} />
                      ))}
                    </div>
                    <span className="text-[12.5px] font-semibold">{r.reviewer_name || t("reviews.anonymous")}</span>
                    {r.verified_purchase && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700">
                        <BadgeCheck className="w-3.5 h-3.5" /> {t("reviews.verifiedPurchase")}
                      </span>
                    )}
                  </div>
                  {r.title && <div className="font-semibold text-[13.5px]">{r.title}</div>}
                  {r.body && <p className="text-[13.5px] text-ink/75 mt-1">{r.body}</p>}
                  <ReviewPhotoStrip paths={r.photo_paths} />
                  <div className="text-[11.5px] text-steel-500 mt-1">{new Date(r.created_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
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

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {photos.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="relative w-14 h-14 rounded-lg overflow-hidden border border-line shrink-0">
                    <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="Remove photo"
                      className="absolute top-0.5 right-0.5 grid place-items-center w-4 h-4 rounded-full bg-ink/70 text-white"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-14 h-14 rounded-lg border border-dashed border-line grid place-items-center text-steel-500 hover:border-ink hover:text-ink shrink-0"
                    aria-label={t("reviews.addPhotos")}
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_PHOTO_TYPES.join(",")}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
              <span className="text-[11px] text-steel-500">{t("reviews.addPhotos")} · {t("reviews.photoLimitReached")}</span>
            </div>

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
