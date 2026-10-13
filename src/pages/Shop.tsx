import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, LayoutGrid, List, PackageSearch, Search, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import type { Category, Product } from "../data/types";
import { catalogService, type PagedProductQuery, type PagedProductResult, type ProductSort } from "../services/catalog/catalogService";
import { brands as mockBrands } from "../data/brands";
import { ProductCard } from "../components/product/ProductCard";
import { TrustBadgesRow } from "../components/home/TrustBadgesRow";
import { useCart } from "../context/CartContext";
import { useLang } from "../i18n/LanguageContext";
import { SeoHead } from "../components/SeoHead";
import clsx from "clsx";
import { track } from "../lib/analytics/client";

const MAX_PRICE = 70000;
const PAGE_SIZE = 9;

// Real Odoo data via Supabase — category/brand filters are real category ids, not the static
// mock slug sets. See Documentations MD/odoo-real-catalog.md.
const IS_REAL_CATALOG = import.meta.env.VITE_CATALOG_SOURCE === "supabase";

const EMPTY_CATEGORIES: Category[] = [];

/**
 * A collapsible filter group — "Category type" / "Brands" / "Model name" / "Availability" /
 * "Price" / "Colors" in the Figma sidebar all render this way, each collapsed by default.
 */
function FilterSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line py-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between text-left">
        <span className="text-[13.5px] font-semibold">{title}</span>
        <ChevronDown className={clsx("w-4 h-4 text-steel-500 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function useCategories() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    catalogService.getCategories().then((c) => {
      if (!cancelled) setCategories(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return categories;
}

/**
 * Real, server-side paginated/filtered fetch — filter-in-Odoo-domain-then-paginate (see
 * Documentations MD/odoo-real-catalog.md). `page 1` replaces the accumulated mobile list; a later
 * page appends to it (Load More), tracked via `lastAppendedPageRef` so a re-render/retry of the
 * SAME page never double-appends.
 */
function useCatalogPage(query: PagedProductQuery) {
  const [result, setResult] = useState<PagedProductResult | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [accumulated, setAccumulated] = useState<Product[]>([]);
  const lastAppendedPageRef = useRef(0);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    catalogService
      .getProductsPage(query)
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        setStatus("ready");
        if (r.page === 1) {
          setAccumulated(r.items);
          lastAppendedPageRef.current = 1;
        } else if (r.page > lastAppendedPageRef.current) {
          setAccumulated((prev) => [...prev, ...r.items]);
          lastAppendedPageRef.current = r.page;
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(query), reloadToken]);

  return { result, status, accumulated, retry: () => setReloadToken((n) => n + 1) };
}

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const { wishlist } = useCart();
  const { t, dict } = useLang();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [brandQuery, setBrandQuery] = useState("");
  const categoriesRaw = useCategories();
  const categories = categoriesRaw ?? EMPTY_CATEGORIES;

  const category = params.get("category") ?? "";
  const vehicleParam = params.get("vehicle") ?? "";
  const vehicle = vehicleParam === "car" || vehicleParam === "bike" ? vehicleParam : "";
  const brand = params.get("brand") ?? "";
  const model = params.get("model") ?? "";
  const fitment = params.get("fitment") ?? "";
  const tag = params.get("tag") ?? "";
  const q = params.get("q") ?? "";
  const onlyWishlist = params.get("wishlist") === "1";
  const availabilityParam = params.get("availability") ?? ""; // "in" | "out" | ""
  const color = params.get("color") ?? "";
  const sort = (params.get("sort") as ProductSort) ?? "relevance";
  const maxPrice = Number(params.get("max") ?? MAX_PRICE);
  const minPrice = Number(params.get("min") ?? 0);
  const onlySale = params.get("sale") === "1";
  const view: "grid" | "list" = params.get("view") === "list" ? "list" : "grid";

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(1);
  };

  // Category-type list vs. brand list: real Odoo data sources both from the one flat
  // product.public.category list via its verified `role` (see _shared/odoo/catalog.ts); the mock
  // catalog keeps its existing separate categories.ts / brands.ts, which predate that model.
  const categoryOptions = IS_REAL_CATALOG ? categories.filter((c) => c.role === "other") : categories;
  const brandCategoryOptions = IS_REAL_CATALOG ? categories.filter((c) => c.role === "brand") : [];

  const query: PagedProductQuery = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      q: q || model || undefined,
      sort,
      vehicle: vehicle || undefined,
      categoryId: IS_REAL_CATALOG && category ? Number(category) : undefined,
      brandCategoryId: IS_REAL_CATALOG && brand ? Number(brand) : undefined,
      fitmentValueId: IS_REAL_CATALOG && fitment ? Number(fitment) : undefined,
      // Mock-catalog-only convenience filters — ignored by the real (Supabase) service.
      categorySlug: !IS_REAL_CATALOG && category ? category : undefined,
      brandSlug: !IS_REAL_CATALOG && brand ? brand : undefined,
      tag: !IS_REAL_CATALOG && tag ? tag : undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, q, model, sort, vehicle, category, brand, fitment, tag]
  );

  useEffect(() => setPage(1), [q, model, sort, vehicle, category, brand, fitment, tag]);

  const { result, status, accumulated, retry } = useCatalogPage(query);
  // Search analytics: recorded once per distinct query per visit, when results have loaded (so the
  // result count is real). Clicking a result records the time from search to click.
  const searchState = useRef({ q: "", at: 0 });
  useEffect(() => {
    if (!q.trim() || status !== "ready" || !result || result.page !== 1) return;
    const normalized = q.trim().replace(/\s+/g, " ").slice(0, 120);
    if (searchState.current.q === normalized) return;
    searchState.current = { q: normalized, at: Date.now() };
    track("search_submitted", { search_query: normalized, result_count: result.total });
    if (result.total === 0) track("search_zero_results", { search_query: normalized });
  }, [q, result, status]);
  const trackSearchClick = (p: Product) => {
    const current = searchState.current;
    if (!current.q || typeof p.odooId !== "number") return;
    track("search_result_click", { search_query: current.q, odoo_template_id: p.odooId, duration_ms: Date.now() - current.at });
  };

  const swatches = useMemo(() => {
    const set = new Set<string>();
    accumulated.forEach((p) => p.colors?.forEach((c) => set.add(c)));
    return Array.from(set).slice(0, 12);
  }, [accumulated]);

  // Price/colour/availability/wishlist have no verified Odoo domain in this phase (see
  // Documentations MD/odoo-real-catalog.md, "Known follow-ups") — applied as an honest
  // client-side refinement on top of whichever page(s) are already loaded, rather than a
  // fabricated server-wide filter. The visible count reflects this refined set, not the raw
  // server total, whenever one of these is active.
  const clientFilterActive = maxPrice < MAX_PRICE || minPrice > 0 || onlySale || onlyWishlist || !!availabilityParam || !!color;
  function applyClientFilters(list: Product[]): Product[] {
    let out = list.filter((p) => p.price <= maxPrice && p.price >= minPrice);
    if (onlySale) out = out.filter((p) => p.mrp != null && p.mrp > p.price);
    if (onlyWishlist) out = out.filter((p) => wishlist.includes(p.id));
    if (availabilityParam === "in") out = out.filter((p) => p.purchasable !== false);
    if (availabilityParam === "out") out = out.filter((p) => p.purchasable === false);
    if (color) out = out.filter((p) => p.colors?.includes(color));
    return out;
  }

  const desktopItems = applyClientFilters(result?.items ?? []);
  const mobileItems = applyClientFilters(accumulated);
  const total = clientFilterActive ? mobileItems.length : (result?.total ?? 0);
  const totalPages = result?.totalPages ?? 1;

  const activeCount = [
    category,
    vehicle,
    brand,
    model,
    fitment,
    tag,
    availabilityParam,
    color,
    onlyWishlist ? "w" : "",
    onlySale ? "s" : "",
    minPrice > 0 || maxPrice < MAX_PRICE ? "p" : "",
  ].filter(Boolean).length;
  // Clearing filters keeps the shopper's layout preference (view/sort) and search term.
  const clearAll = () => {
    const next = new URLSearchParams();
    if (view === "list") next.set("view", "list");
    if (sort !== "relevance") next.set("sort", sort);
    if (q) next.set("q", q);
    setParams(next, { replace: true });
    setPage(1);
  };

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    return [1, 2, 3, "…", totalPages] as const;
  }, [totalPages]);

  const categoryLabel = !IS_REAL_CATALOG && category ? dict.categories[category as keyof typeof dict.categories]?.name : null;
  const realCategoryLabel = IS_REAL_CATALOG && category ? categoryOptions.find((c) => String(c.odooId) === category)?.name : null;

  const optionBtn = (active: boolean) =>
    clsx(
      "w-full text-left text-[13.5px] px-2.5 py-1.5 rounded-lg transition-colors",
      active ? "bg-brand-50 text-brand-700 font-semibold" : "text-ink/80 hover:bg-steel-50 hover:text-brand-700"
    );

  const brandOptions = IS_REAL_CATALOG
    ? brandCategoryOptions.map((c) => ({ value: String(c.odooId), label: c.name }))
    : mockBrands.map((b) => ({ value: b.slug, label: b.name }));
  const visibleBrands = brandOptions.filter((b) => b.label.toLowerCase().includes(brandQuery.trim().toLowerCase()));

  const FiltersPanel = (
    <div>
      <FilterSection title={t("shop.vehicleType")} defaultOpen>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-steel-50">
          {[
            { value: "", label: t("shop.all") },
            { value: "car", label: t("shop.car") },
            { value: "bike", label: t("shop.bike") },
          ].map((o) => (
            <button
              key={o.value || "all"}
              type="button"
              aria-pressed={vehicle === o.value}
              onClick={() => setParam("vehicle", o.value || null)}
              className={clsx(
                "h-9 rounded-lg text-[13px] font-semibold transition-colors",
                vehicle === o.value ? "bg-white text-brand-700 shadow-card" : "text-ink/70 hover:text-ink"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </FilterSection>

      <FilterSection title={t("shop.categoryType")} defaultOpen>
        <ul className="space-y-0.5 max-h-64 overflow-y-auto pr-1">
          <li>
            <button onClick={() => setParam("category", null)} className={optionBtn(!category)}>
              {t("shop.allProductsFilter")}
            </button>
          </li>
          {categoryOptions.map((c) => {
            const value = IS_REAL_CATALOG ? String(c.odooId) : c.slug;
            const label = IS_REAL_CATALOG ? c.name : dict.categories[c.slug as keyof typeof dict.categories]?.name;
            return (
              <li key={value}>
                <button onClick={() => setParam("category", value)} className={optionBtn(category === value)}>
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </FilterSection>

      <FilterSection title={t("shop.brand")} defaultOpen>
        {brandOptions.length > 8 && (
          <div className="relative mb-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-steel-500" />
            <input
              type="search"
              value={brandQuery}
              onChange={(e) => setBrandQuery(e.target.value)}
              placeholder={t("shop.searchBrands")}
              className="w-full h-10 rounded-full border border-line bg-steel-50 pl-9 pr-3 text-[13px] focus:outline-none focus:border-brand-500"
            />
          </div>
        )}
        <ul className="space-y-0.5 max-h-56 overflow-y-auto pr-1">
          <li>
            <button onClick={() => setParam("brand", null)} className={optionBtn(!brand)}>
              {t("shop.allBrands")}
            </button>
          </li>
          {visibleBrands.map((b) => (
            <li key={b.value}>
              <button onClick={() => setParam("brand", b.value)} className={optionBtn(brand === b.value)}>
                {b.label}
              </button>
            </li>
          ))}
        </ul>
      </FilterSection>

      <FilterSection title={t("shop.priceRange")} defaultOpen>
        <div className="flex items-center gap-2">
          <label className="flex-1 min-w-0">
            <span className="sr-only">{t("shop.minPrice")}</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-steel-500">₹</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_PRICE}
                placeholder={t("shop.minPrice")}
                value={minPrice > 0 ? minPrice : ""}
                onChange={(e) => {
                  const n = Math.max(0, Math.min(Number(e.target.value) || 0, maxPrice));
                  setParam("min", n > 0 ? String(n) : null);
                }}
                className="w-full h-10 rounded-lg border border-line bg-white pl-7 pr-2 text-[13px] focus:outline-none focus:border-brand-500"
              />
            </div>
          </label>
          <span className="text-steel-300">–</span>
          <label className="flex-1 min-w-0">
            <span className="sr-only">{t("shop.maxPrice")}</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-steel-500">₹</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_PRICE}
                placeholder={t("shop.maxPrice")}
                value={maxPrice < MAX_PRICE ? maxPrice : ""}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  setParam("max", raw > 0 && raw < MAX_PRICE ? String(Math.max(raw, minPrice)) : null);
                }}
                className="w-full h-10 rounded-lg border border-line bg-white pl-7 pr-2 text-[13px] focus:outline-none focus:border-brand-500"
              />
            </div>
          </label>
        </div>
        <input
          type="range"
          aria-label={t("shop.priceUpTo")}
          min={200}
          max={MAX_PRICE}
          step={200}
          value={maxPrice}
          onChange={(e) => setParam("max", Number(e.target.value) >= MAX_PRICE ? null : e.target.value)}
          className="w-full accent-brand-500 mt-4"
        />
        <div className="flex justify-between text-[12px] text-steel-500 font-mono">
          <span>₹200</span>
          <span>₹{MAX_PRICE.toLocaleString("en-IN")}</span>
        </div>
      </FilterSection>

      <FilterSection title={t("shop.availability")} defaultOpen>
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2.5 text-[13.5px] cursor-pointer px-2.5 py-1.5 rounded-lg hover:bg-steel-50">
            <input type="checkbox" className="accent-brand-500 w-4 h-4" checked={availabilityParam === "in"} onChange={(e) => setParam("availability", e.target.checked ? "in" : null)} />
            {t("shop.inStock")}
          </label>
          <label className="flex items-center gap-2.5 text-[13.5px] cursor-pointer px-2.5 py-1.5 rounded-lg hover:bg-steel-50">
            <input type="checkbox" className="accent-brand-500 w-4 h-4" checked={availabilityParam === "out"} onChange={(e) => setParam("availability", e.target.checked ? "out" : null)} />
            {t("shop.outOfStock")}
          </label>
          <label className="flex items-center gap-2.5 text-[13.5px] cursor-pointer px-2.5 py-1.5 rounded-lg hover:bg-steel-50">
            <input type="checkbox" className="accent-brand-500 w-4 h-4" checked={onlySale} onChange={(e) => setParam("sale", e.target.checked ? "1" : null)} />
            {t("shop.onSale")}
          </label>
        </div>
      </FilterSection>

      <FilterSection title={t("shop.modelName")}>
        <input
          type="text"
          value={model}
          onChange={(e) => setParam("model", e.target.value || null)}
          placeholder={t("shop.modelNamePlaceholder")}
          className="w-full h-10 rounded-lg border border-line px-3 text-[13px] bg-white focus:outline-none focus:border-brand-500"
        />
      </FilterSection>

      {/* Real Odoo products have no reliable colour data (see Documentations MD/odoo-real-catalog.md) —
          explicitly hidden in real-catalog mode rather than relying on incidental emptiness, so it
          can never inconsistently appear for the rare manually-backfilled product (#54). */}
      {!IS_REAL_CATALOG && swatches.length > 0 && (
        <FilterSection title={t("shop.colorsLabel")}>
          <div className="flex flex-wrap gap-2">
            {swatches.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setParam("color", color === c ? null : c)}
                className={clsx("w-7 h-7 rounded-full border-2 transition-transform", color === c ? "border-brand-500 scale-110" : "border-line")}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </FilterSection>
      )}

      {activeCount > 0 && (
        <button onClick={clearAll} className="btn-pill-outline !px-4 !py-2 mt-4 text-[12.5px]">
          <X className="w-3.5 h-3.5" /> {t("shop.clearAll")}
        </button>
      )}
    </div>
  );

  // Removable chips for every active filter — the "applied filters" bar under the toolbar.
  const brandLabel = brand ? (brandOptions.find((b) => b.value === brand)?.label ?? brand) : "";
  const fmtINR = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (vehicle) chips.push({ key: "vehicle", label: vehicle === "car" ? t("shop.car") : t("shop.bike"), onRemove: () => setParam("vehicle", null) });
  if (category) chips.push({ key: "category", label: categoryLabel ?? realCategoryLabel ?? category, onRemove: () => setParam("category", null) });
  if (brand) chips.push({ key: "brand", label: brandLabel, onRemove: () => setParam("brand", null) });
  if (model) chips.push({ key: "model", label: model, onRemove: () => setParam("model", null) });
  if (availabilityParam) chips.push({ key: "availability", label: availabilityParam === "in" ? t("shop.inStock") : t("shop.outOfStock"), onRemove: () => setParam("availability", null) });
  if (onlySale) chips.push({ key: "sale", label: t("shop.onSale"), onRemove: () => setParam("sale", null) });
  if (minPrice > 0 || maxPrice < MAX_PRICE) {
    const label = minPrice > 0 && maxPrice < MAX_PRICE ? `${fmtINR(minPrice)} – ${fmtINR(maxPrice)}` : minPrice > 0 ? `${fmtINR(minPrice)}+` : `≤ ${fmtINR(maxPrice)}`;
    chips.push({
      key: "price",
      label,
      onRemove: () => {
        const next = new URLSearchParams(params);
        next.delete("min");
        next.delete("max");
        setParams(next, { replace: true });
        setPage(1);
      },
    });
  }
  if (color) chips.push({ key: "color", label: color, onRemove: () => setParam("color", null) });
  if (tag) chips.push({ key: "tag", label: tag, onRemove: () => setParam("tag", null) });

  if (status === "error") {
    return (
      <div className="bg-white">
        <SeoHead routeKey="shop" />
        <div className="container-page py-24 flex flex-col items-center text-center">
          <TriangleAlert className="w-10 h-10 text-steel-300 mb-4" />
          <h1 className="font-display uppercase text-xl mb-2">{t("shop.catalogUnavailableTitle")}</h1>
          <p className="text-steel-500 text-[14px] mb-6 max-w-[40ch]">{t("shop.catalogUnavailableDesc")}</p>
          <button onClick={retry} className="btn-dark">{t("shop.retry")}</button>
        </div>
      </div>
    );
  }

  if (status === "loading" && !result) {
    return (
      <div className="bg-white">
        <SeoHead routeKey="shop" />
        <div className="container-page py-24 flex flex-col items-center text-center text-steel-500 text-[14px]">
          {t("shop.loadingCatalog")}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white">
      <SeoHead routeKey="shop" />
      <div className="container-page py-8">
        <nav className="flex items-center gap-1.5 text-[12.5px] text-steel-500 mb-6">
          <Link to="/" className="hover:text-ink">{t("shop.breadcrumbHome")}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-ink">{categoryLabel ?? realCategoryLabel ?? t("shop.shopAllTitle")}</span>
        </nav>

        <h1 className="text-center text-2xl sm:text-3xl font-display uppercase mb-6">
          {onlyWishlist ? t("shop.savedItems") : categoryLabel ?? realCategoryLabel ?? t("shop.shopAllTitle")}
        </h1>
        {q && <p className="text-center text-steel-500 text-[14px] -mt-4 mb-6">{t("shop.showingResultsFor", { query: q })}</p>}

        {/* Toolbar: filters toggle + count (left) · sort + grid/list view (right) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-white px-3 py-2.5 sm:px-4 mb-3 shadow-card">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="lg:hidden inline-flex items-center gap-1.5 h-10 px-3 sm:px-4 rounded-full border border-line bg-white text-[13px] font-semibold hover:border-brand-500 hover:text-brand-700 transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" /> {t("shop.filterToggle")}
            {activeCount > 0 && <span className="grid place-items-center min-w-5 h-5 px-1 rounded-full bg-brand-500 text-white text-[11px]">{activeCount}</span>}
          </button>
          <button
            type="button"
            aria-pressed={sidebarOpen}
            onClick={() => setSidebarOpen((o) => !o)}
            className={clsx(
              "hidden lg:inline-flex items-center gap-2 h-10 px-4 rounded-full border text-[13px] font-semibold transition-colors",
              sidebarOpen ? "border-brand-500 text-brand-700 bg-brand-50" : "border-line bg-white hover:border-brand-500 hover:text-brand-700"
            )}
          >
            <SlidersHorizontal className="w-4 h-4" /> {t("shop.filterToggle")}
            {activeCount > 0 && <span className="grid place-items-center min-w-5 h-5 px-1 rounded-full bg-brand-500 text-white text-[11px]">{activeCount}</span>}
          </button>

          <span className="order-last basis-full sm:order-none sm:basis-auto text-[13px] text-steel-500" aria-live="polite">
            {t("shop.productsCount", { count: total })}
          </span>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-3 min-w-0">
            <label className="relative inline-flex items-center min-w-0">
              <span className="hidden sm:inline text-[13px] text-steel-500 mr-2 whitespace-nowrap">{t("shop.sortByLabel")}</span>
              <select
                value={sort}
                onChange={(e) => setParam("sort", e.target.value === "relevance" ? null : e.target.value)}
                className="appearance-none h-10 max-w-[8.5rem] sm:max-w-none rounded-full border border-line bg-white pl-3 pr-8 sm:pl-4 sm:pr-9 text-[13px] font-semibold focus:outline-none focus:border-brand-500 cursor-pointer"
                aria-label={t("shop.sortByLabel")}
              >
                <option value="relevance">{t("shop.sortRelevance")}</option>
                <option value="price-asc">{t("shop.sortPriceAsc")}</option>
                <option value="price-desc">{t("shop.sortPriceDesc")}</option>
                <option value="name">{t("shop.sortName")}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 w-4 h-4 text-steel-500" />
            </label>

            <div role="group" aria-label={t("shop.viewGrid") + " / " + t("shop.viewList")} className="inline-flex p-1 rounded-full bg-steel-50 border border-line">
              {(
                [
                  { value: "grid", label: t("shop.viewGrid"), Icon: LayoutGrid },
                  { value: "list", label: t("shop.viewList"), Icon: List },
                ] as const
              ).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-label={label}
                  title={label}
                  aria-pressed={view === value}
                  onClick={() => setParam("view", value === "list" ? "list" : null)}
                  className={clsx(
                    "grid place-items-center w-8 sm:w-9 h-8 rounded-full transition-colors",
                    view === value ? "bg-white text-brand-700 shadow-card" : "text-steel-500 hover:text-ink"
                  )}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Applied-filters bar */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-5" aria-label={t("shop.activeFilters")}>
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={c.onRemove}
                aria-label={`${t("shop.removeFilter")}: ${c.label}`}
                className="inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-full bg-brand-50 text-brand-700 text-[12.5px] font-semibold hover:bg-brand-100 transition-colors"
              >
                {c.label}
                <X className="w-3.5 h-3.5" />
              </button>
            ))}
            <button type="button" onClick={clearAll} className="text-[12.5px] font-semibold text-steel-500 hover:text-ink underline underline-offset-2 ml-1">
              {t("shop.clearAll")}
            </button>
          </div>
        )}

        <div className={clsx("grid gap-8 mt-5", sidebarOpen ? "lg:grid-cols-[260px_1fr]" : "lg:grid-cols-1")}>
          {sidebarOpen && (
            <aside className="hidden lg:block lg:sticky lg:top-28 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto rounded-2xl border border-line bg-white px-4 pt-4 pb-2">
              <h2 className="font-display uppercase text-[13px] tracking-widish">{t("shop.filtersHeading")}</h2>
              {FiltersPanel}
            </aside>
          )}

          <div>
            {total === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-24 border border-dashed border-line rounded-2xl">
                <PackageSearch className="w-10 h-10 text-steel-300 mb-4" />
                <h3 className="font-display uppercase text-lg mb-1">{t("shop.noMatchTitle")}</h3>
                <p className="text-steel-500 text-[14px] mb-5">{t("shop.noMatchDesc")}</p>
                <button onClick={clearAll} className="btn-pill-dark">{t("shop.clearFilters")}</button>
              </div>
            ) : (
              <>
                {/* Desktop: true server-side pagination */}
                <div
                  className={clsx(
                    "hidden lg:grid",
                    view === "list"
                      ? clsx("gap-4", sidebarOpen ? "lg:grid-cols-1" : "lg:grid-cols-2")
                      : clsx("gap-5", sidebarOpen ? "lg:grid-cols-3" : "lg:grid-cols-4")
                  )}
                >
                  {desktopItems.map((p) => (
                    <ProductCard key={p.id} product={p} layout={view} onView={() => trackSearchClick(p)} />
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="hidden lg:flex items-center justify-center gap-2 mt-10">
                    <button
                      onClick={() => setPage((n) => Math.max(1, n - 1))}
                      disabled={page === 1}
                      className="px-3 py-2 text-[13px] font-medium disabled:opacity-40 hover:text-brand-700"
                    >
                      {t("shop.paginationPrev")}
                    </button>
                    {pageNumbers.map((n, i) =>
                      n === "…" ? (
                        <span key={`ellipsis-${i}`} className="px-2 text-steel-500">
                          …
                        </span>
                      ) : (
                        <button
                          key={n}
                          onClick={() => setPage(n as number)}
                          className={clsx(
                            "w-9 h-9 grid place-items-center rounded-full text-[13px] font-medium transition-colors",
                            page === n ? "bg-brand-500 text-white" : "hover:bg-steel-50"
                          )}
                        >
                          {n}
                        </button>
                      )
                    )}
                    <button
                      onClick={() => setPage((n) => Math.min(totalPages, n + 1))}
                      disabled={page === totalPages}
                      className="px-3 py-2 text-[13px] font-medium disabled:opacity-40 hover:text-brand-700"
                    >
                      {t("shop.paginationNext")}
                    </button>
                  </div>
                )}

                {/* Mobile + tablet: accumulated pages + Load More */}
                <div className={clsx("grid lg:hidden", view === "list" ? "grid-cols-1 gap-3 md:grid-cols-2" : "grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3")}>
                  {mobileItems.map((p) => (
                    <ProductCard key={p.id} product={p} layout={view} onView={() => trackSearchClick(p)} />
                  ))}
                </div>
                {page < totalPages && (
                  <div className="lg:hidden flex justify-center mt-8">
                    <button onClick={() => setPage((n) => n + 1)} className="btn-pill-outline">
                      {t("shop.loadMore")}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-16 pt-10 border-t border-line">
          <TrustBadgesRow />
        </div>
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-[85%] max-w-sm bg-white p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display uppercase text-lg">{t("shop.filtersHeading")}</h2>
              <button onClick={() => setMobileFiltersOpen(false)} aria-label="Close filters">
                <X className="w-5 h-5" />
              </button>
            </div>
            {FiltersPanel}
            <button onClick={() => setMobileFiltersOpen(false)} className="btn-pill-dark w-full mt-6 justify-center">
              {t("shop.showResults", { count: total })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
