import { useEffect, useState } from "react";
import { Search, X, ChevronUp, ChevronDown, Eye, EyeOff, ImageIcon } from "lucide-react";
import { catalogService } from "../../services/catalog/catalogService";
import type { Category } from "../../data/types";
import type { CategorySelection } from "../../hooks/useMerchandisingCms";
import { AdminMediaPicker, mediaPublicUrl } from "./AdminMediaPicker";

/**
 * Reusable real-Odoo category selector for the Homepage Categories merchandising editor. Lists
 * `product.public.category` rows via the existing `catalog-categories` Edge Function (same one
 * Brands.tsx/Shop.tsx use) — never invents categories. Fully controlled: the caller owns the
 * ordered `CategorySelection[]` list. `imageStoragePath`/`heading` are optional CMS overrides
 * layered on top of the real category (never a substitute for it — `categoryId` is always a real
 * Odoo id, resolved live at render time on the storefront).
 */
export function AdminCategoryPicker({
  selections,
  onChange,
}: {
  selections: CategorySelection[];
  onChange: (selections: CategorySelection[]) => void;
}) {
  const [q, setQ] = useState("");
  const [allCategories, setAllCategories] = useState<Category[] | null>(null);
  const [pickerForCategoryId, setPickerForCategoryId] = useState<number | null>(null);

  useEffect(() => {
    catalogService.getCategories().then(setAllCategories);
  }, []);

  const selectedIds = new Set(selections.map((s) => s.categoryId));
  const results = (allCategories ?? []).filter(
    (c) => c.odooId !== undefined && !selectedIds.has(c.odooId) && (q === "" || c.name.toLowerCase().includes(q.toLowerCase()))
  );

  const add = (category: Category) => {
    if (category.odooId === undefined) return;
    onChange([...selections, { categoryId: category.odooId, order: selections.length, visible: true }]);
  };

  const remove = (categoryId: number) => onChange(selections.filter((s) => s.categoryId !== categoryId));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= selections.length) return;
    const next = [...selections];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const patch = (categoryId: number, updates: Partial<CategorySelection>) => {
    onChange(selections.map((s) => (s.categoryId === categoryId ? { ...s, ...updates } : s)));
  };

  const nameFor = (categoryId: number) => allCategories?.find((c) => c.odooId === categoryId)?.name ?? `Category #${categoryId}`;

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <h3 className="font-display uppercase text-[12px] text-steel-500 mb-2">Add categories</h3>
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-steel-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search categories…"
            className="w-full h-10 pl-9 pr-3 border border-line text-[13.5px] focus:outline-none focus:border-ink"
          />
        </div>
        <div className="border border-line divide-y divide-line max-h-[420px] overflow-y-auto">
          {allCategories === null && <div className="p-4 text-[12.5px] text-steel-500">Loading…</div>}
          {allCategories !== null && results.length === 0 && <div className="p-4 text-[12.5px] text-steel-500">No categories found.</div>}
          {results.map((c) => (
            <div key={c.odooId} className="flex items-center gap-2.5 p-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium line-clamp-1">{c.name}</div>
                <div className="text-[11px] text-steel-500 capitalize">
                  {c.role}
                  {c.productCount !== undefined ? ` · ${c.productCount} products` : ""}
                </div>
              </div>
              <button type="button" onClick={() => add(c)} className="text-[12px] font-semibold text-brand-700 hover:underline shrink-0">
                Add
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-display uppercase text-[12px] text-steel-500 mb-2">Selected ({selections.length})</h3>
        <div className="border border-line divide-y divide-line min-h-[120px] max-h-[420px] overflow-y-auto">
          {selections.length === 0 && <div className="p-4 text-[12.5px] text-steel-500">Nothing selected yet.</div>}
          {selections.map((s, i) => (
            <div key={s.categoryId} className="p-2.5 flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex flex-col shrink-0">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="text-steel-500 hover:text-ink disabled:opacity-30">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === selections.length - 1}
                    aria-label="Move down"
                    className="text-steel-500 hover:text-ink disabled:opacity-30"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 min-w-0 text-[12.5px] font-medium line-clamp-1">{nameFor(s.categoryId)}</div>
                <button
                  type="button"
                  onClick={() => patch(s.categoryId, { visible: !s.visible })}
                  className="text-steel-500 hover:text-ink shrink-0"
                  title={s.visible ? "Hide" : "Show"}
                >
                  {s.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button type="button" onClick={() => remove(s.categoryId)} aria-label="Remove" className="text-steel-500 hover:text-ink shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 pl-[26px]">
                <input
                  value={s.heading ?? ""}
                  onChange={(e) => patch(s.categoryId, { heading: e.target.value || undefined })}
                  placeholder="Label override (optional)"
                  className="h-9 px-2.5 border border-line text-[12.5px] focus:outline-none focus:border-ink"
                />
                <button
                  type="button"
                  onClick={() => setPickerForCategoryId(s.categoryId)}
                  className="h-9 px-2.5 border border-line text-[12.5px] flex items-center gap-2 hover:border-ink"
                >
                  {s.imageStoragePath ? (
                    <img src={mediaPublicUrl(s.imageStoragePath)} alt="" className="w-5 h-5 object-cover shrink-0" />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-steel-400 shrink-0" />
                  )}
                  <span className="truncate text-steel-600">{s.imageStoragePath ? "Change image" : "Choose image (optional)"}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <AdminMediaPicker
        open={pickerForCategoryId !== null}
        onClose={() => setPickerForCategoryId(null)}
        onSelect={(path) => {
          if (pickerForCategoryId !== null) patch(pickerForCategoryId, { imageStoragePath: path });
          setPickerForCategoryId(null);
        }}
      />
    </div>
  );
}
