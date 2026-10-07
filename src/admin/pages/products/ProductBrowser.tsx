import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Search } from "lucide-react";
import { catalogService } from "../../../services/catalog/catalogService";
import { supabase } from "../../../lib/supabaseClient";
import type { Product } from "../../../data/types";
import { formatINR } from "../../../lib/format";

const PAGE_SIZE = 20;

/**
 * READ-ONLY Odoo-backed product browser (spec: this is NOT product CRUD). Reuses the existing,
 * real catalogService.getProductsPage() — the same paginated/filtered endpoint the storefront
 * Shop page uses — so there's no new privileged Odoo-read surface. Row actions are intentionally
 * limited to Preview and Open in Odoo. Merchandising selection lives on the dedicated
 * /admin/merchandising/* editors — never product CRUD here.
 */
export default function ProductBrowser() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ items: Product[]; total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    catalogService
      .getProductsPage({ page, pageSize: PAGE_SIZE, q: q || undefined })
      .then((r) => setResult(r))
      .finally(() => setLoading(false));
  }, [page, q]);

  const openInOdoo = async (odooId: number) => {
    if (!supabase) return;
    setOpeningId(String(odooId));
    const { data, error } = await supabase.functions.invoke<{ url?: string }>("admin-odoo-link", {
      body: { model: "product.template", id: odooId },
    });
    setOpeningId(null);
    if (error || !data?.url) return;
    window.open(data.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="font-display uppercase text-[13.5px]">Products (read-only — Odoo)</h2>
        <div className="relative w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-steel-500" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search products…"
            className="w-full h-10 pl-9 pr-3 border border-line text-[13.5px] focus:outline-none focus:border-ink"
          />
        </div>
      </div>
      <p className="text-[12px] text-steel-500 mb-4">
        Product data comes live from Odoo — to change name, price, stock, or images, edit it in Odoo. This view never writes.
      </p>

      <div className="border border-line overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-steel-50 text-left text-[11px] uppercase tracking-wide text-steel-500">
              <th className="p-3 font-semibold">Product</th>
              <th className="p-3 font-semibold">SKU</th>
              <th className="p-3 font-semibold">Price</th>
              <th className="p-3 font-semibold">Vehicle</th>
              <th className="p-3 font-semibold">Brand</th>
              <th className="p-3 font-semibold">Variants</th>
              <th className="p-3 font-semibold">Odoo ID</th>
              <th className="p-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-steel-500">Loading…</td>
              </tr>
            )}
            {!loading && result?.items.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-steel-500">No products found.</td>
              </tr>
            )}
            {!loading &&
              result?.items.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-b-0 hover:bg-steel-50/50">
                  <td className="p-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 bg-steel-50 shrink-0 overflow-hidden">
                        {p.primaryImage && <img src={p.primaryImage} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <span className="font-medium line-clamp-2">{p.name}</span>
                    </div>
                  </td>
                  <td className="p-3 text-steel-500">{p.sku ?? "—"}</td>
                  <td className="p-3 price">{formatINR(p.price)}</td>
                  <td className="p-3 text-steel-500 capitalize">{p.vehicleTypes?.join(", ") || "—"}</td>
                  <td className="p-3 text-steel-500">{p.brand?.name ?? "—"}</td>
                  <td className="p-3 text-steel-500">{p.variantCount ?? 1}</td>
                  <td className="p-3 text-steel-500 font-mono text-[12px]">{p.odooId}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Link to={`/product/${p.slug}`} target="_blank" className="text-[12px] font-semibold text-brand-700 hover:underline">
                        Preview
                      </Link>
                      {p.odooId && (
                        <button
                          type="button"
                          disabled={openingId === String(p.odooId)}
                          onClick={() => openInOdoo(p.odooId!)}
                          className="flex items-center gap-1 text-[12px] font-semibold text-brand-700 hover:underline disabled:opacity-50"
                        >
                          Odoo <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {result && result.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-[13px]">
          <span className="text-steel-500">
            {result.total} products · page {page} of {result.totalPages}
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-ghost !px-3 !py-1.5 disabled:opacity-40">
              Prev
            </button>
            <button type="button" disabled={page >= result.totalPages} onClick={() => setPage((p) => p + 1)} className="btn-ghost !px-3 !py-1.5 disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
