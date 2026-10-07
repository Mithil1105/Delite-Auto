import { supabase } from "../../lib/supabaseClient";

/**
 * The one place that knows the five cms_* tables (mirrors the existing catalogService/AuthContext
 * service-boundary pattern — see Documentations MD/delite-admin.md, "Service layers"). Every
 * write here is RLS-governed by the caller's own admin_role; this file adds no authorization
 * logic of its own, it just shapes the queries.
 */

export interface CmsSectionRow {
  sectionId: string;
  sectionKey: string;
  sectionType: string;
  isRequired: boolean;
  content: Record<string, unknown>;
  visible: boolean;
  displayOrder: number;
  updatedAt: string | null;
}

export interface CmsPublicationRow {
  id: string;
  publishedAt: string;
  publishedBy: string | null;
  note: string | null;
}

async function getPageId(slug: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("cms_pages").select("id").eq("slug", slug).maybeSingle();
  return data?.id ?? null;
}

export async function getPageSections(pageSlug: string): Promise<CmsSectionRow[]> {
  if (!supabase) return [];
  const pageId = await getPageId(pageSlug);
  if (!pageId) return [];

  const { data, error } = await supabase
    .from("cms_sections")
    .select("id, section_key, section_type, is_required, cms_section_drafts(content, visible, display_order, updated_at)")
    .eq("page_id", pageId);
  if (error || !data) return [];

  return data
    .map((row): CmsSectionRow | null => {
      const draft = Array.isArray(row.cms_section_drafts) ? row.cms_section_drafts[0] : row.cms_section_drafts;
      if (!draft) return null;
      return {
        sectionId: row.id,
        sectionKey: row.section_key,
        sectionType: row.section_type,
        isRequired: row.is_required,
        content: (draft.content as Record<string, unknown>) ?? {},
        visible: draft.visible,
        displayOrder: draft.display_order,
        updatedAt: draft.updated_at,
      };
    })
    .filter((r): r is CmsSectionRow => r !== null)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export async function getSectionDraft(pageSlug: string, sectionKey: string): Promise<CmsSectionRow | null> {
  const sections = await getPageSections(pageSlug);
  return sections.find((s) => s.sectionKey === sectionKey) ?? null;
}

export async function saveSectionDraft(
  sectionId: string,
  updates: Partial<Pick<CmsSectionRow, "content" | "visible" | "displayOrder">>,
  actorId: string
): Promise<{ error?: string }> {
  if (!supabase) return { error: "cms-not-configured" };
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: actorId };
  if (updates.content !== undefined) patch.content = updates.content;
  if (updates.visible !== undefined) patch.visible = updates.visible;
  if (updates.displayOrder !== undefined) patch.display_order = updates.displayOrder;

  // RLS silently filters rows the caller's admin_role isn't allowed to write — `.update()` alone
  // returns no error in that case, just zero rows affected, so the UI would show "Draft saved"
  // for a write that never happened. `.select()` + a row-count check turns that into a real error
  // (see Documentations MD/delite-admin.md, "CMS save silent-failure fix").
  const { data, error } = await supabase.from("cms_section_drafts").update(patch).eq("section_id", sectionId).select("section_id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Save blocked — your admin role doesn't have permission to edit this content." };
  return {};
}

/** Batch-reorders every section on a page in one round trip — used by the Homepage drag-reorder list. */
export async function reorderSections(updates: { sectionId: string; displayOrder: number }[], actorId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "cms-not-configured" };
  for (const u of updates) {
    const { data, error } = await supabase
      .from("cms_section_drafts")
      .update({ display_order: u.displayOrder, updated_at: new Date().toISOString(), updated_by: actorId })
      .eq("section_id", u.sectionId)
      .select("section_id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "Save blocked — your admin role doesn't have permission to edit this content." };
  }
  return {};
}

/** Atomic publish of every section on a page — see cms_publish_page() in the migrations. */
export async function publishPage(pageSlug: string, note?: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "cms-not-configured" };
  const { error } = await supabase.rpc("cms_publish_page", { p_slug: pageSlug, p_note: note ?? null });
  return { error: error?.message };
}

export async function getLastPublication(pageSlug: string): Promise<CmsPublicationRow | null> {
  if (!supabase) return null;
  const pageId = await getPageId(pageSlug);
  if (!pageId) return null;
  const { data } = await supabase
    .from("cms_publications")
    .select("id, published_at, published_by, note")
    .eq("page_id", pageId)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, publishedAt: data.published_at, publishedBy: data.published_by, note: data.note };
}
