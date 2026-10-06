import { useEffect, useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff, Menu } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { getSectionDraft, publishPage, saveSectionDraft, type CmsSectionRow } from "../../services/cmsService";
import { useActivityLog } from "../../hooks/useActivityLog";
import { useAdminToast } from "../../components/AdminToastProvider";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { PreviewFrame } from "../../components/PreviewFrame";
import { EditorToolbar } from "../../components/EditorToolbar";
import { Header } from "../../../components/Header";

export interface NavItem {
  label: string;
  url: string;
  visible: boolean;
}

const inputClass = "h-9 px-2.5 border border-line text-[12.5px] focus:outline-none focus:border-ink";

/** Blocks script-executing/data-URI schemes — the only validation a free-text nav URL field needs. */
function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return !trimmed.startsWith("javascript:") && !trimmed.startsWith("data:") && !trimmed.startsWith("vbscript:");
}

export default function Navigation() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { showToast } = useAdminToast();

  const [section, setSection] = useState<CmsSectionRow | null>(null);
  const { value: items, set: setItemsTracked, setWithoutHistory: loadItems, undo, redo, canUndo, canRedo } = useUndoRedo<NavItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewMenuOpen, setPreviewMenuOpen] = useState(false);

  const guardDialog = useUnsavedChangesGuard(dirty);

  useEffect(() => {
    getSectionDraft("site-chrome", "navigation").then((s) => {
      setSection(s);
      if (s) loadItems((s.content.items as NavItem[] | undefined) ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (next: NavItem[]) => {
    setItemsTracked(next);
    setDirty(true);
  };

  const patch = (index: number, updates: Partial<NavItem>) => {
    update(items.map((it, i) => (i === index ? { ...it, ...updates } : it)));
  };

  const add = () => update([...items, { label: "", url: "/shop", visible: true }]);
  const remove = (index: number) => update(items.filter((_, i) => i !== index));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  };

  const hasUnsafeUrl = items.some((it) => it.url && !isSafeUrl(it.url));

  const onSaveDraft = async () => {
    if (!section || !user || hasUnsafeUrl) return;
    setSaving(true);
    const { error } = await saveSectionDraft(section.sectionId, { content: { items } }, user.id);
    setSaving(false);
    if (error) {
      showToast("Couldn't save draft", "error");
      return;
    }
    setDirty(false);
    loadItems(items); // resets undo history so Undo can never rewind past this save
    showToast("Draft saved");
    logActivity("cms.draft_saved", "cms_section", section.sectionId, { sectionKey: "navigation", count: items.length });
  };

  const onPublish = async () => {
    setPublishing(true);
    const { error } = await publishPage("site-chrome");
    setPublishing(false);
    if (error) {
      showToast("Publish failed", "error");
      return;
    }
    showToast("Published");
    logActivity("cms.page_published", "cms_page", "site-chrome", { via: "navigation-editor" });
  };

  if (!section) return <div className="p-10 text-[13.5px] text-steel-500">Loading…</div>;

  return (
    <div className="p-6 lg:p-10 max-w-2xl">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display uppercase text-[13.5px]">Navigation</h2>
        <EditorToolbar dirty={dirty} canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo}>
          <button type="button" onClick={onSaveDraft} disabled={saving || !dirty || hasUnsafeUrl} className="btn-outline disabled:opacity-50">
            {saving ? "Saving…" : "Save Draft"}
          </button>
          <button type="button" onClick={onPublish} disabled={publishing} className="btn-dark disabled:opacity-50">
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </EditorToolbar>
      </div>
      <p className="text-[12.5px] text-steel-500 mb-6">
        Main header nav links (desktop + mobile). Leave empty and publish to fall back to the site's default links.
      </p>

      <div className="flex flex-col gap-2 mb-4">
        {items.map((item, i) => {
          const unsafe = item.url !== "" && !isSafeUrl(item.url);
          return (
            <div key={i} className="border border-line p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="flex flex-col shrink-0">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="text-steel-500 hover:text-ink disabled:opacity-30">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down" className="text-steel-500 hover:text-ink disabled:opacity-30">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input value={item.label} onChange={(e) => patch(i, { label: e.target.value })} placeholder="Label" className={`${inputClass} flex-1`} />
                <input value={item.url} onChange={(e) => patch(i, { url: e.target.value })} placeholder="/shop?vehicle=car" className={`${inputClass} flex-1`} />
                <button type="button" onClick={() => patch(i, { visible: !item.visible })} className="text-steel-500 hover:text-ink shrink-0" title={item.visible ? "Hide" : "Show"}>
                  {item.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button type="button" onClick={() => remove(i)} aria-label="Remove" className="text-steel-500 hover:text-ink shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {unsafe && <p className="text-[11.5px] text-sale pl-6">Unsafe URL scheme — use a relative path or https:// link.</p>}
            </div>
          );
        })}
        {items.length === 0 && <p className="text-[12.5px] text-steel-500 p-3 border border-dashed border-line">No custom links yet.</p>}
      </div>

      <button type="button" onClick={add} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-700 hover:underline mb-8">
        <Plus className="w-4 h-4" /> Add link
      </button>

      <div className="flex items-center justify-end mb-2">
        <button
          type="button"
          onClick={() => setPreviewMenuOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-steel-600 hover:text-ink"
        >
          <Menu className="w-3.5 h-3.5" /> {previewMenuOpen ? "Hide" : "Preview"} open menu
        </button>
      </div>
      <PreviewFrame>
        {() => <Header contentOverride={{ navItems: items.filter((i) => i.label) }} previewMobileMenuOpen={previewMenuOpen} />}
      </PreviewFrame>
      <p className="text-[11.5px] text-steel-500 mt-2">
        {breakpointNote}
      </p>
      {guardDialog}
    </div>
  );
}

const breakpointNote = "On mobile/tablet these links open in the slide-in menu (tap the ☰ icon above), not a horizontal bar.";
