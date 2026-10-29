/** Public URL of a branding image in the existing `marketing-media` bucket (public by design — logos
 * and banners are not confidential). Paths are validated server-side before they are ever stored. */
export function brandingImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/marketing-media/${path}`;
}

/** The dealer SPA is served at the root of dealers.deliteauto.com, but under /dealer when it shares
 * the storefront's dev server. */
export function dealerBasename(): string {
  const override = import.meta.env.VITE_DEALER_BASENAME;
  if (typeof override === "string") return override === "/" ? "" : override;
  return typeof location !== "undefined" && location.hostname.startsWith("dealers.") ? "" : "/dealer";
}
