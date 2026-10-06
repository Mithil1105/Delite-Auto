import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { getSectionDraft, publishPage, saveSectionDraft, type CmsSectionRow } from "../../services/cmsService";
import { useActivityLog } from "../../hooks/useActivityLog";
import { useAdminToast } from "../../components/AdminToastProvider";
import { AdminProductPicker } from "../../components/AdminProductPicker";

/**
 * Trending merchandising. Drives the existing homepage "Trending" rail directly. Its Car/Bike
 * `PillTabs` are preserved on the storefront — they now client-filter this single curated,
 * real-Odoo-resolved list by each product's real `vehicleTypes`, instead of the old (broken for
 * real data) `tag` field. One curated list here covers both tabs; no separate car/bike lists.
 */
export default function Trending() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { showToast } = useAdminToast();

  const [section, setSection] = useState<CmsSectionRow | null>(null);
  const [productIds, setProductIds] = useState<number[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    getSectionDraft("merchandising", "trending").then((s) => {
      setSection(s);
      if (s) setProductIds(((s.content.productIds as number[] | undefined) ?? []));
    });
  }, []);

  const update = (ids: number[]) => {
    setProductIds(ids);
    setDirty(true);
  };

  const onSaveDraft = async () => {
    if (!section || !user) return;
    setSaving(true);
    const { error } = await saveSectionDraft(section.sectionId, { content: { productIds } }, user.id);
    setSaving(false);
    if (error) {
      showToast("Couldn't save draft", "error");
      return;
    }
    setDirty(false);
    showToast("Draft saved");
    logActivity("cms.draft_saved", "cms_section", section.sectionId, { sectionKey: "trending", count: productIds.length });
  };

  const onPublish = async () => {
    setPublishing(true);
    const { error } = await publishPage("merchandising");
    setPublishing(false);
    if (error) {
      showToast("Publish failed", "error");
      return;
    }
    showToast("Published");
    logActivity("cms.page_published", "cms_page", "merchandising", { via: "trending-editor" });
  };

  if (!section) return <div className="p-10 text-[13.5px] text-steel-500">Loading…</div>;

  return (
    <div className="p-6 lg:p-10 max-w-4xl">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display uppercase text-[13.5px]">Trending</h2>
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] text-steel-500">{dirty ? "Unsaved changes" : "Saved"}</span>
          <button type="button" onClick={onSaveDraft} disabled={saving || !dirty} className="btn-outline disabled:opacity-50">
            {saving ? "Saving…" : "Save Draft"}
          </button>
          <button type="button" onClick={onPublish} disabled={publishing} className="btn-dark disabled:opacity-50">
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
      <p className="text-[12.5px] text-steel-500 mb-6">
        Renders in the homepage Trending rail. The rail's Car/Bike tabs filter this list automatically by each product's real Odoo vehicle type.
      </p>

      <AdminProductPicker selectedIds={productIds} onChange={update} maxItems={16} />
    </div>
  );
}
