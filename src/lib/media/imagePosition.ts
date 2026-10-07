import type { CSSProperties } from "react";

/** Shared focal-point/zoom model for editor-controlled marketing media (Promotions, campaign
 * banners — never Odoo product images). Lives outside `src/admin/**` so the real storefront
 * components that need to actually RENDER a stored position (e.g. PromoBannerPair) can import it
 * without depending on admin-only code. */
export interface ImagePosition {
  x: number; // focal point, 0-100 (%)
  y: number; // focal point, 0-100 (%)
  zoom: number; // 1.0-2.5
}

export type ImagePositionByDevice = Partial<Record<"desktop" | "tablet" | "mobile", ImagePosition>>;

export const DEFAULT_IMAGE_POSITION: ImagePosition = { x: 50, y: 50, zoom: 1 };

/** CSS for an <img> so it actually reflects a stored focal point/zoom — object-fit: cover +
 * object-position at the focal point + a scale transform for zoom. Used identically by the admin
 * editor's own live crop preview and by the real storefront component rendering the picked image. */
export function imagePositionStyle(pos: ImagePosition | undefined): CSSProperties {
  const p = pos ?? DEFAULT_IMAGE_POSITION;
  return {
    objectFit: "cover",
    objectPosition: `${p.x}% ${p.y}%`,
    transform: p.zoom !== 1 ? `scale(${p.zoom})` : undefined,
    transformOrigin: `${p.x}% ${p.y}%`,
  };
}

/** Resolves the position to use for a given viewport: mobile → tablet → desktop → default,
 * matching the fallback chain the CMS visual editor documents (never silently 0/0/1). */
export function resolveImagePosition(byDevice: ImagePositionByDevice | null | undefined, device: "desktop" | "tablet" | "mobile"): ImagePosition {
  if (!byDevice) return DEFAULT_IMAGE_POSITION;
  if (device === "mobile") return byDevice.mobile ?? byDevice.tablet ?? byDevice.desktop ?? DEFAULT_IMAGE_POSITION;
  if (device === "tablet") return byDevice.tablet ?? byDevice.desktop ?? DEFAULT_IMAGE_POSITION;
  return byDevice.desktop ?? DEFAULT_IMAGE_POSITION;
}
