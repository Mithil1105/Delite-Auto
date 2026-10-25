import { useEffect, useMemo, useState } from "react";
import { getPublishedPageSections, type PublishedSection } from "../services/cms/publishedCmsService";
import { isDealsPageEnabled, resolveDealsSections } from "../lib/deals/helpers";

/**
 * The Deals & Offers page's published CMS rows ("deals" page — see src/data/dealsSections.ts),
 * merged with the in-code defaults. The Header/Footer use it too (to hide the menu link when the
 * client switches the page off), so the query is shared for a minute instead of repeating on every
 * route change. `loading` is true until the first answer; callers treat "loading" as enabled so the
 * menu link doesn't flicker out for the usual case.
 */
const CACHE_MS = 60_000;
let cache: { at: number; promise: Promise<PublishedSection[]> } | null = null;

function loadPublished(): Promise<PublishedSection[]> {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    const promise = getPublishedPageSections("deals").catch(() => [] as PublishedSection[]);
    cache = { at: Date.now(), promise };
  }
  return cache.promise;
}

export function useDealsCms() {
  const [rows, setRows] = useState<PublishedSection[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPublished().then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sections = useMemo(() => resolveDealsSections(rows ?? []), [rows]);
  return { loading: rows === null, sections, pageEnabled: isDealsPageEnabled(sections) };
}
