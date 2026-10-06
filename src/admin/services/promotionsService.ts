import { supabase } from "../../lib/supabaseClient";
import type { ImagePositionByDevice } from "../components/ImagePositionControl";

/**
 * The one table Phase 2 adds outside the generic cms_sections machinery — Promotions is a true
 * variable-length collection (create/edit/delete N rows), not a fixed named slot, so it gets its
 * own draft/publish state per row (`status` + `enabled`) instead of the page-level
 * `cms_publish_page()` RPC. See Documentations MD/delite-admin.md, "Promotions".
 */
export interface PromotionRow {
  id: string;
  internalName: string;
  heading: string;
  subheading: string | null;
  body: string | null;
  imageStoragePath: string | null;
  mobileImageStoragePath: string | null;
  imagePosition: ImagePositionByDevice | null;
  mobileImagePosition: ImagePositionByDevice | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  enabled: boolean;
  displayOrder: number;
  status: "draft" | "published";
  updatedAt: string;
  publishedAt: string | null;
}

function mapRow(r: Record<string, unknown>): PromotionRow {
  return {
    id: r.id as string,
    internalName: r.internal_name as string,
    heading: r.heading as string,
    subheading: (r.subheading as string | null) ?? null,
    body: (r.body as string | null) ?? null,
    imageStoragePath: (r.image_storage_path as string | null) ?? null,
    mobileImageStoragePath: (r.mobile_image_storage_path as string | null) ?? null,
    imagePosition: (r.image_position as ImagePositionByDevice | null) ?? null,
    mobileImagePosition: (r.mobile_image_position as ImagePositionByDevice | null) ?? null,
    ctaLabel: (r.cta_label as string | null) ?? null,
    ctaUrl: (r.cta_url as string | null) ?? null,
    enabled: r.enabled as boolean,
    displayOrder: r.display_order as number,
    status: r.status as "draft" | "published",
    updatedAt: r.updated_at as string,
    publishedAt: (r.published_at as string | null) ?? null,
  };
}

const COLUMNS =
  "id, internal_name, heading, subheading, body, image_storage_path, mobile_image_storage_path, image_position, mobile_image_position, cta_label, cta_url, enabled, display_order, status, updated_at, published_at";

export async function listPromotions(): Promise<PromotionRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("cms_promotions").select(COLUMNS).order("display_order", { ascending: true });
  if (error || !data) return [];
  return data.map(mapRow);
}

export type PromotionInput = Pick<
  PromotionRow,
  | "internalName"
  | "heading"
  | "subheading"
  | "body"
  | "imageStoragePath"
  | "mobileImageStoragePath"
  | "imagePosition"
  | "mobileImagePosition"
  | "ctaLabel"
  | "ctaUrl"
  | "enabled"
  | "displayOrder"
>;

function toRow(input: PromotionInput, actorId: string): Record<string, unknown> {
  return {
    internal_name: input.internalName,
    heading: input.heading,
    subheading: input.subheading,
    body: input.body,
    image_storage_path: input.imageStoragePath,
    mobile_image_storage_path: input.mobileImageStoragePath,
    image_position: input.imagePosition,
    mobile_image_position: input.mobileImagePosition,
    cta_label: input.ctaLabel,
    cta_url: input.ctaUrl,
    enabled: input.enabled,
    display_order: input.displayOrder,
    updated_at: new Date().toISOString(),
    updated_by: actorId,
  };
}

export async function createPromotion(input: PromotionInput, actorId: string): Promise<{ id?: string; error?: string }> {
  if (!supabase) return { error: "cms-not-configured" };
  const { data, error } = await supabase.from("cms_promotions").insert({ ...toRow(input, actorId), status: "draft" }).select("id").single();
  return { id: data?.id, error: error?.message };
}

export async function updatePromotion(id: string, input: PromotionInput, actorId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "cms-not-configured" };
  const { error } = await supabase.from("cms_promotions").update(toRow(input, actorId)).eq("id", id);
  return { error: error?.message };
}

export async function publishPromotion(id: string, actorId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "cms-not-configured" };
  const { error } = await supabase
    .from("cms_promotions")
    .update({ status: "published", published_at: new Date().toISOString(), published_by: actorId })
    .eq("id", id);
  return { error: error?.message };
}

export async function deletePromotion(id: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "cms-not-configured" };
  const { error } = await supabase.from("cms_promotions").delete().eq("id", id);
  return { error: error?.message };
}

export async function reorderPromotions(updates: { id: string; displayOrder: number }[], actorId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "cms-not-configured" };
  for (const u of updates) {
    const { error } = await supabase
      .from("cms_promotions")
      .update({ display_order: u.displayOrder, updated_at: new Date().toISOString(), updated_by: actorId })
      .eq("id", u.id);
    if (error) return { error: error.message };
  }
  return {};
}
