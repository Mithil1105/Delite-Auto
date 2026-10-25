import { useEffect, useState } from "react";
import { Check, X, BadgeCheck, FlaskConical } from "lucide-react";
import clsx from "clsx";
import { supabase } from "../../../lib/supabaseClient";
import { useActivityLog } from "../../hooks/useActivityLog";
import { useAdminToast } from "../../components/AdminToastProvider";
import { Drawer, KeyValue, Badge } from "../../analytics/ui";
import { StarRating } from "../../../components/ui/StarRating";
import { reviewMediaPublicUrl } from "../../../lib/media/reviewMedia";

type StatusTab = "pending" | "approved" | "rejected" | "all";
type Source = "real" | "demo" | "all";
type SortChoice = "auto" | "newest" | "oldest" | "highest" | "lowest";

interface ReviewRow {
  id: string;
  odoo_template_id: number;
  /** Half-star steps: 1, 1.5 … 5. */
  rating: number;
  title: string | null;
  body: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  user_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  /** Name shown publicly with the review (snapshot taken when it was submitted). */
  reviewer_name: string | null;
  moderated_by: string | null;
  moderated_at: string | null;
  product_name?: string;
  verified_purchase: boolean;
  photo_paths: string[];
  /** Demo/placeholder review added for display (not written by a real customer). */
  is_seed: boolean;
}

interface Counts {
  pending: number;
  approved: number;
  rejected: number;
  all: number;
  real: number;
  demo: number;
}

const PAGE_SIZE = 50;
const RATING_OPTIONS = ["5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1"];
const fmt = (n: number) => n.toLocaleString("en-IN");
const selectClass = "h-10 rounded-lg border border-line bg-white px-3 text-[13px] focus:border-ink focus:outline-none";

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "pending", label: "Needs review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];
const SOURCE_TABS: { value: Source; label: string }[] = [
  { value: "real", label: "Customer reviews" },
  { value: "demo", label: "Demo reviews" },
  { value: "all", label: "Both" },
];

const statusTone = (s: ReviewRow["status"]) => (s === "approved" ? "good" : s === "rejected" ? "bad" : "neutral");
const statusLabel = (s: ReviewRow["status"]) => (s === "pending" ? "Needs review" : s === "approved" ? "Approved" : "Rejected");

/** Who wrote it: the linked customer when there is one, otherwise the name the review was published under. */
function whoWrote(r: ReviewRow): string {
  if (r.is_seed) return `${r.reviewer_name || "Anonymous"} · demo`;
  return r.customer_name || r.customer_email || r.reviewer_name || "Unknown customer";
}

/**
 * Review moderation. Reads go through the admin-reviews-list Edge Function (wraps
 * public.admin_reviews_query: status/source/rating/date/search/sort + counts + Odoo product names).
 * By default only genuine customer reviews are listed — the demo reviews seeded for display
 * (is_seed, ~26,000 of them, already approved) would otherwise drown the moderation queue — and a
 * Source switch shows them when wanted. Approve/reject is a direct RLS-gated update, logged via
 * useActivityLog; the "review approved" email is only sent for real customer reviews. See
 * Documentations MD/delite-accounts-orders-reviews-admin.md and admin-reviews-update.md.
 */
export default function AdminReviews() {
  const { logActivity } = useActivityLog();
  const { showToast } = useAdminToast();
  const [tab, setTab] = useState<StatusTab>("pending");
  const [source, setSource] = useState<Source>("real");
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [rating, setRating] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortChoice, setSortChoice] = useState<SortChoice>("auto");
  const [loadError, setLoadError] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReviewRow | null>(null);

  const sort = sortChoice === "auto" ? (tab === "pending" ? "oldest" : "newest") : sortChoice;

  const load = async () => {
    if (!supabase) return;
    setRows(null);
    setLoadError(false);
    const { data, error } = await supabase.functions.invoke<{ rows: ReviewRow[]; total: number; counts?: Counts }>("admin-reviews-list", {
      body: {
        status: tab,
        source,
        ratingMin: rating === "all" ? undefined : Number(rating),
        ratingMax: rating === "all" ? undefined : Number(rating),
        dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        dateTo: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
        search: search.trim() || undefined,
        sort,
        page,
        pageSize: PAGE_SIZE,
      },
    });
    if (error || !data) {
      setRows([]);
      setTotal(0);
      setLoadError(true);
      // Surface the function's own message (e.g. "Forbidden", "MFA required") in the console for diagnosis.
      const ctx = (error as { context?: Response } | null)?.context;
      if (ctx && typeof ctx.json === "function") ctx.json().then((b) => console.error("[admin-reviews] load failed", b)).catch(() => {});
      return;
    }
    setRows(data.rows);
    setTotal(data.total);
    if (data.counts) setCounts(data.counts);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, source, page, search, rating, dateFrom, dateTo, sort]);

  useEffect(() => setPage(0), [tab, source, search, rating, dateFrom, dateTo, sortChoice]);

  const moderate = async (row: ReviewRow, status: "approved" | "rejected") => {
    if (!supabase) return;
    setActingId(row.id);
    const { error } = await supabase.from("product_reviews").update({ status }).eq("id", row.id);
    setActingId(null);
    if (error) {
      showToast("Couldn't update this review — your role may not have permission.", "error");
      return;
    }
    logActivity("review.moderated", "product_review", row.id, { status });
    // The "your review was approved" email only makes sense for a real customer account.
    if (status === "approved" && !row.is_seed && row.user_id) supabase.functions.invoke("review-notify", { body: { reviewId: row.id } }).catch(() => {});
    showToast(status === "approved" ? "Review approved" : "Review rejected");
    setSelected(null);
    await load();
  };

  const filtersActive = rating !== "all" || search.trim() !== "" || dateFrom !== "" || dateTo !== "" || sortChoice !== "auto";
  const clearFilters = () => {
    setRating("all");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setSortChoice("auto");
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeTo = Math.min(total, (page + 1) * PAGE_SIZE);
  const tabCount = (v: StatusTab) => (counts ? counts[v] : undefined);

  const ModerationButtons = ({ row, large = false }: { row: ReviewRow; large?: boolean }) => (
    <>
      <button
        type="button"
        disabled={actingId === row.id}
        onClick={() => moderate(row, "approved")}
        className={large ? "btn-dark !px-4 !py-2 text-[12.5px] disabled:opacity-50" : "inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] font-semibold text-emerald-700 hover:border-emerald-600 disabled:opacity-50"}
      >
        <Check className="h-3.5 w-3.5" /> Approve
      </button>
      <button
        type="button"
        disabled={actingId === row.id}
        onClick={() => moderate(row, "rejected")}
        className={large ? "btn-outline !px-4 !py-2 text-[12.5px] disabled:opacity-50" : "inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] font-semibold text-sale hover:border-sale disabled:opacity-50"}
      >
        <X className="h-3.5 w-3.5" /> Reject
      </button>
    </>
  );

  return (
    <div className="space-y-5 p-6 lg:p-8">
      <p className="max-w-[70ch] text-[13px] text-steel-500">
        Approve or reject what customers write about products. Approved reviews appear on the product page. Demo reviews (sample content added for display) are hidden from this list unless you switch to them.
      </p>

      {/* Status + source */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Review status" className="inline-flex flex-wrap gap-1 rounded-xl bg-steel-100 p-1">
          {STATUS_TABS.map((s) => {
            const n = tabCount(s.value);
            const active = tab === s.value;
            return (
              <button
                key={s.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(s.value)}
                className={clsx("inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-all", active ? "bg-white text-ink shadow-card" : "text-steel-600 hover:text-ink")}
              >
                {s.label}
                {n !== undefined && (
                  <span className={clsx("rounded-full px-1.5 text-[11px] font-semibold tabular-nums", s.value === "pending" && n > 0 ? "bg-amber-100 text-amber-800" : "bg-steel-200 text-steel-700")}>{fmt(n)}</span>
                )}
              </button>
            );
          })}
        </div>
        <div role="group" aria-label="Review source" className="inline-flex flex-wrap gap-1 rounded-xl bg-steel-100 p-1">
          {SOURCE_TABS.map((s) => {
            const n = counts ? (s.value === "real" ? counts.real : s.value === "demo" ? counts.demo : counts.real + counts.demo) : undefined;
            const active = source === s.value;
            return (
              <button
                key={s.value}
                type="button"
                aria-pressed={active}
                onClick={() => setSource(s.value)}
                className={clsx("inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-all", active ? "bg-white text-ink shadow-card" : "text-steel-600 hover:text-ink")}
              >
                {s.label}
                {n !== undefined && <span className="rounded-full bg-steel-200 px-1.5 text-[11px] font-semibold tabular-nums text-steel-700">{fmt(n)}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {source !== "real" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-900">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Demo reviews are sample content, not written by customers. They have no customer account, so approving or rejecting one never sends an email.</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search text, name or email" aria-label="Search reviews" className={`${selectClass} min-w-[230px] flex-1 sm:flex-none`} />
        <select value={rating} onChange={(e) => setRating(e.target.value)} aria-label="Rating" className={selectClass}>
          <option value="all">Any rating</option>
          {RATING_OPTIONS.map((n) => (
            <option key={n} value={n}>{n} stars</option>
          ))}
        </select>
        <select value={sortChoice} onChange={(e) => setSortChoice(e.target.value as SortChoice)} aria-label="Sort" className={selectClass}>
          <option value="auto">{tab === "pending" ? "Oldest first" : "Newest first"}</option>
          <option value={tab === "pending" ? "newest" : "oldest"}>{tab === "pending" ? "Newest first" : "Oldest first"}</option>
          <option value="highest">Highest rating</option>
          <option value="lowest">Lowest rating</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" className={selectClass} />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" className={selectClass} />
        {filtersActive && (
          <button type="button" onClick={clearFilters} className="text-[13px] font-medium underline underline-offset-2 hover:text-brand-700">
            Clear filters
          </button>
        )}
      </div>

      {rows === null && <p className="text-[13.5px] text-steel-500">Loading reviews…</p>}
      {rows !== null && loadError && <p className="text-[13.5px] text-sale" role="alert">Couldn't load reviews. Check your connection and permissions, then try again.</p>}
      {rows !== null && !loadError && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line py-14 text-center text-[13.5px] text-steel-500">
          {tab === "pending" && source === "real" && !filtersActive ? "Nothing waiting for review. 🎉" : "No reviews match these filters."}
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {rows.map((r) => (
            <div key={r.id} onClick={() => setSelected(r)} className="flex cursor-pointer flex-col gap-3 px-4 py-4 transition-colors hover:bg-steel-50/60 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <StarRating rating={r.rating} showValue />
                  <span className="text-[12px] text-steel-500">{r.product_name}</span>
                  {r.verified_purchase && !r.is_seed && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700">
                      <BadgeCheck className="h-3.5 w-3.5" /> Verified purchase
                    </span>
                  )}
                  {r.is_seed && <Badge tone="warn">Demo</Badge>}
                  {tab === "all" && <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>}
                </div>
                {r.title && <div className="text-[13.5px] font-semibold">{r.title}</div>}
                {r.body && <p className="mt-1 line-clamp-2 max-w-xl text-[13.5px] text-ink/75">{r.body}</p>}
                {r.photo_paths?.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {r.photo_paths.slice(0, 4).map((p) => (
                      <img key={p} src={reviewMediaPublicUrl(p)} alt="" className="h-8 w-8 rounded border border-line object-cover" />
                    ))}
                    {r.photo_paths.length > 4 && <span className="text-[11px] text-steel-500">+{r.photo_paths.length - 4}</span>}
                  </div>
                )}
                <div className="mt-1 text-[11.5px] text-steel-500">
                  {whoWrote(r)} · {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              {r.status === "pending" && (
                <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <ModerationButtons row={r} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-steel-500">{fmt(rangeFrom)}–{fmt(rangeTo)} of {fmt(total)}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 0} onClick={() => setPage((p) => p - 1)} className="btn-ghost !px-3 !py-1.5 disabled:opacity-40">Prev</button>
            <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-ghost !px-3 !py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.product_name ?? ""} subtitle={selected ? new Date(selected.created_at).toLocaleString() : ""}>
        {selected && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StarRating rating={selected.rating} size="w-4 h-4" showValue />
              {selected.is_seed && <Badge tone="warn">Demo review</Badge>}
            </div>
            {selected.title && <p className="mt-2 text-[14px] font-semibold">{selected.title}</p>}
            {selected.body && <p className="mt-1 whitespace-pre-wrap text-[13.5px]">{selected.body}</p>}
            {selected.photo_paths?.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {selected.photo_paths.map((p) => (
                  <a key={p} href={reviewMediaPublicUrl(p)} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded-lg border border-line">
                    <img src={reviewMediaPublicUrl(p)} alt="" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            )}
            <div className="mt-4">
              <KeyValue
                rows={[
                  ["Shown publicly as", selected.reviewer_name || "—"],
                  ["Customer account", selected.is_seed ? "None (demo review)" : selected.customer_name || selected.customer_email || "Unknown"],
                  ["Verified purchase", selected.is_seed ? "n/a" : selected.verified_purchase ? "Yes" : "No"],
                  ["Product", selected.product_name ?? "—"],
                  ["Submitted", new Date(selected.created_at).toLocaleString()],
                  ["Status", <Badge key="st" tone={statusTone(selected.status)}>{statusLabel(selected.status)}</Badge>],
                  ["Moderated by", selected.moderated_by ?? "—"],
                  ["Moderated at", selected.moderated_at ? new Date(selected.moderated_at).toLocaleString() : "—"],
                ]}
              />
            </div>
            {selected.status === "pending" && (
              <div className="mt-4 flex gap-2">
                <ModerationButtons row={selected} large />
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
