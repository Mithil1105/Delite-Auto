import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Minus, Plus, Search } from "lucide-react";
import { dealerApi, type CatalogProduct, type CatalogVariant } from "../lib/dealerApi";
import { productPath, templateIdFromSlug } from "../lib/slug";
import { ApiError } from "../lib/transport";
import { useMe } from "../DealerShell";
import { btnOutline, btnPrimary, EmptyState, ErrorState, inputClass, money, ProductThumb, Skeleton, Spinner, useApi } from "../ui";

export const taxNote = (basis: "exclusive" | "inclusive" | null) => (basis === "inclusive" ? "incl. tax" : "excl. tax");

const REASONS: Record<string, string> = {
  no_price: "Pricing pending — not orderable yet",
  unavailable: "Currently unavailable",
  out_of_stock: "Out of stock",
  not_orderable: "Not orderable right now",
};

export function Catalog() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const categoryId = Number(params.get("category")) || undefined;
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);
  const { data, error, loading, reload } = useApi(() => dealerApi.catalog({ q: q || undefined, page, pageSize: 12, categoryId }), [q, page, categoryId]);
  const cats = useApi(() => dealerApi.categories(), []);

  const update = (next: Record<string, string | undefined>) => {
    const out = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) out.set(k, v);
      else out.delete(k);
    }
    setParams(out);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    update({ q: draft.trim() || undefined, page: undefined });
  };
  const goPage = (p: number) => {
    update({ page: String(p) });
    window.scrollTo({ top: 0 });
  };
  const categories = cats.data?.categories ?? [];
  const activeCategory = categories.find((c) => c.id === categoryId);

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">My catalogue</h1>
          <p className="text-[13.5px] text-steel-500" aria-live="polite">{data ? `${data.total} product${data.total === 1 ? "" : "s"}${activeCategory ? ` in ${activeCategory.name}` : ""}${q ? ` matching “${q}”` : ""}` : "Loading…"}</p>
        </div>
        <form onSubmit={submit} role="search" className="flex gap-2 w-full sm:w-auto">
          <label htmlFor="cat-q" className="sr-only">Search products or SKU</label>
          <input id="cat-q" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search products or SKU" className={`${inputClass} sm:w-72`} />
          <button type="submit" className={btnOutline} aria-label="Search"><Search className="w-4 h-4" /></button>
        </form>
      </div>

      {categories.length > 1 && (
        <nav aria-label="Categories" className="flex flex-wrap gap-2 mb-5">
          <button type="button" aria-pressed={!categoryId} onClick={() => update({ category: undefined, page: undefined })} className={`px-3.5 h-9 rounded-full text-[13px] border ${!categoryId ? "bg-ink text-white border-ink" : "bg-white border-line hover:bg-steel-50"}`}>All</button>
          {categories.map((c) => (
            <button key={c.id} type="button" aria-pressed={c.id === categoryId} onClick={() => update({ category: String(c.id), page: undefined })} className={`px-3.5 h-9 rounded-full text-[13px] border ${c.id === categoryId ? "bg-ink text-white border-ink" : "bg-white border-line hover:bg-steel-50"}`}>
              {c.name} <span className="opacity-60">({c.count})</span>
            </button>
          ))}
        </nav>
      )}

      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !error && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" role="status" aria-label="Loading products">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      )}
      {!loading && !error && data && data.items.length === 0 && (
        q || categoryId ? (
          <EmptyState title="No results" action={<button type="button" className={btnOutline} onClick={() => update({ q: undefined, category: undefined, page: undefined })}>Clear filters</button>}>Nothing in your catalogue matches{q ? ` “${q}”` : " that category"}.</EmptyState>
        ) : (
          <EmptyState title="No products assigned yet">Delite hasn't opened any products for your account yet. Please contact your representative.</EmptyState>
        )
      )}
      {!loading && !error && data && data.items.length > 0 && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data.items.map((p) => <ProductCard key={p.templateId} product={p} />)}
          </div>
          {data.totalPages > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-between mt-6 text-[13px]">
              <span className="text-steel-500">Page {data.page} of {data.totalPages}</span>
              <div className="flex gap-2">
                <button type="button" className={btnOutline} disabled={data.page <= 1} onClick={() => goPage(data.page - 1)}>Previous</button>
                <button type="button" className={btnOutline} disabled={data.page >= data.totalPages} onClick={() => goPage(data.page + 1)}>Next</button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function ProductCard({ product }: { product: CatalogProduct }) {
  const orderable = product.variants.some((v) => v.orderable);
  const basis = product.variants.find((v) => v.pricePaise !== null)?.taxBasis ?? null;
  const hasTiers = product.variants.some((v) => v.tiers.length > 1);
  const reason = product.variants.find((v) => !v.orderable)?.unavailableReason;
  return (
    <Link to={productPath(product)} className="card-surface rounded-lg p-4 flex flex-col gap-3 hover:shadow-lift transition-shadow">
      <ProductThumb url={product.imageUrl} name={product.name} className="w-full h-36" />
      <div>
        <div className="text-[14px] font-medium leading-snug line-clamp-2">{product.name}</div>
        <div className="text-[12px] text-steel-500 mt-0.5">{product.sku ? `SKU ${product.sku}` : product.categories[0]}{product.variants.length > 1 ? ` · ${product.variants.length} variants` : ""}</div>
      </div>
      <div className="mt-auto">
        {product.fromPricePaise !== null ? (
          <div className="price font-semibold text-[16px]">
            {product.variants.length > 1 ? <span className="text-[12px] font-normal text-steel-500">From </span> : null}
            {money(product.fromPricePaise)} <span className="font-sans text-[11.5px] font-normal text-steel-500">{taxNote(basis)}</span>
          </div>
        ) : (
          <div className="text-[12.5px] text-steel-500">{REASONS.no_price}</div>
        )}
        {hasTiers && <div className="text-[12px] text-emerald-700 mt-1">Volume pricing available</div>}
        {!orderable && product.fromPricePaise !== null && <div className="text-[12px] text-amber-700 mt-1">{REASONS[reason ?? "unavailable"]}</div>}
      </div>
    </Link>
  );
}

export function ProductDetail() {
  const { slug } = useParams();
  const id = templateIdFromSlug(slug);
  const { data, error, loading, reload } = useApi(() => (id ? dealerApi.product(id) : Promise.reject(new ApiError("NOT_FOUND", "Product not found"))), [id]);

  return (
    <div className="max-w-4xl">
      <Link to="/catalog" className="inline-flex items-center gap-1 text-[13px] text-steel-700 hover:underline mb-4"><ArrowLeft className="w-4 h-4" aria-hidden /> Back to catalogue</Link>
      {loading && <Skeleton className="h-80" />}
      {error && (error.code === "NOT_FOUND" ? <EmptyState title="Product not found" action={<Link to="/catalog" className={btnPrimary}>Back to catalogue</Link>}>This product doesn't exist or isn't part of your catalogue.</EmptyState> : <ErrorState error={error} onRetry={reload} />)}
      {data && (
        <div className="grid md:grid-cols-5 gap-8">
          <div className="md:col-span-2"><ProductThumb url={data.product.imageUrl} name={data.product.name} className="w-full h-72" /></div>
          <div className="md:col-span-3">
            <h1 className="text-2xl font-semibold mb-1">{data.product.name}</h1>
            <p className="text-[12.5px] text-steel-500 mb-4">{[data.product.sku && `SKU ${data.product.sku}`, ...data.product.categories].filter(Boolean).join(" · ")}</p>
            {data.product.description && <p className="text-[14px] text-steel-700 mb-5">{data.product.description}</p>}
            <div className="space-y-3">
              {data.product.variants.map((v) => <VariantRow key={v.variantId} variant={v} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function priceAtQty(variant: CatalogVariant, qty: number): number | null {
  let price = variant.pricePaise;
  for (const t of variant.tiers) if (qty >= t.minQty) price = t.pricePaise;
  return price;
}

function VariantRow({ variant }: { variant: CatalogVariant }) {
  const { setCartLines } = useMe();
  const navigate = useNavigate();
  const [qty, setQty] = useState(variant.minQty);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const step = variant.qtyMultiple;
  const unit = priceAtQty(variant, qty);

  const add = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { quote } = await dealerApi.cart();
      const existing = quote.lines.find((l) => l.variantId === variant.variantId)?.quantity ?? 0;
      const res = await dealerApi.setItem(variant.variantId, existing + qty);
      setCartLines(res.quote.lines.length);
      setMsg({ ok: true, text: `Added — ${existing + qty} in your cart` });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Couldn't add to cart" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-surface rounded-lg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[14px] font-medium">{variant.attributes.length ? variant.attributes.map((a) => `${a.attribute}: ${a.value}`).join(", ") : "Standard"}</div>
          <div className="text-[12px] text-steel-500">{variant.sku ? `SKU ${variant.sku}` : null}{variant.minQty > 1 || step > 1 ? ` · min ${variant.minQty}${step > 1 ? `, in packs of ${step}` : ""}` : ""}</div>
        </div>
        <div className="text-right">
          {unit !== null ? (
            <>
              <div className="price font-semibold text-[18px]">{money(unit)}</div>
              <div className="text-[11.5px] text-steel-500">{taxNote(variant.taxBasis)} · your agreed price{variant.tiers.length > 1 ? ` at ${qty}+` : ""}</div>
              {variant.publicPricePaise !== null && <div className="text-[11.5px] text-steel-500">Reference: <s>{money(variant.publicPricePaise)}</s></div>}
            </>
          ) : (
            <div className="text-[12.5px] text-steel-500">Price not set</div>
          )}
        </div>
      </div>
      {variant.tiers.length > 1 && (
        <table className="mt-3 text-[12.5px] w-full max-w-xs">
          <caption className="sr-only">Volume pricing</caption>
          <thead><tr className="text-left text-steel-500"><th className="font-medium pr-4">Quantity</th><th className="font-medium">Price each</th></tr></thead>
          <tbody>
            {variant.tiers.map((t, i) => (
              <tr key={t.minQty} className={priceAtQty(variant, qty) === t.pricePaise ? "font-semibold" : ""}>
                <td className="pr-4">{t.minQty}{variant.tiers[i + 1] ? `–${variant.tiers[i + 1].minQty - 1}` : "+"}</td>
                <td className="price">{money(t.pricePaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {variant.orderable ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center border border-line rounded-md" role="group" aria-label="Quantity">
            <button type="button" className="w-9 h-10 grid place-items-center disabled:opacity-40" aria-label="Decrease quantity" disabled={qty - step < variant.minQty} onClick={() => setQty((q) => q - step)}><Minus className="w-4 h-4" /></button>
            <span className="w-14 text-center text-[14px] font-medium tabular-nums" aria-live="polite">{qty}</span>
            <button type="button" className="w-9 h-10 grid place-items-center" aria-label="Increase quantity" onClick={() => setQty((q) => q + step)}><Plus className="w-4 h-4" /></button>
          </div>
          <button type="button" onClick={add} disabled={busy} className={btnPrimary}>{busy ? <Spinner /> : null} Add to cart</button>
          {msg?.ok && <button type="button" onClick={() => navigate("/cart")} className="text-[13px] underline inline-flex items-center gap-1"><Check className="w-4 h-4" aria-hidden /> View cart</button>}
        </div>
      ) : (
        <p className="mt-3 text-[12.5px] text-amber-700">{REASONS[variant.unavailableReason ?? "unavailable"]}</p>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-[12.5px] ${msg.ok ? "text-emerald-700" : "text-sale"}`}>{msg.text}</p>}
    </div>
  );
}
