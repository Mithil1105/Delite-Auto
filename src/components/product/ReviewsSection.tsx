import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Star, Upload, X } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { useProductReviews } from "../../hooks/useProductReviews";
import { ReviewCard, ReviewsDialog, type StarFilter } from "./ReviewsDialog";
import { Dialog } from "../ui/Dialog";
import { useLang } from "../../i18n/LanguageContext";

const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS = 6;

/** Reviews shown on the page itself; the rest open in a pop-up with filters. */
const INLINE_REVIEWS = 2;

/** Myntra-style colour grading: dark green for 5 stars through light green, yellow and orange to red for 1 star. */
const STAR_BAR_COLOR: Record<1 | 2 | 3 | 4 | 5, string> = { 5: "bg-emerald-600", 4: "bg-lime-500", 3: "bg-yellow-400", 2: "bg-orange-400", 1: "bg-red-500" };

/** The average's colour follows the same scale, so a 4.7 reads green and a 2.4 reads orange at a glance. */
function averageTone(avg: number): { text: string; star: string } {
  if (avg >= 4) return { text: "text-emerald-700", star: "fill-emerald-600 text-emerald-600" };
  if (avg >= 3) return { text: "text-lime-700", star: "fill-lime-600 text-lime-600" };
  if (avg >= 2) return { text: "text-orange-600", star: "fill-orange-500 text-orange-500" };
  return { text: "text-red-600", star: "fill-red-500 text-red-500" };
}

/** Same-size placeholder shown while the reviews load, so the section doesn't jump when they arrive. */
function ReviewsSkeleton() {
  const bar = "rounded-full bg-steel-100";
  return (
    <div className="animate-pulse motion-reduce:animate-none" role="status" aria-label="Loading reviews">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
        <div className="shrink-0">
          <div className="h-12 w-28 rounded-lg bg-steel-100" />
          <div className="mt-3 h-4 w-20 rounded bg-steel-100" />
        </div>
        <div className="hidden w-px self-stretch bg-line sm:block" aria-hidden />
        <div className="flex w-full max-w-md flex-col gap-3.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`h-2.5 ${bar}`} style={{ width: `${90 - i * 12}%` }} />
          ))}
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="h-4 w-40 rounded bg-steel-100" />
            <div className="h-4 w-56 rounded bg-steel-100" />
            <div className="h-4 w-full max-w-xl rounded bg-steel-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Rating distribution: one coloured bar per star level; clicking a bar opens all reviews filtered to it. */
function RatingBars({ breakdown, total, onFilter }: { breakdown: Record<1 | 2 | 3 | 4 | 5, number>; total: number; onFilter: (n: StarFilter) => void }) {
  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      {([5, 4, 3, 2, 1] as const).map((n) => {
        const count = breakdown[n];
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <button key={n} type="button" onClick={() => onFilter(n)} aria-label={`${n} star: ${count}`} className="group flex items-center gap-2.5 text-left">
            <span className="flex w-9 shrink-0 items-center gap-0.5 text-[13px] font-semibold text-ink/80">
              {n} <Star className="h-3 w-3 fill-ink/60 text-ink/60" />
            </span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-steel-100">
              <span className={clsx("block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none", STAR_BAR_COLOR[n])} style={{ width: `${pct}%` }} />
            </span>
            <span className="w-9 shrink-0 text-right text-[12.5px] text-steel-500 group-hover:text-ink">{count}</span>
          </button>
        );
      })}
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
  const [writeOpen, setWriteOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The pop-up with every review; a star bar opens it already filtered to that rating.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStar, setDialogStar] = useState<StarFilter>(0);
  const openDialog = (star: StarFilter = 0) => {
    setDialogStar(star);
    setDialogOpen(true);
  };
  const latest = reviews.slice(0, INLINE_REVIEWS); // already newest-first

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

  // Until the first answer arrives, show the placeholder instead of just the "Write a review" button.
  if (loading && reviews.length === 0) return <div className="max-w-2xl"><ReviewsSkeleton /></div>;

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div className="flex flex-col gap-5">
        {aggregate.count > 0 ? (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
            <div className="shrink-0">
              <div className="flex items-center gap-2">
                <span className={clsx("text-5xl font-bold leading-none", averageTone(aggregate.average!).text)}>{aggregate.average!.toFixed(1)}</span>
                <Star className={clsx("h-7 w-7", averageTone(aggregate.average!).star)} />
              </div>
              <div className="mt-2 text-[13px] text-steel-500">{aggregate.count} {t("reviews.ratings")}</div>
            </div>
            <div className="hidden w-px self-stretch bg-line sm:block" aria-hidden />
            <RatingBars breakdown={aggregate.breakdown} total={aggregate.count} onFilter={(n) => openDialog(n)} />
          </div>
        ) : (
          !loading && <span className="text-[13px] text-steel-500">{t("product.noReviewsYet")}</span>
        )}
        <button type="button" onClick={() => setWriteOpen(true)} className="btn-outline w-fit">{t("reviews.writeReview")}</button>
      </div>

      {reviews.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col divide-y divide-line">
            {latest.map((r) => (
              <ReviewCard key={r.id} r={r} />
            ))}
          </div>
          {reviews.length > INLINE_REVIEWS && (
            <button type="button" onClick={() => openDialog(0)} className="btn-outline w-fit">
              {t("reviews.seeAll").replace("{n}", String(reviews.length))}
            </button>
          )}
          <ReviewsDialog open={dialogOpen} onClose={() => setDialogOpen(false)} reviews={reviews} breakdown={aggregate.breakdown} initialStar={dialogStar} />
        </div>
      )}

      <Dialog open={writeOpen} onClose={() => setWriteOpen(false)} title={t("reviews.writeReview")} size="md">
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
      </Dialog>
    </div>
  );
}
