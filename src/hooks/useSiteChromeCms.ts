import { useEffect, useState } from "react";
import { getPublishedPageSections, type PublishedSection } from "../services/cms/publishedCmsService";

/** One query covering announcement bar + navigation + footer together (all on the 'site-chrome'
 * cms_pages row) — Header.tsx and Footer.tsx both use this single hook/query rather than each
 * fetching separately. */
export function useSiteChromeCms() {
  const [sections, setSections] = useState<PublishedSection[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublishedPageSections("site-chrome").then((s) => {
      if (!cancelled) setSections(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const bySectionKey = new Map((sections ?? []).map((s) => [s.sectionKey, s]));
  return { bySectionKey, loading: sections === null };
}
