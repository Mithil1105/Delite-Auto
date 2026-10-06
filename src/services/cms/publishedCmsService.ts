import { supabase } from "../../lib/supabaseClient";
import type { ImagePositionByDevice } from "../../lib/media/imagePosition";

/**
 * The ONE file public storefront components read CMS content through — mirrors
 * src/admin/services/cmsService.ts's shape but queries cms_section_published (never drafts), with
 * no admin-only assumptions. Deliberately lives outside src/admin/ (unlike the admin-only
 * cmsService.ts) since Home.tsx/Header.tsx/Footer.tsx and their hooks import it — same boundary
 * reasoning as src/services/catalog/catalogService.ts. Public RLS
 * (20260918084540_add_public_cms_read_policies.sql) governs this at the database level too — this
 * file can't leak a draft even if misused, since drafts simply aren't in the table it queries.
 * See Documentations MD/delite-admin.md, "Published CMS store service".
 */

export interface PublishedSection {
  sectionKey: string;
  sectionType: string;
  content: Record<string, unknown>;
  visible: boolean;
  displayOrder: number;
}

/** One query per page — every section's published content in a single round trip (spec: avoid
 * N+1 across 11+ CMS sections). */
export async function getPublishedPageSections(pageSlug: string): Promise<PublishedSection[]> {
  if (!supabase) return [];
  const { data: page } = await supabase.from("cms_pages").select("id").eq("slug", pageSlug).maybeSingle();
  if (!page) return [];

  const { data, error } = await supabase
    .from("cms_sections")
    .select("section_key, section_type, cms_section_published(content, visible, display_order)")
    .eq("page_id", page.id);
  if (error || !data) return [];

  return data
    .map((row): PublishedSection | null => {
      const pub = Array.isArray(row.cms_section_published) ? row.cms_section_published[0] : row.cms_section_published;
      if (!pub) return null;
      return {
        sectionKey: row.section_key,
        sectionType: row.section_type,
        content: (pub.content as Record<string, unknown>) ?? {},
        visible: pub.visible,
        displayOrder: pub.display_order,
      };
    })
    .filter((r): r is PublishedSection => r !== null)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export interface PublishedPromotion {
  id: string;
  heading: string;
  subheading: string | null;
  body: string | null;
  imageStoragePath: string | null;
  mobileImageStoragePath: string | null;
  imagePosition: ImagePositionByDevice | null;
  mobileImagePosition: ImagePositionByDevice | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  displayOrder: number;
}

export async function getPublishedPromotions(): Promise<PublishedPromotion[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("cms_promotions")
    .select("id, heading, subheading, body, image_storage_path, mobile_image_storage_path, image_position, mobile_image_position, cta_label, cta_url, display_order")
    .eq("status", "published")
    .eq("enabled", true)
    .order("display_order", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    heading: r.heading,
    subheading: r.subheading,
    body: r.body,
    imageStoragePath: r.image_storage_path,
    mobileImageStoragePath: r.mobile_image_storage_path,
    imagePosition: (r.image_position as ImagePositionByDevice | null) ?? null,
    mobileImagePosition: (r.mobile_image_position as ImagePositionByDevice | null) ?? null,
    ctaLabel: r.cta_label,
    ctaUrl: r.cta_url,
    displayOrder: r.display_order,
  }));
}

/** Builds a public URL for a marketing-media Storage object from its stored path. */
export function mediaPublicUrl(storagePath: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL ?? "";
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/marketing-media/${storagePath}`;
}
