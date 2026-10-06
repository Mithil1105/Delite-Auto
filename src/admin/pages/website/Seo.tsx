import { useEffect, useState } from "react";
import clsx from "clsx";
import { useAuth } from "../../../context/AuthContext";
import { getPageSections, publishPage, saveSectionDraft, type CmsSectionRow } from "../../services/cmsService";
import { useActivityLog } from "../../hooks/useActivityLog";
import { useAdminToast } from "../../components/AdminToastProvider";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { EditorToolbar } from "../../components/EditorToolbar";

interface SeoContent {
  metaTitle?: string;
  metaDescription?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

const ROUTE_LABELS: Record<string, string> = {
  home: "Home",
  shop: "Shop",
  brands: "Brands",
  about: "About",
  contact: "Contact",
};

const inputClass = "w-full h-10 px-3 border border-line text-[13.5px] focus:outline-none focus:border-ink";
const labelClass = "block text-[12px] uppercase tracking-wide mb-1.5 text-steel-500";
const TITLE_MAX = 60;
const DESC_MAX = 160;

export default function Seo() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { showToast } = useAdminToast();

  const [sections, setSections] = useState<CmsSectionRow[] | null>(null);
  const [activeKey, setActiveKey] = useState("home");
  const { value: form, set: setFormTracked, setWithoutHistory: loadForm, undo, redo, canUndo, canRedo } = useUndoRedo<SeoContent>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const guardDialog = useUnsavedChangesGuard(dirty);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  useEffect(() => {
    getPageSections("seo").then((s) => {
      setSections(s);
      const active = s.find((sec) => sec.sectionKey === "home");
      if (active) loadForm(active.content as SeoContent);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectRoute = async (key: string) => {
    if (dirty && !(await confirm("Discard unsaved changes to this page's SEO?"))) return;
    setActiveKey(key);
    const s = sections?.find((sec) => sec.sectionKey === key);
    loadForm((s?.content as SeoContent) ?? {});
    setDirty(false);
  };

  const update = (patch: Partial<SeoContent>) => {
    setFormTracked({ ...form, ...patch });
    setDirty(true);
  };

  const activeSection = sections?.find((s) => s.sectionKey === activeKey);

  const onSaveDraft = async () => {
    if (!activeSection || !user) return;
    setSaving(true);
    const { error } = await saveSectionDraft(activeSection.sectionId, { content: form as Record<string, unknown> }, user.id);
    setSaving(false);
    if (error) {
      showToast("Couldn't save draft", "error");
      return;
    }
    setSections((prev) => prev?.map((s) => (s.sectionId === activeSection.sectionId ? { ...s, content: form as Record<string, unknown> } : s)) ?? null);
    setDirty(false);
    loadForm(form); // resets undo history so Undo can never rewind past this save
    showToast("Draft saved");
    logActivity("cms.draft_saved", "cms_section", activeSection.sectionId, { sectionKey: activeKey });
  };

  const onPublish = async () => {
    setPublishing(true);
    const { error } = await publishPage("seo");
    setPublishing(false);
    if (error) {
      showToast("Publish failed", "error");
      return;
    }
    showToast("Published");
    logActivity("cms.page_published", "cms_page", "seo", { via: "seo-editor" });
  };

  if (!sections) return <div className="p-10 text-[13.5px] text-steel-500">Loading…</div>;

  const previewTitle = form.metaTitle || `${ROUTE_LABELS[activeKey]} — Delite Auto Accessories`;
  const previewDescription = form.metaDescription || "Delite Auto Accessories — car & two-wheeler accessories, since 1967.";

  return (
    <div className="p-6 lg:p-10 grid lg:grid-cols-[420px_1fr] gap-8 max-w-6xl">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display uppercase text-[13.5px]">SEO</h2>
          <EditorToolbar dirty={dirty} canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo}>
            <button type="button" onClick={onPublish} disabled={publishing} className="btn-dark disabled:opacity-50">
              {publishing ? "Publishing…" : "Publish"}
            </button>
          </EditorToolbar>
        </div>

        <div className="flex items-center gap-1 mb-5 border-b border-line">
          {sections.map((s) => (
            <button
              key={s.sectionId}
              type="button"
              onClick={() => selectRoute(s.sectionKey)}
              className={clsx(
                "px-3 py-2 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors",
                activeKey === s.sectionKey ? "border-ink text-ink" : "border-transparent text-steel-500 hover:text-ink"
              )}
            >
              {ROUTE_LABELS[s.sectionKey] ?? s.sectionKey}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="seo-title" className={labelClass}>
              Meta title <span className={form.metaTitle && form.metaTitle.length > TITLE_MAX ? "text-sale" : ""}>({(form.metaTitle ?? "").length}/{TITLE_MAX})</span>
            </label>
            <input id="seo-title" className={inputClass} value={form.metaTitle ?? ""} onChange={(e) => update({ metaTitle: e.target.value })} />
          </div>
          <div>
            <label htmlFor="seo-desc" className={labelClass}>
              Meta description <span className={form.metaDescription && form.metaDescription.length > DESC_MAX ? "text-sale" : ""}>({(form.metaDescription ?? "").length}/{DESC_MAX})</span>
            </label>
            <textarea id="seo-desc" rows={3} className={`${inputClass} h-auto py-2`} value={form.metaDescription ?? ""} onChange={(e) => update({ metaDescription: e.target.value })} />
          </div>
          <div>
            <label htmlFor="seo-og-title" className={labelClass}>OG title (social share)</label>
            <input id="seo-og-title" className={inputClass} value={form.ogTitle ?? ""} onChange={(e) => update({ ogTitle: e.target.value })} placeholder="Defaults to meta title" />
          </div>
          <div>
            <label htmlFor="seo-og-desc" className={labelClass}>OG description (social share)</label>
            <textarea id="seo-og-desc" rows={2} className={`${inputClass} h-auto py-2`} value={form.ogDescription ?? ""} onChange={(e) => update({ ogDescription: e.target.value })} placeholder="Defaults to meta description" />
          </div>
          <div>
            <label htmlFor="seo-og-image" className={labelClass}>OG image URL</label>
            <input id="seo-og-image" className={inputClass} value={form.ogImage ?? ""} onChange={(e) => update({ ogImage: e.target.value })} placeholder="https://…" />
          </div>
        </div>

        <button type="button" onClick={onSaveDraft} disabled={saving || !dirty} className="btn-outline disabled:opacity-50 mt-6">
          {saving ? "Saving…" : "Save Draft"}
        </button>
      </div>

      <div>
        <h3 className="font-display uppercase text-[12px] text-steel-500 mb-2">Google preview</h3>
        <div className="border border-line p-4 mb-6 max-w-[560px]">
          <div className="text-[13px] text-[#1a0dab] leading-tight mb-0.5 line-clamp-1">{previewTitle}</div>
          <div className="text-[12px] text-[#006621] mb-1">deliteauto.com{activeKey === "home" ? "" : `/${activeKey}`}</div>
          <div className="text-[12.5px] text-steel-700 line-clamp-2">{previewDescription}</div>
        </div>

        <h3 className="font-display uppercase text-[12px] text-steel-500 mb-2">Social share preview</h3>
        <div className="border border-line max-w-[420px] overflow-hidden">
          {form.ogImage && <img src={form.ogImage} alt="" className="w-full h-[200px] object-cover bg-steel-50" />}
          <div className="p-3">
            <div className="text-[11px] uppercase text-steel-500 mb-1">deliteauto.com</div>
            <div className="text-[13.5px] font-semibold line-clamp-1">{form.ogTitle || previewTitle}</div>
            <div className="text-[12px] text-steel-500 line-clamp-2">{form.ogDescription || previewDescription}</div>
          </div>
        </div>
      </div>
      {guardDialog}
      {confirmDialog}
    </div>
  );
}
