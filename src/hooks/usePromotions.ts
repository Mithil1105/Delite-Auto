import { useEffect, useState } from "react";
import { getPublishedPromotions, mediaPublicUrl, type PublishedPromotion } from "../services/cms/publishedCmsService";
import type { ImagePositionByDevice } from "../lib/media/imagePosition";

export interface PromoBannerContent {
  id: string;
  heading: string;
  subheading: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  image: string | null;
  mobileImage: string | null;
  imagePosition: ImagePositionByDevice | null;
  mobileImagePosition: ImagePositionByDevice | null;
}

function toBanner(p: PublishedPromotion): PromoBannerContent {
  return {
    id: p.id,
    heading: p.heading,
    subheading: p.subheading,
    ctaLabel: p.ctaLabel,
    ctaUrl: p.ctaUrl,
    image: p.imageStoragePath ? mediaPublicUrl(p.imageStoragePath) : null,
    mobileImage: p.mobileImageStoragePath ? mediaPublicUrl(p.mobileImageStoragePath) : null,
    imagePosition: p.imagePosition,
    mobileImagePosition: p.mobileImagePosition,
  };
}

/** Published+enabled promotions for the homepage's PromoBannerPair slot — empty until an admin
 * actually publishes one, so the pair's current hardcoded banners keep rendering until then. */
export function usePromotions() {
  const [promotions, setPromotions] = useState<PromoBannerContent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublishedPromotions().then((items) => {
      if (!cancelled) setPromotions(items.map(toBanner));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { promotions, loading: promotions === null };
}
