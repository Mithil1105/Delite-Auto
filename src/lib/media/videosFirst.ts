import type { ProductMedia } from "../../data/types";

/**
 * Gallery order for a product page: embedded videos (YouTube/Vimeo links from Odoo) come first, so a
 * shopper sees the video before the photos. A stable partition — the relative order of the videos, and
 * of the photos, is exactly what Odoo gave us.
 */
export function videosFirst(media: ProductMedia[]): ProductMedia[] {
  const videos = media.filter((m) => m.video);
  return videos.length === 0 ? media : [...videos, ...media.filter((m) => !m.video)];
}
