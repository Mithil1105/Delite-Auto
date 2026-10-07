import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { getSectionDraft, publishPage, saveSectionDraft, type CmsSectionRow } from "../../services/cmsService";
import { useActivityLog } from "../../hooks/useActivityLog";
import { useAdminToast } from "../../components/AdminToastProvider";
import { AdminProductPicker } from "../../components/AdminProductPicker";

/**
 * New Arrivals merchandising. Maps to the "New" tab of the existing homepage "Perfect Vehicle"
 * rail (nearest real existing section — see the approved Phase 2 plan's scope decisions). Manual
 * curation only this pass (no verified Odoo create_date-based auto-ranking). Stores only Odoo
 * product ids, resolved live on the storefront.
 */
export default function NewArrivals() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { showToast } = useAdminToast();

  const [section, setSection] = useState<CmsSectionRow | null>(null);
  const [productIds, setProductIds] = useState<number[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    getSectionDraft("merchandising", "new-arrivals").then((s) => {
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
    logActivity("cms.draft_saved", "cms_section", section.sectionId, { sectionKey: "new-arrivals", count: productIds.length });
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
    logActivity("cms.page_published", "cms_page", "merchandising", { via: "new-arrivals-editor" });
  };

  if (!section) return <div className="p-10 text-[13.5px] text-steel-500">Loading…</div>;

  return (
    <div className="p-6 lg:p-10 max-w-4xl">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display uppercase text-[13.5px]">New Arrivals</h2>
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
        Renders in the "New" tab of the homepage's Perfect Vehicle rail. Curated manually — order here is the display order.
      </p>

      <AdminProductPicker selectedIds={productIds} onChange={update} maxItems={12} />
    </div>
  );
}
