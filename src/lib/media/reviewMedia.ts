/** Builds a public URL for a photo in the `review-media` Storage bucket from its stored path
 * (`<uid>/<filename>`, written by ReviewsSection's upload step) — same shape as
 * publishedCmsService.ts's `mediaPublicUrl`, just a different bucket. */
export function reviewMediaPublicUrl(storagePath: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL ?? "";
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/review-media/${storagePath}`;
}
