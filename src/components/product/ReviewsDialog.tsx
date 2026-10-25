import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Star } from "lucide-react";
import clsx from "clsx";
import type { ReviewRow } from "../../hooks/useProductReviews";
import { reviewMediaPublicUrl } from "../../lib/media/reviewMedia";
import { Dialog } from "../ui/Dialog";
import { useLang } from "../../i18n/LanguageContext";

export type StarFilter = 0 | 1 | 2 | 3 | 4 | 5; // 0 = all
type SortMode = "newest" | "oldest" | "highest" | "lowest";

const PAGE = 15;

export function ReviewPhotoStrip({ paths }: { paths: string[] }) {
  if (paths.length === 0) return null;
  return (
    <div className="mt-2 flex items-center gap-2">
      {paths.map((p) => (
        <a key={p} href={reviewMediaPublicUrl(p)} target="_blank" rel="noreferrer" className="block h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-line">
          <img src={reviewMediaPublicUrl(p)} alt="" className="h-full w-full object-cover" loading="lazy" />
        </a>
      ))}
    </div>
  );
}

/** One review: stars (half stars supported), name, verified badge, text, photos, date. */
export function ReviewCard({ r }: { r: ReviewRow }) {
  const { t } = useLang();
  return (
    <div className="py-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }, (_, i) =>
            i + 0.5 === r.rating ? (
              <span key={i} className="relative inline-block h-3.5 w-3.5">
                <Star className="absolute inset-0 h-3.5 w-3.5 text-line" />
                <span className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
                  <Star className="h-3.5 w-3.5 fill-gold text-gold" />
                </span>
              </span>
            ) : (
              <Star key={i} className={clsx("h-3.5 w-3.5", i < r.rating ? "fill-gold text-gold" : "text-line")} />
            )
          )}
        </div>
        <span className="text-[12.5px] font-semibold">{r.reviewer_name || t("reviews.anonymous")}</span>
        {r.verified_purchase && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700">
            <BadgeCheck className="h-3.5 w-3.5" /> {t("reviews.verifiedPurchase")}
          </span>
        )}
      </div>
      {r.title && <div className="text-[13.5px] font-semibold">{r.title}</div>}
      {r.body && <p className="mt-1 text-[13.5px] text-ink/75">{r.body}</p>}
      <ReviewPhotoStrip paths={r.photo_paths} />
      <div className="mt-1 text-[11.5px] text-steel-500">{new Date(r.created_at).toLocaleDateString()}</div>
    </div>
  );
}

/** Pop-up with every review of the product and filters: stars, photos only, verified only, sort. */
export function ReviewsDialog({
  open,
  onClose,
  reviews,
  breakdown,
  initialStar = 0,
}: {
  open: boolean;
  onClose: () => void;
  reviews: ReviewRow[];
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
  initialStar?: StarFilter;
}) {
  const { t } = useLang();
  const [star, setStar] = useState<StarFilter>(initialStar);
  const [sort, setSort] = useState<SortMode>("newest");
  const [withPhotos, setWithPhotos] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);

  // Opening from a star bar starts on that rating; every open starts at the first page.
  useEffect(() => {
    if (open) {
      setStar(initialStar);
      setShown(PAGE);
    }
  }, [open, initialStar]);

  const filtered = useMemo(() => {
    const list = reviews.filter((r) => (star === 0 || Math.floor(r.rating) === star) && (!withPhotos || r.photo_paths.length > 0) && (!verifiedOnly || r.verified_purchase));
    const time = (r: ReviewRow) => Date.parse(r.created_at);
    return [...list].sort((a, b) => {
      if (sort === "highest") return b.rating - a.rating || time(b) - time(a);
      if (sort === "lowest") return a.rating - b.rating || time(b) - time(a);
      if (sort === "oldest") return time(a) - time(b);
      return time(b) - time(a);
    });
  }, [reviews, star, sort, withPhotos, verifiedOnly]);

  const reset = () => {
    setStar(0);
    setWithPhotos(false);
    setVerifiedOnly(false);
    setShown(PAGE);
  };
  const filtersActive = star !== 0 || withPhotos || verifiedOnly;
  const chip = (active: boolean) => clsx("inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors", active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/75 hover:border-ink");

  return (
    <Dialog open={open} onClose={onClose} title={`${t("reviews.allReviews")} (${reviews.length})`}>
      {/* Filters stay pinned while the list scrolls. */}
      <div className="sm:sticky sm:-top-4 z-10 -mx-5 -mt-4 bg-white px-5 pb-2 pt-4 shadow-[0_6px_8px_-8px_rgba(17,24,39,0.25)]">
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label={t("reviews.filters")}>
        <button type="button" className={chip(star === 0)} aria-pressed={star === 0} onClick={() => { setStar(0); setShown(PAGE); }}>{t("faq.all")}</button>
        {([5, 4, 3, 2, 1] as const).map((n) => (
          <button key={n} type="button" className={chip(star === n)} aria-pressed={star === n} onClick={() => { setStar(star === n ? 0 : n); setShown(PAGE); }}>
            {n} <Star className={clsx("h-3 w-3", star === n ? "fill-white text-white" : "fill-gold text-gold")} /> <span className="font-normal opacity-70">({breakdown[n]})</span>
          </button>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={chip(withPhotos)} aria-pressed={withPhotos} onClick={() => { setWithPhotos(!withPhotos); setShown(PAGE); }}>{t("reviews.withPhotos")}</button>
          <button type="button" className={chip(verifiedOnly)} aria-pressed={verifiedOnly} onClick={() => { setVerifiedOnly(!verifiedOnly); setShown(PAGE); }}>{t("reviews.verifiedOnly")}</button>
          {filtersActive && (
            <button type="button" onClick={reset} className="text-[12.5px] font-semibold text-brand-700 hover:underline">{t("reviews.clearFilters")}</button>
          )}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} aria-label={t("reviews.sortBy")} className="h-9 border border-line bg-white px-2.5 text-[12.5px] focus:border-ink focus:outline-none">
          <option value="newest">{t("reviews.sortNewest")}</option>
          <option value="oldest">{t("reviews.sortOldest")}</option>
          <option value="highest">{t("reviews.sortHighest")}</option>
          <option value="lowest">{t("reviews.sortLowest")}</option>
        </select>
      </div>
      <p className="text-[12px] text-steel-500" aria-live="polite">{t("reviews.showingCount").replace("{shown}", String(Math.min(shown, filtered.length))).replace("{total}", String(filtered.length))}</p>
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-[13px] text-steel-500">{t("reviews.noReviewsMatchFilter")}</p>
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {filtered.slice(0, shown).map((r) => (
            <ReviewCard key={r.id} r={r} />
          ))}
        </div>
      )}
      {shown < filtered.length && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="btn-outline mx-auto mt-4 block">{t("reviews.showMore")}</button>
      )}
    </Dialog>
  );
}
