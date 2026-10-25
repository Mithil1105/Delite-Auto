import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, ExternalLink, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../../context/AuthContext";
import { getLastPublication, getPageSections, publishPage, reorderSections, saveSectionDraft, type CmsSectionRow } from "../../services/cmsService";
import { useActivityLog } from "../../hooks/useActivityLog";
import { useAdminToast } from "../../components/AdminToastProvider";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { AdminProductPicker } from "../../components/AdminProductPicker";
import { AdminMediaField, mediaPublicUrl } from "../../components/AdminMediaPicker";
import { catalogService } from "../../../services/catalog/catalogService";
import type { Category } from "../../../data/types";
import { DEALS_SECTIONS, DEALS_SETTINGS_KEY, dealsSectionDef, type DealsField } from "../../../data/dealsSections";
import { asIdList } from "../../../lib/deals/helpers";

const MIGRATION_FILE = "supabase/migrations/20261022120000_deals_page_cms.sql";
const inputClass = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

/** The Deals page stores an image as its full public URL (so the storefront can use it directly); the media picker works with the storage path. */
const MEDIA_PREFIX = "/storage/v1/object/public/marketing-media/";
const pathFromUrl = (url: unknown): string | undefined => {
  if (typeof url !== "string" || !url) return undefined;
  const i = url.indexOf(MEDIA_PREFIX);
  return i >= 0 ? url.slice(i + MEDIA_PREFIX.length) : undefined;
};

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40",
        checked ? "bg-emerald-500" : "bg-steel-300"
      )}
    >
      <span className={clsx("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

type Combo = { title: string; productIds: number[] };

function CombosEditor({ value, onChange, max }: { value: unknown; onChange: (v: Combo[]) => void; max: number }) {
  const combos: Combo[] = Array.isArray(value)
    ? (value as Record<string, unknown>[]).map((c) => ({ title: typeof c.title === "string" ? c.title : "", productIds: asIdList(c.productIds, 4) }))
    : [];
  const update = (i: number, patch: Partial<Combo>) => onChange(combos.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-4">
      {combos.map((combo, i) => (
        <div key={i} className="rounded-xl border border-line p-3 space-y-3">
          <div className="flex items-center gap-2">
            <input className={inputClass} placeholder="Combo name, e.g. Mats + seat covers" value={combo.title} onChange={(e) => update(i, { title: e.target.value })} />
            <button type="button" onClick={() => onChange(combos.filter((_, idx) => idx !== i))} className="shrink-0 text-steel-500 hover:text-sale" aria-label="Remove combo">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <AdminProductPicker selectedIds={combo.productIds} onChange={(ids) => update(i, { productIds: ids })} maxItems={4} />
          {combo.productIds.length < 2 && <p className="text-xs text-amber-700">Pick at least 2 products — a combo with fewer won't be shown.</p>}
        </div>
      ))}
      {combos.length < max && (
        <button type="button" onClick={() => onChange([...combos, { title: "", productIds: [] }])} className="btn-outline inline-flex items-center gap-1.5 text-sm">
          <Plus className="h-4 w-4" /> Add a combo
        </button>
      )}
    </div>
  );
}

function CategorySelect({ value, onChange }: { value: unknown; onChange: (id: number | undefined) => void }) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  useEffect(() => {
    catalogService.getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);
  const current = Number(value);
  return (
    <select className={inputClass} value={Number.isSafeInteger(current) && current > 0 ? String(current) : ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}>
      <option value="">{categories === null ? "Loading categories…" : "— Choose a category —"}</option>
      {(categories ?? []).filter((c) => typeof c.odooId === "number").map((c) => (
        <option key={c.odooId} value={c.odooId}>
          {c.name}{c.role === "brand" ? " (brand)" : c.role === "vehicle" ? " (vehicle)" : ""}
        </option>
      ))}
    </select>
  );
}

function FieldEditor({ field, content, onChange }: { field: DealsField; content: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  const value = content[field.key];
  const label = <span className="block text-sm font-medium">{field.label}</span>;
  const help = field.help ? <span className="mt-1 block text-xs text-steel-500">{field.help}</span> : null;

  switch (field.kind) {
    case "boolean":
      return (
        <div className="flex items-center gap-3">
          <Switch checked={value === true || (value === undefined && false)} onChange={(v) => onChange(field.key, v)} label={field.label} />
          <span className="text-sm font-medium">{field.label}</span>
        </div>
      );
    case "select": {
      const options = field.options ?? [];
      return (
        <label className="block">
          {label}
          <select className={`${inputClass} mt-1`} value={String(value ?? options[0]?.value ?? "")} onChange={(e) => onChange(field.key, e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {help}
        </label>
      );
    }
    case "textarea":
      return (
        <label className="block">
          {label}
          <textarea rows={field.key === "bands" ? 6 : 3} className={`${inputClass} mt-1 ${field.key === "bands" ? "font-mono" : ""}`} value={String(value ?? "")} onChange={(e) => onChange(field.key, e.target.value)} />
          {help}
        </label>
      );
    case "number":
      return (
        <label className="block">
          {label}
          <input type="number" min={1} max={field.max} className={`${inputClass} mt-1 max-w-[160px]`} value={value === undefined || value === "" ? "" : Number(value)} onChange={(e) => onChange(field.key, e.target.value === "" ? "" : Number(e.target.value))} />
          {help}
        </label>
      );
    case "datetime":
      return (
        <label className="block">
          {label}
          <input type="datetime-local" className={`${inputClass} mt-1 max-w-[260px]`} value={String(value ?? "")} onChange={(e) => onChange(field.key, e.target.value)} />
          {help}
        </label>
      );
    case "image":
      return (
        <AdminMediaField
          label={field.label}
          value={pathFromUrl(value)}
          onChange={(path) => onChange(field.key, path ? mediaPublicUrl(path) : "")}
        />
      );
    case "productIds":
      return (
        <div>
          {label}
          {help}
          <div className="mt-2">
            <AdminProductPicker selectedIds={asIdList(value, field.max ?? 12)} onChange={(ids) => onChange(field.key, ids)} maxItems={field.max ?? 12} />
          </div>
        </div>
      );
    case "category":
      return (
        <div>
          {label}
          <div className="mt-1"><CategorySelect value={value} onChange={(id) => onChange(field.key, id ?? "")} /></div>
          {help}
        </div>
      );
    case "combos":
      return (
        <div>
          {label}
          <div className="mt-2"><CombosEditor value={value} onChange={(v) => onChange(field.key, v)} max={field.max ?? 4} /></div>
        </div>
      );
    default:
      return (
        <label className="block">
          {label}
          <input type={field.kind === "url" ? "text" : "text"} className={`${inputClass} mt-1`} placeholder={field.kind === "url" ? "/shop or https://…" : undefined} value={String(value ?? "")} onChange={(e) => onChange(field.key, e.target.value)} />
          {help}
        </label>
      );
  }
}

export default function DealsAdmin() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { showToast } = useAdminToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const [rows, setRows] = useState<CmsSectionRow[] | null>(null);
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const dirty = Object.keys(edits).length > 0;
  const guardDialog = useUnsavedChangesGuard(dirty);

  const load = () => {
    getPageSections("deals").then(setRows);
    getLastPublication("deals").then((pub) => setLastPublishedAt(pub?.publishedAt ?? null));
  };
  useEffect(() => {
    load();
  }, []);

  const settingsRow = rows?.find((r) => r.sectionKey === DEALS_SETTINGS_KEY) ?? null;
  const listRows = useMemo(() => (rows ?? []).filter((r) => r.sectionKey !== DEALS_SETTINGS_KEY && dealsSectionDef(r.sectionKey)), [rows]);
  const pageEnabled = settingsRow ? settingsRow.content.pageEnabled !== false : true;

  const hasUnpublished = (rows ?? []).some((r) => r.updatedAt && (!lastPublishedAt || new Date(r.updatedAt) > new Date(lastPublishedAt)));

  const patchRow = (sectionId: string, patch: Partial<CmsSectionRow>) => setRows((prev) => prev?.map((r) => (r.sectionId === sectionId ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r)) ?? null);

  const setVisible = async (row: CmsSectionRow, visible: boolean) => {
    if (!user) return;
    patchRow(row.sectionId, { visible });
    const res = await saveSectionDraft(row.sectionId, { visible }, user.id);
    if (res.error) {
      showToast(res.error, "error");
      load();
      return;
    }
    logActivity("cms.section_visibility_changed", "cms_section", row.sectionId, { page: "deals", sectionKey: row.sectionKey, visible });
  };

  const setPageEnabled = async (enabled: boolean) => {
    if (!user || !settingsRow) return;
    const content = { ...settingsRow.content, pageEnabled: enabled };
    patchRow(settingsRow.sectionId, { content });
    const res = await saveSectionDraft(settingsRow.sectionId, { content }, user.id);
    if (res.error) {
      showToast(res.error, "error");
      load();
      return;
    }
    logActivity("cms.section_draft_saved", "cms_section", settingsRow.sectionId, { page: "deals", sectionKey: DEALS_SETTINGS_KEY, pageEnabled: enabled });
  };

  const move = async (index: number, dir: -1 | 1) => {
    if (!user) return;
    const target = index + dir;
    if (target < 0 || target >= listRows.length) return;
    const next = [...listRows];
    [next[index], next[target]] = [next[target], next[index]];
    const updates = next.map((r, i) => ({ sectionId: r.sectionId, displayOrder: (i + 1) * 10 }));
    setRows((prev) => (prev ? prev.map((r) => { const u = updates.find((x) => x.sectionId === r.sectionId); return u ? { ...r, displayOrder: u.displayOrder, updatedAt: new Date().toISOString() } : r; }).sort((a, b) => a.displayOrder - b.displayOrder) : prev));
    const res = await reorderSections(updates, user.id);
    if (res.error) {
      showToast(res.error, "error");
      load();
      return;
    }
    logActivity("cms.sections_reordered", "cms_page", "deals");
  };

  const editContent = (row: CmsSectionRow): Record<string, unknown> => edits[row.sectionKey] ?? row.content;
  const changeField = (row: CmsSectionRow, key: string, value: unknown) => setEdits((prev) => ({ ...prev, [row.sectionKey]: { ...(prev[row.sectionKey] ?? row.content), [key]: value } }));

  const saveRow = async (row: CmsSectionRow) => {
    if (!user) return;
    const content = edits[row.sectionKey];
    if (!content) return;
    setSavingKey(row.sectionKey);
    const res = await saveSectionDraft(row.sectionId, { content }, user.id);
    setSavingKey(null);
    if (res.error) {
      showToast(res.error, "error");
      return;
    }
    patchRow(row.sectionId, { content });
    setEdits((prev) => {
      const { [row.sectionKey]: _removed, ...rest } = prev;
      return rest;
    });
    showToast("Draft saved — click Publish to make it live");
    logActivity("cms.section_draft_saved", "cms_section", row.sectionId, { page: "deals", sectionKey: row.sectionKey });
  };

  const discardRow = (row: CmsSectionRow) =>
    setEdits((prev) => {
      const { [row.sectionKey]: _removed, ...rest } = prev;
      return rest;
    });

  const onPublish = async () => {
    if (dirty && !(await confirm("Some sections have unsaved edits that won't be published. Publish without them?", { confirmLabel: "Publish anyway", cancelLabel: "Cancel" }))) return;
    setPublishing(true);
    const { error } = await publishPage("deals");
    setPublishing(false);
    if (error) {
      showToast("Publish failed", "error");
      return;
    }
    showToast("Deals & Offers published");
    logActivity("cms.page_published", "cms_page", "deals");
    getLastPublication("deals").then((pub) => setLastPublishedAt(pub?.publishedAt ?? null));
  };

  if (rows === null) return <div className="p-10 text-[13.5px] text-steel-500">Loading…</div>;

  if (rows.length === 0) {
    return (
      <div className="max-w-3xl p-6 lg:p-10">
        <h1 className="font-display text-2xl">Deals &amp; Offers</h1>
        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm">
          <div className="mb-2 flex items-center gap-2 font-semibold text-amber-900"><TriangleAlert className="h-4 w-4" /> One-time setup needed</div>
          <p className="text-amber-900/90">The Deals &amp; Offers page hasn't been set up in the database yet. Run this once from the project folder, then reload this page:</p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-ink p-3 text-[12px] text-white">npx supabase db query --linked --file {MIGRATION_FILE}</pre>
          <p className="mt-3 text-amber-900/80">Until then the public page still works with its default sections, but you can't change them from here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6 p-6 lg:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl">Deals &amp; Offers</h1>
          <p className="mt-1 max-w-[60ch] text-sm text-steel-500">
            Switch each section on or off, change the order, and edit what it says. Changes are drafts until you click <strong>Publish</strong>.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/deals" target="_blank" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
            View page <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <button type="button" onClick={onPublish} disabled={publishing} className="btn-dark disabled:opacity-50">
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>

      {hasUnpublished && <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">You have changes that aren't live yet. Click Publish to put them on the website.</div>}

      {/* Master switch */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-white p-5">
        <div>
          <div className="font-semibold">Show the Deals &amp; Offers page</div>
          <p className="text-[13px] text-steel-500">When off, the page, its menu link and its footer link are all hidden, and visitors who open it are sent to the shop.</p>
        </div>
        <Switch checked={pageEnabled} onChange={setPageEnabled} disabled={!settingsRow} label="Show the Deals and Offers page" />
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {listRows.map((row, i) => {
          const def = dealsSectionDef(row.sectionKey)!;
          const open = openKey === row.sectionKey;
          const content = editContent(row);
          const isDirty = !!edits[row.sectionKey];
          return (
            <div key={row.sectionId} className={clsx("rounded-2xl border bg-white", row.visible ? "border-line" : "border-line/70 bg-steel-50/60")}>
              <div className="flex items-center gap-3 p-4">
                <Switch checked={row.visible} onChange={(v) => setVisible(row, v)} label={`${def.label} on or off`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-semibold">
                    {def.label}
                    <span className={clsx("rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide", row.visible ? "bg-emerald-100 text-emerald-800" : "bg-steel-100 text-steel-600")}>{row.visible ? "On" : "Off"}</span>
                    {isDirty && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-amber-800">Unsaved</span>}
                  </div>
                  <p className="text-[12.5px] text-steel-500">{def.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded p-1.5 text-steel-500 hover:bg-steel-50 hover:text-ink disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === listRows.length - 1} aria-label="Move down" className="rounded p-1.5 text-steel-500 hover:bg-steel-50 hover:text-ink disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setOpenKey(open ? null : row.sectionKey)} aria-expanded={open} className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-semibold hover:border-ink">
                    <Pencil className="h-3.5 w-3.5" /> {open ? "Close" : "Edit"}
                  </button>
                </div>
              </div>
              {open && (
                <div className="space-y-4 border-t border-line p-4">
                  {def.notice && <div className="rounded-xl bg-steel-50 px-3 py-2 text-[12.5px] text-steel-700">{def.notice}</div>}
                  {def.fields.map((field) => (
                    <FieldEditor key={field.key} field={field} content={content} onChange={(k, v) => changeField(row, k, v)} />
                  ))}
                  <div className="flex gap-3 pt-1">
                    <button type="button" className="btn-outline disabled:opacity-50" disabled={!isDirty || savingKey === row.sectionKey} onClick={() => saveRow(row)}>
                      {savingKey === row.sectionKey ? "Saving…" : "Save draft"}
                    </button>
                    {isDirty && <button type="button" className="text-sm text-steel-500 hover:text-ink" onClick={() => discardRow(row)}>Discard changes</button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {DEALS_SECTIONS.filter((d) => d.key !== DEALS_SETTINGS_KEY && !listRows.some((r) => r.sectionKey === d.key)).map((d) => (
          <div key={d.key} className="rounded-2xl border border-dashed border-line p-4 text-[13px] text-steel-500">
            <strong className="text-ink">{d.label}</strong> isn't set up in the database yet — re-run <code className="rounded bg-steel-100 px-1">{MIGRATION_FILE}</code> to add it.
          </div>
        ))}
      </div>
      {guardDialog}
      {confirmDialog}
    </div>
  );
}
