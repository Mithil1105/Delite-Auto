import { useEffect, useState } from "react";
import { getPublishedPageSections, type PublishedSection } from "../services/cms/publishedCmsService";

// Module-level cache: Header.tsx and Footer.tsx both call this hook, and previously each fired
// its own independent getPublishedPageSections("site-chrome") call (confirmed live — the exact
// same cms_pages/cms_sections queries appeared twice in a single page-load network waterfall).
// Same share-the-in-flight-request pattern useSeoCms.ts already established. Performance pass,
// 2026-10-13 — see Documentations MD/storefront-performance-2026-10.md.
let cachePromise: Promise<PublishedSection[]> | null = null;
function loadSiteChrome(): Promise<PublishedSection[]> {
  if (!cachePromise) cachePromise = getPublishedPageSections("site-chrome");
  return cachePromise;
}

/** One query covering announcement bar + navigation + footer together (all on the 'site-chrome'
 * cms_pages row) — Header.tsx and Footer.tsx both use this single hook, and now share the same
 * underlying request via the module-level cache above rather than each fetching separately. */
export function useSiteChromeCms() {
  const [sections, setSections] = useState<PublishedSection[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSiteChrome().then((s) => {
      if (!cancelled) setSections(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const bySectionKey = new Map((sections ?? []).map((s) => [s.sectionKey, s]));
  return { bySectionKey, loading: sections === null };
}
