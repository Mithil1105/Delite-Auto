import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSectionDraft, publishPage, saveSectionDraft, type CmsSectionRow } from "../../services/cmsService";
import { useAuth } from "../../../context/AuthContext";
import { useAdminToast } from "../../components/AdminToastProvider";
import { useActivityLog } from "../../hooks/useActivityLog";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { PreviewFrame } from "../../components/PreviewFrame";
import { EditorToolbar } from "../../components/EditorToolbar";
import { HomeSectionPreview } from "../../components/HomeSectionPreview";
import { SectionInspector, sectionFields } from "../../components/SectionInspector";

export default function HomeSectionEditor() {
  const { sectionKey = "" } = useParams();
  const config = sectionFields[sectionKey];
  const { user } = useAuth();
  const { showToast } = useAdminToast();
  const { logActivity } = useActivityLog();
  const [section, setSection] = useState<CmsSectionRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { value: content, set: setContentTracked, setWithoutHistory: loadContent, undo, redo, canUndo, canRedo } = useUndoRedo<Record<string, unknown>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const guardDialog = useUnsavedChangesGuard(dirty);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    getSectionDraft("homepage", sectionKey).then((row) => {
      if (active) { setSection(row); loadContent(row?.content ?? {}); setDirty(false); setLoaded(true); }
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey]);

  if (!config) return <p className="p-8">Unknown homepage section.</p>;
  if (!loaded) return <p className="p-8">Loading section…</p>;
  if (!section) return <p className="p-8" role="alert">Section unavailable. Check the CMS connection and permissions.</p>;

  const update = (key: string, value: unknown) => { setContentTracked({ ...content, [key]: value }); setDirty(true); };
  const save = async () => {
    if (!user) return;
    setSaving(true);
    const result = await saveSectionDraft(section.sectionId, { content }, user.id);
    setSaving(false);
    if (result.error) showToast(result.error, "error");
    else {
      setDirty(false);
      loadContent(content); // resets undo history so Undo can never rewind past this save
      showToast("Draft saved");
      logActivity("cms.section_draft_saved", "cms_section", section.sectionId);
    }
  };
  const publish = async () => {
    if (dirty) { showToast("Save the draft before publishing", "error"); return; }
    const result = await publishPage("homepage");
    if (result.error) showToast(result.error, "error");
    else { showToast("Homepage published"); logActivity("cms.page_published", "cms_page", "homepage"); }
  };

  return <div className="p-6 lg:p-10 max-w-6xl space-y-6">
    <Link to="/admin/website/homepage" className="text-sm text-brand-700 hover:underline">← Homepage sections</Link>
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div><h1 className="font-display text-2xl">{config.title}</h1><p className="text-sm text-steel-500">Edit a draft, save it, then publish the homepage to make it live.</p></div>
      <EditorToolbar dirty={dirty} canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
    </div>
    <div className="grid lg:grid-cols-[1fr_1.1fr] gap-6">
      <div className="card-surface p-5 space-y-4">
        <SectionInspector sectionKey={sectionKey} content={content} onChange={update} />
        <div className="flex gap-3 pt-2"><button className="btn-outline" onClick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save Draft"}</button><button className="btn-dark" onClick={publish}>Publish Homepage</button></div>
      </div>
      <div>
        <PreviewFrame>
          {(breakpoint) => <HomeSectionPreview sectionKey={sectionKey} content={content} previewBreakpoint={breakpoint} />}
        </PreviewFrame>
        <p className="text-xs text-steel-500 mt-3">This shows your unsaved draft using the real storefront components. The live site still shows the last published version until you Save Draft and Publish.</p>
      </div>
    </div>
    {guardDialog}
  </div>;
}
