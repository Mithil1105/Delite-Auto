import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, PackageSearch, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import type { Category, Product } from "../data/types";
import { catalogService, type PagedProductQuery, type PagedProductResult, type ProductSort } from "../services/catalog/catalogService";
import { brands as mockBrands } from "../data/brands";
import { ProductCard } from "../components/product/ProductCard";
import { TrustBadgesRow } from "../components/home/TrustBadgesRow";
import { useCart } from "../context/CartContext";
import { useLang } from "../i18n/LanguageContext";
import clsx from "clsx";

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
  const clientFilterActive = maxPrice < MAX_PRICE || onlyWishlist || !!availabilityParam || !!color;
  function applyClientFilters(list: Product[]): Product[] {
    let out = list.filter((p) => p.price <= maxPrice);
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

  const activeCount = [category, vehicle, brand, model, fitment, tag, availabilityParam, color, onlyWishlist ? "w" : ""].filter(Boolean).length;
  const clearAll = () => {
    setParams({}, { replace: true });
    setPage(1);
  };

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    return [1, 2, 3, "…", totalPages] as const;
  }, [totalPages]);

  const categoryLabel = !IS_REAL_CATALOG && category ? dict.categories[category as keyof typeof dict.categories]?.name : null;
  const realCategoryLabel = IS_REAL_CATALOG && category ? categoryOptions.find((c) => String(c.odooId) === category)?.name : null;

  const FiltersPanel = (
    <div>
      <FilterSection title={t("shop.categoryType")} defaultOpen>
        <ul className="space-y-2">
          <li>
            <button
              onClick={() => setParam("category", null)}
              className={clsx("text-[13.5px] hover:text-brand-700 transition-colors", !category ? "text-brand-700 font-semibold" : "text-ink/80")}
            >
              {t("shop.allProductsFilter")}
            </button>
          </li>
          {categoryOptions.map((c) => {
            const value = IS_REAL_CATALOG ? String(c.odooId) : c.slug;
            const label = IS_REAL_CATALOG ? c.name : dict.categories[c.slug as keyof typeof dict.categories]?.name;
            return (
              <li key={value}>
                <button
                  onClick={() => setParam("category", value)}
                  className={clsx("text-[13.5px] hover:text-brand-700 transition-colors", category === value ? "text-brand-700 font-semibold" : "text-ink/80")}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </FilterSection>

      <FilterSection title={t("shop.brand")}>
        <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
          <li>
            <button
              onClick={() => setParam("brand", null)}
              className={clsx("text-[13.5px] hover:text-brand-700 transition-colors", !brand ? "text-brand-700 font-semibold" : "text-ink/80")}
            >
              {t("shop.allBrands")}
            </button>
          </li>
          {(IS_REAL_CATALOG ? brandCategoryOptions : []).map((c) => (
            <li key={c.odooId}>
              <button
                onClick={() => setParam("brand", String(c.odooId))}
                className={clsx("text-[13.5px] hover:text-brand-700 transition-colors", brand === String(c.odooId) ? "text-brand-700 font-semibold" : "text-ink/80")}
              >
                {c.name}
              </button>
            </li>
          ))}
          {!IS_REAL_CATALOG &&
            mockBrands.map((b) => (
              <li key={b.slug}>
                <button
                  onClick={() => setParam("brand", b.slug)}
                  className={clsx("text-[13.5px] hover:text-brand-700 transition-colors", brand === b.slug ? "text-brand-700 font-semibold" : "text-ink/80")}
                >
                  {b.name}
                </button>
              </li>
            ))}
        </ul>
      </FilterSection>

      <FilterSection title={t("shop.modelName")}>
        <input
          type="text"
          value={model}
          onChange={(e) => setParam("model", e.target.value || null)}
          placeholder={t("shop.modelNamePlaceholder")}
          className="w-full h-10 border border-line px-3 text-[13px] bg-white focus:outline-none focus:border-brand-500"
        />
      </FilterSection>

      <FilterSection title={t("shop.availability")}>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[13.5px] cursor-pointer">
            <input type="checkbox" checked={availabilityParam === "in"} onChange={(e) => setParam("availability", e.target.checked ? "in" : null)} />
            {t("shop.inStock")}
          </label>
          <label className="flex items-center gap-2 text-[13.5px] cursor-pointer">
            <input type="checkbox" checked={availabilityParam === "out"} onChange={(e) => setParam("availability", e.target.checked ? "out" : null)} />
            {t("shop.outOfStock")}
          </label>
        </div>
      </FilterSection>

      <FilterSection title={t("shop.priceUpTo")}>
        <input
          type="range"
          min={200}
          max={MAX_PRICE}
          step={200}
          value={maxPrice}
          onChange={(e) => setParam("max", e.target.value)}
          className="w-full accent-brand-500"
        />
        <div className="flex justify-between text-[12.5px] text-steel-500 mt-1 font-mono">
          <span>₹200</span>
          <span>₹{maxPrice.toLocaleString("en-IN")}</span>
        </div>
      </FilterSection>

      {swatches.length > 0 && (
        <FilterSection title={t("shop.colorsLabel")}>
          <div className="flex flex-wrap gap-2">
            {swatches.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setParam("color", color === c ? null : c)}
                className={clsx("w-6 h-6 rounded-full border-2 transition-transform", color === c ? "border-brand-500 scale-110" : "border-line")}
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

  if (status === "error") {
    return (
      <div className="bg-white">
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
        <div className="container-page py-24 flex flex-col items-center text-center text-steel-500 text-[14px]">
          {t("shop.loadingCatalog")}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white">
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

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <span className="text-[13.5px] text-steel-500">{t("shop.productsCount", { count: total })}</span>

          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="lg:hidden inline-flex items-center gap-2 btn-pill-outline !px-4 !py-2 ml-auto"
          >
            <SlidersHorizontal className="w-4 h-4" /> {t("shop.filterToggle")} {activeCount > 0 && `(${activeCount})`}
          </button>

          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="hidden lg:inline-flex items-center gap-2 btn-pill-outline !px-4 !py-2 ml-auto"
          >
            <SlidersHorizontal className="w-4 h-4" /> {t("shop.filterToggle")} {activeCount > 0 && `(${activeCount})`}
          </button>

          <select
            value={sort}
            onChange={(e) => setParam("sort", e.target.value)}
            className="h-10 border border-line px-3 text-[13px] bg-white focus:outline-none focus:border-brand-500"
            aria-label={t("shop.sortByLabel")}
          >
            <option value="relevance">{t("shop.sortByLabel")}: {t("shop.sortRelevance")}</option>
            <option value="price-asc">{t("shop.sortPriceAsc")}</option>
            <option value="price-desc">{t("shop.sortPriceDesc")}</option>
            <option value="name">{t("shop.sortName")}</option>
          </select>
        </div>

        <div className={clsx("grid gap-10", sidebarOpen ? "lg:grid-cols-[220px_1fr]" : "lg:grid-cols-1")}>
          {sidebarOpen && (
            <aside className="hidden lg:block">
              <h2 className="font-display uppercase text-[13px] tracking-widish mb-1">{t("shop.filtersHeading")}</h2>
              {FiltersPanel}
            </aside>
          )}

          <div>
            {total === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-24 border border-dashed border-line">
                <PackageSearch className="w-10 h-10 text-steel-300 mb-4" />
                <h3 className="font-display uppercase text-lg mb-1">{t("shop.noMatchTitle")}</h3>
                <p className="text-steel-500 text-[14px] mb-5">{t("shop.noMatchDesc")}</p>
                <button onClick={clearAll} className="btn-pill-dark">{t("shop.clearFilters")}</button>
              </div>
            ) : (
              <>
                {/* Desktop: true server-side pagination */}
                <div className={clsx("hidden lg:grid gap-5", sidebarOpen ? "lg:grid-cols-3" : "lg:grid-cols-4")}>
                  {desktopItems.map((p) => (
                    <ProductCard key={p.id} product={p} />
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

                {/* Mobile: accumulated pages + Load More */}
                <div className="grid lg:hidden grid-cols-1 gap-5">
                  {mobileItems.map((p) => (
                    <ProductCard key={p.id} product={p} />
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
