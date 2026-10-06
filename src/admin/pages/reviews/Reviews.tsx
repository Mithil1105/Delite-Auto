import { useEffect, useState } from "react";
import { Star, Check, X } from "lucide-react";
import clsx from "clsx";
import { supabase } from "../../../lib/supabaseClient";
import { useLang } from "../../../i18n/LanguageContext";
import { useActivityLog } from "../../hooks/useActivityLog";
import { Drawer, KeyValue, Badge } from "../../analytics/ui";

type StatusTab = "pending" | "approved" | "rejected" | "all";

interface ReviewRow {
  id: string;
  odoo_template_id: number;
  rating: number;
  title: string | null;
  body: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  user_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  moderated_by: string | null;
  moderated_at: string | null;
  product_name?: string;
}

const PAGE_SIZE = 50;

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={clsx("w-3.5 h-3.5", i < rating ? "fill-gold text-gold" : "text-line")} />
      ))}
    </div>
  );
}

/** Real history (previously pending-only — moderated reviews disappeared from Admin entirely).
 * Tabs + search + rating/date filters + server pagination via admin-reviews-list (wraps
 * public.admin_reviews_query — see Documentations MD/delite-production-operations.md). Moderation
 * itself (approve/reject) is unchanged: a direct RLS-gated client update, still logged once per
 * action via useActivityLog — this page only changed how reviews are READ, not how they're
 * approved/rejected. */
export default function AdminReviews() {
  const { t } = useLang();
  const { logActivity } = useActivityLog();
  const [tab, setTab] = useState<StatusTab>("pending");
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState<"all" | "1" | "2" | "3" | "4" | "5">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReviewRow | null>(null);

  const load = async () => {
    if (!supabase) return;
    setRows(null);
    const { data, error } = await supabase.functions.invoke<{ rows: ReviewRow[]; total: number }>("admin-reviews-list", {
      body: {
        status: tab,
        ratingMin: ratingFilter === "all" ? undefined : Number(ratingFilter),
        ratingMax: ratingFilter === "all" ? undefined : Number(ratingFilter),
        dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        dateTo: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
        search: search.trim() || undefined,
        sort: tab === "pending" ? "oldest" : "newest",
        page,
        pageSize: PAGE_SIZE,
      },
    });
    if (error || !data) {
      setRows([]);
      setTotal(0);
      return;
    }
    setRows(data.rows);
    setTotal(data.total);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, search, ratingFilter, dateFrom, dateTo]);

  useEffect(() => setPage(0), [tab, search, ratingFilter, dateFrom, dateTo]);

  const moderate = async (id: string, status: "approved" | "rejected") => {
    if (!supabase) return;
    setActingId(id);
    await supabase.from("product_reviews").update({ status }).eq("id", id);
    setActingId(null);
    logActivity("review.moderated", "product_review", id, { status });
    if (status === "approved") supabase.functions.invoke("review-notify", { body: { reviewId: id } }).catch(() => {});
    setSelected(null);
    await load();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeTo = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="font-display uppercase text-[13.5px]">{t("admin.reviewsTab")}</h2>
        <div role="tablist" className="inline-flex border border-line bg-white">
          {(["pending", "approved", "rejected", "all"] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={tab === s} onClick={() => setTab(s)} className={`px-3 py-1.5 text-[12px] font-semibold capitalize ${tab === s ? "bg-ink text-white" : "text-steel-700 hover:bg-steel-50"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search review, customer" className="h-9 px-2.5 border border-line text-[12.5px] min-w-[220px]" />
        <select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value as typeof ratingFilter)} className="h-9 px-2.5 border border-line text-[12.5px]">
          <option value="all">All ratings</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>{n} star{n > 1 ? "s" : ""}</option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 px-2.5 border border-line text-[12.5px]" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 px-2.5 border border-line text-[12.5px]" />
      </div>

      {rows === null && <p className="text-[13.5px] text-steel-500">{t("account.loadingOrders")}</p>}
      {rows !== null && rows.length === 0 && <p className="text-[13.5px] text-steel-500">No reviews match these filters.</p>}

      {rows !== null && rows.length > 0 && (
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {rows.map((r) => (
            <div key={r.id} onClick={() => setSelected(r)} className="py-4 flex items-start justify-between gap-4 cursor-pointer hover:bg-steel-50/50 px-2 -mx-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Stars rating={r.rating} />
                  <span className="text-[11.5px] text-steel-500">{r.product_name}</span>
                  {tab === "all" && <Badge tone={r.status === "approved" ? "good" : r.status === "rejected" ? "bad" : "neutral"}>{r.status}</Badge>}
                </div>
                {r.title && <div className="font-semibold text-[13.5px]">{r.title}</div>}
                {r.body && <p className="text-[13.5px] text-ink/75 mt-1 max-w-lg line-clamp-2">{r.body}</p>}
                <div className="text-[11.5px] text-steel-500 mt-1">
                  {r.customer_name || r.customer_email || "Unknown customer"} · {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              {r.status === "pending" && (
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button type="button" disabled={actingId === r.id} onClick={() => moderate(r.id, "approved")} className="flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline disabled:opacity-50">
                    <Check className="w-3.5 h-3.5" /> {t("admin.approve")}
                  </button>
                  <button type="button" disabled={actingId === r.id} onClick={() => moderate(r.id, "rejected")} className="flex items-center gap-1 text-[12.5px] font-semibold text-sale hover:underline disabled:opacity-50">
                    <X className="w-3.5 h-3.5" /> {t("admin.reject")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between mt-4 text-[13px]">
          <span className="text-steel-500">{rangeFrom}–{rangeTo} of {total}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 0} onClick={() => setPage((p) => p - 1)} className="btn-ghost !px-3 !py-1.5 disabled:opacity-40">Prev</button>
            <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-ghost !px-3 !py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.product_name ?? ""} subtitle={selected ? new Date(selected.created_at).toLocaleString() : ""}>
        {selected && (
          <>
            <Stars rating={selected.rating} />
            {selected.title && <p className="font-semibold text-[14px] mt-2">{selected.title}</p>}
            {selected.body && <p className="text-[13.5px] whitespace-pre-wrap mt-1">{selected.body}</p>}
            <div className="mt-4">
              <KeyValue
                rows={[
                  ["Customer", selected.customer_name || selected.customer_email || "Unknown"],
                  ["Product", selected.product_name ?? "—"],
                  ["Submitted", new Date(selected.created_at).toLocaleString()],
                  ["Status", <Badge key="st" tone={selected.status === "approved" ? "good" : selected.status === "rejected" ? "bad" : "neutral"}>{selected.status}</Badge>],
                  ["Moderated by", selected.moderated_by ?? "—"],
                  ["Moderated at", selected.moderated_at ? new Date(selected.moderated_at).toLocaleString() : "—"],
                ]}
              />
            </div>
            {selected.status === "pending" && (
              <div className="flex gap-2 mt-4">
                <button type="button" disabled={actingId === selected.id} onClick={() => moderate(selected.id, "approved")} className="btn-dark !px-4 !py-2 text-[12.5px] disabled:opacity-50">Approve</button>
                <button type="button" disabled={actingId === selected.id} onClick={() => moderate(selected.id, "rejected")} className="btn-outline !px-4 !py-2 text-[12.5px] disabled:opacity-50">Reject</button>
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
