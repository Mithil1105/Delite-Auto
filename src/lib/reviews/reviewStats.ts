import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export interface ReviewStat {
  average: number;
  count: number;
}

/**
 * Review stars for product cards. Every card asks for its own product, but they are collected and fetched in ONE
 * `product_review_stats` call (batched for a few milliseconds), cached for five minutes, and shared by every card on the
 * page — a page of 60 products makes one request, not 60. Products with no approved reviews are cached as "none".
 */
const TTL_MS = 5 * 60_000;
const BATCH_MS = 40;
const MAX_IDS = 200;

const cache = new Map<number, { stat: ReviewStat | null; at: number }>();
const pending = new Set<number>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const ids = [...pending].slice(0, MAX_IDS);
  ids.forEach((id) => pending.delete(id));
  if (pending.size > 0) timer = setTimeout(flush, BATCH_MS);
  if (ids.length === 0 || !supabase) return;

  const { data, error } = await supabase.rpc("product_review_stats", { p_ids: ids });
  if (error) {
    // Don't cache a failure — the next card render will try again.
    return;
  }
  const found = new Map<number, ReviewStat>();
  for (const row of (data ?? []) as { odoo_template_id: number; review_count: number; average: number | string }[]) {
    found.set(row.odoo_template_id, { average: Number(row.average), count: row.review_count });
  }
  const now = Date.now();
  for (const id of ids) cache.set(id, { stat: found.get(id) ?? null, at: now });
  listeners.forEach((l) => l());
}

function request(id: number) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return;
  pending.add(id);
  if (!timer) timer = setTimeout(flush, BATCH_MS);
}

/** The approved-review average and count for one Odoo product, or `undefined` while loading / when there are none. */
export function useReviewStat(odooId: number | undefined): ReviewStat | undefined {
  const [, force] = useState(0);
  useEffect(() => {
    if (odooId === undefined) return;
    const onChange = () => force((n) => n + 1);
    listeners.add(onChange);
    request(odooId);
    return () => {
      listeners.delete(onChange);
    };
  }, [odooId]);
  return odooId === undefined ? undefined : cache.get(odooId)?.stat ?? undefined;
}
