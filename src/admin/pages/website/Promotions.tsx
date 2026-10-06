import { useEffect, useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, X } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../../context/AuthContext";
import {
  createPromotion,
  deletePromotion,
  listPromotions,
  publishPromotion,
  reorderPromotions,
  updatePromotion,
  type PromotionInput,
  type PromotionRow,
} from "../../services/promotionsService";
import { useActivityLog } from "../../hooks/useActivityLog";
import { useAdminToast } from "../../components/AdminToastProvider";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { AdminMediaField, mediaPublicUrl } from "../../components/AdminMediaPicker";
import { ImagePositionControl } from "../../components/ImagePositionControl";
import { PreviewFrame } from "../../components/PreviewFrame";
import { EditorToolbar } from "../../components/EditorToolbar";
import { PromoBannerPair } from "../../../components/home/PromoBannerPair";

const inputClass = "w-full h-10 px-3 border border-line text-[13.5px] focus:outline-none focus:border-ink";
const labelClass = "block text-[12px] uppercase tracking-wide mb-1.5 text-steel-500";

const EMPTY_FORM: PromotionInput = {
  internalName: "",
  heading: "",
  subheading: "",
  body: "",
  imageStoragePath: "",
  mobileImageStoragePath: "",
  imagePosition: null,
  mobileImagePosition: null,
  ctaLabel: "",
  ctaUrl: "",
  enabled: false,
  displayOrder: 0,
};

/**
 * Promotions — the one Website CMS module with its own dedicated table (cms_promotions), since
 * it's a true variable-length collection rather than a fixed named slot. Renders in the homepage's
 * PromoBannerPair slot. Each row publishes independently (status + enabled), not via
 * cms_publish_page().
 */
export default function Promotions() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { showToast } = useAdminToast();

  const [rows, setRows] = useState<PromotionRow[] | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const { value: form, set: setFormTracked, setWithoutHistory: loadFormValue, undo, redo, canUndo, canRedo } = useUndoRedo<PromotionInput>(EMPTY_FORM);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const guardDialog = useUnsavedChangesGuard(dirty && editingId !== null);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const load = () => listPromotions().then(setRows);
  useEffect(() => {
    load();
  }, []);

  const startNew = () => {
    loadFormValue({ ...EMPTY_FORM, displayOrder: (rows?.length ?? 0) * 10 });
    setDirty(false);
    setEditingId("new");
  };

  const startEdit = (row: PromotionRow) => {
    loadFormValue({
      internalName: row.internalName,
      heading: row.heading,
      subheading: row.subheading ?? "",
      body: row.body ?? "",
      imageStoragePath: row.imageStoragePath ?? "",
      mobileImageStoragePath: row.mobileImageStoragePath ?? "",
      imagePosition: row.imagePosition,
      mobileImagePosition: row.mobileImagePosition,
      ctaLabel: row.ctaLabel ?? "",
      ctaUrl: row.ctaUrl ?? "",
      enabled: row.enabled,
      displayOrder: row.displayOrder,
    });
    setDirty(false);
    setEditingId(row.id);
  };

  const cancel = async () => {
    if (dirty && !(await confirm("Discard unsaved changes to this promotion?"))) return;
    setEditingId(null);
  };

  const update = (patch: Partial<PromotionInput>) => {
    setFormTracked({ ...form, ...patch });
    setDirty(true);
  };

  const onSave = async () => {
    if (!user || !form.internalName || !form.heading) return;
    setSaving(true);
    const { error } = editingId === "new" ? await createPromotion(form, user.id) : await updatePromotion(editingId!, form, user.id);
    setSaving(false);
    if (error) {
      showToast("Couldn't save", "error");
      return;
    }
    showToast("Saved");
    logActivity(editingId === "new" ? "cms.promotion_created" : "cms.promotion_updated", "cms_promotion", editingId === "new" ? undefined : editingId!, {
      internalName: form.internalName,
    });
    setDirty(false);
    setEditingId(null);
    load();
  };

  const onPublish = async (id: string) => {
    if (!user) return;
    setPublishing(true);
    const { error } = await publishPromotion(id, user.id);
    setPublishing(false);
    if (error) {
      showToast("Publish failed", "error");
      return;
    }
    showToast("Published");
    logActivity("cms.promotion_published", "cms_promotion", id);
    load();
  };

  const onDelete = async (id: string) => {
    const { error } = await deletePromotion(id);
    if (error) {
      showToast("Couldn't delete", "error");
      return;
    }
    showToast("Deleted");
    logActivity("cms.promotion_deleted", "cms_promotion", id);
    load();
  };

  const move = async (index: number, direction: -1 | 1) => {
    if (!rows || !user) return;
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
    await reorderPromotions(
      next.map((r, i) => ({ id: r.id, displayOrder: (i + 1) * 10 })),
      user.id
    );
  };

  if (!rows) return <div className="p-10 text-[13.5px] text-steel-500">Loading…</div>;

  return (
    <div className="p-6 lg:p-10 max-w-4xl">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display uppercase text-[13.5px]">Promotions</h2>
        <button type="button" onClick={startNew} className="btn-dark flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> New Promotion
        </button>
      </div>
      <p className="text-[12.5px] text-steel-500 mb-6">
        Renders in the homepage's promo banner pair. Only promotions that are both Published and Enabled show publicly. Each promotion publishes
        independently.
      </p>

      <div className="border border-line divide-y divide-line mb-8">
        {rows.length === 0 && <div className="p-6 text-[13px] text-steel-500 text-center">No promotions yet.</div>}
        {rows.map((row, i) => (
          <div key={row.id} className="flex items-center gap-3 p-3">
            <div className="flex flex-col shrink-0">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="text-steel-500 hover:text-ink disabled:opacity-30">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down" className="text-steel-500 hover:text-ink disabled:opacity-30">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold line-clamp-1">{row.internalName}</div>
              <div className="text-[11.5px] text-steel-500 line-clamp-1">{row.heading}</div>
            </div>
            <span
              className={clsx(
                "text-[10.5px] uppercase font-semibold px-2 py-1 shrink-0",
                row.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-steel-50 text-steel-500"
              )}
            >
              {row.status}
            </span>
            <span className={clsx("text-[10.5px] uppercase font-semibold px-2 py-1 shrink-0", row.enabled ? "text-ink" : "text-steel-300")}>
              {row.enabled ? "Enabled" : "Disabled"}
            </span>
            <button type="button" onClick={() => startEdit(row)} className="text-[12px] font-semibold text-brand-700 hover:underline shrink-0">
              Edit
            </button>
            <button
              type="button"
              onClick={() => onPublish(row.id)}
              disabled={publishing}
              className="text-[12px] font-semibold text-brand-700 hover:underline shrink-0 disabled:opacity-50"
            >
              Publish
            </button>
            <button type="button" onClick={() => onDelete(row.id)} aria-label="Delete" className="text-steel-500 hover:text-ink shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {editingId && (
        <div className="border border-line p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display uppercase text-[12.5px]">{editingId === "new" ? "New promotion" : "Edit promotion"}</h3>
            <div className="flex items-center gap-2">
              <EditorToolbar dirty={dirty} canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
              <button type="button" onClick={cancel} aria-label="Close" className="text-steel-500 hover:text-ink ml-2">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="promo-name" className={labelClass}>Internal name</label>
              <input id="promo-name" className={inputClass} value={form.internalName} onChange={(e) => update({ internalName: e.target.value })} placeholder="Diwali combo banner" />
            </div>
            <label className="flex items-center gap-2 text-[13.5px] mt-6">
              <input type="checkbox" checked={form.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
              Enabled
            </label>
            <div>
              <label htmlFor="promo-heading" className={labelClass}>Heading</label>
              <input id="promo-heading" className={inputClass} value={form.heading} onChange={(e) => update({ heading: e.target.value })} />
            </div>
            <div>
              <label htmlFor="promo-subheading" className={labelClass}>Subheading</label>
              <input id="promo-subheading" className={inputClass} value={form.subheading ?? ""} onChange={(e) => update({ subheading: e.target.value })} />
            </div>
            <div>
              <label htmlFor="promo-cta-label" className={labelClass}>CTA label</label>
              <input id="promo-cta-label" className={inputClass} value={form.ctaLabel ?? ""} onChange={(e) => update({ ctaLabel: e.target.value })} placeholder="Shop Now" />
            </div>
            <div>
              <label htmlFor="promo-cta-url" className={labelClass}>CTA link</label>
              <input id="promo-cta-url" className={inputClass} value={form.ctaUrl ?? ""} onChange={(e) => update({ ctaUrl: e.target.value })} placeholder="/shop?tag=bestseller" />
            </div>
            <div>
              <AdminMediaField label="Image" value={form.imageStoragePath ?? undefined} onChange={(path) => update({ imageStoragePath: path ?? "" })} />
              <ImagePositionControl imageUrl={form.imageStoragePath ? mediaPublicUrl(form.imageStoragePath) : undefined} value={form.imagePosition ?? undefined} onChange={(pos) => update({ imagePosition: pos })} />
            </div>
            <div>
              <AdminMediaField label="Mobile image (optional)" value={form.mobileImageStoragePath ?? undefined} onChange={(path) => update({ mobileImageStoragePath: path ?? "" })} />
              <ImagePositionControl imageUrl={form.mobileImageStoragePath ? mediaPublicUrl(form.mobileImageStoragePath) : undefined} value={form.mobileImagePosition ?? undefined} onChange={(pos) => update({ mobileImagePosition: pos })} />
            </div>
          </div>
          <button type="button" onClick={onSave} disabled={saving || !form.internalName || !form.heading} className="btn-dark disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
          </div>

          <div>
            <PreviewFrame>
              {(breakpoint) => (
                <div className="p-4">
                  <PromoBannerPair
                    previewBreakpoint={breakpoint}
                    promotions={[
                      {
                        id: editingId === "new" ? "preview" : editingId!,
                        heading: form.heading || "Promotion heading",
                        subheading: form.subheading || null,
                        ctaLabel: form.ctaLabel || null,
                        ctaUrl: form.ctaUrl || null,
                        image: form.imageStoragePath ? mediaPublicUrl(form.imageStoragePath) : null,
                        mobileImage: form.mobileImageStoragePath ? mediaPublicUrl(form.mobileImageStoragePath) : null,
                        imagePosition: form.imagePosition ?? null,
                        mobileImagePosition: form.mobileImagePosition ?? null,
                      },
                    ]}
                  />
                </div>
              )}
            </PreviewFrame>
          </div>
        </div>
      )}
      {guardDialog}
      {confirmDialog}
    </div>
  );
}
