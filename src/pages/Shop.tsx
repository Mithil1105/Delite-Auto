import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, PackageSearch, Search, TriangleAlert, X } from "lucide-react";
import type { Category, Product } from "../data/types";
import { catalogService, type PagedProductQuery, type PagedProductResult, type ProductSort } from "../services/catalog/catalogService";
import { brands as mockBrands } from "../data/brands";
import { ProductCard } from "../components/product/ProductCard";
import { TrustBadgesRow } from "../components/home/TrustBadgesRow";
import { buildPriceBands } from "../lib/listing/priceBands";
import { Chip, ChipGroup, FilterCard, FilterGroup, ListingToolbar, Segmented, SortSelect, ViewToggle } from "../components/listing/ListingKit";
import { sentenceCase } from "../lib/listing/format";
import { useCart } from "../context/CartContext";
import { useLang } from "../i18n/LanguageContext";
import { SeoHead } from "../components/SeoHead";
import clsx from "clsx";
import { track } from "../lib/analytics/client";
import { Reveal, staggerDelay } from "../components/motion/Reveal";
const MAX_PRICE = 70000;
const PAGE_SIZE = 9;

// Real Odoo data via Supabase — category/brand filters are real category ids, not the static
// mock slug sets. See Documentations MD/odoo-real-catalog.md.
const IS_REAL_CATALOG = import.meta.env.VITE_CATALOG_SOURCE === "supabase";

const EMPTY_CATEGORIES: Category[] = [];

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

  // "Reset all" also clears the search text (the older clearAll keeps it, for the "no results" button).
  const clearAllAndSearch = () => {
    const next = new URLSearchParams();
    if (view === "list") next.set("view", "list");
    if (sort !== "relevance") next.set("sort", sort);
    setParams(next, { replace: true });
    setPage(1);
  };

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    return [1, 2, 3, "…", totalPages] as const;
  }, [totalPages]);

  const categoryLabel = !IS_REAL_CATALOG && category ? dict.categories[category as keyof typeof dict.categories]?.name : null;
  const realCategoryLabelRaw = IS_REAL_CATALOG && category ? categoryOptions.find((c) => String(c.odooId) === category)?.name : null;
  const realCategoryLabel = realCategoryLabelRaw ? sentenceCase(realCategoryLabelRaw) : null;

  const brandOptions = IS_REAL_CATALOG
    ? brandCategoryOptions.map((c) => ({ value: String(c.odooId), label: c.name }))
    : mockBrands.map((b) => ({ value: b.slug, label: b.name }));
  const brandSearch = brandQuery.trim().toLowerCase();
  const visibleBrands = brandOptions.filter((b) => b.label.toLowerCase().includes(brandSearch));

  const priceBands = buildPriceBands(t);
  const isBandActive = (b: { min: number; max?: number }) => minPrice === b.min && (b.max === undefined ? maxPrice >= MAX_PRICE : maxPrice === b.max);
  const setPriceBand = (b: { min: number; max?: number }) => {
    const next = new URLSearchParams(params);
    if (b.min > 0) next.set("min", String(b.min));
    else next.delete("min");
    if (b.max !== undefined) next.set("max", String(b.max));
    else next.delete("max");
    setParams(next, { replace: true });
    setPage(1);
  };
  const smallInput = "w-full h-10 rounded-lg border border-line bg-white pl-7 pr-2 text-[13px] focus:outline-none focus:border-ink";

  const FiltersPanel = (
    <>
      <FilterGroup title={t("shop.vehicleType")}>
        <Segmented
          label={t("shop.vehicleType")}
          value={vehicle}
          onChange={(v) => setParam("vehicle", v || null)}
          options={[
            { value: "", label: t("shop.all") },
            { value: "car", label: t("shop.car") },
            { value: "bike", label: t("shop.bike") },
          ]}
        />
      </FilterGroup>

      <FilterGroup title={t("shop.categoryType")}>
        <ChipGroup
          allLabel={t("shop.all")}
          selected={category}
          onSelect={(v) => setParam("category", v || null)}
          items={categoryOptions.map((c) => ({
            value: IS_REAL_CATALOG ? String(c.odooId) : c.slug,
            label: IS_REAL_CATALOG ? sentenceCase(c.name) : (dict.categories[c.slug as keyof typeof dict.categories]?.name ?? c.slug),
          }))}
          limit={9}
          showMoreLabel={t("shop.showMore")}
          showLessLabel={t("shop.showLess")}
        />
      </FilterGroup>

      <FilterGroup title={t("shop.availability")}>
        <Segmented
          label={t("shop.availability")}
          value={availabilityParam}
          onChange={(v) => setParam("availability", v === availabilityParam ? null : v)}
          options={[
            { value: "in", label: t("shop.inStock") },
            { value: "out", label: t("shop.outOfStock") },
          ]}
        />
        <div className="mt-3">
          <Chip selected={onlySale} onClick={() => setParam("sale", onlySale ? null : "1")}>
            {t("shop.onSale")}
          </Chip>
        </div>
      </FilterGroup>

      <FilterGroup title={t("shop.brand")}>
        {brandOptions.length > 12 && (
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-steel-500" />
            <input
              type="search"
              value={brandQuery}
              onChange={(e) => setBrandQuery(e.target.value)}
              placeholder={t("shop.searchBrands")}
              className="w-full h-10 rounded-lg border border-line bg-white pl-9 pr-3 text-[13px] focus:outline-none focus:border-ink"
            />
          </div>
        )}
        <ChipGroup
          allLabel={t("shop.allBrands")}
          selected={brand}
          onSelect={(v) => setParam("brand", v || null)}
          items={visibleBrands}
          limit={brandSearch ? visibleBrands.length : 12}
          showMoreLabel={t("shop.showMore")}
          showLessLabel={t("shop.showLess")}
        />
      </FilterGroup>

      <FilterGroup title={t("shop.priceRange")}>
        <div className="flex flex-wrap gap-2">
          {priceBands.map((b) => (
            <Chip key={b.key} selected={isBandActive(b)} onClick={() => setPriceBand(b)}>
              {b.label}
            </Chip>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
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
                className={smallInput}
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
                className={smallInput}
              />
            </div>
          </label>
        </div>
      </FilterGroup>

      <FilterGroup title={t("shop.modelName")}>
        <input
          type="text"
          value={model}
          onChange={(e) => setParam("model", e.target.value || null)}
          placeholder={t("shop.modelNamePlaceholder")}
          className="w-full h-10 rounded-lg border border-line px-3 text-[13px] bg-white focus:outline-none focus:border-ink"
        />
      </FilterGroup>

      {/* Real Odoo products have no reliable colour data (see Documentations MD/odoo-real-catalog.md) —
          explicitly hidden in real-catalog mode rather than relying on incidental emptiness, so it
          can never inconsistently appear for the rare manually-backfilled product (#54). */}
      {!IS_REAL_CATALOG && swatches.length > 0 && (
        <FilterGroup title={t("shop.colorsLabel")}>
          <div className="flex flex-wrap gap-2">
            {swatches.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setParam("color", color === c ? null : c)}
                className={clsx("w-7 h-7 rounded-full border-2 transition-transform", color === c ? "border-ink scale-110" : "border-line")}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </FilterGroup>
      )}
    </>
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
        <nav className="flex items-center gap-1.5 text-[12.5px] text-steel-500 mb-4">
          <Link to="/" className="hover:text-ink">{t("shop.breadcrumbHome")}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-ink">{categoryLabel ?? realCategoryLabel ?? t("shop.shopAllTitle")}</span>
        </nav>

        <div className={clsx("mt-1 grid gap-6", sidebarOpen ? "lg:grid-cols-[280px_1fr] lg:items-start" : "lg:grid-cols-1")}>
          {sidebarOpen && (
            <aside className="hidden lg:block lg:sticky lg:top-[calc(var(--header-height,110px)+16px)] lg:max-h-[calc(100dvh-var(--header-height,110px)-32px)] lg:overflow-y-auto lg:rounded-2xl">
              <FilterCard
                title={t("shop.filtersHeading")}
                resetLabel={t("shop.resetAll")}
                onReset={activeCount > 0 || q ? clearAllAndSearch : undefined}
                closeLabel={t("shop.hideFilters")}
                onClose={() => setSidebarOpen(false)}
              >
                {FiltersPanel}
              </FilterCard>
            </aside>
          )}

          <div className="min-w-0">
            <ListingToolbar
              title={
                <h1 className="heading text-2xl sm:text-3xl leading-tight">
                  {onlyWishlist ? t("shop.savedItems") : categoryLabel ?? realCategoryLabel ?? t("shop.shopAllTitle")}
                </h1>
              }
              subtitle={
                <p className="mt-1 text-[13px] text-steel-500" aria-live="polite">
                  {t("shop.productsCount", { count: total })}
                  {q && <> · {t("shop.showingResultsFor", { query: q })}</>}
                </p>
              }
              filtersLabel={t("shop.filterToggle")}
              activeCount={activeCount}
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen((o) => !o)}
              onOpenDrawer={() => setMobileFiltersOpen(true)}
              sortSlot={
                <SortSelect
                  className="w-full sm:w-auto"
                  label={t("shop.sortByLabel")}
                  value={sort}
                  onChange={(v) => setParam("sort", v === "relevance" ? null : v)}
                  options={[
                    { value: "relevance", label: t("shop.sortRelevance") },
                    { value: "price-asc", label: t("shop.sortPriceAsc") },
                    { value: "price-desc", label: t("shop.sortPriceDesc") },
                    { value: "name", label: t("shop.sortName") },
                  ]}
                />
              }
              viewSlot={<ViewToggle value={view} onChange={(v) => setParam("view", v === "list" ? "list" : null)} gridLabel={t("shop.viewGrid")} listLabel={t("shop.viewList")} />}
            />

            {/* Applied filters */}
            {chips.length > 0 && (
              <div className="mb-5 flex flex-wrap items-center gap-2" aria-label={t("shop.activeFilters")}>
                {chips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={c.onRemove}
                    aria-label={`${t("shop.removeFilter")}: ${c.label}`}
                    className="inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-full bg-steel-100 text-ink text-[12.5px] font-medium hover:bg-steel-200 transition-colors"
                  >
                    {c.label}
                    <X className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            )}

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
                    view === "list" ? "gap-4 lg:grid-cols-1" : sidebarOpen ? "gap-5 lg:grid-cols-3" : "gap-5 lg:grid-cols-4"
                  )}
                >
                  {desktopItems.map((p, i) => (
                    <Reveal key={p.id} delay={staggerDelay(i)} className="h-full">
                      <ProductCard product={p} layout={view} className="h-full" onView={() => trackSearchClick(p)} />
                    </Reveal>
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
                            page === n ? "bg-ink text-white" : "hover:bg-steel-100"
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
                  {mobileItems.map((p, i) => (
                    <Reveal key={p.id} delay={staggerDelay(i, 55, 3)} className="h-full">
                      <ProductCard product={p} layout={view} className="h-full" onView={() => trackSearchClick(p)} />
                    </Reveal>
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
            <div className="divide-y divide-line rounded-2xl border border-line">{FiltersPanel}</div>
            {(activeCount > 0 || q) && (
              <button type="button" onClick={clearAllAndSearch} className="mt-4 text-[13px] font-medium underline underline-offset-2 hover:text-brand-700">
                {t("shop.resetAll")}
              </button>
            )}
            <button onClick={() => setMobileFiltersOpen(false)} className="btn-pill-dark w-full mt-6 justify-center">
              {t("shop.showResults", { count: total })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
