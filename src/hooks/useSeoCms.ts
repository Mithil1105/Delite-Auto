import { useEffect, useState } from "react";
import { getPublishedPageSections, type PublishedSection } from "../services/cms/publishedCmsService";

export interface SeoContent {
  metaTitle?: string;
  metaDescription?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

// Module-level cache: all 5 routes' SEO content is one query total for the whole session, not
// one query per route navigation (spec: avoid N+1 / repeated queries for rarely-changing content).
let cachePromise: Promise<PublishedSection[]> | null = null;
function loadAll(): Promise<PublishedSection[]> {
  if (!cachePromise) cachePromise = getPublishedPageSections("seo");
  return cachePromise;
}

/** routeKey matches a cms_sections.section_key on the 'seo' page: home/shop/brands/about/contact. */
export function useSeoCms(routeKey: string): SeoContent | null {
  const [content, setContent] = useState<SeoContent | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAll().then((sections) => {
      if (cancelled) return;
      const match = sections.find((s) => s.sectionKey === routeKey);
      setContent((match?.content as SeoContent) ?? {});
    });
    return () => {
      cancelled = true;
    };
  }, [routeKey]);

  return content;
}
