import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GripVertical, ChevronUp, ChevronDown, Eye, EyeOff, Lock } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../../context/AuthContext";
import { getLastPublication, getPageSections, publishPage, reorderSections, saveSectionDraft, type CmsSectionRow } from "../../services/cmsService";
import { useActivityLog } from "../../hooks/useActivityLog";
import { useAdminToast } from "../../components/AdminToastProvider";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { PreviewFrame } from "../../components/PreviewFrame";
import { EditorToolbar } from "../../components/EditorToolbar";
import { FullHomePreview } from "../../components/FullHomePreview";
import { SectionInspector, sectionFields } from "../../components/SectionInspector";
import type { HeroContentOverride } from "../../../components/Hero";

/** Hero has its own materially different, already-fully-featured dedicated editor (see
 * SectionInspector's doc comment) — the inspector shows a summary + "Open full editor" link for
 * it instead of inlining a second, structurally different form here. Every other section key is
 * "generic" and edits inline via SectionInspector. */
const DEDICATED_EDITOR: Record<string, string> = { hero: "/admin/website/hero" };

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero",
  "vehicle-shop-split": "Shop by Cars / Bikes",
  "category-strip": "Category Icon Strip",
  trending: "Trending",
  "perfect-vehicle": "Perfect Vehicle (Popular / New)",
  brands: "Brands",
  "top-categories-car": "Top Categories — Car",
  "promo-banners": "Promo Banners",
  "top-categories-bike": "Top Categories — Bike",
  testimonials: "Testimonials",
  "get-in-touch": "Get In Touch",
};

type SectionStatus = "hidden" | "draft" | "published";

function statusDotClass(status: SectionStatus): string {
  if (status === "hidden") return "bg-steel-300";
  if (status === "draft") return "bg-amber-500";
  return "bg-emerald-500";
}
const STATUS_LABEL: Record<SectionStatus, string> = { hidden: "Hidden", draft: "Draft changes", published: "Published" };

export default function Homepage() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { showToast } = useAdminToast();

  const [sections, setSections] = useState<CmsSectionRow[] | null>(null);
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  const { value: liveContent, set: setLiveContentTracked, setWithoutHistory: loadLiveContent, undo, redo, canUndo, canRedo } = useUndoRedo<Record<string, unknown>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const guardDialog = useUnsavedChangesGuard(dirty);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const load = () => {
    getPageSections("homepage").then(setSections);
    getLastPublication("homepage").then((pub) => setLastPublishedAt(pub?.publishedAt ?? null));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = sections?.find((s) => s.sectionId === selectedSectionId) ?? null;

  const statusOf = (s: CmsSectionRow): SectionStatus => {
    if (!s.visible) return "hidden";
    if (s.updatedAt && lastPublishedAt && new Date(s.updatedAt) > new Date(lastPublishedAt)) return "draft";
    if (s.updatedAt && !lastPublishedAt) return "draft";
    return "published";
  };

  const selectSection = async (sectionId: string) => {
    if (sectionId === selectedSectionId) return;
    if (dirty && !(await confirm("Discard unsaved changes to this section?"))) return;
    const target = sections?.find((s) => s.sectionId === sectionId);
    setSelectedSectionId(sectionId);
    loadLiveContent(target?.content ?? {});
    setDirty(false);
    document.getElementById(`home-preview-section-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const updateLive = (key: string, value: unknown) => {
    setLiveContentTracked({ ...liveContent, [key]: value });
    setDirty(true);
  };

  const saveSelected = async () => {
    if (!selected || !user) return;
    setSaving(true);
    const result = await saveSectionDraft(selected.sectionId, { content: liveContent }, user.id);
    setSaving(false);
    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    setSections((prev) => prev?.map((s) => (s.sectionId === selected.sectionId ? { ...s, content: liveContent, updatedAt: new Date().toISOString() } : s)) ?? null);
    setDirty(false);
    loadLiveContent(liveContent); // resets undo history so Undo can never rewind past this save
    showToast("Draft saved");
    logActivity("cms.section_draft_saved", "cms_section", selected.sectionId, { sectionKey: selected.sectionKey });
  };

  const move = async (index: number, direction: -1 | 1) => {
    if (!sections || !user) return;
    const next = [...sections];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next);
    const updates = next.map((s, i) => ({ sectionId: s.sectionId, displayOrder: (i + 1) * 10 }));
    await reorderSections(updates, user.id);
    logActivity("cms.sections_reordered", "cms_page", "homepage");
  };

  const onDrop = async (targetKey: string) => {
    if (!sections || !dragKey || dragKey === targetKey || !user) return;
    const fromIndex = sections.findIndex((s) => s.sectionKey === dragKey);
    const toIndex = sections.findIndex((s) => s.sectionKey === targetKey);
    const next = [...sections];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setSections(next);
    setDragKey(null);
    const updates = next.map((s, i) => ({ sectionId: s.sectionId, displayOrder: (i + 1) * 10 }));
    await reorderSections(updates, user.id);
    logActivity("cms.sections_reordered", "cms_page", "homepage");
  };

  const toggleVisible = async (section: CmsSectionRow) => {
    if (section.isRequired || !user) return;
    const next = !section.visible;
    setSections((prev) => prev?.map((s) => (s.sectionId === section.sectionId ? { ...s, visible: next } : s)) ?? null);
    await saveSectionDraft(section.sectionId, { visible: next }, user.id);
    logActivity("cms.section_visibility_changed", "cms_section", section.sectionId, { visible: next });
  };

  const onPublish = async () => {
    if (dirty) {
      const ok = await confirm("You have unsaved changes to the selected section — publish anyway without them?", {
        confirmLabel: "Publish Anyway",
        cancelLabel: "Cancel",
      });
      if (!ok) return;
    }
    setPublishing(true);
    const { error } = await publishPage("homepage");
    setPublishing(false);
    if (error) {
      showToast("Publish failed", "error");
      return;
    }
    showToast("Homepage published");
    logActivity("cms.page_published", "cms_page", "homepage");
    getLastPublication("homepage").then((pub) => setLastPublishedAt(pub?.publishedAt ?? null));
  };

  if (!sections) return <div className="p-10 text-[13.5px] text-steel-500">Loading…</div>;

  const previewSections = sections.map((s) => (s.sectionId === selectedSectionId ? { ...s, content: liveContent } : s));

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display uppercase text-[13.5px]">Homepage</h2>
          <p className="text-[12.5px] text-steel-500">Select a section to edit it — the preview updates as you type.</p>
        </div>
        <button type="button" onClick={onPublish} disabled={publishing} className="btn-dark disabled:opacity-50">
          {publishing ? "Publishing…" : "Publish"}
        </button>
      </div>

      <div className="grid lg:grid-cols-[280px_1fr_360px] gap-4 items-start">
        {/* Navigator */}
        <div className="flex flex-col divide-y divide-line border border-line bg-white">
          {sections.map((s, i) => {
            const status = statusOf(s);
            return (
              <div
                key={s.sectionId}
                draggable
                onDragStart={() => setDragKey(s.sectionKey)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(s.sectionKey)}
                onClick={() => selectSection(s.sectionId)}
                className={clsx(
                  "flex items-center gap-2 px-3 py-2.5 cursor-pointer",
                  dragKey === s.sectionKey && "opacity-50",
                  selectedSectionId === s.sectionId ? "bg-steel-50" : "hover:bg-steel-50/60"
                )}
              >
                <GripVertical className="w-3.5 h-3.5 text-steel-300 cursor-grab shrink-0" aria-hidden onClick={(e) => e.stopPropagation()} />
                <span className={clsx("w-2 h-2 rounded-full shrink-0", statusDotClass(status))} title={STATUS_LABEL[status]} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold truncate flex items-center gap-1.5">
                    {SECTION_LABELS[s.sectionKey] ?? s.sectionKey}
                    {s.isRequired && <Lock className="w-3 h-3 text-steel-300 shrink-0" aria-label="Required" />}
                  </div>
                  <div className="text-[10.5px] text-steel-500">{STATUS_LABEL[status]}</div>
                </div>
                <div className="flex flex-col shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="text-steel-500 hover:text-ink disabled:opacity-30">
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === sections.length - 1} aria-label="Move down" className="text-steel-500 hover:text-ink disabled:opacity-30">
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleVisible(s); }}
                  disabled={s.isRequired}
                  className="text-steel-500 hover:text-ink disabled:opacity-30 shrink-0"
                  title={s.isRequired ? "Required — always visible" : s.visible ? "Hide" : "Show"}
                >
                  {s.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
              </div>
            );
          })}
        </div>

        {/* Preview */}
        <div>
          <PreviewFrame>
            {(breakpoint) => <FullHomePreview sections={previewSections} selectedSectionId={selectedSectionId} previewBreakpoint={breakpoint} />}
          </PreviewFrame>
        </div>

        {/* Inspector */}
        <div className="border border-line bg-white p-4 lg:sticky lg:top-4 max-h-[720px] overflow-y-auto">
          {!selected ? (
            <p className="text-[12.5px] text-steel-500">Select a section from the list to edit it.</p>
          ) : DEDICATED_EDITOR[selected.sectionKey] ? (
            <div>
              <h3 className="font-display uppercase text-[12px] text-steel-500 mb-3">{SECTION_LABELS[selected.sectionKey]}</h3>
              <div className="text-[12.5px] text-steel-600 space-y-1 mb-4">
                <p className="font-semibold">{(selected.content as HeroContentOverride).headingLine1 || "—"} {(selected.content as HeroContentOverride).headingLine2 || ""}</p>
                <p>{(selected.content as HeroContentOverride).subheading || "No subheading set"}</p>
              </div>
              <Link to={DEDICATED_EDITOR[selected.sectionKey]} className="text-[12.5px] font-semibold text-brand-700 hover:underline">
                Open full editor →
              </Link>
            </div>
          ) : !sectionFields[selected.sectionKey] ? (
            <p className="text-[12.5px] text-steel-500">No editor available for this section yet.</p>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display uppercase text-[12px] text-steel-500">{sectionFields[selected.sectionKey].title}</h3>
                <EditorToolbar dirty={dirty} canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
              </div>
              <SectionInspector sectionKey={selected.sectionKey} content={liveContent} onChange={updateLive} />
              <button type="button" onClick={saveSelected} disabled={!dirty || saving} className="btn-outline disabled:opacity-50 mt-4">
                {saving ? "Saving…" : "Save Draft"}
              </button>
            </div>
          )}
        </div>
      </div>
      {guardDialog}
      {confirmDialog}
    </div>
  );
}
