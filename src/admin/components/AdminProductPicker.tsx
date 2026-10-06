import { useEffect, useState } from "react";
import { Search, X, ChevronUp, ChevronDown, AlertTriangle } from "lucide-react";
import { catalogService } from "../../services/catalog/catalogService";
import type { Product } from "../../data/types";
import { formatINR } from "../../lib/format";

const SEARCH_PAGE_SIZE = 12;

/**
 * Reusable Odoo product selector for merchandising rails (Featured/Trending/New Arrivals). Fully
 * controlled: the caller owns the ordered id list, this component only searches/adds/reorders/
 * removes. Never edits product data — search results reuse the same read-only
 * `catalogService.getProductsPage()` the storefront Shop page and ProductBrowser use. Persists
 * (and the caller should persist) only `selectedIds`, never copied name/price/image — see
 * Documentations MD/delite-admin.md, "Odoo-ID-only persistence".
 */
export function AdminProductPicker({
  selectedIds,
  onChange,
  maxItems = 24,
}: {
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  maxItems?: number;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Map<number, Product>>(new Map());
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(() => {
      catalogService
        .getProductsPage({ page: 1, pageSize: SEARCH_PAGE_SIZE, q: q || undefined })
        .then((r) => {
          if (!cancelled) setResults(r.items);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [q]);

  // Resolves the current selection to real product data (for name/image/price display) whenever
  // the id list changes — keyed on the serialized list so identical selections don't re-fetch.
  const key = selectedIds.join(",");
  useEffect(() => {
    if (selectedIds.length === 0) {
      setSelectedProducts(new Map());
      setResolving(false);
      return;
    }
    let cancelled = false;
    setResolving(true);
    catalogService.getProductsPage({ page: 1, pageSize: selectedIds.length, ids: selectedIds }).then((r) => {
      if (cancelled) return;
      setSelectedProducts(new Map(r.items.map((p) => [p.odooId!, p])));
      setResolving(false);
    });
    return () => {
      cancelled = true;
    };
    // Deliberately keyed on `key` (serialized ids), not `selectedIds` itself — the array is a new
    // reference every render, which would refetch on every render if used directly.
  }, [key]);

  const add = (product: Product) => {
    if (!product.odooId || selectedIds.includes(product.odooId)) return;
    if (selectedIds.length >= maxItems) return;
    onChange([...selectedIds, product.odooId]);
  };

  const remove = (id: number) => onChange(selectedIds.filter((i) => i !== id));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= selectedIds.length) return;
    const next = [...selectedIds];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <h3 className="font-display uppercase text-[12px] text-steel-500 mb-2">Add products</h3>
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-steel-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products…"
            className="w-full h-10 pl-9 pr-3 border border-line text-[13.5px] focus:outline-none focus:border-ink"
          />
        </div>
        <div className="border border-line divide-y divide-line max-h-[420px] overflow-y-auto">
          {searching && <div className="p-4 text-[12.5px] text-steel-500">Searching…</div>}
          {!searching && results.length === 0 && <div className="p-4 text-[12.5px] text-steel-500">No products found.</div>}
          {!searching &&
            results.map((p) => {
              const already = p.odooId ? selectedIds.includes(p.odooId) : true;
              return (
                <div key={p.id} className="flex items-center gap-2.5 p-2.5">
                  <div className="w-9 h-9 bg-steel-50 shrink-0 overflow-hidden">
                    {p.primaryImage && <img src={p.primaryImage} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium line-clamp-1">{p.name}</div>
                    <div className="text-[11px] text-steel-500">
                      {p.sku ?? "—"} · {formatINR(p.price)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => add(p)}
                    disabled={already || selectedIds.length >= maxItems}
                    className="text-[12px] font-semibold text-brand-700 hover:underline disabled:opacity-40 disabled:no-underline shrink-0"
                  >
                    {already ? "Added" : "Add"}
                  </button>
                </div>
              );
            })}
        </div>
      </div>

      <div>
        <h3 className="font-display uppercase text-[12px] text-steel-500 mb-2">
          Selected ({selectedIds.length}/{maxItems})
        </h3>
        <div className="border border-line divide-y divide-line min-h-[120px] max-h-[420px] overflow-y-auto">
          {selectedIds.length === 0 && <div className="p-4 text-[12.5px] text-steel-500">Nothing selected yet.</div>}
          {selectedIds.map((id, i) => {
            const product = selectedProducts.get(id);
            const unresolved = !resolving && !product;
            return (
              <div key={id} className="flex items-center gap-2.5 p-2.5">
                <div className="flex flex-col shrink-0">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="text-steel-500 hover:text-ink disabled:opacity-30">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === selectedIds.length - 1}
                    aria-label="Move down"
                    className="text-steel-500 hover:text-ink disabled:opacity-30"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="w-9 h-9 bg-steel-50 shrink-0 overflow-hidden">
                  {product?.primaryImage && <img src={product.primaryImage} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  {unresolved ? (
                    <div className="flex items-center gap-1.5 text-[12px] text-amber-600">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Unavailable in Odoo (id {id})
                    </div>
                  ) : (
                    <>
                      <div className="text-[12.5px] font-medium line-clamp-1">{product?.name ?? "Loading…"}</div>
                      <div className="text-[11px] text-steel-500">{product ? formatINR(product.price) : ""}</div>
                    </>
                  )}
                </div>
                <button type="button" onClick={() => remove(id)} aria-label="Remove" className="text-steel-500 hover:text-ink shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
