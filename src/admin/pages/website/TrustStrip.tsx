import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { getSectionDraft, publishPage, saveSectionDraft, type CmsSectionRow } from "../../services/cmsService";
import { useActivityLog } from "../../hooks/useActivityLog";
import { useAdminToast } from "../../components/AdminToastProvider";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { PreviewFrame } from "../../components/PreviewFrame";
import { EditorToolbar } from "../../components/EditorToolbar";
import { TRUST_STRIP_SECTION_KEY, TrustStrip, type TrustStripContent, type TrustStripIcon, type TrustStripItem } from "../../../components/product/TrustStrip";

const inputClass = "w-full h-11 px-3.5 border border-line bg-white text-[14px] focus:outline-none focus:border-ink transition-colors";
const labelClass = "block text-[12px] uppercase tracking-wide mb-1.5 text-steel-500";
const iconOptions: { value: TrustStripIcon | ""; label: string }[] = [
  { value: "", label: "No icon" }, { value: "returns", label: "Returns" }, { value: "truck", label: "Delivery" }, { value: "wallet", label: "Payment" },
  { value: "refresh", label: "Exchange" }, { value: "shield", label: "Guarantee" }, { value: "gift", label: "Gift" },
  { value: "sparkles", label: "New" }, { value: "tag", label: "Offer" }, { value: "heart", label: "Loved" },
];
const DEFAULT_ITEMS: TrustStripItem[] = [
  { id: "returns", text: "30-day money-back guarantee", icon: "returns" },
  { id: "shipping", text: "Shipping in 2–3 business days", icon: "truck" },
];
const newItem = (): TrustStripItem => ({ id: crypto.randomUUID(), text: "", icon: null });

/**
 * Admin → Website → Header & footer → Product strip. The one strip under the Buy Now button on every
 * product page: its messages rotate. Stored as the 'pdp-trust-strip' section of the 'site-chrome' CMS page.
 */
export default function TrustStripEditor() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { showToast } = useAdminToast();

  const [section, setSection] = useState<CmsSectionRow | null>(null);
  const { value: form, set: setFormTracked, setWithoutHistory: loadForm, undo, redo, canUndo, canRedo } = useUndoRedo<TrustStripContent>({});
  const [visible, setVisible] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const guardDialog = useUnsavedChangesGuard(dirty);

  useEffect(() => {
    getSectionDraft("site-chrome", TRUST_STRIP_SECTION_KEY).then((s) => {
      setSection(s);
      if (s) {
        const saved = s.content as TrustStripContent;
        loadForm({ ...saved, items: Array.isArray(saved.items) && saved.items.length ? saved.items : DEFAULT_ITEMS });
        setVisible(s.visible);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (patch: Partial<TrustStripContent>) => {
    setFormTracked({ ...form, ...patch });
    setDirty(true);
  };
  const items = form.items ?? [];
  const updateItem = (id: string, patch: Partial<TrustStripItem>) => update({ items: items.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  const moveItem = (index: number, direction: -1 | 1) => {
    const reordered = [...items];
    [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
    update({ items: reordered });
  };

  const onSaveDraft = async () => {
    if (!section || !user) return;
    if (!items.length || items.some((item) => !item.text.trim())) { showToast("Every message needs some text", "error"); return; }
    setSaving(true);
    const { error } = await saveSectionDraft(section.sectionId, { content: form as Record<string, unknown>, visible }, user.id);
    setSaving(false);
    if (error) { showToast("Couldn't save draft", "error"); return; }
    setDirty(false);
    loadForm(form);
    showToast("Draft saved");
    logActivity("cms.draft_saved", "cms_section", section.sectionId, { sectionKey: TRUST_STRIP_SECTION_KEY });
  };

  const onPublish = async () => {
    if (dirty) { showToast("Save the draft before publishing", "error"); return; }
    setPublishing(true);
    const { error } = await publishPage("site-chrome");
    setPublishing(false);
    if (error) { showToast("Publish failed", "error"); return; }
    showToast("Published");
    logActivity("cms.page_published", "cms_page", "site-chrome", { via: "trust-strip-editor" });
  };

  if (!section) return <div className="p-10 text-[13.5px] text-steel-500">Loading…</div>;

  return (
    <div className="p-6 lg:p-10 max-w-3xl">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display uppercase text-[13.5px]">Product page strip</h2>
        <EditorToolbar dirty={dirty} canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
      </div>
      <p className="text-[13px] text-steel-500 mb-5">The strip under the Buy Now button on every product page. Messages take turns, one at a time.</p>

      <div className="flex flex-col gap-5 mb-6">
        <div className="flex items-center justify-between"><h3 className={labelClass}>Messages ({items.length})</h3><button type="button" className="btn-outline text-sm" onClick={() => update({ items: [...items, newItem()] })}>Add message</button></div>
        {items.map((item, index) => (
          <div key={item.id} className="card-surface p-4 space-y-3">
            <div className="flex items-center justify-between"><strong className="text-sm">Message {index + 1}</strong><div className="flex gap-2">
              <button type="button" disabled={index === 0} onClick={() => moveItem(index, -1)} aria-label={`Move message ${index + 1} up`} className="text-sm disabled:opacity-30">↑</button>
              <button type="button" disabled={index === items.length - 1} onClick={() => moveItem(index, 1)} aria-label={`Move message ${index + 1} down`} className="text-sm disabled:opacity-30">↓</button>
              <button type="button" disabled={items.length === 1} onClick={() => update({ items: items.filter((entry) => entry.id !== item.id) })} className="text-sm text-red-600 disabled:opacity-30">Remove</button>
            </div></div>
            <label className={labelClass}>Message text<input className={inputClass} value={item.text} onChange={(e) => updateItem(item.id, { text: e.target.value })} placeholder="30-day money-back guarantee" /></label>
            <label className={labelClass}>Icon<select className={inputClass} value={item.icon ?? ""} onChange={(e) => updateItem(item.id, { icon: (e.target.value || null) as TrustStripIcon | null })}>{iconOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-5">
          <label className="text-sm">Change message every <input type="number" min="1" max="60" step="0.5" className="w-20 rounded border border-line px-2 py-1" value={(form.intervalMs ?? 3200) / 1000} onChange={(e) => update({ intervalMs: Math.min(60000, Math.max(1000, Number(e.target.value) * 1000 || 1000)) })} /> seconds</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.showIcons ?? true} onChange={(e) => update({ showIcons: e.target.checked })} />Show icons</label>
        </div>
        <label className="flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" checked={visible} onChange={(e) => { setVisible(e.target.checked); setDirty(true); }} />
          Show the strip on product pages
        </label>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <button type="button" onClick={onSaveDraft} disabled={saving || !dirty} className="btn-outline disabled:opacity-50">{saving ? "Saving…" : "Save Draft"}</button>
        <button type="button" onClick={onPublish} disabled={publishing} className="btn-dark disabled:opacity-50">{publishing ? "Publishing…" : "Publish"}</button>
      </div>

      <PreviewFrame>
        <div className="p-4 max-w-md"><TrustStrip {...form} visible={visible} /></div>
      </PreviewFrame>
      {guardDialog}
    </div>
  );
}
