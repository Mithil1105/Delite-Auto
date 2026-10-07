import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { getSectionDraft, publishPage, saveSectionDraft, type CmsSectionRow } from "../../services/cmsService";
import { useActivityLog } from "../../hooks/useActivityLog";
import { useAdminToast } from "../../components/AdminToastProvider";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { PreviewFrame } from "../../components/PreviewFrame";
import { EditorToolbar } from "../../components/EditorToolbar";
import { Footer as RealFooter } from "../../../components/Footer";

interface FooterLink {
  label: string;
  url: string;
}

export interface FooterContent {
  contactPhone?: string;
  contactPhoneAlt?: string;
  contactEmail?: string;
  socialInstagram?: string;
  socialFacebook?: string;
  socialYoutube?: string;
  quickLinks?: FooterLink[];
  links?: FooterLink[];
  copyright?: string;
}

const inputClass = "w-full h-10 px-3 border border-line text-[13.5px] focus:outline-none focus:border-ink";
const labelClass = "block text-[12px] uppercase tracking-wide mb-1.5 text-steel-500";

function LinkListEditor({ title, links, onChange }: { title: string; links: FooterLink[]; onChange: (next: FooterLink[]) => void }) {
  const patch = (i: number, updates: Partial<FooterLink>) => onChange(links.map((l, idx) => (idx === i ? { ...l, ...updates } : l)));
  return (
    <div>
      <label className={labelClass}>{title}</label>
      <div className="flex flex-col gap-2 mb-2">
        {links.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={l.label} onChange={(e) => patch(i, { label: e.target.value })} placeholder="Label" className="h-9 px-2.5 border border-line text-[12.5px] flex-1 focus:outline-none focus:border-ink" />
            <input value={l.url} onChange={(e) => patch(i, { url: e.target.value })} placeholder="/terms" className="h-9 px-2.5 border border-line text-[12.5px] flex-1 focus:outline-none focus:border-ink" />
            <button type="button" onClick={() => onChange(links.filter((_, idx) => idx !== i))} aria-label="Remove" className="text-steel-500 hover:text-ink shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...links, { label: "", url: "" }])} className="flex items-center gap-1.5 text-[12px] font-semibold text-brand-700 hover:underline">
        <Plus className="w-3.5 h-3.5" /> Add link
      </button>
    </div>
  );
}

export default function Footer() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { showToast } = useAdminToast();

  const [section, setSection] = useState<CmsSectionRow | null>(null);
  const { value: form, set: setFormTracked, setWithoutHistory: loadForm, undo, redo, canUndo, canRedo } = useUndoRedo<FooterContent>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const guardDialog = useUnsavedChangesGuard(dirty);

  useEffect(() => {
    getSectionDraft("site-chrome", "footer").then((s) => {
      setSection(s);
      if (s) loadForm(s.content as FooterContent);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (patch: Partial<FooterContent>) => {
    setFormTracked({ ...form, ...patch });
    setDirty(true);
  };

  const onSaveDraft = async () => {
    if (!section || !user) return;
    setSaving(true);
    const { error } = await saveSectionDraft(section.sectionId, { content: form as Record<string, unknown> }, user.id);
    setSaving(false);
    if (error) {
      showToast("Couldn't save draft", "error");
      return;
    }
    setDirty(false);
    loadForm(form); // resets undo history so Undo can never rewind past this save
    showToast("Draft saved");
    logActivity("cms.draft_saved", "cms_section", section.sectionId, { sectionKey: "footer" });
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
    logActivity("cms.page_published", "cms_page", "site-chrome", { via: "footer-editor" });
  };

  if (!section) return <div className="p-10 text-[13.5px] text-steel-500">Loading…</div>;

  return (
    <div className="p-6 lg:p-10 max-w-3xl">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display uppercase text-[13.5px]">Footer</h2>
        <EditorToolbar dirty={dirty} canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo}>
          <button type="button" onClick={onSaveDraft} disabled={saving || !dirty} className="btn-outline disabled:opacity-50">
            {saving ? "Saving…" : "Save Draft"}
          </button>
          <button type="button" onClick={onPublish} disabled={publishing} className="btn-dark disabled:opacity-50">
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </EditorToolbar>
      </div>
      <p className="text-[12.5px] text-steel-500 mb-6">
        Contact info, social links, Quick Links / Links columns, and copyright. Brand and accessory columns always show real live catalog data and
        aren't editable here. Leave any field blank to keep the site's current default.
      </p>

      <div className="flex flex-col gap-6">
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="footer-phone" className={labelClass}>Phone</label>
            <input id="footer-phone" className={inputClass} value={form.contactPhone ?? ""} onChange={(e) => update({ contactPhone: e.target.value })} />
          </div>
          <div>
            <label htmlFor="footer-phone-alt" className={labelClass}>Phone (alt)</label>
            <input id="footer-phone-alt" className={inputClass} value={form.contactPhoneAlt ?? ""} onChange={(e) => update({ contactPhoneAlt: e.target.value })} />
          </div>
          <div>
            <label htmlFor="footer-email" className={labelClass}>Email</label>
            <input id="footer-email" className={inputClass} value={form.contactEmail ?? ""} onChange={(e) => update({ contactEmail: e.target.value })} />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="footer-instagram" className={labelClass}>Instagram URL</label>
            <input id="footer-instagram" className={inputClass} value={form.socialInstagram ?? ""} onChange={(e) => update({ socialInstagram: e.target.value })} />
          </div>
          <div>
            <label htmlFor="footer-facebook" className={labelClass}>Facebook URL</label>
            <input id="footer-facebook" className={inputClass} value={form.socialFacebook ?? ""} onChange={(e) => update({ socialFacebook: e.target.value })} />
          </div>
          <div>
            <label htmlFor="footer-youtube" className={labelClass}>YouTube URL</label>
            <input id="footer-youtube" className={inputClass} value={form.socialYoutube ?? ""} onChange={(e) => update({ socialYoutube: e.target.value })} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <LinkListEditor title="Quick Links" links={form.quickLinks ?? []} onChange={(quickLinks) => update({ quickLinks })} />
          <LinkListEditor title="Links" links={form.links ?? []} onChange={(links) => update({ links })} />
        </div>

        <div>
          <label htmlFor="footer-copyright" className={labelClass}>Copyright text</label>
          <input id="footer-copyright" className={inputClass} value={form.copyright ?? ""} onChange={(e) => update({ copyright: e.target.value })} placeholder="DeliteAuto. All rights reserved." />
        </div>
      </div>

      <div className="mt-8">
        <PreviewFrame>
          <RealFooter contentOverride={form} />
        </PreviewFrame>
      </div>
      {guardDialog}
    </div>
  );
}
