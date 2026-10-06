import { useEffect } from "react";
import { useSeoCms } from "../hooks/useSeoCms";

const DEFAULT_DESCRIPTION =
  "Delite Auto Accessories — car & two-wheeler accessories, since 1967. Seat covers, mats, audio, GPS security & car care for every ride, in Ahmedabad and pan-India.";

const ROUTE_DEFAULTS: Record<string, { title: string; description: string }> = {
  home: { title: "Delite Auto Accessories — Delite-fy Your Ride", description: DEFAULT_DESCRIPTION },
  shop: { title: "Shop — Delite Auto Accessories", description: DEFAULT_DESCRIPTION },
  brands: { title: "Brands — Delite Auto Accessories", description: DEFAULT_DESCRIPTION },
  about: { title: "About Us — Delite Auto Accessories", description: DEFAULT_DESCRIPTION },
  contact: { title: "Contact Us — Delite Auto Accessories", description: DEFAULT_DESCRIPTION },
};

function setMeta(name: string, content: string, property = false) {
  const attr = property ? "property" : "name";
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/**
 * Applies published page SEO (Documentations MD/delite-admin.md, "SEO") to the real document head
 * on every route change — CMS value wins when published, existing route default otherwise (never
 * blank). Client-only SPA, no new dependency (no react-helmet) — direct DOM updates, reset on
 * every mount so a stale previous route's tags never linger.
 */
export function SeoHead({ routeKey }: { routeKey: keyof typeof ROUTE_DEFAULTS }) {
  const cms = useSeoCms(routeKey);
  const fallback = ROUTE_DEFAULTS[routeKey];

  useEffect(() => {
    const title = cms?.metaTitle || fallback.title;
    const description = cms?.metaDescription || fallback.description;
    const ogTitle = cms?.ogTitle || title;
    const ogDescription = cms?.ogDescription || description;

    document.title = title;
    setMeta("description", description);
    setMeta("og:title", ogTitle, true);
    setMeta("og:description", ogDescription, true);
    if (cms?.ogImage) setMeta("og:image", cms.ogImage, true);
  }, [cms, fallback]);

  return null;
}
