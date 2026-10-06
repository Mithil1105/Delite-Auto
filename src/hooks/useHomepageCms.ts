import { useEffect, useState } from "react";
import { getPublishedPageSections, type PublishedSection } from "../services/cms/publishedCmsService";

/** One query for the whole homepage's published section order/visibility/content — see
 * Documentations MD/delite-admin.md, "Published content performance". Returns null while loading
 * so Home.tsx can render its existing hardcoded order/content unchanged until this resolves,
 * avoiding a visible reflow (spec: avoid homepage flash/layout shift). */
export function useHomepageCms() {
  const [sections, setSections] = useState<PublishedSection[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublishedPageSections("homepage").then((s) => {
      if (!cancelled) setSections(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const bySectionKey = new Map((sections ?? []).map((s) => [s.sectionKey, s]));
  return { sections, bySectionKey, loading: sections === null };
}
