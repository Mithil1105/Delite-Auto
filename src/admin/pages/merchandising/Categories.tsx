import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { getSectionDraft, publishPage, saveSectionDraft, type CmsSectionRow } from "../../services/cmsService";
import { useActivityLog } from "../../hooks/useActivityLog";
import { useAdminToast } from "../../components/AdminToastProvider";
import { AdminCategoryPicker } from "../../components/AdminCategoryPicker";
import type { CategorySelection } from "../../../hooks/useMerchandisingCms";

/**
 * Homepage Categories merchandising. Drives the existing `CategoryIconStrip` component (currently
 * a hardcoded 7-icon grid). Odoo's `product.public.category` model is flat, matching this
 * component's flat list shape exactly. Stores only real category ids + optional CMS overrides
 * (label/image) — never copies category data.
 */
export default function Categories() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { showToast } = useAdminToast();

  const [section, setSection] = useState<CmsSectionRow | null>(null);
  const [selections, setSelections] = useState<CategorySelection[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    getSectionDraft("merchandising", "categories").then((s) => {
      setSection(s);
      if (s) setSelections(((s.content.categorySelections as CategorySelection[] | undefined) ?? []));
    });
  }, []);

  const update = (next: CategorySelection[]) => {
    setSelections(next);
    setDirty(true);
  };

  const onSaveDraft = async () => {
    if (!section || !user) return;
    setSaving(true);
    const { error } = await saveSectionDraft(section.sectionId, { content: { categorySelections: selections } }, user.id);
    setSaving(false);
    if (error) {
      showToast("Couldn't save draft", "error");
      return;
    }
    setDirty(false);
    showToast("Draft saved");
    logActivity("cms.draft_saved", "cms_section", section.sectionId, { sectionKey: "categories", count: selections.length });
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
    logActivity("cms.page_published", "cms_page", "merchandising", { via: "categories-editor" });
  };

  if (!section) return <div className="p-10 text-[13.5px] text-steel-500">Loading…</div>;

  return (
    <div className="p-6 lg:p-10 max-w-4xl">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display uppercase text-[13.5px]">Homepage Categories</h2>
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
        Renders as the homepage's category icon strip. Label/image overrides are optional — leave blank to show the real category name with an
        icon fallback.
      </p>

      <AdminCategoryPicker selections={selections} onChange={update} />
    </div>
  );
}
