import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { getSectionDraft, publishPage, saveSectionDraft, type CmsSectionRow } from "../../services/cmsService";
import { useActivityLog } from "../../hooks/useActivityLog";
import { useAdminToast } from "../../components/AdminToastProvider";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { PreviewFrame } from "../../components/PreviewFrame";
import { EditorToolbar } from "../../components/EditorToolbar";
import { AnnouncementBar, ANNOUNCEMENT_DEFAULT_BG, ANNOUNCEMENT_DEFAULT_TEXT, type AnnouncementContentOverride, type AnnouncementIcon, type AnnouncementItem } from "../../../components/AnnouncementBar";
import { AdminColorPicker, contrastRatio, suggestedTextColor } from "../../components/AdminColorPicker";

const inputClass = "w-full h-11 px-3.5 border border-line bg-white text-[14px] focus:outline-none focus:border-ink transition-colors";
const labelClass = "block text-[12px] uppercase tracking-wide mb-1.5 text-steel-500";
const iconOptions: { value: AnnouncementIcon | ""; label: string }[] = [
  { value: "", label: "No icon" }, { value: "truck", label: "Delivery" }, { value: "wallet", label: "Payment" },
  { value: "refresh", label: "Exchange" }, { value: "shield", label: "Guarantee" }, { value: "gift", label: "Gift" },
  { value: "sparkles", label: "New" }, { value: "tag", label: "Offer" }, { value: "heart", label: "Loved" },
];
const colorPresets = [
  { name: "Delite Blue", bg: ANNOUNCEMENT_DEFAULT_BG, text: ANNOUNCEMENT_DEFAULT_TEXT },
  { name: "Midnight", bg: "#0E1740", text: "#FFFFFF" },
  { name: "White", bg: "#FFFFFF", text: "#111827" },
  { name: "Gold", bg: "#F8C849", text: "#111827" },
  { name: "Forest", bg: "#1B3A30", text: "#FFFFFF" },
];
const newItem = (): AnnouncementItem => ({ id: crypto.randomUUID(), text: "", icon: null });

/**
 * Note on scope: start/end scheduling from the original spec is deliberately not built — the
 * spec itself gates it behind "unless the data model handles timezone correctly," which is real
 * added scope beyond this foundation pass. See Documentations MD/delite-admin.md.
 */
export default function AnnouncementEditor() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { showToast } = useAdminToast();

  const [section, setSection] = useState<CmsSectionRow | null>(null);
  const { value: form, set: setFormTracked, setWithoutHistory: loadForm, undo, redo, canUndo, canRedo } = useUndoRedo<AnnouncementContentOverride>({});
  const [visible, setVisible] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const guardDialog = useUnsavedChangesGuard(dirty);

  useEffect(() => {
    getSectionDraft("site-chrome", "announcement-bar").then((s) => {
      setSection(s);
      if (s) {
        const saved = s.content as AnnouncementContentOverride;
        loadForm({ ...saved, items: Array.isArray(saved.items) && saved.items.length ? saved.items : [{ id: "original", text: saved.message ?? "Free delivery on orders above ₹999", icon: null, linkLabel: saved.linkLabel, linkUrl: saved.linkUrl }] });
        setVisible(s.visible);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (patch: Partial<AnnouncementContentOverride>) => {
    setFormTracked({ ...form, ...patch });
    setDirty(true);
  };
  const items = form.items ?? [];
  const updateItem = (id: string, patch: Partial<AnnouncementItem>) => update({ items: items.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const moveItem = (index: number, direction: -1 | 1) => {
    const reordered = [...items];
    [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
    update({ items: reordered });
  };
  const background = form.bgColor ?? ANNOUNCEMENT_DEFAULT_BG;
  const foreground = form.textColor ?? ANNOUNCEMENT_DEFAULT_TEXT;
  const contrast = contrastRatio(background, foreground);

  const onSaveDraft = async () => {
    if (!section || !user) return;
    if (!items.length || items.some((item) => !item.text.trim())) { showToast("Every announcement needs a message", "error"); return; }
    if (items.some((item) => item.linkUrl && (!item.linkUrl.startsWith("/") || item.linkUrl.startsWith("//")))) { showToast("Links must start with a single /", "error"); return; }
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
    logActivity("cms.draft_saved", "cms_section", section.sectionId, { sectionKey: "announcement-bar" });
  };

  const onPublish = async () => {
    if (dirty) { showToast("Save the draft before publishing", "error"); return; }
    setPublishing(true);
    const { error } = await publishPage("site-chrome");
    setPublishing(false);
    if (error) {
      showToast("Publish failed", "error");
      return;
    }
    showToast("Published");
    logActivity("cms.page_published", "cms_page", "site-chrome", { via: "announcement-editor" });
  };

  if (!section) return <div className="p-10 text-[13.5px] text-steel-500">Loading…</div>;

  return (
    <div className="p-6 lg:p-10 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display uppercase text-[13.5px]">Announcement Bar</h2>
        <EditorToolbar dirty={dirty} canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
      </div>

      <div className="flex flex-col gap-5 mb-6">
        <div className="flex items-center justify-between"><h3 className={labelClass}>Messages ({items.length})</h3><button type="button" className="btn-outline text-sm" onClick={() => update({ items: [...items, newItem()] })}>Add message</button></div>
        {items.map((item, index) => <div key={item.id} className="card-surface p-4 space-y-3">
          <div className="flex items-center justify-between"><strong className="text-sm">Message {index + 1}</strong><div className="flex gap-2">
            <button type="button" disabled={index === 0} onClick={() => moveItem(index, -1)} aria-label={`Move message ${index + 1} up`} className="text-sm disabled:opacity-30">↑</button>
            <button type="button" disabled={index === items.length - 1} onClick={() => moveItem(index, 1)} aria-label={`Move message ${index + 1} down`} className="text-sm disabled:opacity-30">↓</button>
            <button type="button" disabled={items.length === 1} onClick={() => update({ items: items.filter((entry) => entry.id !== item.id) })} className="text-sm text-red-600 disabled:opacity-30">Remove</button>
          </div></div>
          <label className={labelClass}>Message text<input className={inputClass} value={item.text} onChange={(e) => updateItem(item.id, { text: e.target.value })} placeholder="Free delivery on orders above ₹999" /></label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className={labelClass}>Link label (optional)<input className={inputClass} value={item.linkLabel ?? ""} onChange={(e) => updateItem(item.id, { linkLabel: e.target.value })} placeholder="Shop now" /></label>
            <label className={labelClass}>Link URL (optional)<input className={inputClass} value={item.linkUrl ?? ""} onChange={(e) => updateItem(item.id, { linkUrl: e.target.value })} placeholder="/shop" /></label>
          </div>
          <label className={labelClass}>Icon<select className={inputClass} value={item.icon ?? ""} onChange={(e) => updateItem(item.id, { icon: (e.target.value || null) as AnnouncementIcon | null })}>{iconOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>)}
        <div className="flex flex-wrap items-center gap-5">
          <label className="text-sm">Rotate every <input type="number" min="1" max="60" step="0.5" className="w-20 rounded border border-line px-2 py-1" value={(form.intervalMs ?? 3200) / 1000} onChange={(e) => update({ intervalMs: Math.min(60000, Math.max(1000, Number(e.target.value) * 1000 || 1000)) })} /> seconds</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.showIcons ?? true} onChange={(e) => update({ showIcons: e.target.checked })} />Show icons</label>
        </div>
        <div><h3 className={labelClass}>Color presets</h3><div className="flex flex-wrap gap-2">{colorPresets.map((preset) => <button type="button" key={preset.name} title={preset.name} aria-label={`${preset.name} colors`} onClick={() => update({ bgColor: preset.bg, textColor: preset.text })} className={`flex items-center gap-2 rounded border px-3 py-2 text-xs ${background.toUpperCase() === preset.bg && foreground.toUpperCase() === preset.text ? "border-brand-600" : "border-line"}`}><span className="h-5 w-5 rounded-full border border-black/10" style={{ backgroundColor: preset.bg }} />{preset.name}</button>)}</div></div>
        <div className="flex flex-wrap gap-5"><AdminColorPicker label="Background color" value={background} onChange={(bgColor) => update({ bgColor })} /><AdminColorPicker label="Text color" value={foreground} onChange={(textColor) => update({ textColor })} /></div>
        <div className="text-xs text-steel-500">Contrast {contrast.toFixed(1)}:1{contrast < 4.5 && <> — text may be hard to read. <button type="button" className="text-brand-700 underline" onClick={() => update({ textColor: suggestedTextColor(background) })}>Use suggested text color</button></>}</div>
        <label className="flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" checked={visible} onChange={(e) => { setVisible(e.target.checked); setDirty(true); }} />
          Visible
        </label>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <button type="button" onClick={onSaveDraft} disabled={saving || !dirty} className="btn-outline disabled:opacity-50">
          {saving ? "Saving…" : "Save Draft"}
        </button>
        <button type="button" onClick={onPublish} disabled={publishing} className="btn-dark disabled:opacity-50">
          {publishing ? "Publishing…" : "Publish"}
        </button>
      </div>

      <PreviewFrame>
        <AnnouncementBar {...form} visible={visible} />
      </PreviewFrame>
      {guardDialog}
    </div>
  );
}
