import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { getSectionDraft, publishPage, saveSectionDraft, type CmsSectionRow } from "../../services/cmsService";
import { useActivityLog } from "../../hooks/useActivityLog";
import { useAdminToast } from "../../components/AdminToastProvider";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { PreviewFrame } from "../../components/PreviewFrame";
import { EditorToolbar } from "../../components/EditorToolbar";
import { Hero as HeroPreview, type HeroContentOverride } from "../../../components/Hero";

const inputClass = "w-full h-11 px-3.5 border border-line bg-white text-[14px] focus:outline-none focus:border-ink transition-colors";
const labelClass = "block text-[12px] uppercase tracking-wide mb-1.5 text-steel-500";

export default function HeroEditor() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { showToast } = useAdminToast();

  const [section, setSection] = useState<CmsSectionRow | null>(null);
  const { value: form, set: setFormTracked, setWithoutHistory: loadForm, undo, redo, canUndo, canRedo } = useUndoRedo<HeroContentOverride>({});
  const [visible, setVisible] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const guardDialog = useUnsavedChangesGuard(dirty);

  useEffect(() => {
    getSectionDraft("homepage", "hero").then((s) => {
      setSection(s);
      if (s) {
        loadForm(s.content as HeroContentOverride);
        setVisible(s.visible);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (patch: Partial<HeroContentOverride>) => {
    setFormTracked({ ...form, ...patch });
    setDirty(true);
  };

  const onSaveDraft = async () => {
    if (!section || !user) return;
    setSaving(true);
    const { error } = await saveSectionDraft(section.sectionId, { content: form as Record<string, unknown>, visible }, user.id);
    setSaving(false);
    if (error) {
      showToast("Couldn't save draft", "error");
      return;
    }
    setDirty(false);
    loadForm(form); // resets undo history so Undo can never rewind past this save
    showToast("Draft saved");
    logActivity("cms.draft_saved", "cms_section", section.sectionId, { sectionKey: "hero" });
  };

  const onPublish = async () => {
    setPublishing(true);
    const { error } = await publishPage("homepage");
    setPublishing(false);
    if (error) {
      showToast("Publish failed", "error");
      return;
    }
    showToast("Published");
    logActivity("cms.page_published", "cms_page", "homepage", { via: "hero-editor" });
  };

  if (!section) return <div className="p-10 text-[13.5px] text-steel-500">Loading…</div>;

  return (
    <div className="p-6 lg:p-10 grid lg:grid-cols-[420px_1fr] gap-8 max-w-6xl">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display uppercase text-[13.5px]">Hero</h2>
          <EditorToolbar dirty={dirty} canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-[12.5px] text-steel-500 bg-steel-50 border border-line p-3">
            The Hero banner (image, headline, and button artwork) is a fixed design asset, not editable here — only
            where the "Shop Now" button links to.
          </p>
          <div>
            <label htmlFor="hero-cta-link" className={labelClass}>CTA link</label>
            <input id="hero-cta-link" className={inputClass} value={form.ctaLink ?? ""} onChange={(e) => update({ ctaLink: e.target.value })} placeholder="/shop" />
          </div>
          <label className="flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" checked={visible} onChange={(e) => { setVisible(e.target.checked); setDirty(true); }} />
            Visible
          </label>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button type="button" onClick={onSaveDraft} disabled={saving || !dirty} className="btn-outline disabled:opacity-50">
            {saving ? "Saving…" : "Save Draft"}
          </button>
          <button type="button" onClick={onPublish} disabled={publishing} className="btn-dark disabled:opacity-50">
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
        <p className="text-[11.5px] text-steel-500 mt-3">
          Save the draft, then publish the homepage to update the live storefront.
        </p>
      </div>

      <div>
        <PreviewFrame>
          <HeroPreview {...form} />
        </PreviewFrame>
      </div>
      {guardDialog}
    </div>
  );
}
